// pattern: Functional Core
//
// Shared Standard.site record construction and validation.
//
// The static site and the publisher both need the same records: the site emits
// a deterministic JSON export at build time, and the publisher plans PDS writes
// from that same model. Keeping the builders and the invariants here means the
// export route, its tests, and the publisher cannot drift apart.
//
// Records are validated with the generated atcute schemas. What remains here is
// only what a schema cannot express: the publication's own coordinates, the
// deterministic document record keys, and the site's canonical blog paths.

import { parse } from "@atcute/lexicons/validations";
import { SiteStandardDocument, SiteStandardPublication } from "@atcute/standard-site";

import { SITE_ORIGIN, STANDARD_SITE_PUBLICATION_RECORD_KEY } from "../site-config.ts";
import {
  ConversionError,
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  deriveStableTid,
  documentAtUriForRkey,
  publicationAtUri,
  validateSlug,
} from "./identity.ts";
import { htmlToTextContent } from "./html-to-text.ts";

/** Publication metadata shown wherever the publication is described. */
export const PUBLICATION_NAME = "Art Computer Insanity Posting";
export const PUBLICATION_DESCRIPTION =
  "Marceline Belardo's thoughts on tech, politics, and art";

/** The generated atcute record type for `site.standard.publication`. */
export type PublicationRecord = SiteStandardPublication.Main;
/** The generated atcute record type for `site.standard.document`. */
export type DocumentRecord = SiteStandardDocument.Main;
export type StandardRecord = PublicationRecord | DocumentRecord;

/** A record together with the coordinates used to write it. */
export type PlannedRecord<T extends StandardRecord = StandardRecord> = {
  readonly collection: typeof PUBLICATION_COLLECTION | typeof DOCUMENT_COLLECTION;
  readonly rkey: string;
  readonly uri: string;
  readonly value: T;
};

/** One blog entry as the site can observe it. */
export type RecordExportSource = {
  /** Route ID of the blog entry, reported when an explicit slug is missing. */
  readonly id: string;
  /** Explicit frontmatter slug. Without it the post is not exported. */
  readonly slug?: string | undefined;
  readonly title: string;
  readonly date: Date | string;
  readonly description?: string | undefined;
  readonly tags?: ReadonlyArray<string> | undefined;
  readonly draft?: boolean | undefined;
  /** Rendered article body only: no layout chrome and no author signature. */
  readonly html: string;
};

export type BuildRecordExportOptions = {
  /** Publication owner. `null` disables the export instead of publishing data. */
  readonly did: string | null;
  readonly siteOrigin?: string | undefined;
  readonly publicationName?: string | undefined;
  readonly publicationDescription?: string | undefined;
  readonly sources: ReadonlyArray<RecordExportSource>;
};

export const RECORD_EXPORT_VERSION = 1 as const;

/**
 * The build-time records export.
 *
 * A disabled export (`did: null`) carries no publication, no documents, and no
 * draft count, so a deployment without a configured identity publishes nothing
 * at all.
 */
export type RecordExport = {
  readonly version: typeof RECORD_EXPORT_VERSION;
  readonly did: string | null;
  readonly publication: PlannedRecord<PublicationRecord> | null;
  readonly documents: ReadonlyArray<PlannedRecord<DocumentRecord>>;
  readonly draftsExcluded: number;
  /**
   * Published posts that have no explicit frontmatter slug, listed by route ID.
   * They are not exported: a title-derived route ID is a compatibility address,
   * not a stable document identity.
   */
  readonly missingSlugIds: ReadonlyArray<string>;
};

/** Return the canonical blog path for a document slug. */
export function documentPathForSlug(slug: string): string {
  return `/blog/${slug}/`;
}

/**
 * Build the records export from blog entries.
 *
 * The result is deterministic: documents are ordered by the slug their
 * canonical path carries, drafts contribute only to `draftsExcluded`, and every
 * record is validated against the generated atcute schema before it is
 * returned.
 */
