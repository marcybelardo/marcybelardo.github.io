#!/usr/bin/env python3
"""Generate local Standard.site metadata JSON records.

This utility performs local Markdown/frontmatter reads and generated JSON writes
only. It does not authenticate, contact a PDS, use HTTP/DNS, synchronize,
deploy, verify a domain, or modify Astro pages.

The payloads follow the official Standard.site lexicons:
* https://standard.site/docs/lexicons/publication
* https://standard.site/docs/lexicons/document

The lexicons express ``maxLength`` in UTF-8 bytes and ``maxGraphemes`` using
AT Protocol Lexicon string semantics (https://atproto.com/specs/lexicon). The
standard library has no extended-grapheme segmenter, so this implementation
conservatively limits Python code points with ``len``. That may reject a
combining sequence the lexicon would count as one grapheme, but never accepts a
value beyond the lexicon grapheme limit.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Callable, Mapping

SITE = "https://www.marcelinebelardo.com"
NAME = "Art Computer Insanity Posting"
PUB_DESCRIPTION = "Marceline Belardo's thoughts on tech, politics, and art"
MARKER = ".standard-site-owned"
FIELDS = {"slug", "title", "date", "description", "tags", "draft", "image", "imageAlt"}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RKEY_RE = re.compile(r"^[A-Za-z0-9._:~-]{1,512}$")
HANDLE_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)
DID_RE = re.compile(r"^did:[a-z]+:[A-Za-z0-9._:%-]+$")
DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
OFFSET_RE = re.compile(r"(?:Z|[+-]\d{2}:\d{2})$")
FRACTION_RE = re.compile(r"[.,](\d+)(?=(?:Z|[+-]\d{2}:\d{2})$)")


class ConversionError(ValueError):
    """Raised for invalid source metadata, arguments, or output transactions."""


def _fail(path: Path, line: int, field: str, message: str) -> None:
    raise ConversionError(f"{path}: line {line}: {field}: {message}")


def _validate_did(authority: str) -> None:
    # atproto DID syntax: https://atproto.com/specs/did
    if not 1 <= len(authority) <= 2048 or not authority.isascii():
        raise ConversionError("invalid DID authority length or character set")
    if not DID_RE.fullmatch(authority):
        raise ConversionError("invalid DID authority")
    identifier = authority.split(":", 2)[2]
    if not identifier or authority.endswith((":", "%")):
        raise ConversionError("DID identifier may not be empty or end in ':' or '%'" )
    if re.search(r"%(?![0-9A-Fa-f]{2})", identifier):
        raise ConversionError("DID percent escapes must use two hexadecimal characters")
    if any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:%-" for char in identifier):
        raise ConversionError("DID identifier contains an invalid character")


def _validate_handle(authority: str) -> None:
    # Handles are normalized lowercase ASCII authorities with at least two
    # labels; see https://atproto.com/specs/handle.
    if authority != authority.lower() or not HANDLE_RE.fullmatch(authority):
        raise ConversionError("invalid normalized AT Protocol handle authority")


def parse_publication_at_uri(value: str) -> str:
    """Validate and return an exact publication AT-URI without normalizing it."""
    if not isinstance(value, str):
        raise ConversionError("publication URI must be text")
    if not value.startswith("at://"):
        raise ConversionError("publication URI must start with at://")
    if any(char in value for char in "?#"):
        raise ConversionError("publication URI must not contain a query or fragment")
    remainder = value[5:]
    parts = remainder.split("/")
    if len(parts) != 3 or parts[1] != "site.standard.publication":
        raise ConversionError(
            "publication URI must exactly match at://AUTHORITY/site.standard.publication/RKEY"
        )
    authority, _collection, rkey = parts
    if not authority or "@" in authority:
        raise ConversionError("publication URI authority must not contain credentials")
    if authority.startswith("did:"):
        _validate_did(authority)
    else:
        if ":" in authority:
            raise ConversionError("publication URI handle authority must not contain a port")
        _validate_handle(authority)
    if not RKEY_RE.fullmatch(rkey) or rkey in {".", ".."}:
        raise ConversionError("invalid publication record key")
    return value


def _parse_scalar(raw: str, path: Path, line: int, field: str) -> str:
    value = raw.strip()
    if not value:
        _fail(path, line, field, "blank values are not supported")
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            _fail(path, line, field, "malformed single-quoted scalar")
        inner = value[1:-1]
        result: list[str] = []
        index = 0
        while index < len(inner):
            if inner[index] != "'":
                result.append(inner[index])
                index += 1
                continue
            if index + 1 >= len(inner) or inner[index + 1] != "'":
                _fail(path, line, field, "single quotes must be doubled inside a quoted scalar")
            result.append("'")
            index += 2
        value = "".join(result)
    elif value.startswith('"'):
        try:
            decoded = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            _fail(path, line, field, "malformed JSON double-quoted scalar")
        if not isinstance(decoded, str):
            _fail(path, line, field, "double-quoted value must decode to a string")
        value = decoded
    else:
        if value in {"null", "Null", "NULL", "~"}:
            _fail(path, line, field, "null values are not supported")
        if " #" in value:
            _fail(path, line, field, "inline comments are not supported")
        if value.startswith(("{", "[", "|", ">", "&", "*", "!")):
            _fail(path, line, field, "flow, anchors, aliases, tags, or multiline YAML values are not supported")
        if re.search(r"(?:^|\s)[&*!][A-Za-z0-9_.-]*", value):
            _fail(path, line, field, "flow, anchors, aliases, or explicit YAML tags are not supported")
    if not value:
        _fail(path, line, field, "blank values are not supported")
    return value


def parse_frontmatter(path: Path) -> dict[str, object]:
    """Parse the deliberately small UTF-8 frontmatter grammar used by the site."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise ConversionError(f"{path}: invalid UTF-8: {error}") from error
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        _fail(path, 1, "frontmatter", "first line must be exactly ---")
    closing: int | None = None
    for index in range(1, len(lines)):
        if lines[index] == "---":
            closing = index
            break
    if closing is None:
        _fail(path, len(lines), "frontmatter", "missing closing --- delimiter")

    data: dict[str, object] = {}
    index = 1
    while index < closing:
        line = lines[index]
        line_number = index + 1
        if not line.strip():
            index += 1
            continue
        if line[0].isspace():
            _fail(path, line_number, "frontmatter", "indented mappings are not supported")
        if ":" not in line:
            _fail(path, line_number, "frontmatter", "expected an unindented key: value mapping")
        raw_key, raw_value = line.split(":", 1)
        key = raw_key.strip()
        if key not in FIELDS:
            _fail(path, line_number, key or "frontmatter", "unknown top-level field")
        if key in data:
            _fail(path, line_number, key, "duplicate field")

        if key == "tags":
            trimmed = raw_value.strip()
            if trimmed == "[]":
                data[key] = []
                index += 1
                continue
            if trimmed:
                _fail(path, line_number, key, "use exactly [] or a two-space block list")
            tags: list[str] = []
            cursor = index + 1
            while cursor < closing:
                item = lines[cursor]
                item_number = cursor + 1
                if not item.strip():
                    _fail(path, item_number, key, "blank lines are not allowed in a tag block")
                if item.startswith("  - "):
                    tags.append(_parse_scalar(item[4:], path, item_number, key))
                    cursor += 1
                    continue
                if item[0].isspace():
                    _fail(path, item_number, key, "tag items require exactly two spaces followed by - ")
                break
            if not tags:
                _fail(path, line_number, key, "tag block must contain at least one item")
            data[key] = tags
            index = cursor
            continue

        if key == "draft":
            draft_value = raw_value.strip()
            if draft_value not in {"true", "false"}:
                _fail(path, line_number, key, "must be the unquoted literal true or false")
            data[key] = draft_value == "true"
        else:
            data[key] = _parse_scalar(raw_value, path, line_number, key)
        index += 1

    for required in ("title", "date"):
        if required not in data:
            _fail(path, 1, required, "required for every entry, including drafts")
    return data


