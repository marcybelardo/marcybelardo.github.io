import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "@atcute/client";

import {
  PUBLISHER_USAGE,
  RECORDS_EXPORT_PATH,
  STANDARD_SITE_OAUTH_SCOPE,
  applyPublicationPlan,
  assertRecord,
  assertRecordExportMembership,
  changedFields,
  createAtcutePds,
  createOAuthFetch,
  formatErrorChain,
  planPublication,
  planRecord,
  publishStandardSite,
  readRecordsExportFile,
  runPublisherCli,
  selectOAuthIdentifier,
  stableJson,
  type AuthenticatedPublisher,
  type PublishWorkflowDependencies,
} from "../scripts/standard-site/publisher.ts";
import type { BlogSourcePreflight } from "../scripts/standard-site/source-preflight.ts";
import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  documentAtUri,
  publicationAtUri,
} from "../src/standard-site/identity.ts";
import {
  RECORD_EXPORT_VERSION,
  documentPathForSlug,
  validateRecordExport,
  type DocumentRecord,
  type PlannedRecord,
  type PublicationRecord,
  type RecordExport,
} from "../src/standard-site/records.ts";
import { STANDARD_SITE_PUBLICATION_RECORD_KEY } from "../src/site-config.ts";
import {
  PdsError,
  PublisherError,
  type PublisherPds,
  type RemoteRecord,
} from "../scripts/standard-site/types.ts";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const did = "did:plc:abc123";
const publicationUri = publicationAtUri(did);
const publication = {
  $type: PUBLICATION_COLLECTION,
  url: "https://www.marcelinebelardo.com",
  name: "Publication",
  description: "Description",
} as const;
const document = {
  $type: DOCUMENT_COLLECTION,
  site: publicationUri,
  title: "Hello",
  publishedAt: "2024-01-01T00:00:00.000Z",
  path: "/blog/hello/",
  description: "A description",
  textContent: "Hello body.",
} as const;

function plannedDocument(slug = "hello"): PlannedRecord<DocumentRecord> {
  const uri = documentAtUri(did, slug);
  return {
    collection: DOCUMENT_COLLECTION,
    rkey: uri.slice(uri.lastIndexOf("/") + 1),
    uri,
    value: { ...document, path: documentPathForSlug(slug) },
  };
}

function plannedPublication(
  value: PublicationRecord = publication,
): PlannedRecord<PublicationRecord> {
  return {
    collection: PUBLICATION_COLLECTION,
    rkey: STANDARD_SITE_PUBLICATION_RECORD_KEY,
    uri: publicationUri,
    value,
  };
}

function recordExport(overrides: Partial<RecordExport> = {}): RecordExport {
  return {
    version: RECORD_EXPORT_VERSION,
    did,
    publication: plannedPublication(),
    documents: [plannedDocument()],
    draftsExcluded: 2,
    missingSlugIds: [],
    ...overrides,
  };
}

const disabledExport = (): RecordExport =>
  recordExport({
    did: null,
    publication: null,
    documents: [],
    draftsExcluded: 0,
    missingSlugIds: [],
  });

test("stable JSON and record planning ignore object-key order", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  const planned = plannedPublication();
  const remote: RemoteRecord = {
    uri: planned.uri,
    cid: "bafyreicid",
    value: {
      description: "Description",
      name: "Publication",
      url: publication.url,
      $type: PUBLICATION_COLLECTION,
    },
  };
  assert.equal(planRecord(planned, remote).action, "unchanged");
  assert.deepEqual(
    changedFields({ ...publication, name: "Old" }, planned.value),
    ["name"],
  );
});

