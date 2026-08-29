// Functional Core
//
// This module deliberately has no publishing or filesystem-write surface.  It
// turns the blog source into Standard.site records that a publisher can diff
// and write through an authenticated PDS client.

import { lstat, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

export const DEFAULT_SITE_ORIGIN = "https://www.marcelinebelardo.com";
export const DEFAULT_PUBLICATION_NAME = "Art Computer Insanity Posting";
export const DEFAULT_PUBLICATION_DESCRIPTION =
  "Marceline Belardo's thoughts on tech, politics, and art";
export const PUBLICATION_COLLECTION = "site.standard.publication";
export const DOCUMENT_COLLECTION = "site.standard.document";
/** A stable seed for the single publication record. */
export const PUBLICATION_IDENTITY_SEED = "marceline-belardo-publication";
/** Record keys in Standard.site are TIDs, not arbitrary slug strings. */
export const DEFAULT_PUBLICATION_RKEY = "5jpjlmfobo2uz";

const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";
const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;
const TID_TIMESTAMP_BITS = 53n;
const TID_CLOCK_BITS = 10n;
const TID_CLOCK_MASK = (1n << TID_CLOCK_BITS) - 1n;
const TID_TIMESTAMP_MASK = (1n << TID_TIMESTAMP_BITS) - 1n;
// Keep generated synthetic IDs recognizably modern while leaving enough range
// for a hash-derived offset. This is an identity derivation epoch, not the
// publication's article date.
const TID_DERIVATION_EPOCH_MICROS = 1_577_836_800_000_000n; // 2020-01-01 UTC
const TID_OFFSET_MASK = (1n << 52n) - 1n;

const BLOG_FIELDS = new Set([
  "slug",
  "title",
  "date",
  "description",
  "tags",
  "draft",
  "image",
  "imageAlt",
]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DID_RE = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
const HANDLE_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:\d{2})$/;

export class ConversionError extends Error {
  override name = "ConversionError";
}

export type BlogFrontmatter = {
  readonly slug?: string;
  readonly title: string;
  readonly date: string;
  readonly description?: string;
  readonly tags: ReadonlyArray<string>;
  readonly draft: boolean;
  readonly image?: string;
  readonly imageAlt?: string;
};

export type BlogSource = {
  readonly path: string;
  readonly relativePath: string;
  readonly frontmatter: BlogFrontmatter;
  readonly markdown: string;
};

export type StandardSitePublication = {
  readonly $type: typeof PUBLICATION_COLLECTION;
  readonly url: string;
  readonly name: string;
  readonly description?: string;
};

export type StandardSiteDocument = {
  readonly $type: typeof DOCUMENT_COLLECTION;
  readonly site: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly path: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly textContent: string;
};

export type PublishedBlogPost = {
  readonly source: BlogSource;
  readonly slug: string;
  readonly rkey: string;
  readonly document: StandardSiteDocument;
  readonly uri: string;
};

export type ConversionResult = {
  readonly publication: StandardSitePublication;
  readonly publicationUri: string;
  readonly documents: ReadonlyArray<PublishedBlogPost>;
  readonly drafts: ReadonlyArray<BlogSource>;
};

export type ParseFrontmatterResult = {
  readonly data: BlogFrontmatter;
  readonly body: string;
};

export type ConvertOptions = {
  /** DID or normalized handle that owns the records. */
  readonly authority: string;
  readonly publicationRkey?: string;
  /** Use this only when updating a publication that has a pre-existing URI. */
  readonly publicationUri?: string;
  readonly siteOrigin?: string;
  readonly publicationName?: string;
  readonly publicationDescription?: string;
};

export type RecordIdentity = {
  readonly slug: string;
  readonly rkey: string;
  readonly uri: string;
};

/** Return whether a value has the current 13-character TID syntax. */
export function isTid(value: unknown): value is string {
  return typeof value === "string" && TID_RE.test(value);
}

/** Validate and return a TID record key. */
export function validateTid(value: string, label = "record key"): string {
  if (!isTid(value)) {
    throw new ConversionError(`${label} must be a valid 13-character TID`);
  }
  return value;
}

/**
 * Derive a valid, deterministic TID from a stable identity string.
 *
 * TIDs encode a 53-bit microsecond timestamp and a 10-bit clock identifier in
 * a 64-bit integer. We use a fixed derivation epoch and SHA-256 material for
 * both parts, so rerunning a publisher produces the same rkey without a local
 * database or a committed token. The resulting ID is intentionally synthetic;
 * its embedded timestamp must not be treated as an article creation time.
 */
export function deriveStableTid(identity: string): string {
  if (typeof identity !== "string" || identity.length === 0) {
    throw new ConversionError("TID identity must be a non-empty string");
  }
  const digest = createHash("sha256").update(identity, "utf8").digest();
  // Use 52 bits for the offset so epoch + offset remains within the 53-bit
  // timestamp field. The next digest bits serve as the 10-bit clock ID.
  const offset = (BigInt(digest.readUInt32BE(0)) << 20n | BigInt(digest.readUIntBE(4, 3))) & TID_OFFSET_MASK;
  const timestamp = TID_DERIVATION_EPOCH_MICROS + offset;
  if (timestamp > TID_TIMESTAMP_MASK) {
    throw new ConversionError("derived TID timestamp exceeds the 53-bit range");
  }
  const clock = BigInt(digest.readUInt16BE(7)) & TID_CLOCK_MASK;
  const value = (timestamp << TID_CLOCK_BITS) | clock;
  const tid = encodeTid(value);
  validateTid(tid);
  return tid;
}

/** Derive the publication's stable TID from its fixed identity seed. */
export function publicationRecordKey(): string {
  return deriveStableTid(PUBLICATION_IDENTITY_SEED);
}

/**
 * Build a sorted slug→TID map and fail if a source set ever collides. The
 * collision check is kept explicit even though SHA-256 makes accidental
 * collisions extraordinarily unlikely; it protects callers from silently
 * losing one source during a future mapping change.
 */
export function deriveDocumentRecordKeys(
  slugs: ReadonlyArray<string>,
): ReadonlyMap<string, string> {
  const mapping = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const slug of [...slugs].sort((left, right) => left.localeCompare(right))) {
    validateSlug(slug);
    if (mapping.has(slug)) {
      throw new ConversionError(`duplicate document slug: ${slug}`);
    }
    const rkey = deriveStableTid(`document:${slug}`);
    const owner = owners.get(rkey);
    if (owner !== undefined && owner !== slug) {
      throw new ConversionError(`document TID collision: ${owner} and ${slug} both map to ${rkey}`);
    }
    mapping.set(slug, rkey);
    owners.set(rkey, slug);
  }
  return mapping;
}

