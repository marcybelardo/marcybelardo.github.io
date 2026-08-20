"""Contract tests for the local Standard.site metadata converter."""
from __future__ import annotations

import ast
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "generate_standard_site.py"


def load_converter():
    spec = importlib.util.spec_from_file_location("generate_standard_site", SCRIPT)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load converter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConverterContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.converter = load_converter()
        cls.error = cls.converter.ConversionError

    def make_project(self, directory: Path, posts: dict[str, str]) -> tuple[Path, Path]:
        blog = directory / "src" / "content" / "blog"
        output = directory / "generated" / "standard-site"
        blog.mkdir(parents=True)
        for relative, content in posts.items():
            path = blog / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="")
        return blog, output

    def convert(self, blog: Path, output: Path, **kwargs):
        return self.converter.convert(blog, output, repo_root=blog.parents[3], **kwargs)

    def test_publication_uri_contract(self):
        parse = self.converter.parse_publication_at_uri
        valid = [
            "at://did:plc:abc123/site.standard.publication/abc",
            "at://did:unsupported:opaque/site.standard.publication/rkey",
            "at://did:example:abc%20def/site.standard.publication/rkey",
            "at://alice.example/site.standard.publication/rkey",
            "at://did:example:" + "a" * 2000 + "/site.standard.publication/rkey",
        ]
        for uri in valid:
            with self.subTest(uri=uri):
                self.assertEqual(parse(uri), uri)
        invalid = [
            "",
            "at://did:plc:/site.standard.publication/rkey",
            "at://did:plc:a%2/site.standard.publication/rkey",
            "at://did:plc:a%2G/site.standard.publication/rkey",
            "at://did:plc:a!/site.standard.publication/rkey",
            "at://did:plc:a:/site.standard.publication/rkey",
            "at://did:plc:a%/site.standard.publication/rkey",
            "at://did:plc:a/site.standard.publication/rkey/path",
            "at://DID:plc:a/site.standard.publication/rkey",
            "AT://did:plc:a/site.standard.publication/rkey",
            "at://did:plc:a/path/site.standard.publication/rkey",
            "at://did:plc:a/site.standard.document/rkey",
            "at://did:plc:a/site.standard.publication/rkey?x=1",
            "at://did:plc:a/site.standard.publication/rkey#x",
            "at://did:plc:a/site.standard.publication/",
            "at://did:plc:a//site.standard.publication/rkey",
            "at://did:plc:a/site.standard.publication/.",
            "at://did:plc:a/site.standard.publication/..",
            "at://did:plc:a/site.standard.publication/rkey!",
            "at://did:plc:a/site.standard.publication/" + "r" * 513,
            "at://user@did:plc:a/site.standard.publication/rkey",
            "at://alice.example:443/site.standard.publication/rkey",
            "at://Alice.example/site.standard.publication/rkey",
            "at://example/site.standard.publication/rkey",
        ]
        for uri in invalid:
            with self.subTest(uri=uri):
                with self.assertRaises(self.error):
                    parse(uri)
        for bad_did in (
            "did:plc:" + "a" * 2041,
            "did:plc:a/path",
            "did:plc:a?query",
            "did:plc:a#fragment",
        ):
            uri = f"at://{bad_did}/site.standard.publication/rkey"
            with self.subTest(uri=uri):
                with self.assertRaises(self.error):
                    parse(uri)

    def test_publication_and_document_payloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            blog, output = self.make_project(
                Path(temporary),
                {
                    "post.md": (
                        "---\nslug: hello-world\ntitle: Hello, world!\n"
                        "date: 2024-01-02T03:04:05.123+03:00\n"
                        "description: A description\ntags:\n  - zeta\n  - alpha\n---\nBody.\n"
                    ),
                    "draft.md": "---\ntitle: Draft\ndate: 2024-01-03\ndraft: true\n---\nNope\n",
                },
            )
            self.assertEqual(self.convert(blog, output), 1)
            files = sorted(path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file())
            self.assertEqual(files, [".standard-site-owned", "documents/hello-world.json", "publication.json"])
            publication = json.loads((output / "publication.json").read_text(encoding="utf-8"))
            document = json.loads((output / "documents/hello-world.json").read_text(encoding="utf-8"))
            self.assertEqual(
                publication,
                {
                    "$type": "site.standard.publication",
                    "url": "https://www.marcelinebelardo.com",
                    "name": "Art Computer Insanity Posting",
                    "description": "Marceline Belardo's thoughts on tech, politics, and art",
                },
            )
            self.assertEqual(document["site"], "https://www.marcelinebelardo.com")
            self.assertEqual(document["publishedAt"], "2024-01-02T00:04:05.123Z")
            self.assertEqual(document["tags"], ["zeta", "alpha"])
            self.assertNotIn("content", document)
            self.assertNotIn("textContent", document)

    def test_publication_uri_override(self):
        with tempfile.TemporaryDirectory() as temporary:
            blog, output = self.make_project(
                Path(temporary),
                {"post.md": "---\nslug: post\ntitle: Post\ndate: 2024-01-01\ndescription: Desc\n---\n"},
            )
            uri = "at://did:plc:abc123/site.standard.publication/record"
            self.convert(blog, output, publication_uri=uri)
            document = json.loads((output / "documents/post.json").read_text(encoding="utf-8"))
            self.assertEqual(document["site"], uri)

    def test_frontmatter_mini_grammar_and_draft_validation(self):
        accepted = """---\nslug: plain: value's\ntitle: 'An ''apostrophe'''\ndate: 2024-01-01\ndescription: \"A \\\"quoted\\\" value\"\ntags: []\nimage: image.png\nimageAlt: Alt text\n\n---\nbody\n"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "post.md"
            path.write_text(accepted, encoding="utf-8")
            parsed = self.converter.parse_frontmatter(path)
            self.assertEqual(parsed["title"], "An 'apostrophe'")
            self.assertEqual(parsed["slug"], "plain: value's")
            self.assertEqual(parsed["tags"], [])
            quoted_prefixes = {
                "image": "'&anchor'",
                "imageAlt": "'*alias'",
            }
            quoted_source = "---\nslug: quoted\ntitle: 'Title'\ndate: 2024-01-01\ndescription: 'Description'\n" + "\n".join(
                f"{field}: {value}" for field, value in quoted_prefixes.items()
            ) + "\n---\n"
            path.write_text(quoted_source, encoding="utf-8")
            quoted = self.converter.parse_frontmatter(path)
            self.assertEqual(quoted["title"], "Title")
            self.assertEqual(quoted["image"], "&anchor")
            self.assertEqual(quoted["imageAlt"], "*alias")
            quoted_hash = root / "quoted-hash.md"
            quoted_hash.write_text("---\ntitle: 'null # not a comment'\ndate: 2024-01-01\ndescription: '~'\n---\n", encoding="utf-8")
            quoted_hash_data = self.converter.parse_frontmatter(quoted_hash)
            self.assertEqual(quoted_hash_data["title"], "null # not a comment")
            self.assertEqual(quoted_hash_data["description"], "~")
            rejects = [
                "---\ntitle:\ndate: 2024-01-01\n---\n",
                "---\ntitle: null\ndate: 2024-01-01\n---\n",
                "---\ntitle: Title # comment\ndate: 2024-01-01\n---\n",
                "---\ntitle: [flow]\ndate: 2024-01-01\n---\n",
                "---\ntitle: &anchor\ndate: 2024-01-01\n---\n",
                "---\ntitle: Title\ntitle: Again\ndate: 2024-01-01\n---\n",
                "---\nunknown: value\ntitle: Title\ndate: 2024-01-01\n---\n",
                "---\ntitle: Title\ndate: 2024-01-01\ntags:\n - wrong\n---\n",
                "---\ntitle: Title\ndate: 2024-01-01\ntags:\n  - one\n\n---\n",
            ]
            for index, source in enumerate(rejects):
                with self.subTest(index=index):
                    path.write_text(source, encoding="utf-8")
                    with self.assertRaises(self.error):
                        self.converter.parse_frontmatter(path)
            draft = root / "draft.md"
            draft.write_text("---\ndate: 2024-01-01\ndraft: true\n---\n", encoding="utf-8")
            with self.assertRaisesRegex(self.error, "title"):
                self.converter.parse_frontmatter(draft)

    def test_datetime_contract(self):
        normalize = self.converter.normalize_datetime
        self.assertEqual(normalize("2024-01-02"), "2024-01-02T00:00:00.000Z")
        self.assertEqual(normalize("2024-01-02T03:04:05.1-03:00"), "2024-01-02T06:04:05.100Z")
        self.assertEqual(normalize("2024-01-02T03:04:05,123Z"), "2024-01-02T03:04:05.123Z")
        for value in ("2024-01-02T03:04:05", "2024-01-02T03:04:05.1234Z", "2024-01-02T03:04:05,1234Z", "2024-01-02 03:04:05Z"):
            with self.subTest(value=value):
                with self.assertRaises(self.error):
                    normalize(value)

    def test_lexicon_boundaries(self):
        validate = self.converter.validate_lexicon_string
        validate("a" * 500, "title", 5000, 500)
        with self.assertRaises(self.error):
            validate("a" * 501, "title", 5000, 500)
        validate("é" * 2500, "description", 30000, 3000)
        with self.assertRaises(self.error):
            validate("é" * 15001, "description", 30000, 3000)
        validate("é" * 128, "tag", 1280, 128)
        with self.assertRaises(self.error):
            validate("é" * 129, "tag", 1280, 128)

    def test_draft_and_published_validation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            blog, output = self.make_project(
                root,
                {
                    "draft.md": "---\ntitle: Draft\ndate: 2024-01-01\ndraft: true\n---\n",
                    "published.md": "---\ntitle: Published\ndate: 2024-01-02\ndescription: Desc\n---\n",
                },
            )
            with self.assertRaisesRegex(self.error, "slug"):
                self.convert(blog, output)

    def test_transaction_preserves_previous_output_on_validation_and_write_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            blog, output = self.make_project(
                root,
                {"post.md": "---\nslug: post\ntitle: Post\ndate: 2024-01-01\ndescription: Desc\n---\n"},
            )
            self.convert(blog, output)
            before = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            (blog / "bad.md").write_text("---\ntitle: [broken\n---\n", encoding="utf-8")
            with self.assertRaises(self.error):
                self.convert(blog, output)
            after_validation = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            self.assertEqual(before, after_validation)
            (blog / "bad.md").unlink()
            calls = {"count": 0}
            original_write = self.converter._write_file

            def failing_write(path, content):
                calls["count"] += 1
                if calls["count"] == 2:
                    raise OSError("injected write failure")
                original_write(path, content)

            with self.assertRaises(self.error):
                self.convert(blog, output, write_file=failing_write)
            after_write = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            self.assertEqual(before, after_write)

    def test_deterministic_rerun_and_stale_cleanup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            blog, output = self.make_project(
                root,
                {
                    "a.md": "---\nslug: a\ntitle: A\ndate: 2024-01-01\ndescription: A\n---\n",
                    "b.md": "---\nslug: b\ntitle: B\ndate: 2024-01-02\ndescription: B\n---\n",
                },
            )
            self.convert(blog, output)
            first = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            (blog / "b.md").unlink()
            self.convert(blog, output)
            self.assertFalse((output / "documents/b.json").exists())
            second = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            self.convert(blog, output)
            third = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            self.assertEqual(second, third)
            self.assertNotEqual(first, second)

    def test_current_repository_emits_expected_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated" / "standard-site"
            blog = ROOT / "src" / "content" / "blog"
            self.converter.convert(blog, output, repo_root=Path(temporary))
            self.assertEqual(
                sorted(path.relative_to(output).as_posix() for path in output.rglob("*.json")),
                ["documents/the-devil-you-know.json", "publication.json"],
            )

    def test_cli_defaults_summary_and_exit_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            blog, _output = self.make_project(
                project,
                {"post.md": "---\nslug: post\ntitle: Post\ndate: 2024-01-01\ndescription: Desc\n---\n"},
            )
            result = subprocess.run([sys.executable, str(SCRIPT)], cwd=project, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("generated/standard-site", result.stdout)
            self.assertIn("1 document", result.stdout)
            self.assertEqual(result.stderr, "")
            self.assertTrue((project / "generated/standard-site/publication.json").exists())
            (blog / "bad.md").write_text("---\ntitle: [bad\n---\n", encoding="utf-8")
            before = (project / "generated/standard-site/publication.json").read_bytes()
            failed = subprocess.run([sys.executable, str(SCRIPT)], cwd=project, text=True, capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("bad.md", failed.stderr)
            self.assertEqual(before, (project / "generated/standard-site/publication.json").read_bytes())

    def test_converter_has_no_network_or_operational_surface(self):
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        allowed = {"__future__", "argparse", "datetime", "json", "os", "re", "shutil", "sys", "tempfile", "uuid", "pathlib", "typing"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self.assertIn(alias.name.split(".")[0], allowed)
            elif isinstance(node, ast.ImportFrom):
                self.assertIn((node.module or "").split(".")[0], allowed)
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotRegex(source, r"\b(?:urllib|http\.client|socket|subprocess|requests|dns|curl)\b")
        self.assertNotRegex(source, r"\b(?:createSession|createRecord|putRecord|deleteRecord|resolveHandle)\b")

    def test_lexical_symlink_components_are_rejected_before_resolution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            real_root = root / "real"
            real_root.mkdir()
            blog, _output = self.make_project(real_root, {"post.md": "---\nslug: post\ntitle: Post\ndate: 2024-01-01\ndescription: Desc\n---\n"})
            alias = root / "alias"
            alias.symlink_to(real_root, target_is_directory=True)
            with self.assertRaisesRegex(self.error, "symlink"):
                self.converter.convert(alias / "src" / "content" / "blog", root / "generated" / "standard-site", repo_root=root)

    def test_generated_output_is_gitignored(self):
        result = subprocess.run(
            ["git", "check-ignore", "generated/standard-site/publication.json"],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_python_gate_is_wired_into_package_and_deploy_workflow(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        command = "python3 -m unittest discover -s tests -p 'test_generate_standard_site.py'"
        test_script = package["scripts"]["test"]
        self.assertIn(command, test_script)
        self.assertLess(test_script.index(command), test_script.index("pnpm build"))
        workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        setup = workflow.index("uses: actions/setup-python@v6")
        version = workflow.index("python-version: '3.11'", setup)
        astro = workflow.index("uses: withastro/action@v6")
        verify = workflow.index("build-cmd: pnpm verify", astro)
        self.assertLess(setup, astro)
        self.assertLess(version, astro)
        self.assertLess(astro, verify)


if __name__ == "__main__":
    unittest.main()