def normalize_datetime(value: str) -> str:
    """Normalize an accepted date/date-time string to millisecond UTC precision."""
    if not isinstance(value, str):
        raise ConversionError("date must be text")
    try:
        if DATE_ONLY_RE.fullmatch(value):
            parsed_date = dt.date.fromisoformat(value)
            parsed = dt.datetime.combine(parsed_date, dt.time(), tzinfo=dt.timezone.utc)
        else:
            if "T" not in value or not OFFSET_RE.search(value):
                raise ValueError("datetime must contain T and an explicit offset")
            fraction = FRACTION_RE.search(value)
            if fraction and len(fraction.group(1)) > 3:
                raise ValueError("fractional precision finer than milliseconds")
            normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
            parsed = dt.datetime.fromisoformat(normalized)
            if parsed.tzinfo is None or parsed.utcoffset() is None:
                raise ValueError("timezone-naive datetime")
            parsed = parsed.astimezone(dt.timezone.utc)
    except (TypeError, ValueError) as error:
        raise ConversionError(f"invalid ISO date/time: {value!r} ({error})") from error
    return parsed.strftime("%Y-%m-%dT%H:%M:%S.") + f"{parsed.microsecond // 1000:03d}Z"


def validate_lexicon_string(value: str, label: str, max_bytes: int, max_code_points: int) -> None:
    if not isinstance(value, str):
        raise ConversionError(f"{label} must be a string")
    if len(value.encode("utf-8")) > max_bytes or len(value) > max_code_points:
        raise ConversionError(
            f"{label} exceeds the Lexicon limit of {max_bytes} UTF-8 bytes and "
            f"{max_code_points} code points"
        )


