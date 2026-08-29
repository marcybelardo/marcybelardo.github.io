import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "@atcute/client";

import {
  applyPublicationPlan,
  changedFields,
  createAtcutePds,
  createOAuthFetch,
  formatErrorChain,
  planPublication,
  planRecord,
  prepareRecords,
  selectOAuthIdentifier,
  stableJson,
} from "../scripts/standard-site/publisher.ts";
import {
  documentAtUri,
  publicationAtUri,
  publicationRecordKey,
} from "../src/standard-site/converter.ts";
import {
  DOCUMENT_COLLECTION,
  PdsError,
  PUBLICATION_COLLECTION,
  PublisherError,
  type PlannedRecord,
  type PublisherPds,
  type RemoteRecord,
} from "../scripts/standard-site/types.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const did = "did:plc:abc123";
const publication = {
  $type: PUBLICATION_COLLECTION,
  url: "https://www.marcelinebelardo.com",
  name: "Publication",
  description: "Description",
} as const;
const document = {
  $type: DOCUMENT_COLLECTION,
  site: publicationAtUri(did),
  title: "Hello",
  publishedAt: "2024-01-01T00:00:00.000Z",
  path: "/blog/hello/",
  description: "A description",
  textContent: "Hello body.",
} as const;

function record<T extends PlannedRecord>(record: T): T {
  return record;
}

test("stable JSON and record planning ignore object-key order", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  const planned = record({
    collection: PUBLICATION_COLLECTION,
    rkey: publicationRecordKey(),
    uri: publicationAtUri(did),
    value: publication,
  });
  const remote: RemoteRecord = {
    uri: planned.uri,
    cid: "bafyreicid",
    value: { description: "Description", name: "Publication", url: publication.url, $type: PUBLICATION_COLLECTION },
  };
  assert.equal(planRecord(planned, remote).action, "unchanged");
  assert.deepEqual(
    changedFields({ ...publication, name: "Old" }, planned.value),
    ["name"],
  );
});

test("prepareRecords converts published posts and excludes drafts", async () => {
  const root = await mkdtemp(join(tmpdir(), "standard-site-publisher-"));
  try {
    await writeFile(
      join(root, "published.md"),
      "---\nslug: hello\ntitle: Hello\ndate: 2024-01-01\ndescription: A description\n---\nHello **body**.\n",
    );
    await writeFile(
      join(root, "draft.md"),
      "---\ntitle: Draft\ndate: 2024-01-02\ndraft: true\n---\nDraft\n",
    );
    const prepared = await prepareRecords(root, { authority: did });
    assert.equal(prepared.documents.length, 1);
    assert.equal(prepared.documents[0]?.uri, documentAtUri(did, "hello"));
    assert.equal(prepared.excludedDrafts.length, 1);
    assert.equal(prepared.documents[0]?.value.textContent, "Hello body.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    const result = { uri: `at://did:plc:abc123/${input.collection}/${input.rkey}`, cid };
    this.records.set(key, { uri: result.uri, cid, value: input.record });
    return result;
  }
}

test("publication plans and applies create/update/no-op records with CAS", async () => {
  const prepared = {
    posts: [],
    excludedDrafts: [],
    publicationUri: publicationAtUri(did),
    publication,
    documents: [
      record({
        collection: DOCUMENT_COLLECTION,
        rkey: documentAtUri(did, "hello").split("/").at(-1)!,
        uri: documentAtUri(did, "hello"),
        value: document,
      }),
    ],
  } as const;
  const pds = new FakePds();
  const firstPlan = await planPublication(prepared, pds, did);
  assert.equal(firstPlan.publication.action, "create");
  assert.equal(firstPlan.documents[0]?.action, "create");
  const firstResult = await applyPublicationPlan(firstPlan, pds, did, 2);
  assert.deepEqual(
    { created: firstResult.created, updated: firstResult.updated, unchanged: firstResult.unchanged, draftsExcluded: firstResult.draftsExcluded },
    { created: 2, updated: 0, unchanged: 0, draftsExcluded: 2 },
  );
  assert.deepEqual(pds.writes.map((write) => write.swapRecord), [null, null]);

  const unchangedPlan = await planPublication(prepared, pds, did);
  assert.equal(unchangedPlan.publication.action, "unchanged");
  assert.equal(unchangedPlan.documents[0]?.action, "unchanged");
  const secondResult = await applyPublicationPlan(unchangedPlan, pds, did);
  assert.equal(secondResult.unchanged, 2);
  assert.equal(secondResult.records.length, 2);
  assert.equal(pds.writes.length, 2);

  const changedPrepared = {
    ...prepared,
    publication: { ...publication, description: "Changed" },
  } as const;
  const updatePlan = await planPublication(changedPrepared, pds, did);
  assert.equal(updatePlan.publication.action, "update");
  assert.deepEqual(updatePlan.publication.changes, ["description"]);
  await applyPublicationPlan(updatePlan, pds, did);
  assert.equal(pds.writes[2]?.swapRecord, "cid-1");
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
        data: { uri: publicationAtUri(did), cid: "cid-created" },
      };
    },
  } as unknown as Client;
  const pds = createAtcutePds(client, did);

  await pds.putRecord({
    repo: did,
    collection: PUBLICATION_COLLECTION,
    rkey: publicationRecordKey(),
    record: publication,
    swapRecord: null,
  });

  assert.ok(requestInput);
  assert.equal("validate" in requestInput!, false);
  assert.equal(requestInput!.swapRecord, null);
});

test("PDS write failures preserve error codes and classify only InvalidSwap as conflicts", async () => {
  const prepared = {
    posts: [],
    excludedDrafts: [],
    publicationUri: publicationAtUri(did),
    publication,
    documents: [],
  } as const;
  const plan = await planPublication(prepared, new FakePds(), did);

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
      error.message === `PDS rejected create for ${publicationAtUri(did)}` &&
      error.cause instanceof PdsError &&
      error.cause.code === "InvalidRequest",
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
      error.message === `PDS record conflict for ${publicationAtUri(did)}; it changed after planning`,
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