test("validateRecordExport accepts the shared export shape and rejects malformed identities", () => {
  const exported = validateRecordExport(recordExport(), did);
  assert.equal(exported.documents.length, 1);
  assert.equal(exported.documents[0]?.uri, documentAtUri(did, "hello"));

  assert.throws(
    () => validateRecordExport(recordExport(), "did:plc:other"),
    /does not match the expected DID/,
  );
  assert.throws(
    () => validateRecordExport({ ...recordExport(), version: 2 }),
    /version must be 1/,
  );
  assert.throws(() => validateRecordExport(null), /must be an object/);

  const duplicate = recordExport({ documents: [plannedDocument(), plannedDocument()] });
  assert.throws(() => validateRecordExport(duplicate), /repeats the slug hello/);

  const mismatchedIdentity = recordExport({
    documents: [{ ...plannedDocument("other"), uri: documentAtUri(did, "hello") }],
  });
  assert.throws(
    () => validateRecordExport(mismatchedIdentity),
    /uri must be the document AT-URI for other/,
  );

  assert.throws(
    () => validateRecordExport({ ...recordExport(), draftsExcluded: -1 }),
    /non-negative integer/,
  );
  assert.throws(
    () => validateRecordExport({ ...recordExport(), missingSlugIds: [1] }),
    /non-empty strings/,
  );

  const disabled = validateRecordExport(disabledExport());
  assert.equal(disabled.did, null);
  assert.equal(disabled.publication, null);
  assert.throws(
    () => validateRecordExport({ ...disabledExport(), publication: plannedPublication() }),
    /must not include a publication/,
  );
});

test("assertRecord rejects a document without a string textContent", () => {
  const plan = plannedDocument();
  const invalid = {
    ...plan,
    value: { ...plan.value, textContent: undefined },
  } as unknown as PlannedRecord<DocumentRecord>;
  assert.throws(() => assertRecord(invalid), /textContent must be a string/);
});

test("publication plans and applies create/update/no-op records with CAS", async () => {
  const records = { publication: plannedPublication(), documents: [plannedDocument()] };
  const pds = new FakePds();
  const firstPlan = await planPublication(records, pds, did);
  assert.equal(firstPlan.publication.action, "create");
  assert.equal(firstPlan.documents[0]?.action, "create");
  const firstResult = await applyPublicationPlan(firstPlan, pds, did, 2);
  assert.deepEqual(
    {
      created: firstResult.created,
      updated: firstResult.updated,
      unchanged: firstResult.unchanged,
      draftsExcluded: firstResult.draftsExcluded,
    },
    { created: 2, updated: 0, unchanged: 0, draftsExcluded: 2 },
  );
  assert.deepEqual(pds.writes.map((write) => write.swapRecord), [null, null]);

  const unchangedPlan = await planPublication(records, pds, did);
  assert.equal(unchangedPlan.publication.action, "unchanged");
  assert.equal(unchangedPlan.documents[0]?.action, "unchanged");
  const secondResult = await applyPublicationPlan(unchangedPlan, pds, did);
  assert.equal(secondResult.unchanged, 2);
  assert.equal(secondResult.records.length, 2);
  assert.equal(pds.writes.length, 2);

  const changedRecords = {
    publication: plannedPublication({ ...publication, description: "Changed" }),
    documents: [plannedDocument()],
  };
  const updatePlan = await planPublication(changedRecords, pds, did);
  assert.equal(updatePlan.publication.action, "update");
  assert.deepEqual(updatePlan.publication.changes, ["description"]);
  await applyPublicationPlan(updatePlan, pds, did);
  assert.equal(pds.writes[2]?.swapRecord, "cid-1");
});

test("planner rejects documents that do not belong to the publication", async () => {
  const pds = new FakePds();
  await assert.rejects(
    () =>
      planPublication(
        {
          publication: plannedPublication(),
          documents: [{ ...plannedDocument(), uri: documentAtUri("did:plc:other", "hello") }],
        },
        pds,
        did,
      ),
    /does not belong to the authenticated DID/,
  );
  await assert.rejects(
    () =>
      planPublication(
        {
          publication: plannedPublication(),
          documents: [
            { ...plannedDocument(), value: { ...document, site: publicationAtUri("did:plc:other") } },
          ],
        },
        pds,
        did,
      ),
    /references/,
  );
});

test("atcute adapter leaves remote lexicon validation optimistic", async () => {
  let requestInput: Record<string, unknown> | undefined;
  const client = {
    post: async (_method: string, options: { input: Record<string, unknown> }) => {
      requestInput = options.input;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        data: { uri: publicationUri, cid: "cid-created" },
      };
    },
  } as unknown as Client;
  const pds = createAtcutePds(client, did);

  await pds.putRecord({
    repo: did,
    collection: PUBLICATION_COLLECTION,
    rkey: STANDARD_SITE_PUBLICATION_RECORD_KEY,
    record: publication,
    swapRecord: null,
  });

  assert.ok(requestInput);
  assert.equal("validate" in requestInput!, false);
  assert.equal(requestInput!.swapRecord, null);
});

