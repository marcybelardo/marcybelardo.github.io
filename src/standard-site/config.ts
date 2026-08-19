// pattern: Functional Core

import { SITE_ORIGIN as CONFIGURED_SITE_ORIGIN } from "../site-config.ts";

export const SITE_ORIGIN = CONFIGURED_SITE_ORIGIN;
export const STANDARD_SITE_HANDLE = "marcelinebelardo.com";
export const STANDARD_SITE_DID = "did:plc:fakq3c4v2fvivhoc3cgom3nc";

export const STANDARD_SITE_PUBLICATION_COLLECTION = "site.standard.publication";
export const STANDARD_SITE_DOCUMENT_COLLECTION = "site.standard.document";

export const STANDARD_SITE_COLLECTIONS = Object.freeze({
  publication: STANDARD_SITE_PUBLICATION_COLLECTION,
  document: STANDARD_SITE_DOCUMENT_COLLECTION,
});

export const STANDARD_SITE_PUBLICATION_METADATA = Object.freeze({
  name: "Art Computer Insanity Posting",
  description: "Marceline Belardo's thoughts on tech, politics, and art",
  url: SITE_ORIGIN,
  showInDiscover: true,
});

// Short aliases keep the public configuration convenient for Astro integrations.
export const EXPECTED_HANDLE = STANDARD_SITE_HANDLE;
export const EXPECTED_DID = STANDARD_SITE_DID;
export const PUBLICATION_COLLECTION = STANDARD_SITE_PUBLICATION_COLLECTION;
export const DOCUMENT_COLLECTION = STANDARD_SITE_DOCUMENT_COLLECTION;
export const PUBLICATION_METADATA = STANDARD_SITE_PUBLICATION_METADATA;

export type StandardSiteConfig = {
  readonly siteOrigin: typeof SITE_ORIGIN;
  readonly handle: typeof STANDARD_SITE_HANDLE;
  readonly did: typeof STANDARD_SITE_DID;
  readonly collections: typeof STANDARD_SITE_COLLECTIONS;
  readonly publication: typeof STANDARD_SITE_PUBLICATION_METADATA;
};

export const STANDARD_SITE_CONFIG: StandardSiteConfig = Object.freeze({
  siteOrigin: SITE_ORIGIN,
  handle: STANDARD_SITE_HANDLE,
  did: STANDARD_SITE_DID,
  collections: STANDARD_SITE_COLLECTIONS,
  publication: STANDARD_SITE_PUBLICATION_METADATA,
});