/** Build deterministic identities for all document slugs under an authority. */
export function deriveDocumentIdentities(
  authority: string,
  slugs: ReadonlyArray<string>,
): ReadonlyArray<RecordIdentity> {
  const mapping = deriveDocumentRecordKeys(slugs);
  return [...mapping.entries()].map(([slug, rkey]) => ({
    slug,
    rkey,
    uri: documentAtUriForRkey(authority, rkey),
  }));
}

/** Return an AT-URI for a document when its TID rkey is already known. */
export function documentAtUriForRkey(authority: string, rkey: string): string {
  validateAtAuthority(authority);
  validateTid(rkey, "document record key");
  return `at://${authority}/${DOCUMENT_COLLECTION}/${rkey}`;
}

/**
 * Parse an exact publication AT-URI.  AT-URIs are intentionally not decoded
 * or normalized here: the value is also used as the document's `site` field.
 */
export function parsePublicationAtUri(value: string): string {
  if (typeof value !== "string" || !value.startsWith("at://")) {
    throw new ConversionError("publication URI must start with at://");
  }
  if (/[?#]/u.test(value)) {
    throw new ConversionError("publication URI must not contain a query or fragment");
  }
  const parts = value.slice("at://".length).split("/");
  if (parts.length !== 3 || parts[1] !== PUBLICATION_COLLECTION) {
    throw new ConversionError(
      `publication URI must exactly match at://AUTHORITY/${PUBLICATION_COLLECTION}/RKEY`,
    );
  }
  const authority = parts[0];
  if (!authority || authority.includes("@")) {
    throw new ConversionError("publication URI authority must not contain credentials");
  }
  validateAtAuthority(authority);
  validateTid(parts[2], "publication record key");
  return value;
}

/** Return an AT-URI for a publication record owned by `authority`. */
export function publicationAtUri(
  authority: string,
  rkey = DEFAULT_PUBLICATION_RKEY,
): string {
  validateAtAuthority(authority);
  validateTid(rkey, "publication record key");
  return `at://${authority}/${PUBLICATION_COLLECTION}/${rkey}`;
}

/** Return the deterministic AT-URI for the document represented by `slug`. */
export function documentAtUri(authority: string, slug: string): string {
  validateSlug(slug);
  return documentAtUriForRkey(authority, deriveStableTid(`document:${slug}`));
}

/**
 * Normalize an ISO date/date-time to the millisecond UTC representation used
 * by Standard.site.  Date-times must carry an explicit offset.
 */
export function normalizeDatetime(value: string): string {
  if (typeof value !== "string") {
    throw new ConversionError("date must be text");
  }
  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    assertCalendarDate(+year, +month, +day, value);
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  const dateTime = DATE_TIME_RE.exec(value);
  if (!dateTime) {
    throw new ConversionError(
      `invalid ISO date/time: ${JSON.stringify(value)} (datetime must contain T and an explicit offset)`,
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, offset] =
    dateTime;
  const year = +yearText;
  const month = +monthText;
  const day = +dayText;
  const hour = +hourText;
  const minute = +minuteText;
  const second = +secondText;
  assertCalendarDate(year, month, day, value);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ConversionError(`invalid ISO date/time: ${JSON.stringify(value)} (invalid time)`);
  }

  const fraction = fractionText ?? "";
  if (fraction.length > 3) {
    throw new ConversionError(
      `invalid ISO date/time: ${JSON.stringify(value)} (fractional precision finer than milliseconds)`,
    );
  }
  const milliseconds = +(fraction.padEnd(3, "0") || "0");
  const offsetMinutes = parseOffsetMinutes(offset, value);
  const utc = dateFromParts(year, month, day, hour, minute, second, milliseconds, -offsetMinutes);
  return utc.toISOString();
}

/** Validate Standard.site's UTF-8 and code-point limits. */
export function validateLexiconString(
  value: string,
  label: string,
  maxBytes: number,
  maxCodePoints: number,
): void {
  if (typeof value !== "string") {
    throw new ConversionError(`${label} must be a string`);
  }
  const bytes = new TextEncoder().encode(value).byteLength;
  const codePoints = [...value].length;
  if (bytes > maxBytes || codePoints > maxCodePoints) {
    throw new ConversionError(
      `${label} exceeds the Lexicon limit of ${maxBytes} UTF-8 bytes and ${maxCodePoints} code points`,
    );
  }
}

/**
 * Parse the deliberately small frontmatter grammar used by the portfolio.
 * This avoids accepting YAML features whose interpretation differs between
 * Astro and the publisher (anchors, aliases, implicit types, and multiline
 * scalars).
 */
export function parseFrontmatter(
  sourcePath: string,
  source: string,
): ParseFrontmatterResult {
  if (typeof source !== "string") {
    throw new ConversionError(`${sourcePath}: source must be text`);
  }
  const lines = source.split(/\r?\n/u);
  if (lines[0] !== "---") {
    fail(sourcePath, 1, "frontmatter", "first line must be exactly ---");
  }
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      closing = index;
      break;
    }
  }
  if (closing < 0) {
    fail(sourcePath, lines.length, "frontmatter", "missing closing --- delimiter");
  }

  const values: Record<string, unknown> = {};
  let index = 1;
  while (index < closing) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^\s/u.test(line)) {
      fail(sourcePath, lineNumber, "frontmatter", "indented mappings are not supported");
    }
    const colon = line.indexOf(":");
    if (colon < 0) {
      fail(sourcePath, lineNumber, "frontmatter", "expected an unindented key: value mapping");
    }
    const key = line.slice(0, colon).trim();
    if (!BLOG_FIELDS.has(key)) {
      fail(sourcePath, lineNumber, key || "frontmatter", "unknown top-level field");
    }
    if (key in values) {
      fail(sourcePath, lineNumber, key, "duplicate field");
    }
    const rawValue = line.slice(colon + 1);
    if (key === "tags") {
      const trimmed = rawValue.trim();
      if (trimmed === "[]") {
        values.tags = [];
        index += 1;
        continue;
      }
      if (trimmed) {
        fail(sourcePath, lineNumber, key, "use exactly [] or a two-space block list");
      }
      const tags: string[] = [];
      let cursor = index + 1;
      while (cursor < closing) {
        const item = lines[cursor];
        const itemNumber = cursor + 1;
        if (!item.trim()) {
          fail(sourcePath, itemNumber, key, "blank lines are not allowed in a tag block");
        }
        if (item.startsWith("  - ")) {
          tags.push(parseScalar(item.slice(4), sourcePath, itemNumber, key));
          cursor += 1;
          continue;
        }
        if (/^\s/u.test(item)) {
          fail(sourcePath, itemNumber, key, "tag items require exactly two spaces followed by - ");
        }
        break;
      }
      if (tags.length === 0) {
        fail(sourcePath, lineNumber, key, "tag block must contain at least one item");
      }
      values.tags = tags;
      index = cursor;
      continue;
    }
    if (key === "draft") {
      const draftValue = rawValue.trim();
      if (draftValue !== "true" && draftValue !== "false") {
        fail(sourcePath, lineNumber, key, "must be the unquoted literal true or false");
      }
      values.draft = draftValue === "true";
    } else {
      values[key] = parseScalar(rawValue, sourcePath, lineNumber, key);
    }
    index += 1;
  }

  if (!("title" in values)) {
    fail(sourcePath, 1, "title", "required for every entry, including drafts");
  }
  if (!("date" in values)) {
    fail(sourcePath, 1, "date", "required for every entry, including drafts");
  }
  validateFrontmatterTypes(values, sourcePath);
  return {
    data: {
      title: values.title as string,
      date: values.date as string,
      ...(values.slug === undefined ? {} : { slug: values.slug as string }),
      ...(values.description === undefined ? {} : { description: values.description as string }),
      tags: (values.tags as string[] | undefined) ?? [],
      draft: (values.draft as boolean | undefined) ?? false,
      ...(values.image === undefined ? {} : { image: values.image as string }),
      ...(values.imageAlt === undefined ? {} : { imageAlt: values.imageAlt as string }),
    },
    // Keep the original newline semantics where possible.  A source ending in
    // a newline has one extra split item that should be represented in body.
    body: lines.slice(closing + 1).join("\n"),
  };
}

