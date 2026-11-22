// pattern: Imperative Shell

import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { parse } from "@atcute/lexicons/validations";
import { SiteStandardDocument, SiteStandardPublication } from "@atcute/standard-site";
import {
  OAuthClient,
  MemoryStore,
  type OAuthSession,
} from "@atcute/oauth-node-client";
import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WellKnownHandleResolver,
  WebDidDocumentResolver,
} from "@atcute/identity-resolver";
import { NodeDnsHandleResolver } from "@atcute/identity-resolver-node";

import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  documentAtUri,
} from "../../src/standard-site/identity.ts";
import {
  documentPathForSlug,
  validateRecordExport,
  type DocumentRecord,
  type PlannedRecord,
  type PublicationRecord,
  type RecordExport,
  type StandardRecord,
} from "../../src/standard-site/records.ts";
import { STANDARD_SITE_DEFAULT_DID } from "../../src/site-config.ts";
import {
  BLOG_SOURCE_DIRECTORY,
  preflightBlogSources,
  type BlogSourcePreflight,
} from "./source-preflight.ts";
import {
  PdsError,
  PublisherError,
  type PlannedAction,
  type PublicationPlan,
  type PublisherPds,
  type RecordPlan,
  type RemoteRecord,
} from "./types.ts";

/** Record export path inside the Astro output directory. */
export const RECORDS_EXPORT_PATH = "standard-site/records.json";

export interface PublishSummary {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly draftsExcluded: number;
}

export interface PublishResult extends PublishSummary {
  readonly records: readonly RecordPlan[];
}

/** Canonical JSON keeps diffs stable even when a PDS changes object key order. */
export function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return input;
  };

  return JSON.stringify(normalize(value));
}

/** Return changed top-level fields for an operator-readable dry run. */
export function changedFields(
  remote: StandardRecord | null,
  planned: StandardRecord,
): readonly string[] {
  if (remote === null) return ["<new record>"];
  const fields = new Set([...Object.keys(remote), ...Object.keys(planned)]);
  return [...fields]
    .filter(
      (field) =>
        stableJson(remote[field as keyof typeof remote]) !==
        stableJson(planned[field as keyof typeof planned]),
    )
    .sort((left, right) => left.localeCompare(right));
}

export function planRecord(
  planned: PlannedRecord,
  remote: RemoteRecord | null,
): RecordPlan {
  const action =
    remote === null
      ? "create"
      : stableJson(remote.value) === stableJson(planned.value)
        ? "unchanged"
        : "update";
  return {
    planned,
    remote,
    action,
    changes: action === "unchanged" ? [] : changedFields(remote?.value ?? null, planned.value),
  };
}

/**
 * Validate a planned record against the pinned Standard.site lexicon.
 *
 * The shared records validator already checks this shape at the export
 * boundary; this is the planner's own guard for records built in memory. The
 * only policy a schema cannot express is that `textContent` must be present
 * and a string, including for an article with no text.
 */