test("PDS write failures preserve error codes and classify only InvalidSwap as conflicts", async () => {
  const records = { publication: plannedPublication(), documents: [] };
  const plan = await planPublication(records, new FakePds(), did);

  const rejectingPds: PublisherPds = {
    getRecord: async () => null,
    putRecord: async () => {
      throw new PdsError("putRecord", "InvalidRequest", 400, "unknown Standard.site lexicon");
    },
  };
  await assert.rejects(
    () => applyPublicationPlan(plan, rejectingPds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `PDS rejected create for ${publicationUri}` &&
      error.cause instanceof PdsError &&
      error.cause.code === "InvalidRequest" &&
      error.cause.operation === "putRecord" &&
      error.cause.status === 400,
  );

  const throttledPds: PublisherPds = {
    getRecord: async () => null,
    putRecord: async () => {
      throw new PdsError("putRecord", "RateLimited", 429, "too many requests");
    },
  };
  await assert.rejects(
    () => applyPublicationPlan(plan, throttledPds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `PDS rejected create for ${publicationUri}` &&
      error.cause instanceof PdsError &&
      error.cause.operation === "putRecord" &&
      error.cause.code === "RateLimited" &&
      error.cause.status === 429 &&
      /too many requests/.test(error.cause.message),
  );

  const conflictPds: PublisherPds = {
    getRecord: async () => null,
    putRecord: async () => {
      throw new PdsError("putRecord", "InvalidSwap", 400, "record changed");
    },
  };
  await assert.rejects(
    () => applyPublicationPlan(plan, conflictPds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `PDS record conflict for ${publicationUri}; it changed after planning`,
  );
});

test("apply writes the publication before documents and verifies each write", async () => {
  const inner = new FakePds();
  const plan = await planPublicationWithDocuments(inner);
  const result = await applyPublicationPlan(plan, inner, did);

  assert.equal(result.created, 3);
  assert.equal(result.records.length, 3);
  assert.deepEqual(
    inner.writes.map((write) => write.collection),
    [PUBLICATION_COLLECTION, DOCUMENT_COLLECTION, DOCUMENT_COLLECTION],
  );
  assert.deepEqual(
    inner.writes.map((write) => write.rkey),
    [plannedPublication().rkey, ...documentRkeys()],
  );
});

test("apply rejects a null publication read-back before writing any document", async () => {
  const inner = new FakePds();
  const pds = new FaultyPds(inner, {
    collection: PUBLICATION_COLLECTION,
    readback: () => null,
  });
  const plan = await planPublicationWithDocuments(pds);

  await assert.rejects(
    () => applyPublicationPlan(plan, pds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `post-write verification failed for ${publicationUri}`,
  );
  assertOnlyPublicationWritten(inner);
});

test("apply rejects a publication read-back from the wrong URI before writing any document", async () => {
  const inner = new FakePds();
  const pds = new FaultyPds(inner, {
    collection: PUBLICATION_COLLECTION,
    readback: (record) => ({ ...record, uri: documentAtUri(did, "alpha") }),
  });
  const plan = await planPublicationWithDocuments(pds);

  await assert.rejects(
    () => applyPublicationPlan(plan, pds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `post-write verification failed for ${publicationUri}`,
  );
  assertOnlyPublicationWritten(inner);
});

test("apply rejects a publication read-back with a different value before writing any document", async () => {
  const inner = new FakePds();
  const pds = new FaultyPds(inner, {
    collection: PUBLICATION_COLLECTION,
    readback: (record) =>
      ({
        ...record,
        value: { ...record.value, name: "Tampered publication" },
      }) as RemoteRecord,
  });
  const plan = await planPublicationWithDocuments(pds);

  await assert.rejects(
    () => applyPublicationPlan(plan, pds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message === `post-write verification failed for ${publicationUri}`,
  );
  assertOnlyPublicationWritten(inner);
});

test("apply rejects a put whose return URI differs before writing any document", async () => {
  const inner = new FakePds();
  const wrongUri = documentAtUri(did, "wrong-return");
  const pds = new FaultyPds(inner, {
    collection: PUBLICATION_COLLECTION,
    putUri: () => wrongUri,
  });
  const plan = await planPublicationWithDocuments(pds);

  await assert.rejects(
    () => applyPublicationPlan(plan, pds, did),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message ===
        `PDS returned ${wrongUri} for ${publicationUri}; refusing an ambiguous write`,
  );
  assertOnlyPublicationWritten(inner);
});

const clientReturningGet = (response: unknown): Client =>
  ({ get: async () => response }) as unknown as Client;

test("atcute adapter refuses a getRecord response without a CID", async () => {
  const pds = createAtcutePds(
    clientReturningGet({
      ok: true,
      status: 200,
      headers: new Headers(),
      data: { uri: publicationUri, value: publication },
    }),
    did,
  );

  await assert.rejects(
    () => pds.getRecord(PUBLICATION_COLLECTION, STANDARD_SITE_PUBLICATION_RECORD_KEY),
    (error: unknown) =>
      error instanceof PublisherError &&
      error.message ===
        `PDS getRecord omitted a CID for ${PUBLICATION_COLLECTION}/${STANDARD_SITE_PUBLICATION_RECORD_KEY}; refusing an unsafe update`,
  );
});

test("atcute adapter preserves structured non-RecordNotFound GET diagnostics", async () => {
  const pds = createAtcutePds(
    clientReturningGet({
      ok: false,
      status: 403,
      headers: new Headers(),
      data: { error: "Forbidden", message: "not allowed" },
    }),
    did,
  );

  await assert.rejects(
    () => pds.getRecord(PUBLICATION_COLLECTION, STANDARD_SITE_PUBLICATION_RECORD_KEY),
    (error: unknown) => {
      assert.ok(error instanceof PdsError);
      assert.equal(error.operation, "getRecord");
      assert.equal(error.code, "Forbidden");
      assert.equal(error.status, 403);
      assert.equal(
        error.message,
        `PDS getRecord failed (403 Forbidden): ${PUBLICATION_COLLECTION}/${STANDARD_SITE_PUBLICATION_RECORD_KEY}: not allowed`,
      );
      return true;
    },
  );
});

test("atcute adapter maps only RecordNotFound GET errors to an absent record", async () => {
  const pds = createAtcutePds(
    clientReturningGet({
      ok: false,
      status: 400,
      headers: new Headers(),
      data: { error: "RecordNotFound" },
    }),
    did,
  );

  assert.equal(
    await pds.getRecord(PUBLICATION_COLLECTION, STANDARD_SITE_PUBLICATION_RECORD_KEY),
    null,
  );
});

test("planner preserves structured PDS read diagnostics", async () => {
  const failingPds: PublisherPds = {
    getRecord: async () => {
      throw new PdsError("getRecord", "RateLimited", 429, "slow down");
    },
    putRecord: async () => {
      throw new Error("unexpected write");
    },
  };

  await assert.rejects(
    () =>
      planPublication(
        { publication: plannedPublication(), documents: [] },
        failingPds,
        did,
      ),
    (error: unknown) =>
      error instanceof PdsError &&
      error.operation === "getRecord" &&
      error.code === "RateLimited" &&
      error.status === 429 &&
      /slow down/.test(error.message),
  );
});

test("OAuth discovery fetch retries transient metadata GETs but never POSTs", async () => {
  let metadataAttempts = 0;
  let unrelatedAttempts = 0;
  let postAttempts = 0;
  const fetchThis = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      postAttempts += 1;
      return new Response("retry me", { status: 503 });
    }
    if (String(input).endsWith("/.well-known/oauth-protected-resource")) {
      metadataAttempts += 1;
      if (metadataAttempts < 3) throw new TypeError("fetch failed");
      return new Response("{}", { status: 200 });
    }
    unrelatedAttempts += 1;
    return new Response("retry me", { status: 503 });
  };
  const oauthFetch = createOAuthFetch({
    fetch: fetchThis,
    attempts: 3,
    timeoutMs: 100,
    backoffMs: 0,
    sleep: async () => {},
  });

  assert.equal(
    (await oauthFetch("https://pds.example/.well-known/oauth-protected-resource")).status,
    200,
  );
  assert.equal(metadataAttempts, 3);
  assert.equal((await oauthFetch("https://pds.example/not-discovery")).status, 503);
  assert.equal(unrelatedAttempts, 1);
  assert.equal(
    (await oauthFetch("https://bsky.social/xrpc/com.atproto.repo.putRecord", { method: "POST" })).status,
    503,
  );
  assert.equal(postAttempts, 1);
});

test("OAuth scope is exactly the two write-only record permissions", () => {
  assert.equal(
    STANDARD_SITE_OAUTH_SCOPE,
    "atproto repo:site.standard.publication?action=create&action=update repo:site.standard.document?action=create&action=update",
  );
});

test("OAuth diagnostics include nested causes and preserve explicit account overrides", () => {
  const networkError = Object.assign(new Error("getaddrinfo ENOTFOUND pds.example"), { code: "ENOTFOUND" });
  const resolverError = new Error("failed to resolve protected resource metadata", { cause: networkError });
  assert.match(
    formatErrorChain(resolverError),
    /Error: failed to resolve protected resource metadata; caused by Error: getaddrinfo ENOTFOUND pds\.example \[ENOTFOUND\]/,
  );
  assert.equal(selectOAuthIdentifier(did), did);
  assert.equal(selectOAuthIdentifier(did, "marcelinebelardo.com"), "marcelinebelardo.com");
});

class FakePds implements PublisherPds {
  readonly records = new Map<string, RemoteRecord>();
  readonly writes: Array<{ collection: string; rkey: string; swapRecord: string | null }> = [];
  private cidCounter = 0;

  async getRecord(collection: PlannedRecord["collection"], rkey: string): Promise<RemoteRecord | null> {
    return this.records.get(`${collection}/${rkey}`) ?? null;
  }

  async putRecord(input: Parameters<PublisherPds["putRecord"]>[0]) {
    this.writes.push({ collection: input.collection, rkey: input.rkey, swapRecord: input.swapRecord });
    const key = `${input.collection}/${input.rkey}`;
    const current = this.records.get(key);
    if ((current?.cid ?? null) !== input.swapRecord) {
      throw new Error("swap conflict");
    }
    const cid = `cid-${++this.cidCounter}`;
    const result = { uri: `at://${did}/${input.collection}/${input.rkey}`, cid };
    this.records.set(key, { uri: result.uri, cid, value: input.record });
    return result;
  }
}

interface PdsFault {
  /** Collection whose live records are faulted after a successful write. */
  readonly collection: PlannedRecord["collection"];
  /** Replace the post-write read-back result, or return null to lose it. */
  readonly readback?: (record: RemoteRecord) => RemoteRecord | null;
  /** Replace the URI returned by a successful put. */
  readonly putUri?: (uri: string) => string;
}

/**
 * Delegate to the in-memory PDS and corrupt one boundary result.
 *
 * Planning reads still see the untouched remote state; the fault only applies
 * once a record exists, which is exactly the post-write verification read.
 */
class FaultyPds implements PublisherPds {
  private readonly inner: FakePds;
  private readonly fault: PdsFault;

  constructor(inner: FakePds, fault: PdsFault) {
    this.inner = inner;
    this.fault = fault;
  }

  async getRecord(
    collection: PlannedRecord["collection"],
    rkey: string,
  ): Promise<RemoteRecord | null> {
    const record = await this.inner.getRecord(collection, rkey);
    if (
      record !== null &&
      collection === this.fault.collection &&
      this.fault.readback !== undefined
    ) {
      return this.fault.readback(record);
    }
    return record;
  }

  async putRecord(input: Parameters<PublisherPds["putRecord"]>[0]) {
    const result = await this.inner.putRecord(input);
    if (this.fault.putUri !== undefined && input.collection === this.fault.collection) {
      return { ...result, uri: this.fault.putUri(result.uri) };
    }
    return result;
  }
}

/** Plan a publication plus two documents so a stopped apply is observable. */
async function planPublicationWithDocuments(pds: PublisherPds) {
  return planPublication(
    {
      publication: plannedPublication(),
      documents: [plannedDocument("alpha"), plannedDocument("beta")],
    },
    pds,
    did,
  );
}

const documentRkeys = (): readonly string[] => [
  plannedDocument("alpha").rkey,
  plannedDocument("beta").rkey,
];

function assertOnlyPublicationWritten(inner: FakePds): void {
  assert.deepEqual(
    inner.writes.map((write) => `${write.collection}/${write.rkey}`),
    [`${PUBLICATION_COLLECTION}/${plannedPublication().rkey}`],
  );
  for (const rkey of documentRkeys()) {
    assert.equal(inner.records.has(`${DOCUMENT_COLLECTION}/${rkey}`), false);
  }
}

interface WorkflowHarness {
  readonly calls: string[];
  readonly logs: string[];
  readonly pds: FakePds;
  readonly dependencies: Partial<PublishWorkflowDependencies>;
}

const defaultSource: BlogSourcePreflight = {
  publishedSlugs: ["hello"],
  draftsExcluded: 2,
  missingSlugIds: [],
};

function workflowHarness(options: {
  preflight?: () => Promise<BlogSourcePreflight>;
  build?: () => Promise<void>;
  exported?: unknown;
  authenticate?: () => Promise<AuthenticatedPublisher>;
} = {}): WorkflowHarness {
  const calls: string[] = [];
  const logs: string[] = [];
  const pds = new FakePds();
  return {
    calls,
    logs,
    pds,
    dependencies: {
      preflight: async () => {
        calls.push("preflight");
        return options.preflight ? await options.preflight() : defaultSource;
      },
      build: async () => {
        calls.push("build");
        if (options.build) await options.build();
      },
      readRecordsExport: async (path) => {
        calls.push(`read:${path}`);
        return "exported" in options ? options.exported : recordExport();
      },
      authenticate: async () => {
        calls.push("authenticate");
        return options.authenticate
          ? await options.authenticate()
          : { did, pds };
      },
      log: (message) => logs.push(message),
    },
  };
}

const workflowOptions = {
  repositoryRoot: "/repo",
  authority: did,
  write: false,
} as const;

const recordsPath = `/repo/dist/${RECORDS_EXPORT_PATH}`;

test("workflow stops before build, read, and auth when preflight fails", async () => {
  const harness = workflowHarness({
    preflight: async () => {
      throw new PublisherError("blog source directory may not contain symlink");
    },
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, harness.dependencies),
    /symlink/,
  );
  assert.deepEqual(harness.calls, ["preflight"]);
});

test("workflow never reads a stale export after a failed build", async () => {
  const harness = workflowHarness({
    build: async () => {
      throw new PublisherError("astro build failed");
    },
  });
  await assert.rejects(
    () => publishStandardSite({ ...workflowOptions, write: true }, harness.dependencies),
    /astro build failed/,
  );
  assert.deepEqual(harness.calls, ["preflight", "build"]);
  assert.equal(harness.pds.writes.length, 0);
});

test("workflow rejects a missing or disabled export before authentication", async () => {
  const missingFile = workflowHarness({ exported: null });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, missingFile.dependencies),
    /publishing is disabled/,
  );
  assert.deepEqual(missingFile.calls, ["preflight", "build", `read:${recordsPath}`]);

  const disabled = workflowHarness({ exported: disabledExport() });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, disabled.dependencies),
    /publishing is disabled/,
  );
  assert.equal(disabled.calls.includes("authenticate"), false);
});

