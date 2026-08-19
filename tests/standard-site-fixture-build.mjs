import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(repositoryRoot, "src/standard-site/registry.json");
const publicationDirectory = resolve(repositoryRoot, "public/.well-known");
const publicationPath = resolve(publicationDirectory, "site.standard.publication");
const temporaryPostPath = resolve(
  repositoryRoot,
  "src/content/blog/__standard-site-unmapped-fixture.md",
);
const fixtureDirectory = mkdtempSync(resolve(tmpdir(), "marceline-standard-site-fixture-"));
const originalRegistry = readFileSync(registryPath, "utf8");
const hadPublicationFile = existsSync(publicationPath);
const originalPublication = hadPublicationFile ? readFileSync(publicationPath, "utf8") : null;

const publication =
  "at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/3jzfcf4wz4k2a";
const document =
  "at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.document/3jzfcf4wz4k2b";

function runBuild(label) {
  const result = spawnSync("pnpm", ["build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, `${label} build failed:\n${output}`);
}

function runExpectedBuildFailure(label, expectedMessage) {
  const result = spawnSync("pnpm", ["build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }
  assert.notEqual(result.status, 0, `${label} unexpectedly passed`);
  assert.match(output, expectedMessage, `${label} failed without an actionable message`);
}

function readOutput(relativePath) {
  return readFileSync(resolve(repositoryRoot, "dist", relativePath), "utf8");
}

function assertUnregisteredOutput() {
  const htmlFiles = ["index.html", "blog/the-devil-you-know/index.html"];
  htmlFiles.forEach((relativePath) => {
    const html = readOutput(relativePath);
    assert.doesNotMatch(html, /site\.standard\.(publication|document)/);
    assert.doesNotMatch(html, /at:\/\//);
  });
  assert.equal(existsSync(resolve(repositoryRoot, "dist/.well-known/site.standard.publication")), false);
}

function assertRegisteredOutput() {
  const homepage = readOutput("index.html");
  const mappedPost = readOutput("blog/the-devil-you-know/index.html");
  const unmappedPost = readOutput("blog/standard-site-unmapped-fixture/index.html");
  const blogIndex = readOutput("blog/index.html");
  const rss = readOutput("rss.xml");
  const notFound = readOutput("404.html");

  assert.equal(
    (homepage.match(/rel="site\.standard\.publication"/g) ?? []).length,
    1,
    "registered homepage must expose one publication discovery link",
  );
  assert.match(homepage, new RegExp(`href="${publication.replaceAll(".", "\\.")}"`));
  assert.equal(
    (mappedPost.match(/rel="site\.standard\.document"/g) ?? []).length,
    1,
    "mapped post must expose one document verification link",
  );
  assert.match(mappedPost, new RegExp(`href="${document.replaceAll(".", "\\.")}"`));
  assert.doesNotMatch(unmappedPost, /site\.standard\.document/);
  assert.doesNotMatch(blogIndex, /site\.standard\.document/);
  assert.doesNotMatch(rss, /site\.standard\.(publication|document)/);
  assert.doesNotMatch(notFound, /site\.standard\.(publication|document)/);
  assert.equal(
    readFileSync(resolve(repositoryRoot, "dist/.well-known/site.standard.publication"), "utf8"),
    `${publication}\n`,
  );
  assert.doesNotMatch(readOutput("sitemap-0.xml"), /site\.standard|\.well-known/);
}

function writeRegistry(registry) {
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

const unmappedPost = `---
slug: standard-site-unmapped-fixture
title: Standard.site Unmapped Fixture
date: 2026-08-01
description: Temporary published post for Standard.site link scoping.
tags:
  - fixture
draft: false
---

Temporary published fixture post.
`;

try {
  if (existsSync(temporaryPostPath)) {
    throw new Error(`refusing to overwrite ${temporaryPostPath}`);
  }
  writeFileSync(temporaryPostPath, unmappedPost, "utf8");

  writeRegistry({
    version: 1,
    did: "did:plc:fakq3c4v2fvivhoc3cgom3nc",
    publication: null,
    documents: [],
  });
  rmSync(publicationPath, { force: true });
  runBuild("unregistered Standard.site fixture");
  assertUnregisteredOutput();

  writeRegistry({
    version: 1,
    did: "did:plc:fakq3c4v2fvivhoc3cgom3nc",
    publication,
    documents: [{ id: "the-devil-you-know", uri: document }],
  });
  mkdirSync(publicationDirectory, { recursive: true });
  writeFileSync(publicationPath, `${publication}\n`, "utf8");
  runBuild("registered Standard.site fixture");
  assertRegisteredOutput();

  writeRegistry({
    version: 1,
    did: "did:plc:fakq3c4v2fvivhoc3cgom3nc",
    publication,
    documents: [{ id: "the-devil-you-know", uri: document }],
  });
  writeFileSync(publicationPath, `${publication}\nextra\n`, "utf8");
  runExpectedBuildFailure("mismatched Standard.site pointer fixture", /exactly.*one newline/i);
} finally {
  writeFileSync(registryPath, originalRegistry, "utf8");
  if (hadPublicationFile) {
    writeFileSync(publicationPath, originalPublication, "utf8");
  } else {
    rmSync(publicationPath, { force: true });
    rmSync(publicationDirectory, { force: true, recursive: true });
  }
  rmSync(temporaryPostPath, { force: true });
  rmSync(fixtureDirectory, { force: true, recursive: true });
}
