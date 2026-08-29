import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  createStandardSiteDocumentUri,
  getStandardSiteDid,
  getStandardSitePublicationUri,
  validateStandardSiteDocumentUri,
} from "../src/site-config.ts";
import { documentAtUri, publicationRecordKey } from "../src/standard-site/converter.ts";

const configuredDid = "did:plc:example123";

function withConfiguredDid<T>(callback: () => T): T {
  const previous = process.env.PUBLIC_STANDARD_SITE_DID;
  process.env.PUBLIC_STANDARD_SITE_DID = configuredDid;

  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env.PUBLIC_STANDARD_SITE_DID;
    } else {
      process.env.PUBLIC_STANDARD_SITE_DID = previous;
    }
  }
}

test("Standard.site configuration can be disabled explicitly", () => {
  const previous = process.env.PUBLIC_STANDARD_SITE_DID;
  process.env.PUBLIC_STANDARD_SITE_DID = "";

  try {
    assert.equal(getStandardSiteDid(), null);
    assert.equal(getStandardSitePublicationUri(), null);
    assert.equal(createStandardSiteDocumentUri("the-devil-you-know"), null);
  } finally {
    if (previous !== undefined) {
      process.env.PUBLIC_STANDARD_SITE_DID = previous;
    } else {
      delete process.env.PUBLIC_STANDARD_SITE_DID;
    }
  }
});

test("Standard.site configuration builds deterministic publication and document URIs", () => {
  withConfiguredDid(() => {
    assert.equal(getStandardSiteDid(), configuredDid);
    assert.equal(
      getStandardSitePublicationUri(),
      `at://${configuredDid}/site.standard.publication/${publicationRecordKey()}`,
    );
    const documentUri = createStandardSiteDocumentUri("the-devil-you-know");

    assert.equal(
      documentUri,
      documentAtUri(configuredDid, "the-devil-you-know"),
    );
    assert.equal(validateStandardSiteDocumentUri(documentUri ?? ""), documentUri);
  });
});

test("Standard.site configuration rejects malformed DIDs, slugs, and document authorities", () => {
  const previous = process.env.PUBLIC_STANDARD_SITE_DID;

  try {
    process.env.PUBLIC_STANDARD_SITE_DID = "did:plc:bad value";
    assert.throws(() => getStandardSiteDid(), /must be a valid AT Protocol DID/);

    process.env.PUBLIC_STANDARD_SITE_DID = configuredDid;
    assert.throws(() => createStandardSiteDocumentUri("Not-A-Slug"), /slug is invalid/);
    assert.throws(
      () => validateStandardSiteDocumentUri("at://did:plc:other/site.standard.document/3o7dqwjezuvd3"),
      /configured publication DID/,
    );
    assert.throws(
      () => validateStandardSiteDocumentUri("https://example.com/document"),
      /absolute at:\/\//,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.PUBLIC_STANDARD_SITE_DID;
    } else {
      process.env.PUBLIC_STANDARD_SITE_DID = previous;
    }
  }
});