/**
 * Convert Markdown/MDX to a readable plaintext representation.  The parser is
 * intentionally a small block/inline AST parser: it never evaluates MDX and
 * does not use regex replacements as a substitute for parsing nested markup.
 */
export function markdownToPlainText(markdown: string): string {
  const blocks = parseMarkdownBlocks(markdown);
  const lines: string[] = [];
  const footnotes = new Map<string, string>();
  const references = new Set<string>();

  for (const block of blocks) {
    if (block.kind === "code") {
      if (block.value.trim()) lines.push(block.value.trim());
      continue;
    }
    if (block.kind === "footnote-definition") {
      footnotes.set(block.label, inlineToPlain(block.value, references));
      continue;
    }
    const rendered = inlineToPlain(block.value, references).trim();
    if (rendered) lines.push(rendered);
  }

  // Definitions are often emitted after the article body by GFM. Include each
  // referenced definition exactly once so a plaintext reader can understand
  // the corresponding [^reference].
  for (const label of references) {
    const definition = footnotes.get(label);
    if (definition) lines.push(`[Footnote ${label}] ${definition}`);
  }
  return lines
    .join("\n\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Build the publication record with Standard.site's required fields. */
export function buildPublicationRecord(options: {
  readonly siteOrigin?: string;
  readonly name?: string;
  readonly description?: string;
} = {}): StandardSitePublication {
  const url = options.siteOrigin ?? DEFAULT_SITE_ORIGIN;
  const name = options.name ?? DEFAULT_PUBLICATION_NAME;
  const description = options.description ?? DEFAULT_PUBLICATION_DESCRIPTION;
  validateHttpOrigin(url);
  validateLexiconString(name, "publication name", 5000, 500);
  validateLexiconString(description, "publication description", 30000, 3000);
  return {
    $type: PUBLICATION_COLLECTION,
    url,
    name,
    description,
  };
}

/** Build and lexicon-validate one deterministic document record. */
export function buildDocumentRecord(
  source: BlogSource,
  options: {
    readonly publicationUri: string;
    readonly siteOrigin?: string;
  },
): StandardSiteDocument {
  const { frontmatter } = source;
  if (frontmatter.draft) {
    throw new ConversionError(`${source.path}: draft posts cannot be converted to documents`);
  }
  const slug = requirePublishedSlug(frontmatter, source.path);
  const description = requireDescription(frontmatter, source.path);
  const site = parsePublicationAtUri(options.publicationUri);
  validateLexiconString(frontmatter.title, `${source.path}: title`, 5000, 500);
  validateLexiconString(description, `${source.path}: description`, 30000, 3000);
  for (const tag of frontmatter.tags) {
    validateLexiconString(tag, `${source.path}: tag`, 1280, 128);
  }
  const textContent = markdownToPlainText(source.markdown);
  const document: StandardSiteDocument = {
    $type: DOCUMENT_COLLECTION,
    site,
    title: frontmatter.title,
    publishedAt: normalizeDatetime(frontmatter.date),
    path: `/blog/${slug}/`,
    description,
    ...(frontmatter.tags.length > 0 ? { tags: [...frontmatter.tags] } : {}),
    textContent,
  };
  validateDocumentRecord(document, options.siteOrigin ?? DEFAULT_SITE_ORIGIN);
  return document;
}

/** Runtime structural validation for records before handing them to atcute. */
export function validatePublicationRecord(record: unknown): asserts record is StandardSitePublication {
  if (!isObject(record) || record.$type !== PUBLICATION_COLLECTION) {
    throw new ConversionError("publication record has an invalid $type");
  }
  requireString(record.url, "publication url");
  requireString(record.name, "publication name");
  if (record.description !== undefined) requireString(record.description, "publication description");
  validateHttpOrigin(record.url);
  validateLexiconString(record.name, "publication name", 5000, 500);
  if (record.description !== undefined) {
    validateLexiconString(record.description, "publication description", 30000, 3000);
  }
}

/** Runtime structural validation for records before handing them to atcute. */
export function validateDocumentRecord(
  record: unknown,
  siteOrigin = DEFAULT_SITE_ORIGIN,
): asserts record is StandardSiteDocument {
  if (!isObject(record) || record.$type !== DOCUMENT_COLLECTION) {
    throw new ConversionError("document record has an invalid $type");
  }
  requireString(record.site, "document site");
  if (!record.site.startsWith("at://") && !record.site.startsWith("https://")) {
    throw new ConversionError("document site must be an AT-URI or HTTPS publication URL");
  }
  requireString(record.title, "document title");
  requireString(record.publishedAt, "document publishedAt");
  requireString(record.path, "document path");
  requireString(record.textContent, "document textContent");
  if (record.description !== undefined) requireString(record.description, "document description");
  if (record.tags !== undefined) {
    if (!Array.isArray(record.tags) || !record.tags.every((tag) => typeof tag === "string")) {
      throw new ConversionError("document tags must be an array of strings");
    }
    for (const tag of record.tags) validateLexiconString(tag, "document tag", 1280, 128);
  }
  validateLexiconString(record.title, "document title", 5000, 500);
  if (record.description !== undefined) {
    validateLexiconString(record.description, "document description", 30000, 3000);
  }
  normalizeDatetime(record.publishedAt);
  if (!record.path.startsWith("/")) throw new ConversionError("document path must start with /");
  validateHttpOrigin(siteOrigin);
}

/** Discover and parse all Markdown/MDX files, retaining deterministic paths. */
export async function discoverBlogSources(inputDirectory: string): Promise<ReadonlyArray<BlogSource>> {
  const root = resolve(inputDirectory);
  await assertNoSymlinkComponents(root, "input directory");
  await assertDirectory(root, "input directory");
  const files = await collectMarkdownFiles(root);
  const sources: BlogSource[] = [];
  for (const path of files) {
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ConversionError(`${path}: invalid UTF-8`);
      }
      throw error;
    }
    const parsed = parseFrontmatter(path, source);
    sources.push({
      path,
      relativePath: relative(root, path).split(sep).join("/"),
      frontmatter: parsed.data,
      markdown: parsed.body,
    });
  }
  return sources;
}