def _validate_source_types(data: Mapping[str, object], path: Path) -> None:
    scalar_fields = ("slug", "title", "date", "description", "image", "imageAlt")
    for field in scalar_fields:
        if field in data and not isinstance(data[field], str):
            raise ConversionError(f"{path}: {field}: invalid scalar value")
    if "tags" in data:
        if not isinstance(data["tags"], list) or not all(isinstance(tag, str) for tag in data["tags"]):
            raise ConversionError(f"{path}: tags: invalid list value")
    if "draft" in data and not isinstance(data["draft"], bool):
        raise ConversionError(f"{path}: draft: invalid boolean value")


def _collect_payloads(input_dir: Path, publication_uri: str) -> tuple[dict[str, object], list[tuple[str, dict[str, object]]]]:
    if not input_dir.exists() or not input_dir.is_dir() or input_dir.is_symlink():
        raise ConversionError(f"input directory is missing or unsafe: {input_dir}")
    source_files = sorted(
        (path for path in input_dir.rglob("*") if path.is_file() and path.suffix in {".md", ".mdx"}),
        key=lambda path: path.relative_to(input_dir).as_posix(),
    )
    posts: list[tuple[str, dict[str, object]]] = []
    seen_slugs: set[str] = set()
    for path in source_files:
        data = parse_frontmatter(path)
        _validate_source_types(data, path)
        title = data["title"]
        date_value = data["date"]
        assert isinstance(title, str) and isinstance(date_value, str)
        validate_lexicon_string(title, f"{path}: title", 5000, 500)
        published_at = normalize_datetime(date_value)
        if "description" in data:
            description = data["description"]
            assert isinstance(description, str)
            validate_lexicon_string(description, f"{path}: description", 30000, 3000)
        for tag in data.get("tags", []):
            assert isinstance(tag, str)
            validate_lexicon_string(tag, f"{path}: tag", 1280, 128)
        if "slug" in data:
            slug = data["slug"]
            assert isinstance(slug, str)
            if not SLUG_RE.fullmatch(slug):
                raise ConversionError(f"{path}: slug: must match lowercase stable slug syntax")
        if data.get("draft", False):
            continue
        slug = data.get("slug")
        description = data.get("description")
        if not isinstance(slug, str) or not slug:
            raise ConversionError(f"{path}: slug: published post requires an explicit non-empty slug")
        if not isinstance(description, str) or not description:
            raise ConversionError(f"{path}: description: published post requires a non-empty description")
        if slug in seen_slugs:
            raise ConversionError(f"{path}: slug: duplicate published slug {slug!r}")
        seen_slugs.add(slug)
        posts.append((slug, {"title": title, "description": description, "date": published_at, "tags": data.get("tags", [])}))

    publication = {
        "$type": "site.standard.publication",
        "url": SITE,
        "name": NAME,
        "description": PUB_DESCRIPTION,
    }
    validate_lexicon_string(NAME, "publication name", 5000, 500)
    validate_lexicon_string(PUB_DESCRIPTION, "publication description", 30000, 3000)
    documents: list[tuple[str, dict[str, object]]] = []
    for slug, post in posts:
        document: dict[str, object] = {
            "$type": "site.standard.document",
            "site": publication_uri,
            "title": post["title"],
            "publishedAt": post["date"],
            "path": f"/blog/{slug}/",
            "description": post["description"],
        }
        tags = post["tags"]
        if tags:
            document["tags"] = tags
        documents.append((slug, document))
    documents.sort(key=lambda item: item[0])
    return publication, documents