export function buildRecordExport(options: BuildRecordExportOptions): RecordExport {
  if (typeof options !== "object" || options === null || !Array.isArray(options.sources)) {
    throw new ConversionError("record export options require a sources array");
  }

  const sources = [...options.sources];
  const draftsExcluded = sources.filter((source) => source.draft === true).length;

  if (options.did === null) {
    return {
      version: RECORD_EXPORT_VERSION,
      did: null,
      publication: null,
      documents: [],
      draftsExcluded: 0,
      missingSlugIds: [],
    };
  }

  const publicationUri = publicationAtUri(options.did, STANDARD_SITE_PUBLICATION_RECORD_KEY);
  const publicationValue: PublicationRecord = {
    $type: PUBLICATION_COLLECTION,
    url: options.siteOrigin ?? SITE_ORIGIN,
    name: options.publicationName ?? PUBLICATION_NAME,
    description: options.publicationDescription ?? PUBLICATION_DESCRIPTION,
  };
  assertValidRecord(SiteStandardPublication.mainSchema, publicationValue, "publication record");

  const publication: PlannedRecord<PublicationRecord> = {
    collection: PUBLICATION_COLLECTION,
    rkey: STANDARD_SITE_PUBLICATION_RECORD_KEY,
    uri: publicationUri,
    value: publicationValue,
  };

  const documents: Array<PlannedRecord<DocumentRecord>> = [];
  const missingSlugIds: string[] = [];

  for (const source of sources) {
    if (source.draft === true) {
      continue;
    }

    const slug = explicitSlugOf(source);
    if (slug === undefined) {
      // A published post without an explicit slug keeps its route, but it has no
      // stable document identity to export.
      missingSlugIds.push(assertRouteId(source));
      continue;
    }

    if (typeof source.description !== "string" || source.description.trim().length === 0) {
      throw new ConversionError(`${source.id}: published description must be non-empty`);
    }
    const rkey = deriveStableTid(`document:${slug}`);
    const value: DocumentRecord = {
      $type: DOCUMENT_COLLECTION,
      site: publicationUri,
      title: source.title,
      publishedAt: publishedAtOf(source),
      path: documentPathForSlug(slug),
      ...(typeof source.description === "string" && source.description.length > 0
        ? { description: source.description }
        : {}),
      ...(source.tags && source.tags.length > 0 ? { tags: [...source.tags] } : {}),
      // The article body is the only text source: no layout, no signature, and
      // an empty body stays an empty string.
      textContent: htmlToTextContent(source.html),
    };
    assertValidRecord(SiteStandardDocument.mainSchema, value, `${slug}: document record`);

    documents.push({
      collection: DOCUMENT_COLLECTION,
      rkey,
      uri: documentAtUriForRkey(options.did, rkey),
      value,
    });
  }

  documents.sort((left, right) => compareSlugs(documentSlugOf(left), documentSlugOf(right)));

  const recordExport: RecordExport = {
    version: RECORD_EXPORT_VERSION,
    did: options.did,
    publication,
    documents,
    draftsExcluded,
    missingSlugIds: sortUnique(missingSlugIds),
  };

  // Validate the assembled envelope so a builder change cannot emit an export
  // that a consumer would reject.
  return validateRecordExport(recordExport, options.did);
}

/**
 * Validate an unknown value as a records export and return it.
 *
 * A disabled export is structurally valid; a caller that needs a publication
 * (the publisher, for example) rejects `did: null` separately. When
 * `expectedDid` is supplied, an enabled export must belong to that DID.
 */
