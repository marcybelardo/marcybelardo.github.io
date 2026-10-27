import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveStableTid, deriveDocumentRecordKeys, deriveDocumentIdentities,
  documentAtUri, publicationAtUri, publicationRecordKey,
  isTid, validateTid, parsePublicationAtUri,
} from "../src/standard-site/identity.ts";

test("standard_site_identity_vectors", () => {
  assert.equal(publicationRecordKey(), "5jpjlmfobo2uz");
  assert.equal(deriveStableTid("document:hello-world"), "3sp2q2tmsdo2w");
  assert.equal(deriveStableTid("document:the-devil-you-know"), "3o7dqwjezuvd3");
  assert.equal(documentAtUri("did:plc:abc123", "hello-world"), "at://did:plc:abc123/site.standard.document/3sp2q2tmsdo2w");
  assert.equal(publicationAtUri("did:plc:abc123"), "at://did:plc:abc123/site.standard.publication/5jpjlmfobo2uz");
  assert.deepEqual(deriveDocumentIdentities("did:plc:abc123", ["hello-world"]), [{
    slug: "hello-world", rkey: "3sp2q2tmsdo2w",
    uri: "at://did:plc:abc123/site.standard.document/3sp2q2tmsdo2w",
  }]);
  assert.deepEqual([...deriveDocumentRecordKeys(["zeta", "alpha"]).keys()], ["alpha", "zeta"]);
  assert.throws(() => deriveDocumentRecordKeys(["alpha", "alpha"]), /duplicate document slug/);
  assert.equal(isTid("3sp2q2tmsdo2w"), true);
  assert.equal(isTid("hello-world"), false);
  assert.throws(() => validateTid("hello-world"), /13-character TID/);
  assert.equal(parsePublicationAtUri("at://alice.example/site.standard.publication/3sp2q2tmsdo2w"), "at://alice.example/site.standard.publication/3sp2q2tmsdo2w");
  assert.throws(() => documentAtUri("did:plc:abc123", "Hello-World"), /stable slug syntax/);
  assert.throws(() => publicationAtUri("example", "main"), /normalized AT Protocol handle/);
  assert.throws(() => parsePublicationAtUri("at://did:plc:abc123/site.standard.publication/main?x=1"), /query or fragment/);
  assert.throws(() => parsePublicationAtUri("at://did:plc:abc123/site.standard.publication/main"), /13-character TID/);
});