export function assertRecord(plan: PlannedRecord): void {
  try {
    if (plan.collection === PUBLICATION_COLLECTION) {
      parse(SiteStandardPublication.mainSchema, plan.value);
      return;
    }
    const textContent = (plan.value as DocumentRecord).textContent;
    if (typeof textContent !== "string") {
      throw new PublisherError("document textContent must be a string");
    }
    parse(SiteStandardDocument.mainSchema, plan.value);
  } catch (error) {
    throw new PublisherError(
      `invalid ${plan.collection} record ${plan.uri}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** The records the build exported, in the shape the planner consumes. */
export interface PlannedPublicationRecords {
  readonly publication: PlannedRecord<PublicationRecord>;
  readonly documents: readonly PlannedRecord<DocumentRecord>[];
}

/** Read the current records and create a deterministic create/update/no-op plan. */
export async function planPublication(
  records: PlannedPublicationRecords,
  pds: PublisherPds,
  did: string,
): Promise<PublicationPlan> {
  const publicationUri = records.publication.uri;
  const rkey = publicationUri.slice(publicationUri.lastIndexOf("/") + 1);
  if (!publicationUri.startsWith(`at://${did}/${PUBLICATION_COLLECTION}/`)) {
    throw new PublisherError(
      `publication URI ${publicationUri} does not belong to the authenticated DID ${did}`,
    );
  }
  records.documents.forEach((document) => {
    if (!document.uri.startsWith(`at://${did}/${DOCUMENT_COLLECTION}/`)) {
      throw new PublisherError(
        `document URI ${document.uri} does not belong to the authenticated DID ${did}`,
      );
    }
    if (document.value.site !== publicationUri) {
      throw new PublisherError(
        `document ${document.uri} references ${document.value.site}, not ${publicationUri}`,
      );
    }
  });
  const publication: PlannedRecord<PublicationRecord> = {
    collection: PUBLICATION_COLLECTION,
    rkey,
    uri: publicationUri,
    value: records.publication.value,
  };
  assertRecord(publication);
  records.documents.forEach(assertRecord);

  const [remotePublication, ...remoteDocuments] = await Promise.all([
    pds.getRecord(publication.collection, publication.rkey),
    ...records.documents.map((document) => pds.getRecord(document.collection, document.rkey)),
  ]);

  if (remotePublication !== null && remotePublication.uri !== publication.uri) {
    throw new PublisherError(`PDS returned ${remotePublication.uri} for ${publication.uri}`);
  }
  records.documents.forEach((document, index) => {
    const remote = remoteDocuments[index];
    if (remote !== undefined && remote !== null && remote.uri !== document.uri) {
      throw new PublisherError(`PDS returned ${remote.uri} for ${document.uri}`);
    }
  });

  return {
    did,
    publication: planRecord(publication, remotePublication ?? null),
    documents: records.documents.map((document, index) =>
      planRecord(document, remoteDocuments[index] ?? null),
    ),
  };
}

function plansInWriteOrder(plan: PublicationPlan): readonly RecordPlan[] {
  return [plan.publication, ...plan.documents];
}

/** Apply only creates/updates, preserving compare-and-swap CIDs and verifying each write. */
export async function applyPublicationPlan(
  plan: PublicationPlan,
  pds: PublisherPds,
  repository: string,
  draftsExcluded = 0,
): Promise<PublishResult> {
  const records: RecordPlan[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const recordPlan of plansInWriteOrder(plan)) {
    if (recordPlan.action === "unchanged") {
      unchanged += 1;
      records.push(recordPlan);
      continue;
    }

    let result;
    try {
      result = await pds.putRecord({
        repo: repository,
        collection: recordPlan.planned.collection,
        rkey: recordPlan.planned.rkey,
        record: recordPlan.planned.value,
        swapRecord: recordPlan.remote?.cid ?? null,
      });
    } catch (error) {
      if (error instanceof PdsError && error.operation === "putRecord") {
        if (error.code === "InvalidSwap") {
          throw new PublisherError(
            `PDS record conflict for ${recordPlan.planned.uri}; it changed after planning`,
            { cause: error },
          );
        }
        throw new PublisherError(
          `PDS rejected ${recordPlan.action} for ${recordPlan.planned.uri}`,
          { cause: error },
        );
      }
      throw new PublisherError(
        `${recordPlan.action} failed for ${recordPlan.planned.uri}`,
        { cause: error },
      );
    }

    const verified = await pds.getRecord(recordPlan.planned.collection, recordPlan.planned.rkey);
    if (
      verified === null ||
      verified.uri !== recordPlan.planned.uri ||
      stableJson(verified.value) !== stableJson(recordPlan.planned.value)
    ) {
      throw new PublisherError(`post-write verification failed for ${recordPlan.planned.uri}`);
    }
    if (result.uri !== recordPlan.planned.uri) {
      throw new PublisherError(
        `PDS returned ${result.uri} for ${recordPlan.planned.uri}; refusing an ambiguous write`,
      );
    }

    if (recordPlan.action === "create") created += 1;
    else updated += 1;
    records.push(recordPlan);
  }

  if (records.length !== plansInWriteOrder(plan).length) {
    throw new PublisherError("publisher result did not account for every planned record");
  }
  return { created, updated, unchanged, draftsExcluded: draftsExcluded, records };
}

/** Adapt an authenticated atcute Client to the small injectable PDS boundary. */
export function createAtcutePds(client: Client, repository: ActorIdentifier): PublisherPds {
  return {
    async getRecord(collection, rkey) {
      const response = await client.get("com.atproto.repo.getRecord", {
        params: { repo: repository, collection, rkey },
      });
      if (!response.ok) {
        if (response.data.error === "RecordNotFound") return null;
        throw new PdsError(
          "getRecord",
          response.data.error,
          response.status,
          `${collection}/${rkey}${response.data.message ? `: ${response.data.message}` : ""}`,
        );
      }
      if (!response.data.cid) {
        throw new PublisherError(`PDS getRecord omitted a CID for ${collection}/${rkey}; refusing an unsafe update`);
      }
      return {
        uri: response.data.uri,
        cid: response.data.cid,
        value: response.data.value as unknown as StandardRecord,
      };
    },
    async putRecord(input) {
      const response = await client.post("com.atproto.repo.putRecord", {
        input: {
          repo: input.repo as ActorIdentifier,
          collection: input.collection,
          rkey: input.rkey,
          record: input.record as unknown as Record<string, unknown>,
          swapRecord: input.swapRecord,
        },
      });
      if (!response.ok) {
        throw new PdsError(
          "putRecord",
          response.data.error,
          response.status,
          `${input.collection}/${input.rkey}${response.data.message ? `: ${response.data.message}` : ""}`,
        );
      }
      return { uri: response.data.uri, cid: response.data.cid };
    },
  };
}

export interface OAuthLoginOptions {
  readonly identifier: string;
  readonly port?: number;
  readonly scope?: string;
}

/**
 * Narrow write permission set: only creates and updates of the two record
 * collections the publisher manages. Deletes and media uploads are outside
 * this scope by design.
 */
export const STANDARD_SITE_OAUTH_SCOPE =
  "atproto repo:site.standard.publication?action=create&action=update repo:site.standard.document?action=create&action=update";

const OAUTH_FETCH_ATTEMPTS = 3;
const OAUTH_FETCH_TIMEOUT_MS = 15_000;
const OAUTH_FETCH_BACKOFF_MS = 250;
const RETRYABLE_DISCOVERY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface OAuthFetchOptions {
  /** Underlying fetch implementation, injectable for deterministic tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Total attempts for idempotent GET requests, including the first attempt. */
  readonly attempts?: number;
  readonly timeoutMs?: number;
  readonly backoffMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method !== undefined) return init.method.toUpperCase();
  if (typeof input === "object" && input !== null && "method" in input) {
    return String((input as { readonly method?: unknown }).method ?? "GET").toUpperCase();
  }
  return "GET";
}

function isRetryableOAuthRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (requestMethod(input, init) !== "GET") return false;

  const rawUrl =
    typeof input === "object" && input !== null && "url" in input
      ? String((input as { readonly url: unknown }).url)
      : String(input);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  return (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-authorization-server" ||
    url.pathname === "/.well-known/atproto-did" ||
    url.hostname === "plc.directory"
  );
}

/**
 * Add bounded timeout/retry behavior to OAuth discovery requests.
 *
 * Only GETs are retried. OAuth PAR and token requests are POSTs and must not
 * be replayed automatically because their side effects and request bodies may
 * not be safely repeatable.
 */
export function createOAuthFetch(options: OAuthFetchOptions = {}): typeof globalThis.fetch {
  const fetchThis = options.fetch ?? globalThis.fetch;
  if (fetchThis === undefined) {
    throw new PublisherError("global fetch is unavailable; use Node.js 22 or provide a fetch implementation");
  }
  const attempts = Math.max(1, Math.floor(options.attempts ?? OAUTH_FETCH_ATTEMPTS));
  const timeoutMs = Math.max(1, options.timeoutMs ?? OAUTH_FETCH_TIMEOUT_MS);
  const backoffMs = Math.max(0, options.backoffMs ?? OAUTH_FETCH_BACKOFF_MS);
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  }));

  return async (input, init) => {
    const retryable = isRetryableOAuthRequest(input, init);
    const maxAttempts = retryable ? attempts : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const timeoutController = new AbortController();
      const callerSignal = init?.signal;
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutController.signal])
        : timeoutController.signal;
      const timeout = setTimeout(
        () => timeoutController.abort(new Error(`OAuth request timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      let response: Response | undefined;

      try {
        response = await fetchThis(input, { ...init, signal });
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (response !== undefined) {
        if (!retryable || !RETRYABLE_DISCOVERY_STATUSES.has(response.status) || attempt + 1 >= maxAttempts) {
          return response;
        }
        try {
          await response.body?.cancel();
        } catch {
          // The response is already being discarded before the retry.
        }
      } else if (!retryable || callerSignal?.aborted || attempt + 1 >= maxAttempts) {
        throw lastError;
      }

      if (callerSignal?.aborted) {
        throw lastError;
      }
      await sleep(backoffMs * 2 ** attempt);
    }

    throw lastError ?? new PublisherError("OAuth request failed without a response");
  };
}

/** Select an explicit handle when provided, otherwise resolve the authority DID directly. */
export function selectOAuthIdentifier(authority: string, configuredAccount?: string): string {
  return configuredAccount ?? authority;
}

/** Render nested Error.cause values without exposing request credentials. */
export function formatErrorChain(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code =
      typeof (current as Error & { readonly code?: unknown }).code === "string"
        ? ` [${(current as Error & { readonly code: string }).code}]`
        : "";
    messages.push(`${current.name}: ${current.message}${code}`);
    current = current.cause;
  }

  return messages.length > 0 ? messages.join("; caused by ") : String(error);
}

/** Run the atcute loopback OAuth flow and return the authenticated session. */
export async function authenticateLoopback(options: OAuthLoginOptions): Promise<OAuthSession> {
  let server: Server | undefined;
  let oauthClient: OAuthClient;
  let callbackResolve: ((session: OAuthSession) => void) | undefined;
  let callbackReject: ((error: unknown) => void) | undefined;
  const callback = new Promise<OAuthSession>((resolvePromise, rejectPromise) => {
    callbackResolve = resolvePromise;
    callbackReject = rejectPromise;
  });

  server = createServer(async (request, response) => {
    const address = server?.address();
    const port = typeof address === "object" && address !== null ? address.port : options.port ?? 0;
    const callbackUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (callbackUrl.pathname !== "/callback") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    try {
      const result = await oauthClient.callback(callbackUrl.searchParams);
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization complete. You can close this window.\n");
      callbackResolve?.(result.session);
    } catch (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization failed. Return to the terminal for details.\n");
      callbackReject?.(error);
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server?.once("error", rejectPromise);
    server?.listen(options.port ?? 0, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port ?? 0;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const oauthFetch = createOAuthFetch();
  const actorResolver = new LocalActorResolver({
    handleResolver: new CompositeHandleResolver({
      strategy: "race",
      methods: {
        http: new WellKnownHandleResolver({ fetch: oauthFetch }),
        dns: new NodeDnsHandleResolver(),
      },
    }),
    didDocumentResolver: new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver({ fetch: oauthFetch }),
        web: new WebDidDocumentResolver({ fetch: oauthFetch }),
      },
    }),
  });
  oauthClient = new OAuthClient({
    metadata: {
      redirect_uris: [redirectUri],
      scope: options.scope ?? STANDARD_SITE_OAUTH_SCOPE,
    },
    actorResolver,
    stores: {
      sessions: new MemoryStore(),
      states: new MemoryStore({ maxSize: 8, ttl: 10 * 60 * 1000 }),
    },
    fetch: oauthFetch,
  });

  try {
    const authorization = await oauthClient.authorize({
      target: { type: "account", identifier: options.identifier as ActorIdentifier },
      redirectUri,
    });
    console.log(`Open this URL to authorize Standard.site publishing:\n${authorization.url}\n`);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<OAuthSession>((_, rejectPromise) => {
        timeout = setTimeout(
          () => rejectPromise(new PublisherError("OAuth callback timed out after 10 minutes")),
          10 * 60 * 1000,
        );
      });
      return await Promise.race([callback, timeoutPromise]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  } finally {
    await new Promise<void>((resolvePromise) => server?.close(() => resolvePromise()));
  }
}

/** Build the site with Astro's public programmatic API, outside the CLI. */
export async function buildStandardSite(repositoryRoot: string): Promise<void> {
  const { build } = await import("astro");
  await build({ root: repositoryRoot, mode: "production", outDir: "./dist" });
}

/** Read the record export from the fresh build; a missing file means disabled. */
export async function readRecordsExportFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PublisherError(`could not read the Standard.site record export at ${path}`, {
      cause: error,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new PublisherError(
      `Standard.site record export at ${path} is not valid JSON`,
      { cause: error },
    );
  }
}

/** Authenticate, enforce the publication owner, and expose the PDS boundary. */
export async function authenticatePublisher(options: {
  readonly identifier: string;
  readonly authority: string;
}): Promise<AuthenticatedPublisher> {
  const session = await authenticateLoopback({ identifier: options.identifier });
  if (session.did !== options.authority) {
    throw new PublisherError(
      `OAuth signed in as ${session.did}, but the publication authority is ${options.authority}`,
    );
  }
  const client = new Client({ handler: session });
  return { did: session.did, pds: createAtcutePds(client, session.did) };
}

/**
 * Compare the fresh build's membership with the preflight source set.
 *
 * Every published source must produce exactly one document with the same
 * deterministic identity and route, and the export's draft/legacy counts must
 * describe the same sources. A published post without an explicit slug keeps
 * its website route but has no exported identity, so it blocks publishing.
 */
export function assertRecordExportMembership(
  authority: string,
  source: BlogSourcePreflight,
  recordExport: RecordExport,
): void {
  if (recordExport.did === null || recordExport.publication === null) {
    throw new PublisherError("cannot compare a disabled Standard.site record export");
  }
  const publicationUri = recordExport.publication.uri;
  if (recordExport.documents.some((document) => document.value.site !== publicationUri)) {
    throw new PublisherError("record export documents must reference the publication");
  }
  const expected = new Map<string, string>();
  for (const slug of source.publishedSlugs) {
    let uri: string;
    try {
      uri = documentAtUri(authority, slug);
    } catch (error) {
      throw new PublisherError(
        `${slug}: invalid published blog ID: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    expected.set(uri, slug);
  }

  const actual = new Map<string, string>();
  for (const document of recordExport.documents) {
    actual.set(document.uri, document.value.path);
  }

  const missing = [...expected.keys()].filter((uri) => !actual.has(uri));
  const unexpected = [...actual.keys()].filter((uri) => !expected.has(uri));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new PublisherError(
      `record export does not match the blog sources: missing ${missing.join(", ") || "none"}; unexpected ${unexpected.join(", ") || "none"}`,
    );
  }

  for (const [uri, slug] of expected) {
    const path = actual.get(uri);
    if (path !== documentPathForSlug(slug)) {
      throw new PublisherError(
        `document ${uri} path must be ${documentPathForSlug(slug)}, found ${String(path)}`,
      );
    }
  }

  if (recordExport.draftsExcluded !== source.draftsExcluded) {
    throw new PublisherError(
      `record export excluded ${recordExport.draftsExcluded} draft(s), but the sources contain ${source.draftsExcluded}`,
    );
  }

  const expectedLegacy = [...source.missingSlugIds].sort((left, right) => left.localeCompare(right));
  const actualLegacy = [...recordExport.missingSlugIds].sort((left, right) => left.localeCompare(right));
  if (expectedLegacy.join("\n") !== actualLegacy.join("\n")) {
    throw new PublisherError(
      `record export legacy IDs do not match the sources: expected ${expectedLegacy.join(", ") || "none"}; found ${actualLegacy.join(", ") || "none"}`,
    );
  }

  if (actualLegacy.length > 0) {
    throw new PublisherError(
      `published blog posts without an explicit slug are not exported and block publishing: ${actualLegacy.join(", ")}`,
    );
  }
}

