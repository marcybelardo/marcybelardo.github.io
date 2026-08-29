// pattern: Imperative Shell

import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { Client } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { parse } from "@atcute/lexicons/validations";
import { SiteStandardDocument, SiteStandardPublication } from "@atcute/standard-site";
import {
  OAuthClient,
  MemoryStore,
  scope,
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
  convertBlogDirectory,
  validateDocumentRecord,
  validatePublicationRecord,
} from "../../src/standard-site/converter.ts";
import { STANDARD_SITE_DEFAULT_DID } from "../../src/site-config.ts";
import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  PublisherError,
  type DocumentRecord,
  type PlannedRecord,
  type PublicationPlan,
  type PublisherPds,
  type PublicationRecord,
  type PreparedRecords,
  PdsError,
  type RecordPlan,
  type RemoteRecord,
  type StandardRecord,
  type SourcePost,
} from "./types.ts";

export interface PublisherOptions {
  readonly authority: string;
  readonly siteOrigin?: string;
  readonly publicationName?: string;
  readonly publicationDescription?: string;
  readonly publicationUri?: string;
}

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

function assertRecord(plan: PlannedRecord): void {
  try {
    if (plan.collection === PUBLICATION_COLLECTION) {
      validatePublicationRecord(plan.value);
      parse(SiteStandardPublication.mainSchema, plan.value);
    } else {
      validateDocumentRecord(plan.value);
      parse(SiteStandardDocument.mainSchema, plan.value);
    }
  } catch (error) {
    throw new PublisherError(
      `invalid ${plan.collection} record ${plan.uri}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Convert the source collection into validated, deterministic planned records. */
export async function prepareRecords(
  blogDirectory: string,
  options: PublisherOptions,
): Promise<PreparedRecords> {
  const result = await convertBlogDirectory(blogDirectory, options);
  const publication: PublicationRecord = result.publication;
  const publicationPlan: PlannedRecord<PublicationRecord> = {
    collection: PUBLICATION_COLLECTION,
    rkey: result.publicationUri.slice(result.publicationUri.lastIndexOf("/") + 1),
    uri: result.publicationUri,
    value: publication,
  };
  assertRecord(publicationPlan);

  const documents = result.documents.map((post) => {
    const planned: PlannedRecord<DocumentRecord> = {
      collection: DOCUMENT_COLLECTION,
      rkey: post.rkey,
      uri: post.uri,
      value: post.document,
    };
    assertRecord(planned);
    return planned;
  });

  const posts: SourcePost[] = result.documents.map((post) => ({
    sourcePath: post.source.path,
    slug: post.slug,
    title: post.source.frontmatter.title,
    date: post.source.frontmatter.date,
    description: post.source.frontmatter.description ?? "",
    tags: post.source.frontmatter.tags,
    draft: false,
    textContent: post.document.textContent,
  }));

  return {
    posts,
    excludedDrafts: result.drafts.map((draft) => draft.path),
    publicationUri: result.publicationUri,
    publication,
    documents,
  };
}

/** Read the current records and create a deterministic create/update/no-op plan. */
export async function planPublication(
  prepared: PreparedRecords,
  pds: PublisherPds,
  did: string,
): Promise<PublicationPlan> {
  const publicationUri = prepared.publicationUri;
  const rkey = publicationUri.slice(publicationUri.lastIndexOf("/") + 1);
  if (!publicationUri.startsWith(`at://${did}/${PUBLICATION_COLLECTION}/`)) {
    throw new PublisherError(
      `publication URI ${publicationUri} does not belong to the authenticated DID ${did}`,
    );
  }
  prepared.documents.forEach((document) => {
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
    value: prepared.publication,
  };
  assertRecord(publication);

  const [remotePublication, ...remoteDocuments] = await Promise.all([
    pds.getRecord(publication.collection, publication.rkey),
    ...prepared.documents.map((document) => pds.getRecord(document.collection, document.rkey)),
  ]);

  if (remotePublication !== null && remotePublication.uri !== publication.uri) {
    throw new PublisherError(`PDS returned ${remotePublication.uri} for ${publication.uri}`);
  }
  prepared.documents.forEach((document, index) => {
    const remote = remoteDocuments[index];
    if (remote !== undefined && remote !== null && remote.uri !== document.uri) {
      throw new PublisherError(`PDS returned ${remote.uri} for ${document.uri}`);
    }
  });

  return {
    did,
    publication: planRecord(publication, remotePublication ?? null),
    documents: prepared.documents.map((document, index) =>
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

const STANDARD_SITE_OAUTH_SCOPE = `atproto ${scope.include({ nsid: "site.standard.authFull" })}`;

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

function parseArgs(argv: readonly string[]): { write: boolean; help: boolean } {
  return {
    write: argv.includes("--write"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

async function main(): Promise<void> {
  const { write, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(
      "Usage: pnpm standard-site:publish [--write]\n\nDefault mode is a dry run. --write applies creates and updates after OAuth.",
    );
    return;
  }

  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const authority = process.env.PUBLIC_STANDARD_SITE_DID ?? STANDARD_SITE_DEFAULT_DID;
  const account = selectOAuthIdentifier(authority, process.env.STANDARD_SITE_ACCOUNT);
  if (!authority.startsWith("did:")) {
    throw new PublisherError("PUBLIC_STANDARD_SITE_DID must be a DID for PDS publication; use STANDARD_SITE_ACCOUNT for a handle");
  }
  const prepared = await prepareRecords(resolve(repositoryRoot, "src/content/blog"), { authority });
  const session = await authenticateLoopback({ identifier: account });
  if (session.did !== authority && authority.startsWith("did:")) {
    throw new PublisherError(`OAuth signed in as ${session.did}, but the publication authority is ${authority}`);
  }

  const client = new Client({ handler: session });
  const pds = createAtcutePds(client, session.did);
  const plan = await planPublication(prepared, pds, session.did);
  const allPlans = plansInWriteOrder(plan);
  const counts = allPlans.reduce(
    (summary, record) => ({ ...summary, [record.action]: summary[record.action] + 1 }),
    { create: 0, update: 0, unchanged: 0 } as Record<"create" | "update" | "unchanged", number>,
  );
  console.log(
    `Standard.site plan: ${counts.create} create, ${counts.update} update, ${counts.unchanged} unchanged; ${prepared.excludedDrafts.length} draft(s) excluded.`,
  );
  allPlans
    .filter((record) => record.action !== "unchanged")
    .forEach((record) => console.log(`- ${record.action} ${record.planned.uri} (${record.changes.join(", ")})`));
  if (!write) {
    console.log("Dry run complete; no records were written. Re-run with --write to apply this plan.");
    return;
  }

  const result = await applyPublicationPlan(plan, pds, session.did, prepared.excludedDrafts.length);
  console.log(
    `Published Standard.site records: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`,
  );
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error: unknown) => {
    console.error(`standard-site publisher: ${formatErrorChain(error)}`);
    process.exitCode = 1;
  });
}
