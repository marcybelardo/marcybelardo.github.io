// pattern: Functional Core + Imperative Shell

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STANDARD_SITE_DID,
  STANDARD_SITE_DOCUMENT_COLLECTION,
  STANDARD_SITE_PUBLICATION_COLLECTION,
} from "./config.ts";

const TID_PATTERN = /^[234567abcdefghijklmnopqrstuvwxyz]{13}$/;
const AT_URI_PATTERN = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/;
const REGISTRY_KEYS = new Set(["version", "did", "publication", "documents"]);
const DOCUMENT_KEYS = new Set(["id", "uri"]);

export type StandardSiteDocument = {
  readonly id: string;
  readonly uri: string;
};

export type StandardSiteState = {
  readonly publication: string | null;
  readonly documents: ReadonlyArray<StandardSiteDocument>;
};

export type StandardSiteBlogEntry = {
  readonly id: string;
  readonly data: {
    readonly slug?: unknown;
    readonly draft?: boolean;
  };
};

export type StandardSiteValidationInput = {
  readonly registry: unknown;
  readonly publicationFile: string | null;
  readonly blogEntries?: ReadonlyArray<StandardSiteBlogEntry>;
};

export type LoadStandardSiteStateOptions = {
  /** Repository root used to derive the default registry and well-known paths. */
  readonly repositoryRoot?: string;
  readonly registryPath?: string;
  readonly publicationPath?: string;
  /** Raw test/build input. When present, no registry file is read. */
  readonly registry?: unknown;
  readonly registryText?: string;
  /** Raw well-known file input. null means that the file is absent. */
  readonly publicationFile?: string | null;
  readonly publicationText?: string | null;
  readonly blogEntries?: ReadonlyArray<StandardSiteBlogEntry>;
};

function fail(message: string): never {
  throw new Error(`Standard.site validation failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      fail(`${path} contains unsupported field '${key}'`);
    }
  });
}

function parseRegistryText(registryText: string, registryPath: string): unknown {
  try {
    return JSON.parse(registryText) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`registry at ${registryPath} is not valid JSON (${detail})`);
  }
}

function assertTid(value: string, path: string): void {
  if (!TID_PATTERN.test(value)) {
    fail(`${path} must be a strict 13-character base32 TID rkey`);
  }
}

function assertAtUri(
  value: unknown,
  expectedCollection: string,
  path: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} must be an AT-URI for ${expectedCollection}`);
  }

  const match = value.match(AT_URI_PATTERN);
  if (!match) {
    fail(`${path} must have the form at://<DID>/<collection>/<13-character-TID>`);
  }

  const [, authority, collection, rkey] = match;
  if (authority !== STANDARD_SITE_DID) {
    fail(`${path} must be owned by ${STANDARD_SITE_DID}`);
  }
  if (collection !== expectedCollection) {
    fail(`${path} must use collection ${expectedCollection}`);
  }
  assertTid(rkey, `${path} rkey`);

  return value;
}

function validateRegistryShape(rawRegistry: unknown): {
  readonly publication: string | null;
  readonly documents: ReadonlyArray<StandardSiteDocument>;
} {
  if (!isRecord(rawRegistry)) {
    fail("registry must be a JSON object");
  }
  assertExactKeys(rawRegistry, REGISTRY_KEYS, "registry");

  if (rawRegistry.version !== 1) {
    fail("registry.version must be exactly 1");
  }
  if (rawRegistry.did !== STANDARD_SITE_DID) {
    fail(`registry.did must be exactly ${STANDARD_SITE_DID}`);
  }
  if (!Array.isArray(rawRegistry.documents)) {
    fail("registry.documents must be an array");
  }

  const publication = rawRegistry.publication;
  if (publication !== null && typeof publication !== "string") {
    fail("registry.publication must be null or an AT-URI string");
  }

  const documents: Array<StandardSiteDocument> = [];
  const seenIds = new Set<string>();
  const seenUris = new Set<string>();

  rawRegistry.documents.forEach((rawDocument, index) => {
    const path = `registry.documents[${index}]`;
    if (!isRecord(rawDocument)) {
      fail(`${path} must be an object with only id and uri`);
    }
    assertExactKeys(rawDocument, DOCUMENT_KEYS, path);

    const id = rawDocument.id;
    if (typeof id !== "string" || id.length === 0) {
      fail(`${path}.id must be a non-empty document ID`);
    }
    if (seenIds.has(id)) {
      fail(`${path}.id duplicates document ID '${id}'`);
    }

    const uri = assertAtUri(
      rawDocument.uri,
      STANDARD_SITE_DOCUMENT_COLLECTION,
      `${path}.uri`,
    );
    if (seenUris.has(uri)) {
      fail(`${path}.uri duplicates document URI '${uri}'`);
    }

    seenIds.add(id);
    seenUris.add(uri);
    documents.push({ id, uri });
  });

  return { publication, documents };
}