test("workflow rejects an export owned by another DID before authentication", async () => {
  const harness = workflowHarness({
    exported: recordExport({
      did: "did:plc:other",
      publication: {
        ...plannedPublication(),
        uri: publicationAtUri("did:plc:other"),
      },
      documents: [],
    }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, harness.dependencies),
    /does not match the expected DID/,
  );
  assert.equal(harness.calls.includes("authenticate"), false);
});

test("workflow rejects invalid, missing, and null textContent before authentication", async () => {
  for (const textContent of [undefined, null, 42]) {
    const invalidDocument = {
      ...plannedDocument(),
      value: { ...document, textContent },
    } as unknown as PlannedRecord<DocumentRecord>;
    const harness = workflowHarness({
      exported: recordExport({ documents: [invalidDocument] }),
    });
    await assert.rejects(
      () => publishStandardSite(workflowOptions, harness.dependencies),
      (error: unknown) =>
        error instanceof Error && /textContent/i.test(error.message),
    );
    assert.equal(harness.calls.includes("authenticate"), false);
  }
});

test("workflow rejects export membership that differs from the sources before authentication", async () => {
  const missingDocument = workflowHarness({
    exported: recordExport({ documents: [] }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, missingDocument.dependencies),
    /does not match the blog sources/,
  );
  assert.equal(missingDocument.calls.includes("authenticate"), false);

  const extraDocument = workflowHarness({
    preflight: async () => ({ publishedSlugs: [], draftsExcluded: 2, missingSlugIds: [] }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, extraDocument.dependencies),
    /unexpected/,
  );
  assert.equal(extraDocument.calls.includes("authenticate"), false);

  const otherSlug = workflowHarness({
    exported: recordExport({ documents: [plannedDocument("other")] }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, otherSlug.dependencies),
    /does not match the blog sources/,
  );
  assert.equal(otherSlug.calls.includes("authenticate"), false);

  const wrongDrafts = workflowHarness({
    exported: recordExport({ draftsExcluded: 3 }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, wrongDrafts.dependencies),
    /excluded 3 draft\(s\), but the sources contain 2/,
  );
  assert.equal(wrongDrafts.calls.includes("authenticate"), false);

  const wrongLegacy = workflowHarness({
    exported: recordExport({ missingSlugIds: ["legacy-title"] }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, wrongLegacy.dependencies),
    /legacy IDs do not match/,
  );
  assert.equal(wrongLegacy.calls.includes("authenticate"), false);
});

test("workflow blocks publishing when a published post has no explicit slug", async () => {
  const source: BlogSourcePreflight = {
    publishedSlugs: [],
    draftsExcluded: 0,
    missingSlugIds: ["legacy-title-here"],
  };
  const harness = workflowHarness({
    preflight: async () => source,
    exported: recordExport({
      documents: [],
      draftsExcluded: 0,
      missingSlugIds: ["legacy-title-here"],
    }),
  });
  await assert.rejects(
    () => publishStandardSite(workflowOptions, harness.dependencies),
    /without an explicit slug .*block publishing/,
  );
  assert.equal(harness.calls.includes("authenticate"), false);
});

test("workflow rejects a non-DID authority before preflight", async () => {
  const harness = workflowHarness();
  await assert.rejects(
    () => publishStandardSite({ ...workflowOptions, authority: "marcelinebelardo.com" }, harness.dependencies),
    /must be a DID/,
  );
  assert.deepEqual(harness.calls, []);
});

test("workflow dry run plans records but performs no writes", async () => {
  const harness = workflowHarness();
  const result = await publishStandardSite(workflowOptions, harness.dependencies);

  assert.deepEqual(harness.calls, [
    "preflight",
    "build",
    `read:${recordsPath}`,
    "authenticate",
  ]);
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(
    { created: result.summary.created, updated: result.summary.updated, unchanged: result.summary.unchanged },
    { created: 2, updated: 0, unchanged: 0 },
  );
  assert.equal(result.applied, undefined);
  assert.equal(harness.pds.writes.length, 0);
  assert.match(harness.logs[0] ?? "", /2 create, 0 update, 0 unchanged; 2 draft\(s\) excluded/);
  assert.match(harness.logs.at(-1) ?? "", /Dry run complete/);
});

test("workflow write applies creates with CAS and re-plans as unchanged", async () => {
  const harness = workflowHarness();
  const applied = await publishStandardSite(
    { ...workflowOptions, write: true },
    harness.dependencies,
  );
  assert.equal(applied.mode, "write");
  assert.equal(applied.applied?.created, 2);
  assert.deepEqual(harness.pds.writes.map((write) => write.swapRecord), [null, null]);
  assert.equal(applied.applied?.draftsExcluded, 2);

  const rerun = await publishStandardSite(
    { ...workflowOptions, write: true },
    harness.dependencies,
  );
  assert.equal(rerun.applied?.created, 0);
  assert.equal(rerun.applied?.unchanged, 2);
  assert.equal(harness.pds.writes.length, 2);
});

test("membership comparison is exported and requires publication site links", () => {
  const exported = recordExport({
    documents: [
      {
        ...plannedDocument(),
        value: { ...document, site: publicationAtUri("did:plc:other") },
      },
    ],
  });
  assert.throws(
    () => assertRecordExportMembership(did, defaultSource, exported),
    /must reference the publication/,
  );
});

test("readRecordsExportFile treats a missing export as disabled and rejects invalid JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "standard-site-export-"));
  try {
    assert.equal(await readRecordsExportFile(join(root, "missing.json")), null);
    const malformed = join(root, "records.json");
    await writeFile(malformed, "{");
    await assert.rejects(
      () => readRecordsExportFile(malformed),
      /not valid JSON/,
    );
    const valid = join(root, "valid.json");
    await writeFile(valid, JSON.stringify(recordExport()));
    assert.deepEqual(await readRecordsExportFile(valid), recordExport());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--help is side-effect free", async () => {
  const harness = workflowHarness();
  const result = await runPublisherCli(["--help"], { repositoryRoot: "/repo", authority: did }, harness.dependencies);
  assert.equal(result, null);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.logs, [PUBLISHER_USAGE]);
});
