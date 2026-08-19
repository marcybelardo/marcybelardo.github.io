import assert from "node:assert/strict";
import test from "node:test";

import {
  STANDARD_SITE_DID,
  STANDARD_SITE_DOCUMENT_COLLECTION,
  STANDARD_SITE_PUBLICATION_COLLECTION,
} from "../src/standard-site/config.ts";
import {
  assertAtUri,
  assertTid,
  loadStandardSiteState,
  parseStandardSiteState,
  validateStandardSiteState,
} from "../src/standard-site/state.ts";

const publication = `at://${STANDARD_SITE_DID}/${STANDARD_SITE_PUBLICATION_COLLECTION}/3jzfcf4wz4k2a`;
const documentUri = `at://${STANDARD_SITE_DID}/${STANDARD_SITE_DOCUMENT_COLLECTION}/3jzfcf4wz4k2b`;
const post = {
  id: "the-devil-you-know",
  data: { slug: "the-devil-you-know", draft: false },
};

function registry(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    did: STANDARD_SITE_DID,
    publication,
    documents: [{ id: post.id, uri: documentUri }],
    ...overrides,
  };
}

test("supports the unregistered state only when the pointer and mappings are absent", () => {
  assert.deepEqual(
    parseStandardSiteState(
      JSON.stringify({
        version: 1,
        did: STANDARD_SITE_DID,
        publication: null,
        documents: [],
      }),
      null,
    ),
    { publication: null, documents: [] },
  );

  assert.throws(
    () => parseStandardSiteState(JSON.stringify(registry({ publication: null })), null, [post]),
    /unregistered state must have an empty documents array/i,
  );
  assert.throws(
    () =>
      parseStandardSiteState(
        JSON.stringify({ version: 1, did: STANDARD_SITE_DID, publication: null, documents: [] }),
        `${publication}\n`,
      ),
    /must not have.*publication/i,
  );
});

test("supports registered zero and partial mappings", () => {
  assert.deepEqual(
    validateStandardSiteState({
      registry: registry({ documents: [] }),
      publicationFile: `${publication}\n`,
      blogEntries: [post],
    }),
    { publication, documents: [] },
  );
  assert.deepEqual(parseStandardSiteState(JSON.stringify(registry()), `${publication}\n`, [post]), {
    publication,
    documents: [{ id: post.id, uri: documentUri }],
  });
});

test("requires the exact publication pointer and one final newline", () => {
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), publication, [post]), /exactly.*one newline/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\n\n`, [post]), /exactly.*one newline/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\r\n`, [post]), /exactly.*one newline/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), null, [post]), /requires.*publication/i);
});

test("validates AT-URI ownership, collection, and strict TID rkeys", () => {
  assert.equal(assertAtUri(publication, STANDARD_SITE_PUBLICATION_COLLECTION, "publication"), publication);
  assert.equal(assertTid("3jzfcf4wz4k2a", "rkey"), undefined);
  assert.throws(() => assertAtUri(publication.replace(STANDARD_SITE_DID, "did:plc:other"), STANDARD_SITE_PUBLICATION_COLLECTION, "publication"), /owned by/i);
  assert.throws(() => assertAtUri(publication.replace(STANDARD_SITE_PUBLICATION_COLLECTION, STANDARD_SITE_DOCUMENT_COLLECTION), STANDARD_SITE_PUBLICATION_COLLECTION, "publication"), /collection/i);
  assert.throws(() => assertTid("3jzfcf4wz4k2", "rkey"), /13-character/i);
  assert.throws(() => assertTid("3jzfcf4wz4k2!", "rkey"), /13-character/i);
  assert.throws(() => assertTid("3jzfcf4wz4k2A", "rkey"), /13-character/i);
});

test("rejects duplicate document IDs and duplicate or malformed mappings", () => {
  assert.throws(
    () =>
      parseStandardSiteState(
        JSON.stringify(registry({ documents: [{ id: post.id, uri: documentUri }, { id: post.id, uri: documentUri }] })),
        `${publication}\n`,
        [post],
      ),
    /duplicates document ID/i,
  );
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry({ documents: [{ id: post.id, uri: documentUri, session: "secret" }] })), `${publication}\n`, [post]), /unsupported field.*session/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry({ documents: [{ id: post.id, uri: "at://wrong/site.standard.document/3jzfcf4wz4k2b" }] })), `${publication}\n`, [post]), /owned by/i);
});

test("rejects unknown, draft, fallback, and mismatched blog IDs", () => {
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\n`, []), /does not match.*published/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\n`, [{ id: post.id, data: { slug: post.id, draft: true } }]), /draft/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\n`, [{ id: post.id, data: {} }]), /fallback.*explicit/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry()), `${publication}\n`, [{ id: post.id, data: { slug: "other-post" } }]), /entry\.id.*post\.data\.slug/i);
  assert.doesNotThrow(() => parseStandardSiteState(JSON.stringify(registry({ documents: [] })), `${publication}\n`, [{ id: "fallback-id", data: {} }]));
});

test("rejects secret-bearing registry data and wrong registry identity", () => {
  assert.throws(() => parseStandardSiteState(JSON.stringify({ ...registry(), session: { token: "secret" } }), `${publication}\n`, [post]), /unsupported field.*session/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry({ did: "did:plc:wrong" })), `${publication}\n`, [post]), /registry\.did/i);
  assert.throws(() => parseStandardSiteState(JSON.stringify(registry({ publication: { accessToken: "secret" } })), `${publication}\n`, [post]), /publication.*null.*AT-URI/i);
});

test("loadStandardSiteState accepts raw inputs without caching", () => {
  const options = {
    registryText: JSON.stringify({ version: 1, did: STANDARD_SITE_DID, publication: null, documents: [] }),
    publicationText: null,
  };
  assert.deepEqual(loadStandardSiteState(options), { publication: null, documents: [] });
  assert.deepEqual(loadStandardSiteState(options), { publication: null, documents: [] });
});