function validateDocumentBlogOwnership(
  documents: ReadonlyArray<StandardSiteDocument>,
  blogEntries: ReadonlyArray<StandardSiteBlogEntry> | undefined,
): void {
  if (documents.length === 0) {
    return;
  }
  if (!blogEntries) {
    fail("blogEntries are required to validate registered document mappings");
  }

  documents.forEach((document) => {
    const matchingEntries = blogEntries.filter((entry) => entry.id === document.id);
    const publishedEntries = matchingEntries.filter((entry) => entry.data.draft !== true);

    if (publishedEntries.length === 0) {
      if (matchingEntries.length > 0) {
        fail(`document '${document.id}' maps to a draft blog entry and cannot be published`);
      }
      fail(`document '${document.id}' does not match a production published blog entry`);
    }

    const post = publishedEntries[0];
    if (typeof post.data.slug !== "string" || post.data.slug.trim().length === 0) {
      fail(
        `document '${document.id}' maps to a fallback blog ID; the published post needs an explicit non-empty data.slug`,
      );
    }
    if (post.id !== post.data.slug || post.data.slug !== document.id) {
      fail(
        `document '${document.id}' must satisfy entry.id === post.data.slug === registry document id`,
      );
    }
  });
}

/** Pure validation core: no filesystem access or caching. */
export function validateStandardSiteState(
  input: StandardSiteValidationInput,
): StandardSiteState {
  const { publication, documents } = validateRegistryShape(input.registry);
  const publicationFile = input.publicationFile;

  if (publication === null) {
    if (documents.length > 0) {
      fail("unregistered state must have an empty documents array");
    }
    if (publicationFile !== null) {
      fail("unregistered state must not have a site.standard.publication file");
    }
    return { publication: null, documents: [] };
  }

  assertAtUri(publication, STANDARD_SITE_PUBLICATION_COLLECTION, "registry.publication");
  if (publicationFile === null) {
    fail("registered state requires public/.well-known/site.standard.publication");
  }
  if (publicationFile !== `${publication}\n`) {
    fail(
      "public/.well-known/site.standard.publication must contain exactly the publication AT-URI followed by one newline",
    );
  }

  validateDocumentBlogOwnership(documents, input.blogEntries);
  return { publication, documents };
}

export function parseStandardSiteState(
  registryText: string,
  publicationFile: string | null,
  blogEntries?: ReadonlyArray<StandardSiteBlogEntry>,
): StandardSiteState {
  return validateStandardSiteState({
    registry: parseRegistryText(registryText, "registry input"),
    publicationFile,
    blogEntries,
  });
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function readRequiredFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`could not read registry at ${path} (${detail})`);
  }
}

function readOptionalFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    const detail = error instanceof Error ? error.message : String(error);
    fail(`could not read publication pointer at ${path} (${detail})`);
  }
}

/**
 * Imperative build shell. Files are read on every call; callers should pass
 * production `getCollection("blog")` entries for registered mappings.
 */
export function loadStandardSiteState(
  options: LoadStandardSiteStateOptions = {},
): StandardSiteState {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const registryPath = options.registryPath ?? resolve(repositoryRoot, "src/standard-site/registry.json");
  const publicationPath =
    options.publicationPath ?? resolve(repositoryRoot, "public/.well-known/site.standard.publication");

  const hasRegistryObject = Object.prototype.hasOwnProperty.call(options, "registry");
  const hasRegistryText = Object.prototype.hasOwnProperty.call(options, "registryText");
  if (hasRegistryObject && hasRegistryText) {
    fail("provide only one of registry or registryText");
  }

  let registry: unknown;
  if (hasRegistryObject) {
    registry = options.registry;
  } else if (hasRegistryText) {
    if (typeof options.registryText !== "string") {
      fail("registryText must be a string");
    }
    registry = parseRegistryText(options.registryText, "registryText");
  } else {
    registry = parseRegistryText(readRequiredFile(registryPath), registryPath);
  }

  const hasPublicationFile = Object.prototype.hasOwnProperty.call(options, "publicationFile");
  const hasPublicationText = Object.prototype.hasOwnProperty.call(options, "publicationText");
  if (hasPublicationFile && hasPublicationText) {
    fail("provide only one of publicationFile or publicationText");
  }

  let publicationFile: string | null;
  if (hasPublicationFile) {
    if (options.publicationFile !== null && typeof options.publicationFile !== "string") {
      fail("publicationFile must be a string or null");
    }
    publicationFile = options.publicationFile ?? null;
  } else if (hasPublicationText) {
    if (options.publicationText !== null && typeof options.publicationText !== "string") {
      fail("publicationText must be a string or null");
    }
    publicationFile = options.publicationText ?? null;
  } else {
    publicationFile = readOptionalFile(publicationPath);
  }

  return validateStandardSiteState({
    registry,
    publicationFile,
    blogEntries: options.blogEntries,
  });
}

export { assertAtUri, assertTid };
