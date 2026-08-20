import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const documentationFiles = ["README.md", "AGENTS.md"];
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