export interface PublishWorkflowOptions {
  readonly repositoryRoot: string;
  /** DID that owns the publication records. */
  readonly authority: string;
  /** Optional OAuth account identifier when the authority is resolved via handle. */
  readonly account?: string;
  readonly write: boolean;
  readonly blogDirectory?: string;
}

export interface AuthenticatedPublisher {
  readonly did: string;
  readonly pds: PublisherPds;
}

/** Injectable boundaries; the CLI supplies the real implementations. */
export interface PublishWorkflowDependencies {
  readonly preflight: (
    repositoryRoot: string,
    blogDirectory: string,
  ) => Promise<BlogSourcePreflight>;
  readonly build: (repositoryRoot: string) => Promise<void>;
  readonly readRecordsExport: (path: string) => Promise<unknown>;
  readonly authenticate: (options: {
    readonly identifier: string;
    readonly authority: string;
  }) => Promise<AuthenticatedPublisher>;
  readonly log: (message: string) => void;
}

export interface PublishWorkflowResult {
  readonly mode: "dry-run" | "write";
  readonly did: string;
  readonly publicationUri: string;
  readonly draftsExcluded: number;
  readonly missingSlugIds: readonly string[];
  readonly summary: PublishSummary;
  readonly records: readonly RecordPlan[];
  readonly applied?: PublishResult;
}