/**
 * Convert a blog directory into deterministic records.  This function only
 * reads files; it never writes generated output or contacts a network.
 */
export async function convertBlogDirectory(
  inputDirectory: string,
  options: ConvertOptions,
): Promise<ConversionResult> {
  const publicationUri = options.publicationUri
    ? parsePublicationAtUri(options.publicationUri)
    : publicationAtUri(options.authority, options.publicationRkey);
  const publication = buildPublicationRecord({
    siteOrigin: options.siteOrigin,
    name: options.publicationName,
    description: options.publicationDescription,
  });
  const sources = await discoverBlogSources(inputDirectory);
  const drafts: BlogSource[] = [];
  const documents: PublishedBlogPost[] = [];
  const seen = new Map<string, string>();

  for (const source of sources) {
    validateSourceFrontmatter(source);
    if (source.frontmatter.draft) {
      drafts.push(source);
      continue;
    }
    const slug = requirePublishedSlug(source.frontmatter, source.path);
    const previous = seen.get(slug);
    if (previous) {
      throw new ConversionError(
        `${source.path}: slug: duplicate published slug ${slug}; already used by ${previous}`,
      );
    }
    seen.set(slug, source.path);
    const document = buildDocumentRecord(source, {
      publicationUri,
      siteOrigin: publication.url,
    });
    const rkey = deriveStableTid(`document:${slug}`);
    documents.push({
      source,
      slug,
      document,
      rkey,
      uri: documentAtUriForRkey(options.authority, rkey),
    });
  }
  documents.sort((left, right) => left.slug.localeCompare(right.slug));
  return { publication, publicationUri, documents, drafts };
}

