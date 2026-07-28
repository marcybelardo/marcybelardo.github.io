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
const invalidBlogEntryPath = resolve(
  repositoryRoot,
  "src/content/blog/__invalid-image-alt.md",
);
const draftRouteFixturePath = resolve(
  repositoryRoot,
  "src/content/blog/__draft-route-fixture.md",
);
const invalidUrlFixtures = [
  { field: "repositoryUrl", value: '""' },
  { field: "repositoryUrl", value: '"#"' },
  { field: "liveUrl", value: '""' },
  { field: "liveUrl", value: '"#"' },
  { field: "externalUrl", value: '""' },
  { field: "externalUrl", value: '"#"' },
].map((fixture) => ({
  ...fixture,
  path: resolve(
    repositoryRoot,
    `src/content/projects/__invalid-${fixture.field}-${fixture.value === '""' ? "empty" : "fragment"}.md`,
  ),
}));

for (const fixturePath of [
  invalidEntryPath,
  invalidBlogEntryPath,
  draftRouteFixturePath,
  ...invalidUrlFixtures.map(({ path }) => path),
]) {
  if (existsSync(fixturePath)) {
    throw new Error(`refusing to overwrite ${fixturePath}`);
  }
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

const invalidBlogEntry = `---
title: Invalid Blog Image Alt Fixture
date: 2026-06-16
description: Temporary fixture for blog image alternative validation
image: ../../assets/20260425_29.jpg
tags:
  - validation
draft: false
---

Temporary content validation fixture.
`;

const draftRouteFixture = `---
title: Draft Route Fixture
date: 2026-06-17
tags:
  - draft-only-review
draft: true
---

Temporary draft route fixture.
`;

function createInvalidUrlFixture(field, value) {
  return `---
slug: invalid-${field}-${value === '""' ? "empty" : "fragment"}
title: Invalid ${field} Fixture
date: 2026-06-21
description: Temporary fixture for URL validation
disciplines:
  - software
${field}: ${value}
---

Temporary URL validation fixture.
`;
}

function assertAstroSyncRejects(fixturePath, fixture, message) {
  writeFileSync(fixturePath, fixture, "utf8");

  try {
    const result = spawnSync("pnpm", ["astro", "sync"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    if (result.error) {
      throw result.error;
    }

    assert.notEqual(result.status, 0, `${fixturePath} unexpectedly passed Astro sync`);
    assert.match(
      output,
      message,
      `Astro sync failed without the expected validation message:\n${output}`,
    );
  } finally {
    rmSync(fixturePath, { force: true });
  }
}

try {
  assertAstroSyncRejects(
    invalidEntryPath,
    invalidEntry,
    /coverImageAlt is required when coverImage is provided/,
  );
  assertAstroSyncRejects(
    invalidBlogEntryPath,
    invalidBlogEntry,
    /imageAlt is required when image is provided/,
  );
  invalidUrlFixtures.forEach(({ field, value, path }) => {
    assertAstroSyncRejects(
      path,
      createInvalidUrlFixture(field, value),
      new RegExp(field),
    );
  });

  writeFileSync(draftRouteFixturePath, draftRouteFixture, "utf8");
  try {
    const result = spawnSync("pnpm", ["build"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    if (result.error) {
      throw result.error;
    }

    assert.equal(result.status, 0, `draft route fixture build failed:\n${output}`);
    assert.equal(
      existsSync(resolve(repositoryRoot, "dist/blog/draft-route-fixture/index.html")),
      false,
      "draft blog detail route was generated in production",
    );
    assert.equal(
      existsSync(resolve(repositoryRoot, "dist/blog/tags/draft-only-review/index.html")),
      false,
      "draft-only tag archive was generated in production",
    );
  } finally {
    rmSync(draftRouteFixturePath, { force: true });
  }
} finally {
  rmSync(invalidEntryPath, { force: true });
  rmSync(invalidBlogEntryPath, { force: true });
  rmSync(draftRouteFixturePath, { force: true });
}