export function validateRecordExport(input: unknown, expectedDid?: string): RecordExport {
  if (!isObject(input)) {
    throw new ConversionError("record export must be an object");
  }
  if (input.version !== RECORD_EXPORT_VERSION) {
    throw new ConversionError(
      `record export version must be ${RECORD_EXPORT_VERSION}: ${JSON.stringify(input.version)}`,
    );
  }

  const did = input.did;
  const documents = input.documents;
  const missingSlugIds = input.missingSlugIds;
  const draftsExcluded = input.draftsExcluded;

  if (did !== null && typeof did !== "string") {
    throw new ConversionError("record export did must be a string or null");
  }
  if (!Array.isArray(documents)) {
    throw new ConversionError("record export documents must be an array");
  }
  if (
    !Array.isArray(missingSlugIds) ||
    !missingSlugIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new ConversionError("record export missingSlugIds must be an array of non-empty strings");
  }
  if (!Number.isInteger(draftsExcluded) || draftsExcluded < 0) {
    throw new ConversionError("record export draftsExcluded must be a non-negative integer");
  }

  if (did === null) {
    if (input.publication !== null) {
      throw new ConversionError("a disabled record export must not include a publication");
    }
    if (documents.length > 0) {
      throw new ConversionError("a disabled record export must not include documents");
    }
    if (missingSlugIds.length > 0) {
      throw new ConversionError("a disabled record export must not include missing slug IDs");
    }
    if (draftsExcluded !== 0) {
      throw new ConversionError("a disabled record export must not include a draft count");
    }

    return {
      version: RECORD_EXPORT_VERSION,
      did: null,
      publication: null,
      documents: [],
      draftsExcluded: 0,
      missingSlugIds: [],
    };
  }

  if (!did.startsWith("did:")) {
    throw new ConversionError(`record export did must be a DID: ${did}`);
  }
  if (expectedDid !== undefined && did !== expectedDid) {
    throw new ConversionError(
      `record export did ${did} does not match the expected DID ${expectedDid}`,
    );
  }

  const publication = readPublicationRecord(input.publication, did);
  const publicationUri = publication.uri;
  const slugs = new Set<string>();
  let previousSlug: string | null = null;

  documents.forEach((entry: unknown, index: number) => {
    const label = `record export documents[${index}]`;
    const planned = readDocumentRecord(entry, label, did);
    const slug = documentSlugOf(planned);
    const rkey = deriveStableTid(`document:${slug}`);

    if (planned.rkey !== rkey) {
      throw new ConversionError(`${label}.rkey must be the record key for ${slug}`);
    }
    if (planned.uri !== documentAtUriForRkey(did, rkey)) {
      throw new ConversionError(`${label}.uri must be the document AT-URI for ${slug}`);
    }
    if (planned.value.site !== publicationUri) {
      throw new ConversionError(
        `${label}.value.site must reference the publication ${publicationUri}`,
      );
    }
    if (typeof planned.value.description !== "string" || planned.value.description.trim().length === 0) {
      throw new ConversionError(`${label}.value.description must be non-empty`);
    }
    if (!Object.hasOwn(planned.value, "textContent") || typeof planned.value.textContent !== "string") {
      throw new ConversionError(
        `${label}.value.textContent must be a string, including when the article has no text`,
      );
    }

    if (slugs.has(slug)) {
      throw new ConversionError(`${label}.value.path repeats the slug ${slug}`);
    }
    slugs.add(slug);

    if (previousSlug !== null && compareSlugs(previousSlug, slug) >= 0) {
      throw new ConversionError(
        `record export documents must be sorted by slug: ${previousSlug} precedes ${slug}`,
      );
    }
    previousSlug = slug;
  });

  missingSlugIds.forEach((id: string, index: number) => {
    if (slugs.has(id)) {
      throw new ConversionError(
        `record export missingSlugIds[${index}] ${id} is also an exported document`,
      );
    }
    if (index > 0 && compareSlugs(missingSlugIds[index - 1], id) >= 0) {
      throw new ConversionError("record export missingSlugIds must be sorted and unique");
    }
  });

  return {
    version: RECORD_EXPORT_VERSION,
    did,
    publication,
    documents: documents as ReadonlyArray<PlannedRecord<DocumentRecord>>,
    draftsExcluded,
    missingSlugIds: missingSlugIds as ReadonlyArray<string>,
  };
}