function validateSourceFrontmatter(source: BlogSource): void {
  const { frontmatter } = source;
  validateLexiconString(frontmatter.title, `${source.path}: title`, 5000, 500);
  normalizeDatetime(frontmatter.date);
  for (const tag of frontmatter.tags) {
    validateLexiconString(tag, `${source.path}: tag`, 1280, 128);
  }
  if (frontmatter.description !== undefined) {
    validateLexiconString(frontmatter.description, `${source.path}: description`, 30000, 3000);
  }
  if (frontmatter.slug !== undefined) validateSlug(frontmatter.slug, source.path);
}

function requirePublishedSlug(frontmatter: BlogFrontmatter, path: string): string {
  if (!frontmatter.slug) {
    throw new ConversionError(`${path}: slug: published post requires an explicit non-empty slug`);
  }
  validateSlug(frontmatter.slug, path);
  return frontmatter.slug;
}

function requireDescription(frontmatter: BlogFrontmatter, path: string): string {
  if (!frontmatter.description) {
    throw new ConversionError(`${path}: description: published post requires a non-empty description`);
  }
  return frontmatter.description;
}

function validateSlug(slug: string, path = "slug"): void {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new ConversionError(`${path}: slug: must match lowercase stable slug syntax`);
  }
}

function validateAtAuthority(authority: string): void {
  if (authority.startsWith("did:")) {
    if (!DID_RE.test(authority) || authority.length > 2048) {
      throw new ConversionError("invalid DID authority");
    }
    const identifier = authority.split(":", 3)[2] ?? "";
    if (!identifier || authority.endsWith(":") || authority.endsWith("%")) {
      throw new ConversionError("DID identifier may not be empty or end in ':' or '%'");
    }
    if (/%(?![0-9A-Fa-f]{2})/u.test(identifier)) {
      throw new ConversionError("DID percent escapes must use two hexadecimal characters");
    }
    return;
  }
  if (!HANDLE_RE.test(authority) || authority !== authority.toLowerCase()) {
    throw new ConversionError("invalid normalized AT Protocol handle authority");
  }
}

