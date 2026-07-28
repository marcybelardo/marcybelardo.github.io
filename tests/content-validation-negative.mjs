import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invalidEntryPath = resolve(
  repositoryRoot,
  "src/content/projects/__invalid-alt.md",
);

if (existsSync(invalidEntryPath)) {
  throw new Error(`refusing to overwrite ${invalidEntryPath}`);
}

const invalidEntry = `---
slug: invalid-alt
title: Invalid Alt Fixture
date: 2026-06-15
description: Temporary fixture for image alternative validation
disciplines:
  - software
tags: []
featured: false
featuredOrder: 1
draft: false
coverImage: ../../assets/20260425_29.jpg
---

Temporary content validation fixture.
`;

try {
  writeFileSync(invalidEntryPath, invalidEntry, "utf8");

  const result = spawnSync("pnpm", ["astro", "sync"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }

  assert.notEqual(result.status, 0, "invalid content unexpectedly passed Astro sync");
  assert.match(
    output,
    /coverImageAlt is required when coverImage is provided/,
    `Astro sync failed without the paired-alt validation message:\n${output}`,
  );
} finally {
  rmSync(invalidEntryPath, { force: true });
}
