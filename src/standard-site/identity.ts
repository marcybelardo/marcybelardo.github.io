// Pure Standard.site identity primitives.
//
// This module intentionally has no filesystem, publishing, or Astro surface.
// The site configuration and the publishing/conversion layers can therefore
// share the same collection and record identity contract without pulling in
// the converter's filesystem dependencies.

import { createHash } from "node:crypto";

export const PUBLICATION_COLLECTION = "site.standard.publication" as const;
export const DOCUMENT_COLLECTION = "site.standard.document" as const;

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

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DID_RE = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
const HANDLE_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Errors raised while validating or deriving Standard.site identities. */
export class ConversionError extends Error {
  override name = "ConversionError";
}

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
  const offset =
    (BigInt(digest.readUInt32BE(0)) << 20n | BigInt(digest.readUIntBE(4, 3))) &
    TID_OFFSET_MASK;
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
      throw new ConversionError(
        `document TID collision: ${owner} and ${slug} both map to ${rkey}`,
      );
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

export type RecordIdentity = {
  readonly slug: string;
  readonly rkey: string;
  readonly uri: string;
};

/** Return an AT-URI for a document when its TID rkey is already known. */
export function documentAtUriForRkey(authority: string, rkey: string): string {
  validateAtAuthority(authority);
  validateTid(rkey, "document record key");
  return `at://${authority}/${DOCUMENT_COLLECTION}/${rkey}`;
}

/**
 * Parse an exact publication AT-URI. AT-URIs are intentionally not decoded
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

/** Validate the lowercase stable slug syntax used by document identities. */
export function validateSlug(slug: string, path = "slug"): void {
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