function validateHttpOrigin(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConversionError(`site origin must be an absolute HTTP(S) URL: ${value}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConversionError(`site origin must be an absolute HTTP(S) URL: ${value}`);
  }
  if (parsed.pathname !== "/") {
    throw new ConversionError(`site origin must not include a path: ${value}`);
  }
}

function parseOffsetMinutes(offset: string, original: string): number {
  if (offset === "Z") return 0;
  const sign = offset[0] === "+" ? 1 : -1;
  const hours = +offset.slice(1, 3);
  const minutes = +offset.slice(4, 6);
  if (hours > 23 || minutes > 59) {
    throw new ConversionError(`invalid ISO date/time: ${JSON.stringify(original)} (invalid offset)`);
  }
  return sign * (hours * 60 + minutes);
}

function encodeTid(value: bigint): string {
  const maxValue = 1n << 63n;
  if (value < 0n || value >= maxValue) {
    throw new ConversionError("derived TID is outside the 63-bit range");
  }
  let remaining = value;
  let encoded = "";
  for (let index = 0; index < 13; index += 1) {
    encoded = TID_ALPHABET[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }
  if (remaining !== 0n) {
    throw new ConversionError("derived TID could not be encoded in 13 characters");
  }
  return encoded;
}

function assertCalendarDate(year: number, month: number, day: number, original: string): void {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new ConversionError(`invalid ISO date/time: ${JSON.stringify(original)} (invalid calendar date)`);
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dateFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  minuteAdjustment: number,
): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute + minuteAdjustment, second, millisecond);
  if (!Number.isFinite(date.getTime())) {
    throw new ConversionError("date is outside the supported range");
  }
  return date;
}

function parseScalar(raw: string, path: string, line: number, field: string): string {
  let value = raw.trim();
  if (!value) fail(path, line, field, "blank values are not supported");
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) fail(path, line, field, "malformed single-quoted scalar");
    const inner = value.slice(1, -1);
    let result = "";
    for (let index = 0; index < inner.length; index += 1) {
      if (inner[index] !== "'") {
        result += inner[index];
      } else if (inner[index + 1] === "'") {
        result += "'";
        index += 1;
      } else {
        fail(path, line, field, "single quotes must be doubled inside a quoted scalar");
      }
    }
    value = result;
  } else if (value.startsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(value);
      if (typeof decoded !== "string") fail(path, line, field, "double-quoted value must decode to a string");
      value = decoded;
    } catch {
      fail(path, line, field, "malformed JSON double-quoted scalar");
    }
  } else {
    if (["null", "Null", "NULL", "~"].includes(value)) fail(path, line, field, "null values are not supported");
    if (value.includes(" #")) fail(path, line, field, "inline comments are not supported");
    if (/^[{[|>&*!]/u.test(value) || /(?:^|\s)[&*!][A-Za-z0-9_.-]*/u.test(value)) {
      fail(path, line, field, "flow, anchors, aliases, tags, or multiline YAML values are not supported");
    }
  }
  if (!value) fail(path, line, field, "blank values are not supported");
  return value;
}

function validateFrontmatterTypes(values: Record<string, unknown>, path: string): void {
  for (const field of ["slug", "title", "date", "description", "image", "imageAlt"]) {
    if (values[field] !== undefined && typeof values[field] !== "string") {
      throw new ConversionError(`${path}: ${field}: invalid scalar value`);
    }
  }
  if (values.tags !== undefined && (!Array.isArray(values.tags) || !values.tags.every((tag) => typeof tag === "string"))) {
    throw new ConversionError(`${path}: tags: invalid list value`);
  }
  if (values.draft !== undefined && typeof values.draft !== "boolean") {
    throw new ConversionError(`${path}: draft: invalid boolean value`);
  }
}

function fail(path: string, line: number, field: string, message: string): never {
  throw new ConversionError(`${path}: line ${line}: ${field}: ${message}`);
}

async function assertDirectory(path: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    throw new ConversionError(`${label} is missing: ${path}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ConversionError(`${label} is missing or unsafe: ${path}`);
  }
}

