// pattern: Functional Core

import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  documentAtUri,
  isTid,
  publicationRecordKey,
} from "./standard-site/identity.ts";

export const SITE_ORIGIN = "https://www.marcelinebelardo.com";

/** DID currently published by the site's verified canonical handle. */
export const STANDARD_SITE_DEFAULT_DID = "did:plc:fakq3c4v2fvivhoc3cgom3nc";

/**
 * The Standard.site publisher and the generated website share this boundary.
 *
 * The default is the DID resolved from the canonical handle. An environment
 * override is available for migrations or a different publication owner.
 */
export const STANDARD_SITE_PUBLICATION_RECORD_KEY = publicationRecordKey();

export type StandardSiteDocumentUri = string & {
  readonly __standardSiteDocumentUri: unique symbol;
};

type Environment = Readonly<Record<string, string | undefined>>;

const DID_PATTERN = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Read both Astro's public build environment and the Node environment used by
 * the local publisher.  This stays dynamic so tests and local commands can
 * configure the DID without importing a second configuration module.
 */
function getConfiguredEnvironment(): Environment {
  const importMetaEnv = (import.meta as ImportMeta & { readonly env?: Environment }).env;
  const runtimeProcess = (
    globalThis as typeof globalThis & {
      readonly process?: { readonly env?: Environment };
    }
  ).process;

  return {
    ...(importMetaEnv ?? {}),
    ...(runtimeProcess?.env ?? {}),
  };
}

function validateStandardSiteDid(value: string): string {
  if (value.length < 1 || value.length > 2048 || !DID_PATTERN.test(value)) {
    throw new Error(
      "PUBLIC_STANDARD_SITE_DID must be a valid AT Protocol DID (for example, did:plc:...)",
    );
  }

  const identifier = value.split(":", 3)[2] ?? "";

  if (!identifier || value.endsWith(":") || value.endsWith("%")) {
    throw new Error("PUBLIC_STANDARD_SITE_DID contains an empty or incomplete identifier");
  }

  if (/%(?![0-9A-Fa-f]{2})/.test(identifier)) {
    throw new Error("PUBLIC_STANDARD_SITE_DID contains an invalid percent escape");
  }

  return value;
}

/** Return the configured publication owner. */
export function getStandardSiteDid(): string | null {
  const rawValue = getConfiguredEnvironment().PUBLIC_STANDARD_SITE_DID ?? STANDARD_SITE_DEFAULT_DID;

  if (rawValue === undefined || rawValue.trim() === "") {
    return null;
  }

  if (rawValue !== rawValue.trim()) {
    throw new Error("PUBLIC_STANDARD_SITE_DID must not contain leading or trailing whitespace");
  }

  return validateStandardSiteDid(rawValue);
}

/** Return the stable publication AT-URI when a DID has been configured. */
export function getStandardSitePublicationUri(): string | null {
  const did = getStandardSiteDid();

  return did === null
    ? null
    : `at://${did}/${PUBLICATION_COLLECTION}/${STANDARD_SITE_PUBLICATION_RECORD_KEY}`;
}

/**
 * Build the deterministic document AT-URI used by a published blog route.
 * Slugs are record keys, so changing a published slug is intentionally an
 * explicit migration rather than an implicit update.
 */
export function createStandardSiteDocumentUri(
  slug: string,
): StandardSiteDocumentUri | null {
  if (!BLOG_SLUG_PATTERN.test(slug)) {
    throw new Error(`Standard.site document slug is invalid: ${slug}`);
  }

  const did = getStandardSiteDid();

  return did === null
    ? null
    : (documentAtUri(did, slug) as StandardSiteDocumentUri);
}

/** Validate a document URI before placing it in a page's head. */
export function validateStandardSiteDocumentUri(
  value: string,
): StandardSiteDocumentUri {
  if (!value.startsWith("at://") || value.includes("?") || value.includes("#")) {
    throw new Error("Standard.site document URI must be an absolute at:// URI without a query or fragment");
  }

  const parts = value.slice(5).split("/");
  const did = getStandardSiteDid();

  if (
    parts.length !== 3 ||
    parts[1] !== DOCUMENT_COLLECTION ||
    !parts[0] ||
    !isTid(parts[2])
  ) {
    throw new Error(
      `Standard.site document URI must match at://DID/${DOCUMENT_COLLECTION}/RKEY`,
    );
  }

  if (did !== null && parts[0] !== did) {
    throw new Error("Standard.site document URI must use the configured publication DID");
  }

  return value as StandardSiteDocumentUri;
}