def _write_file(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def _remove_tree(path: Path) -> None:
    """Remove an owned tree without ever traversing a symlink."""
    if path.is_symlink():
        raise OSError(f"refusing to remove symlink: {path}")
    if not path.exists():
        return
    if not path.is_dir():
        raise OSError(f"expected directory during cleanup: {path}")
    for child in path.iterdir():
        if child.is_symlink():
            raise OSError(f"refusing to traverse symlink during cleanup: {child}")
        if child.is_dir():
            _remove_tree(child)
        else:
            child.unlink()
    path.rmdir()


def _absolute_without_following(path: Path) -> Path:
    """Make an absolute lexical path without resolving symlinks or ``..``."""
    if path.is_absolute():
        return path
    return Path.cwd() / path


def _normalize_after_symlink_checks(path: Path) -> Path:
    """Collapse lexical ``.``/``..`` components after symlinks are rejected."""
    return Path(os.path.normpath(os.fspath(path)))


def _assert_no_symlink_components(path: Path, label: str) -> None:
    current = Path(path.anchor)
    for component in path.parts[1:]:
        current /= component
        if current.is_symlink():
            raise ConversionError(f"{label} may not contain symlink component: {current}")


def _assert_no_symlinks(path: Path, label: str) -> None:
    _assert_no_symlink_components(path, label)
    if not path.exists():
        return
    if path.is_symlink():
        raise ConversionError(f"{label} may not be a symlink: {path}")
    for child in path.rglob("*"):
        if child.is_symlink():
            raise ConversionError(f"{label} may not contain symlink: {child}")


def _assert_safe_output(input_dir: Path, output_dir: Path, repo_root: Path, enforce_repo_output: bool) -> tuple[Path, Path, Path]:
    _assert_no_symlink_components(repo_root, "repository root")
    _assert_no_symlink_components(input_dir, "input")
    _assert_no_symlink_components(output_dir, "output")
    normalized_root = _normalize_after_symlink_checks(repo_root)
    normalized_input = _normalize_after_symlink_checks(input_dir)
    normalized_output = _normalize_after_symlink_checks(output_dir)
    if not normalized_input.exists() or not normalized_input.is_dir():
        raise ConversionError(f"input directory does not exist: {normalized_input}")
    if normalized_output == normalized_root:
        raise ConversionError("output overlaps the repository root")
    if normalized_input == normalized_output or normalized_input in normalized_output.parents or normalized_output in normalized_input.parents:
        raise ConversionError("output overlaps the input tree")
    if enforce_repo_output:
        generated_root = normalized_root / "generated"
        if normalized_output == generated_root or not normalized_output.is_relative_to(generated_root):
            raise ConversionError("output must resolve beneath the repository generated/ directory")
    _assert_no_symlinks(normalized_input, "input")
    _assert_no_symlinks(normalized_output, "output")
    if normalized_output.exists() and not normalized_output.is_dir():
        raise ConversionError(f"output path is not a directory: {normalized_output}")
    if normalized_output.exists() and any(normalized_output.iterdir()) and not (normalized_output / MARKER).is_file():
        raise ConversionError("refusing to replace a non-empty unowned output directory")
    return normalized_input, normalized_output, normalized_root


def convert(
    input_dir: Path,
    output_dir: Path,
    publication_uri: str | None = None,
    *,
    repo_root: Path | None = None,
    enforce_repo_output: bool = False,
    write_file: Callable[[Path, str], None] = _write_file,
    rename: Callable[[Path, Path], None] = os.replace,
    remove_tree: Callable[[Path], None] = _remove_tree,
) -> int:
    """Convert a source tree into an owned generated tree and return document count."""
    # Keep lexical components intact until the safety checks have inspected
    # them.  Path.resolve() would hide a symlink component by canonicalizing it
    # before _assert_no_symlink_components() could reject it.
    input_path = _absolute_without_following(Path(input_dir))
    output_path = _absolute_without_following(Path(output_dir))
    project_root = _absolute_without_following(Path(repo_root or Path(__file__).parent.parent))
    input_path, output_path, project_root = _assert_safe_output(input_path, output_path, project_root, enforce_repo_output)
    selected_site = parse_publication_at_uri(publication_uri) if publication_uri else SITE
    publication, documents = _collect_payloads(input_path, selected_site)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _assert_no_symlink_components(output_path.parent, "output parent")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _assert_no_symlink_components(output_path.parent, "output parent")
    stage = Path(tempfile.mkdtemp(prefix=f".{output_path.name}.staging-", dir=output_path.parent))
    backup: Path | None = None
    promoted = False
    try:
        write_file(stage / MARKER, "owned\n")
        write_file(stage / "publication.json", json.dumps(publication, ensure_ascii=False, indent=2) + "\n")
        documents_dir = stage / "documents"
        documents_dir.mkdir()
        for slug, document in documents:
            write_file(documents_dir / f"{slug}.json", json.dumps(document, ensure_ascii=False, indent=2) + "\n")

        if output_path.exists():
            backup = output_path.parent / f".{output_path.name}.backup-{uuid.uuid4().hex}"
            rename(output_path, backup)
        try:
            rename(stage, output_path)
            promoted = True
            stage = Path()
        except Exception:
            if backup is not None and not output_path.exists() and backup.exists():
                rename(backup, output_path)
                backup = None
            raise
        if backup is not None:
            try:
                remove_tree(backup)
                backup = None
            except Exception:
                # A failed cleanup must not leave the new tree as the apparent
                # success. Restore the previous complete tree where possible.
                failed_new = output_path.parent / f".{output_path.name}.failed-{uuid.uuid4().hex}"
                try:
                    rename(output_path, failed_new)
                    rename(backup, output_path)
                    remove_tree(failed_new)
                    backup = None
                except Exception as rollback_error:
                    raise ConversionError(f"backup cleanup failed and rollback failed: {rollback_error}") from rollback_error
                raise
    except ConversionError:
        raise
    except Exception as error:
        if backup is not None and not output_path.exists() and backup.exists():
            try:
                rename(backup, output_path)
                backup = None
            except Exception as rollback_error:
                error = RuntimeError(f"transaction failed ({error}); rollback failed ({rollback_error})")
        if stage and stage != Path() and stage.exists():
            try:
                remove_tree(stage)
            except Exception:
                pass
        raise ConversionError(f"transaction failed: {error}") from error
    finally:
        if not promoted and stage and stage != Path() and stage.exists():
            try:
                remove_tree(stage)
            except Exception:
                pass
    return len(documents)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate local Standard.site metadata JSON")
    parser.add_argument("--publication-uri", help="existing site.standard.publication AT-URI for document site fields")
    args = parser.parse_args(argv)
    project_root = _absolute_without_following(Path.cwd())
    input_dir = project_root / "src" / "content" / "blog"
    output_dir = project_root / "generated" / "standard-site"
    try:
        count = convert(
            input_dir,
            output_dir,
            args.publication_uri,
            repo_root=project_root,
            enforce_repo_output=True,
        )
    except (ConversionError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Generated generated/standard-site ({count} document{'s' if count != 1 else ''})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