async function assertNoSymlinkComponents(path: string, label: string): Promise<void> {
  let current: string = sep;
  for (const component of path.split(sep).filter(Boolean)) {
    current = join(current, component);
    let stat;
    try {
      stat = await lstat(current);
    } catch {
      // Let assertDirectory report a missing final path with its clearer error.
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new ConversionError(`${label} may not contain symlink component: ${current}`);
    }
  }
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ConversionError(`input directory may not contain symlink: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
        results.push(path);
      }
    }
  }
  await visit(root);
  return results.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

type MarkdownBlock =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "code"; readonly value: string }
  | { readonly kind: "footnote-definition"; readonly value: string; readonly label: string };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let index = 0;
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "text", value: paragraph.join("\n") });
      paragraph = [];
    }
  };
  while (index < lines.length) {
    const line = lines[index];
    const fence = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fence) {
      flush();
      const marker = fence[1][0];
      const size = fence[1].length;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}{${size},}\\s*$`, "u").test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", value: code.join("\n") });
      index += 1;
      continue;
    }
    const footnote = /^\s*\[\^([^\]]+)\]:\s*(.*)$/u.exec(line);
    if (footnote) {
      flush();
      const definition = [footnote[2]];
      index += 1;
      while (index < lines.length && /^(?: {2,}|\t)/u.test(lines[index]) && lines[index].trim()) {
        definition.push(lines[index].trim());
        index += 1;
      }
      blocks.push({ kind: "footnote-definition", label: footnote[1], value: definition.join(" ") });
      continue;
    }
    if (!line.trim()) {
      flush();
      index += 1;
      continue;
    }
    // MDX module declarations are executable source, not document prose.
    if (/^\s*(?:import|export)\s+(?:["']|[A-Za-z_*{])/u.test(line)) {
      flush();
      index += 1;
      continue;
    }
    // Setext heading underlines are block syntax, not article prose. A line
    // consisting only of `=` or `-` is also a thematic break.
    if (/^\s*(?:={3,}|-{3,})\s*$/u.test(line)) {
      index += 1;
      continue;
    }
    // Block syntax is normalized into text before the inline parser runs.
    const normalized = line
      .replace(/^\s{0,3}#{1,6}\s+/u, "")
      .replace(/^(?:\s{0,3}>\s?)+/u, "")
      .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u, "")
      .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/u, "")
      .replace(/^\s*\|/u, "")
      .replace(/\|\s*$/u, "");
    // GFM table delimiter rows do not carry prose.
    if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(line)) {
      index += 1;
      continue;
    }
    // Consecutive list items are separate block nodes even without a blank
    // line between them. Keep that boundary in the plaintext output.
    if (/^\s{0,3}(?:[-+*]|\d+[.)])\s+/u.test(line)) {
      flush();
      paragraph.push(normalized);
      flush();
      index += 1;
      continue;
    }
    paragraph.push(normalized);
    index += 1;
  }
  flush();
  return blocks;
}