const defaultDependencies: PublishWorkflowDependencies = {
  preflight: preflightBlogSources,
  build: buildStandardSite,
  readRecordsExport: readRecordsExportFile,
  authenticate: authenticatePublisher,
  log: (message) => console.log(message),
};

function summarizePlans(records: readonly RecordPlan[]): Record<PlannedAction, number> {
  return records.reduce(
    (summary, record) => {
      summary[record.action] += 1;
      return summary;
    },
    { create: 0, update: 0, unchanged: 0 } as Record<PlannedAction, number>,
  );
}

/**
 * Run the ordered publish workflow:
 * source preflight, fresh production build, export read/validation, membership
 * comparison, authentication, then planning and an optional write.
 *
 * Every rejection before authentication leaves the network untouched; a failed
 * build is never followed by reading an older export.
 */
export async function publishStandardSite(
  options: PublishWorkflowOptions,
  overrides: Partial<PublishWorkflowDependencies> = {},
): Promise<PublishWorkflowResult> {
  const dependencies: PublishWorkflowDependencies = { ...defaultDependencies, ...overrides };
  const authority = options.authority;
  if (!authority.startsWith("did:")) {
    throw new PublisherError(
      "PUBLIC_STANDARD_SITE_DID must be a DID for PDS publication; use STANDARD_SITE_ACCOUNT for a handle",
    );
  }

  const blogDirectory = options.blogDirectory ?? BLOG_SOURCE_DIRECTORY;
  const exportPath = resolve(options.repositoryRoot, "dist", RECORDS_EXPORT_PATH);

  // 1. Inspect the sources. Failures here must not build or authenticate.
  const source = await dependencies.preflight(options.repositoryRoot, blogDirectory);

  // 2. Always run an awaited, fresh production build before reading records.
  await dependencies.build(options.repositoryRoot);

  // 3. Read and validate the export from this build only.
  const rawExport = await dependencies.readRecordsExport(exportPath);
  if (rawExport === null || rawExport === undefined) {
    throw new PublisherError(
      `Standard.site publishing is disabled: ${exportPath} was not generated by the fresh build`,
    );
  }
  const recordExport = validateRecordExport(rawExport, authority);
  if (recordExport.did === null || recordExport.publication === null) {
    throw new PublisherError(
      `Standard.site publishing is disabled: ${exportPath} has no configured publication DID`,
    );
  }
  assertRecord(recordExport.publication);
  recordExport.documents.forEach(assertRecord);

  // 4. The build must describe exactly the sources preflight inspected.
  assertRecordExportMembership(authority, source, recordExport);

  // 5. Only a complete, consistent export can reach authentication.
  const identifier = selectOAuthIdentifier(authority, options.account);
  const authenticated = await dependencies.authenticate({ identifier, authority });
  if (authenticated.did !== authority) {
    throw new PublisherError(
      `OAuth signed in as ${authenticated.did}, but the publication authority is ${authority}`,
    );
  }

  // 6. Plan against the live PDS, then write only with an explicit request.
  const plan = await planPublication(recordExport, authenticated.pds, authenticated.did);
  const allPlans = plansInWriteOrder(plan);
  const counts = summarizePlans(allPlans);
  const summary: PublishSummary = {
    created: counts.create,
    updated: counts.update,
    unchanged: counts.unchanged,
    draftsExcluded: recordExport.draftsExcluded,
  };
  dependencies.log(
    `Standard.site plan: ${summary.created} create, ${summary.updated} update, ${summary.unchanged} unchanged; ${summary.draftsExcluded} draft(s) excluded.`,
  );
  allPlans
    .filter((record) => record.action !== "unchanged")
    .forEach((record) =>
      dependencies.log(
        `- ${record.action} ${record.planned.uri} (${record.changes.join(", ")})`,
      ),
    );

  if (!options.write) {
    dependencies.log("Dry run complete; no records were written. Re-run with --write to apply this plan.");
    return {
      mode: "dry-run",
      did: authenticated.did,
      publicationUri: recordExport.publication.uri,
      draftsExcluded: summary.draftsExcluded,
      missingSlugIds: recordExport.missingSlugIds,
      summary,
      records: allPlans,
    };
  }

  const applied = await applyPublicationPlan(
    plan,
    authenticated.pds,
    authenticated.did,
    recordExport.draftsExcluded,
  );
  dependencies.log(
    `Published Standard.site records: ${applied.created} created, ${applied.updated} updated, ${applied.unchanged} unchanged.`,
  );
  return {
    mode: "write",
    did: authenticated.did,
    publicationUri: recordExport.publication.uri,
    draftsExcluded: summary.draftsExcluded,
    missingSlugIds: recordExport.missingSlugIds,
    summary,
    records: allPlans,
    applied,
  };
}

