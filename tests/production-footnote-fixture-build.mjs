// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishedPostPath = resolve(
  repositoryRoot,
  "src/content/blog/the-devil-you-know.md",
);
const fixtureOutputPath = resolve(
  repositoryRoot,
  "dist/blog/the-devil-you-know/index.html",
);
const originalPost = readFileSync(publishedPostPath, "utf8");
const fixtureBody = readFileSync(
  resolve(repositoryRoot, "tests/fixtures/footnotes.md"),
  "utf8",
);
const fixturePost = `${originalPost.trimEnd()}\n\n${fixtureBody}`;

function runFixtureBuild() {
  const result = spawnSync("pnpm", ["build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, `production footnote fixture build failed:\n${output}`);
}

try {
  writeFileSync(publishedPostPath, fixturePost, "utf8");
  runFixtureBuild();

  assert.ok(existsSync(fixtureOutputPath), "published post fixture route was not generated");
  const html = readFileSync(fixtureOutputPath, "utf8");

  assert.match(html, /data-footnote-ref/);
  assert.match(html, /<li\b[^>]*id="[^"]+"[^>]*>/);
  assert.match(html, /data-footnote-backref/);
} finally {
  writeFileSync(publishedPostPath, originalPost, "utf8");
}
