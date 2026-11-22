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

test("design documentation describes the updated homepage, Projects, Blog, and fixture review scope", () => {
  const read = (filename: string) => readFileSync(resolve(repositoryRoot, filename), "utf8");
  const agents = read("AGENTS.md");
  const projects = read("docs/projects-design.md");
  const homepage = read("docs/homepage-design-comparison.md");

  assert.match(agents, /name-only `Marceline Belardo` heading[\s\S]*unchanged triptych/);
  assert.match(agents, /consistent square preview slot[\s\S]*Project preview forthcoming/);
  assert.match(agents, /count-independent tightened spacing/);
  assert.doesNotMatch(agents, /intentionally has no practice statement|covers occupy a dedicated column only when present/);
  assert.match(projects, /Project preview forthcoming/);
  assert.match(projects, /automatically replaces it/);
  assert.match(projects, /index-only state/);
  assert.match(homepage, /name-only heading and a subordinate muted introduction/);
  assert.match(homepage, /production-fixture-build\.mjs --review-output/);
  assert.match(homepage, /astro preview --outDir/);
  assert.match(homepage, /normal `pnpm verify` run does not retain review output/);
});

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