export const PUBLISHER_USAGE =
  "Usage: pnpm standard-site:publish [--write]\n\nDefault mode is a dry run. --write applies creates and updates after OAuth.";

export function parseArgs(argv: readonly string[]): { write: boolean; help: boolean } {
  return {
    write: argv.includes("--write"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export interface PublisherCliContext {
  readonly repositoryRoot: string;
  readonly authority: string;
  readonly account?: string;
}

/**
 * CLI entry point with injected workflow boundaries.
 *
 * `--help` returns before any preflight, build, read, or authentication, so it
 * is always side-effect free.
 */
export async function runPublisherCli(
  argv: readonly string[],
  context: PublisherCliContext,
  overrides: Partial<PublishWorkflowDependencies> = {},
): Promise<PublishWorkflowResult | null> {
  const { write, help } = parseArgs(argv);
  if (help) {
    (overrides.log ?? defaultDependencies.log)(PUBLISHER_USAGE);
    return null;
  }
  return publishStandardSite(
    {
      repositoryRoot: context.repositoryRoot,
      authority: context.authority,
      account: context.account,
      write,
    },
    overrides,
  );
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const authority = process.env.PUBLIC_STANDARD_SITE_DID ?? STANDARD_SITE_DEFAULT_DID;
  await runPublisherCli(process.argv.slice(2), {
    repositoryRoot,
    authority,
    account: process.env.STANDARD_SITE_ACCOUNT,
  });
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error: unknown) => {
    console.error(`standard-site publisher: ${formatErrorChain(error)}`);
    process.exitCode = 1;
  });
}
