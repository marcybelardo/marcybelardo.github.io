import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = mkdtempSync(resolve(tmpdir(), "marceline-homepage-fixture-"));
const copiedEntries = [];

function copyCollectionEntries(collection) {
  const sourceDirectory = resolve(repositoryRoot, "src", "content", collection);
  const fixtureCollectionDirectory = resolve(fixtureDirectory, collection);

  mkdirSync(fixtureCollectionDirectory, { recursive: true });

  readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(md|mdx)$/.test(entry.name))
    .forEach((entry) => {
      const sourcePath = resolve(sourceDirectory, entry.name);
      const fixturePath = resolve(fixtureCollectionDirectory, entry.name);

      copyFileSync(sourcePath, fixturePath);
      rmSync(sourcePath);
      copiedEntries.push({ sourcePath, fixturePath });
    });
}

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

  assert.equal(result.status, 0, `empty homepage fixture build failed:\n${output}`);
}

try {
  copyCollectionEntries("projects");
  copyCollectionEntries("blog");
  rmSync(resolve(repositoryRoot, ".astro", "data-store.json"), { force: true });
  rmSync(resolve(repositoryRoot, "node_modules", ".astro", "data-store.json"), {
    force: true,
  });
  runFixtureBuild();

  const homepagePath = resolve(repositoryRoot, "dist", "index.html");
  assert.ok(existsSync(homepagePath), "empty homepage fixture output must exist");

  const html = readFileSync(homepagePath, "utf8");
  assert.doesNotMatch(html, /id="selected-projects-heading"/);
  assert.doesNotMatch(html, /aria-label="Selected projects"/);
  assert.doesNotMatch(html, /id="recent-writing-heading"/);
  assert.doesNotMatch(html, /aria-label="Recent writing"/);

  const blogIndexPath = resolve(repositoryRoot, "dist/blog/index.html");
  assert.ok(existsSync(blogIndexPath), "empty blog index output must exist");
  const blogHtml = readFileSync(blogIndexPath, "utf8");
  assert.match(blogHtml, /<h1[^>]*>[\s\S]*?Blog[\s\S]*?<\/h1>/);
  assert.match(blogHtml, /href="\/rss\.xml"/);
  assert.match(blogHtml, /class="editorial-empty"/);
  assert.doesNotMatch(blogHtml, /class="blog-index-entry|<ol class="blog-index__list"/);
  assert.equal(existsSync(resolve(repositoryRoot, "dist/blog/tags/index.html")), false);
  assert.equal(existsSync(resolve(repositoryRoot, "dist/blog/tags/draft-only-review/index.html")), false);
} finally {
  copiedEntries.reverse().forEach(({ sourcePath, fixturePath }) => {
    copyFileSync(fixturePath, sourcePath);
  });
  rmSync(fixtureDirectory, { force: true, recursive: true });
}