function readPublicationRecord(
  candidate: unknown,
  did: string,
): PlannedRecord<PublicationRecord> {
  if (!isObject(candidate)) {
    throw new ConversionError("record export publication must be an object");
  }
  if (candidate.collection !== PUBLICATION_COLLECTION) {
    throw new ConversionError(
      `record export publication collection must be ${PUBLICATION_COLLECTION}`,
    );
  }
  if (candidate.rkey !== STANDARD_SITE_PUBLICATION_RECORD_KEY) {
    throw new ConversionError(
      `record export publication rkey must be ${STANDARD_SITE_PUBLICATION_RECORD_KEY}`,
    );
  }
  const expectedUri = publicationAtUri(did, STANDARD_SITE_PUBLICATION_RECORD_KEY);
  if (candidate.uri !== expectedUri) {
    throw new ConversionError(`record export publication uri must be ${expectedUri}`);
  }

  assertValidRecord(SiteStandardPublication.mainSchema, candidate.value, "publication record");

  return {
    collection: PUBLICATION_COLLECTION,
    rkey: STANDARD_SITE_PUBLICATION_RECORD_KEY,
    uri: expectedUri,
    value: candidate.value as PublicationRecord,
  };
}

function readDocumentRecord(
  candidate: unknown,
  label: string,
  did: string,
): PlannedRecord<DocumentRecord> {
  if (!isObject(candidate)) {
    throw new ConversionError(`${label} must be an object`);
  }
  if (candidate.collection !== DOCUMENT_COLLECTION) {
    throw new ConversionError(`${label}.collection must be ${DOCUMENT_COLLECTION}`);
  }
  if (typeof candidate.rkey !== "string" || typeof candidate.uri !== "string") {
    throw new ConversionError(`${label} requires a record key and an AT-URI`);
  }
  if (!candidate.uri.startsWith(`at://${did}/${DOCUMENT_COLLECTION}/`)) {
    throw new ConversionError(`${label}.uri must belong to the publication DID ${did}`);
  }

  assertValidRecord(SiteStandardDocument.mainSchema, candidate.value, `${label}.value`);

  return {
    collection: DOCUMENT_COLLECTION,
    rkey: candidate.rkey,
    uri: candidate.uri,
    value: candidate.value as DocumentRecord,
  };
}

function assertValidRecord(
  schema: Parameters<typeof parse>[0],
  value: unknown,
  label: string,
): void {
  try {
    parse(schema, value);
  } catch (error) {
    throw new ConversionError(`${label} is invalid: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * Read the slug back out of the canonical blog path. The path is the only place
 * a document's slug is stored, so it is also what orders the export.
 */
function documentSlugOf(planned: PlannedRecord<DocumentRecord>): string {
  const path = planned.value.path;
  if (typeof path !== "string" || !path.startsWith("/blog/") || !path.endsWith("/")) {
    throw new ConversionError(
      `document path must match /blog/<slug>/: ${JSON.stringify(path ?? null)}`,
    );
  }

  const slug = path.slice("/blog/".length, -1);
  validateSlug(slug, "document path slug");

  return slug;
}

function explicitSlugOf(source: RecordExportSource): string | undefined {
  if (!isObject(source)) {
    throw new ConversionError("record export source must be an object");
  }

  const slug = source.slug;
  if (typeof slug !== "string" || slug.trim().length === 0) {
    return undefined;
  }

  const trimmed = slug.trim();
  validateSlug(trimmed, `${source.id}: slug`);

  return trimmed;
}

function assertRouteId(source: RecordExportSource): string {
  const id = source.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new ConversionError("record export source requires a non-empty route ID");
  }

  return id;
}

function publishedAtOf(source: RecordExportSource): string {
  const date = source.date instanceof Date ? source.date : new Date(source.date);

  if (Number.isNaN(date.getTime())) {
    throw new ConversionError(
      `${source.id}: published date is not a valid date: ${String(source.date)}`,
    );
  }

  return date.toISOString();
}

function sortUnique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort(compareSlugs);
}

/**
 * Order slugs by code unit so the export is identical on every machine,
 * independent of the local collation data.
 */
function compareSlugs(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
