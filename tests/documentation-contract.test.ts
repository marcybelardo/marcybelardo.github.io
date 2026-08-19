import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const documentationFiles = ["README.md", "AGENTS.md"];
const standardSiteManualPath = resolve(repositoryRoot, "docs/standard-site-manual.md");

const requiredDocumentation = [
  "src/components/BlogAuthorSignature.astro",
  "public/marceline-belardo-cv.pdf",
  "/marceline-belardo-cv.pdf",
  "full rendered article content",
  "RSS feed",
];

test("documentation records the RSS signature, full-content, and CV asset contract", () => {
  documentationFiles.forEach((filename) => {
    const documentation = readFileSync(resolve(repositoryRoot, filename), "utf8");

    requiredDocumentation.forEach((phrase) => {
      assert.match(
        documentation,
        new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `${filename} must document ${phrase}`,
      );
    });
    assert.match(
      documentation,
      /external, mail, fragment, and protocol-relative targets remain unchanged/i,
      `${filename} must document non-site URL preservation`,
    );
    assert.match(
      documentation,
      /does not imply that the binary currently exists/i,
      `${filename} must not imply that the CV binary is present`,
    );
  });
});

test("Standard.site manual documents the manual-only credential-safe operating contract", () => {
  const documentation = readFileSync(standardSiteManualPath, "utf8");
  const requiredPhrases = [
    "site.standard.publication",
    "site.standard.document",
    "metadata-only",
    "com.atproto.repo.createRecord",
    "com.atproto.repo.getRecord",
    "com.atproto.repo.putRecord",
    "com.atproto.repo.deleteRecord",
    "swapRecord",
    "InvalidSwap",
    "did:plc:fakq3c4v2fvivhoc3cgom3nc",
    "com.atproto.identity.resolveHandle",
    "#atproto_pds",
    "ATPROTO_APP_PASSWORD",
    "read -s",
    "export ATPROTO_APP_PASSWORD",
    "env.ATPROTO_APP_PASSWORD",
    "--data-binary @-",
    "OAuth",
    "/.well-known/site.standard.publication",
  ];

  requiredPhrases.forEach((phrase) => {
    assert.match(
      documentation,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `standard-site-manual.md must document ${phrase}`,
    );
  });
  assert.doesNotMatch(documentation, /jq\s+--arg\s+[^\n]*password/i);
  assert.doesNotMatch(documentation, /curl[^\n]*--data[^\n]*ATPROTO_APP_PASSWORD/i);
});
