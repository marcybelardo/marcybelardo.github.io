// pattern: Imperative Shell
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const draftFixturePath = resolve(
  repositoryRoot,
  "src/content/projects/__draft-project-fixture.md",
);
const optionalFixturePath = resolve(
  repositoryRoot,
  "src/content/projects/__optional-project-fixture.md",
);
const optionalProjectOutputPath = resolve(
  repositoryRoot,
  "dist/projects/optional-project-fixture/index.html",
);
const draftProjectOutputPath = resolve(
  repositoryRoot,
  "dist/projects/draft-project-fixture/index.html",
);

for (const fixturePath of [draftFixturePath, optionalFixturePath]) {
  if (existsSync(fixturePath)) {
    throw new Error(`refusing to overwrite ${fixturePath}`);
  }
}

const draftFixture = `---
slug: draft-project-fixture
title: Draft Project Fixture
date: 2026-06-18
description: Temporary draft project fixture
disciplines:
  - software
tags: []
featured: false
draft: true
relatedProjects: []
relatedWriting: []
---

Temporary draft project fixture.
`;

const optionalFixture = `---
slug: optional-project-fixture
title: Optional Project Fixture
date: 2026-06-19
description: Temporary project fixture for optional case-study fields
disciplines:
  - software
  - visual
tags:
  - fixture
  - validation
status: Published fixture
featured: false
featuredOrder: 5
draft: false
coverImage: ../../assets/20260425_29.jpg
coverImageAlt: A portrait image used by the optional project fixture
gallery:
  - image: "../../assets/IMG_6936_EDIT copy.jpg"
    imageAlt: A landscape image used by the optional project gallery
    caption: Optional gallery caption.
repositoryUrl: https://github.com/marcybelardo/optional-project-fixture
liveUrl: https://example.com/optional-project-fixture
externalUrl: https://example.com/optional-project-reference
collaborators:
  - Marceline Belardo
role: Lead developer
relatedProjects:
  - osborne
  - missing-project
relatedWriting:
  - the-devil-you-know
  - missing-writing
---

This fixture exercises the optional project fields without embedding a body image.
`;

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

  assert.equal(result.status, 0, `fixture build failed:\n${output}`);
}

try {
  writeFileSync(draftFixturePath, draftFixture, "utf8");
  writeFileSync(optionalFixturePath, optionalFixture, "utf8");
  runFixtureBuild();

  assert.equal(
    existsSync(draftProjectOutputPath),
    false,
    "draft project detail route was generated in production",
  );
  assert.equal(
    existsSync(optionalProjectOutputPath),
    true,
    "published optional project detail route was not generated",
  );

  const html = readFileSync(optionalProjectOutputPath, "utf8");
  const squareImageCount = (html.match(/class="square-image"/g) ?? []).length;

  assert.equal(squareImageCount, 2, "cover and gallery must use SquareImage");
  assert.match(html, /Status[\s\S]*Published fixture/);
  assert.match(html, /Role[\s\S]*Lead developer/);
  assert.match(html, /Collaborators[\s\S]*Marceline Belardo/);
  assert.match(html, /href="https:\/\/github\.com\/marcybelardo\/optional-project-fixture"/);
  assert.match(html, /href="https:\/\/example\.com\/optional-project-fixture"/);
  assert.match(html, /href="https:\/\/example\.com\/optional-project-reference"/);
  assert.match(html, /Gallery/);
  assert.match(html, /Optional gallery caption\./);
  assert.match(html, /Related projects[\s\S]*href="\/projects\/osborne\/"/);
  assert.match(html, /Related writing[\s\S]*href="\/blog\/the-devil-you-know\/"/);
  assert.doesNotMatch(html, /missing-project|missing-writing|href="#"|href=""|<p>\s*<img\b/);
  assert.equal(
    readFileSync(resolve(repositoryRoot, "dist/sitemap-0.xml"), "utf8").includes(
      "draft-project-fixture",
    ),
    false,
    "draft project must not appear in the production sitemap",
  );
} finally {
  rmSync(draftFixturePath, { force: true });
  rmSync(optionalFixturePath, { force: true });
}