function inlineToPlain(value: string, references: Set<string>): string {
  // Tokenize links/images/code spans before removing punctuation so nested
  // labels and URLs are handled as units rather than via global substitutions.
  const tokens: string[] = [];
  let text = value.replace(/!\[([^\]]*)\]\([^)]*\)/gu, (_match, alt: string) => {
    tokens.push(alt);
    return `\u0000${tokens.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/gu, (_match, label: string) => {
    tokens.push(label);
    return `\u0000${tokens.length - 1}\u0000`;
  });
  text = text.replace(/`+([^`]+)`+/gu, (_match, code: string) => {
    tokens.push(code);
    return `\u0000${tokens.length - 1}\u0000`;
  });
  text = text.replace(/<!--[\s\S]*?-->/gu, "");
  text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gu, "$1");
  text = text.replace(/<\/?[A-Za-z][^>]*>/gu, "");
  text = text.replace(/\[\^([^\]]+)\]/gu, (_match, label: string) => {
    references.add(label);
    return `[Footnote ${label}]`;
  });
  // MDX expressions are executable syntax, not article prose. Keep ordinary
  // punctuation while removing a balanced expression conservatively.
  text = removeMdxExpressions(text);
  text = text
    .replace(/\\([\\`*_{}[\]()#+.!|>~-])/gu, "$1")
    .replace(/[*_~]+/gu, "")
    .replace(/\u0000(\d+)\u0000/gu, (_match, index: string) => tokens[+index] ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, decodeEntity)
    .replace(/[ \t]+/gu, " ");
  return text;
}

function removeMdxExpressions(value: string): string {
  let result = "";
  let depth = 0;
  let quote: string | undefined;
  for (const char of value) {
    if (depth === 0) {
      if (char === "{") {
        depth = 1;
      } else {
        result += char;
      }
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
  }
  return result;
}

function decodeEntity(_match: string, entity: string): string {
  if (entity === "amp") return "&";
  if (entity === "lt") return "<";
  if (entity === "gt") return ">";
  if (entity === "quot") return '"';
  if (entity === "apos") return "'";
  if (entity === "nbsp") return " ";
  const numeric = entity.startsWith("#x")
    ? Number.parseInt(entity.slice(2), 16)
    : Number.parseInt(entity.slice(1), 10);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
    ? String.fromCodePoint(numeric)
    : _match;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new ConversionError(`${label} must be a string`);
}
