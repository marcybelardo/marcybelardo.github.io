// pattern: Imperative Shell

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReviewOutputDestination as validateReviewOutputDestination } from "./production-fixture-output-guard.mjs";
import { resolveRetainedResource } from "./production-fixture-resource-resolver.mjs";
// Node strips types for these `.ts` modules, so the fixture derives the same
// identities as the site without duplicating the slug/AT-URI contract.
import { STANDARD_SITE_DEFAULT_DID, SITE_ORIGIN } from "../src/site-config.ts";
import { validateRecordExport } from "../src/standard-site/records.ts";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import {
  deriveStableTid,
  documentAtUri,
  isTid,
  publicationRecordKey,
} from "../src/standard-site/identity.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsDirectory = resolve(repositoryRoot, "src/content/projects");
const blogDirectory = resolve(repositoryRoot, "src/content/blog");
const siteOrigin = "https://www.marcelinebelardo.com";

const invalidEntryPath = resolve(projectsDirectory, "__invalid-alt.md");
const invalidBlogEntryPath = resolve(blogDirectory, "__invalid-image-alt.md");
const draftRouteFixturePath = resolve(blogDirectory, "__draft-route-fixture.md");
const draftProjectFixturePath = resolve(projectsDirectory, "__draft-project-fixture.md");
const optionalProjectFixturePath = resolve(projectsDirectory, "__optional-project-fixture.md");
const noOptionalsProjectFixturePath = resolve(projectsDirectory, "__no-optionals-project-fixture.md");
const rssFixturePath = resolve(blogDirectory, "__rss-production-fixture.md");
const footnoteFixturePath = resolve(blogDirectory, "__footnote-production-fixture.md");
const standardSiteExportFixturePath = resolve(
  blogDirectory,
  "__standard-site-export-fixture.md",
);
const standardSiteDraftFixturePath = resolve(
  blogDirectory,
  "__standard-site-draft-fixture.md",
);
const standardSiteDraftSluglessFixturePath = resolve(
  blogDirectory,
  "__standard-site-draft-slugless-fixture.md",
);
const standardSiteLegacySluglessFixturePath = resolve(
  blogDirectory,
  "__standard-site-legacy-slugless-fixture.md",
);
const coveredReviewProjectPath = resolve(projectsDirectory, "__design-preview-covered.md");
const minimalReviewProjectPath = resolve(projectsDirectory, "__design-preview-minimal.md");
const reviewBlogFixturePaths = [
  "__design-review-multiple-one.md",
  "__design-review-multiple-two.md",
  "__design-review-multiple-three.md",
  "__design-review-single.md",
  "__design-review-draft.md",
].map((filename) => resolve(blogDirectory, filename));
const reviewOutputArgument = process.argv.indexOf("--review-output");
if (reviewOutputArgument >= 0 && !process.argv[reviewOutputArgument + 1]) {
  throw new Error("--review-output requires a destination directory");
}
if (reviewOutputArgument >= 0 && process.argv[reviewOutputArgument + 2]) {
  throw new Error("--review-output accepts exactly one destination directory");
}
const reviewOutputDirectory = reviewOutputArgument >= 0
  ? resolve(process.argv[reviewOutputArgument + 1])
  : null;
const simulatedFixtureFailure = process.env.PORTFOLIO_FIXTURE_SIMULATE_FAILURE === "1";

const optionalProjectOutputPath = resolve(
  repositoryRoot,
  "dist/projects/optional-project-fixture/index.html",
);
const draftProjectOutputPath = resolve(
  repositoryRoot,
  "dist/projects/draft-project-fixture/index.html",
);
const noOptionalsProjectOutputPath = resolve(
  repositoryRoot,
  "dist/projects/no-optionals-project-fixture/index.html",
);
const footnoteFixtureOutputPath = resolve(
  repositoryRoot,
  "dist/blog/footnote-production-fixture/index.html",
);
const rssOutputPath = resolve(repositoryRoot, "dist/rss.xml");
const standardSiteExportOutputPath = resolve(
  repositoryRoot,
  "dist/standard-site/records.json",
);
const standardSiteDiscoveryOutputPath = resolve(
  repositoryRoot,
  "dist/.well-known/site.standard.publication",
);
const standardSitePublicationUri =
  `at://${STANDARD_SITE_DEFAULT_DID}/site.standard.publication/${publicationRecordKey()}`;
const standardSiteExportSlug = "standard-site-export-fixture";
const standardSiteDraftSlug = "standard-site-draft-fixture";
const standardSiteDraftSluglessId = "standard-site-draft-slugless";
const standardSiteLegacySluglessId = "standard-site-legacy-slugless";

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
    projectsDirectory,
    `__invalid-${fixture.field}-${fixture.value === '""' ? "empty" : "fragment"}.md`,
  ),
}));

const fixturePaths = [
  invalidEntryPath,
  invalidBlogEntryPath,
  draftRouteFixturePath,
  draftProjectFixturePath,
  optionalProjectFixturePath,
  noOptionalsProjectFixturePath,
  rssFixturePath,
  footnoteFixturePath,
  standardSiteExportFixturePath,
  standardSiteDraftFixturePath,
  standardSiteDraftSluglessFixturePath,
  standardSiteLegacySluglessFixturePath,
  coveredReviewProjectPath,
  minimalReviewProjectPath,
  ...reviewBlogFixturePaths,
  ...invalidUrlFixtures.map(({ path }) => path),
];

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
coverImage: ../../assets/homepage-photo.jpg
---

Temporary content validation fixture.
`;

const invalidBlogEntry = `---
title: Invalid Blog Image Alt Fixture
date: 2026-06-16
description: Temporary fixture for blog image alternative validation
image: ../../assets/homepage-photo.jpg
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

const draftProjectFixture = `---
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

const optionalProjectFixture = (relatedProjectSlug) => `---
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
coverImage: ../../assets/homepage-photo.jpg
coverImageAlt: A portrait image used by the optional project fixture
gallery:
  - image: ../../assets/homepage-photo.jpg
    imageAlt: A second use of the fixture image in the optional project gallery
    caption: Optional gallery caption.
repositoryUrl: https://github.com/marcybelardo/optional-project-fixture
liveUrl: https://example.com/optional-project-fixture
externalUrl: https://example.com/optional-project-reference
collaborators:
  - Marceline Belardo
role: Lead developer
relatedProjects:
  - ${relatedProjectSlug}
  - missing-project
relatedWriting:
  - footnote-production-fixture
  - missing-writing
---

This fixture exercises the optional project fields without embedding a body image.
`;

const noOptionalsProjectFixture = `---
slug: no-optionals-project-fixture
title: No Optionals Project Fixture
date: 2026-06-20
description: Temporary project fixture without optional case-study fields
disciplines:
  - software
---

This fixture exercises the complete absence of optional project fields.
`;

const projectReviewFixture = (slug, hasCover, date, title) => `---
slug: ${slug}
title: ${title}
date: ${date}
description: A controlled fixture for reviewing the project index preview layout.
disciplines:
  - software
  - visual
status: Review fixture
featured: false
${hasCover ? "coverImage: ../../assets/homepage-photo.jpg\ncoverImageAlt: A real photograph used as the covered project fixture\n" : ""}---

Controlled project preview fixture.
`;

const reviewBlogFixtures = [
  { slug: "design-review-multiple-one", title: "Design Review Multiple One", date: "2026-06-28", tags: ["Design Review Multiple"] },
  { slug: "design-review-multiple-two", title: "Design Review Multiple Two", date: "2026-06-27", tags: ["Design Review Multiple"], image: true },
  { slug: "design-review-multiple-three", title: "Design Review Multiple Three", date: "2026-06-26", tags: ["Design Review Multiple"] },
  { slug: "design-review-single", title: "Design Review Single", date: "2026-06-25", tags: ["Design Review Single"] },
  { slug: "design-review-draft", title: "Design Review Draft", date: "2026-06-24", tags: ["Design Review Multiple"], draft: true },
].map((fixture) => `---
slug: ${fixture.slug}
title: ${fixture.title}
date: ${fixture.date}
description: Controlled published article for archive layout review.
tags:
${fixture.tags.map((tag) => `  - ${tag}`).join("\n")}
${fixture.image ? "image: ../../assets/homepage-photo.jpg\nimageAlt: A real photograph used as the optional blog fixture cover\n" : ""}draft: ${fixture.draft ? "true" : "false"}
---

A controlled archive review fixture.
`);

const fixtureSlug = "rss-production-fixture";
const fixtureTitle = 'RSS Fixture & <Quotes> "Round Trip"';
const fixtureDescription = 'RSS fixture & <description> "round trip" \'apostrophe\'';
const fixtureLink = `${siteOrigin}/blog/${fixtureSlug}/`;
const fixtureCategories = ["Fixture & XML", "Quotes <Tags>", "RSS"];
const rssFixture = `---
slug: ${fixtureSlug}
title: '${fixtureTitle.replaceAll("'", "''")}'
date: 2026-06-03
description: '${fixtureDescription.replaceAll("'", "''")}'
tags:
  - 'Fixture & XML'
  - 'Quotes <Tags>'
  - RSS
draft: false
---

RSS_FIXTURE_FIRST_MARKER_7c1b: XML-sensitive & < > " ' text.

## Formatted RSS Fixture Section

A **bold** and *italic* paragraph includes a [Markdown root link](/fixture-root/?one=1&two=2).

<a href="/quoted-root/?href=1&amp;href=2">Quoted root href</a>
<img src="/quoted-image.svg?src=1&amp;src=2" alt="Quoted root src" />
<a href="https://external.example/path?external=1&amp;external=2">External target</a>
<a href="mailto:fixture@example.com?subject=RSS&amp;body=XML">Mail target</a>
<a href="#fixture-fragment">Fragment target</a>
<a href="//cdn.example.com/fixture.svg?cdn=1&amp;cdn=2">Protocol-relative target</a>

A footnote reference keeps its definition and backlink.[^fixture]

[^fixture]: A **formatted** footnote with a [non-site link](https://external.example/footnote?one=1&two=2).

RSS_FIXTURE_LAST_MARKER_9d2f
`;

const expectedFixtureBodyHtml =
  '<p>RSS_FIXTURE_FIRST_MARKER_7c1b: XML-sensitive &#x26; &#x3C; > ” ’ text.</p>\n' +
  '<h2 id="formatted-rss-fixture-section">Formatted RSS Fixture Section</h2>\n' +
  '<p>A <strong>bold</strong> and <em>italic</em> paragraph includes a <a href="' +
  `${siteOrigin}/fixture-root/?one=1&#x26;two=2` +
  '">Markdown root link</a>.</p>\n' +
  '<p><a href="' +
  `${siteOrigin}/quoted-root/?href=1&#x26;href=2` +
  '">Quoted root href</a>\n' +
  '<img src="' +
  `${siteOrigin}/quoted-image.svg?src=1&#x26;src=2` +
  '" alt="Quoted root src">\n' +
  '<a href="https://external.example/path?external=1&#x26;external=2">External target</a>\n' +
  '<a href="mailto:fixture@example.com?subject=RSS&#x26;body=XML">Mail target</a>\n' +
  '<a href="#fixture-fragment">Fragment target</a>\n' +
  '<a href="//cdn.example.com/fixture.svg?cdn=1&#x26;cdn=2">Protocol-relative target</a></p>\n' +
  '<p>A footnote reference keeps its definition and backlink.<sup><a href="#user-content-fn-fixture" id="user-content-fnref-fixture" data-footnote-ref="" aria-describedby="footnote-label" data-margin-note-ref="user-content-fn-fixture">1</a></sup></p>\n' +
  '<p>RSS_FIXTURE_LAST_MARKER_9d2f</p>\n' +
  '<section data-footnotes="" class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>\n' +
  '<ol>\n' +
  '<li id="user-content-fn-fixture" data-margin-note-anchor="user-content-fnref-fixture">\n' +
  '<p>A <strong>formatted</strong> footnote with a <a href="https://external.example/footnote?one=1&#x26;two=2">non-site link</a>. <a href="#user-content-fnref-fixture" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>\n' +
  '</li>\n' +
  '</ol>\n' +
  '</section>';

// The controlled export fixture covers every article construct the records
// export must carry: YAML frontmatter, raw HTML, a code fence, a GFM table, a
// body image, and a footnote referenced twice. Sentinels keep each assertion
// anchored to exactly the text this fixture authored.
const standardSiteExportFixture = `---
slug: ${standardSiteExportSlug}
title: Standard Site Export Fixture
date: 2026-07-04
description: Controlled fixture for the Standard.site records export.
tags:
  - Export Fixture
  - Standard Site
draft: false
---

STANDARD_SITE_YAML_MARKER_a41f: controlled fixture prose from the frontmatter body.

## Controlled HTML Section

<p id="fixture-html-marker">STANDARD_SITE_HTML_MARKER_b52a: <strong>strong fixture</strong> and <em>emphasis</em>.</p>

\`\`\`js
const STANDARD_SITE_CODE_MARKER_c63b = 42;
\`\`\`

| Column | Value |
| --- | --- |
| STANDARD_SITE_TABLE_MARKER_d74c | STANDARD_SITE_TABLE_CELL_e85d |

![STANDARD_SITE_IMAGE_ALT_f96e](../../assets/homepage-photo.jpg)

STANDARD_SITE_FOOTNOTE_REF_g07f repeated reference[^export-note] and a second reference[^export-note].

[^export-note]: STANDARD_SITE_FOOTNOTE_DEFINITION_h18a repeated definition body.

STANDARD_SITE_LAST_MARKER_i29b
`;

const standardSiteDraftFixture = `---
slug: ${standardSiteDraftSlug}
title: Standard Site Draft Fixture
date: 2026-07-05
description: Controlled draft fixture for the Standard.site records export.
tags:
  - Export Fixture
draft: true
---

STANDARD_SITE_DRAFT_SENTINEL_z19b must never reach the records export.
`;

const standardSiteDraftSluglessFixture = `---
title: Standard Site Draft Slugless
date: 2026-07-06
description: Controlled slugless draft fixture for the Standard.site records export.
draft: true
---

STANDARD_SITE_DRAFT_SLUGLESS_SENTINEL_y28c must never reach the records export.
`;

const standardSiteLegacySluglessFixture = `---
title: Standard Site Legacy Slugless
date: 2026-07-07
description: Controlled slugless published fixture for the Standard.site records export.
tags:
  - Legacy Fixture
draft: false
---

STANDARD_SITE_LEGACY_SENTINEL_x37d builds its title-derived route.
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


function runCommand(command, args, failureMessage, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true", ...extraEnvironment },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, `${failureMessage}:\n${output}`);
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

function assertDraftRouteOutput() {
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
  [
    resolve(repositoryRoot, "dist/index.html"),
    resolve(repositoryRoot, "dist/blog/index.html"),
    resolve(repositoryRoot, "dist/rss.xml"),
  ].forEach((outputPath) => {
    assert.doesNotMatch(
      readFileSync(outputPath, "utf8"),
      /Draft Route Fixture|draft-only-review|Temporary draft route fixture/i,
      `${outputPath} leaked the draft post`,
    );
  });
}

function getRelatedProjectSlug() {
  const projectFiles = readdirSync(projectsDirectory)
    .filter((fileName) => /\.(?:md|mdx)$/.test(fileName))
    .sort();

  for (const fileName of projectFiles) {
    const contents = readFileSync(resolve(projectsDirectory, fileName), "utf8");

    if (/^draft:\s*true\s*$/m.test(contents)) {
      continue;
    }

    const slug = contents.match(/^slug:\s*(\S+)\s*$/m)?.[1] ?? "";
    if (slug) {
      return slug;
    }
  }

  throw new Error("at least one published project is required for relationship fixtures");
}

function getSquareImageWrappers(html) {
  return [
    ...html.matchAll(/<div class="square-image(?:\s[^>]*)?"[^>]*>[\s\S]*?<\/div>/g),
  ].map((match) => match[0] ?? "");
}

function removePageScripts(html) {
  return html.replace(
    /<script\b([^>]*)>[\s\S]*?<\/script>/g,
    (script, attributes) =>
      attributes.includes('type="application/ld+json"') ? script : "",
  );
}

function assertSquareImageContract(wrapper, label) {
  assert.match(wrapper, /style="aspect-ratio:\s*1;"/, `${label} must reserve a square frame`);
  assert.match(wrapper, /data-astro-image-fit="contain"/, `${label} must preserve the full image`);
  assert.match(wrapper, /style="object-fit:\s*contain;"/, `${label} must use contain fitting`);
  assert.match(wrapper, /<img\b[^>]*\bwidth="\d+"/, `${label} must emit intrinsic width`);
  assert.match(wrapper, /<img\b[^>]*\bheight="\d+"/, `${label} must emit intrinsic height`);
  assert.match(wrapper, /<img\b[^>]*\bsrcset="[^"]+"/, `${label} must emit responsive sources`);
  assert.match(wrapper, /<img\b[^>]*\bsizes="[^"]+"/, `${label} must emit responsive sizing`);
}

function getProjectIndexEntry(html, slug) {
  return [
    ...html.matchAll(/<article class="project-index-entry"[^>]*>[\s\S]*?<\/article>/g),
  ].find((match) => match[0]?.includes(`href="/projects/${slug}/"`))?.[0] ?? "";
}

function assertDesignReviewFixtureOutput() {
  const indexHtml = readFileSync(resolve(repositoryRoot, "dist/projects/index.html"), "utf8");
  const covered = getProjectIndexEntry(indexHtml, "design-preview-covered");
  const minimal = getProjectIndexEntry(indexHtml, "design-preview-minimal");

  assert.ok(covered, "covered project review fixture must appear in the Projects index");
  assert.ok(minimal, "minimal project review fixture must appear in the Projects index");
  assert.equal((covered.match(/class="square-image project-index-entry__image"/g) ?? []).length, 1);
  assert.match(covered, /<img\b[^>]*\balt="A real photograph used as the covered project fixture"/);
  assert.match(covered, /<img\b[^>]*\bsrcset="[^"]+"/);
  assert.doesNotMatch(covered, /Project preview forthcoming/);
  assert.equal((minimal.match(/class="project-index-entry__placeholder"/g) ?? []).length, 1);
  assert.match(minimal, /role="note"[\s\S]*Project preview forthcoming/);
  assert.doesNotMatch(minimal, /<img\b/);

  const multiPath = resolve(repositoryRoot, "dist/blog/tags/design-review-multiple/index.html");
  const singlePath = resolve(repositoryRoot, "dist/blog/tags/design-review-single/index.html");
  assert.ok(existsSync(multiPath), "multi-entry review tag archive must exist");
  assert.ok(existsSync(singlePath), "single-entry review tag archive must exist");
  const multi = readFileSync(multiPath, "utf8");
  const single = readFileSync(singlePath, "utf8");
  const multiSlugs = [...multi.matchAll(/<h2>\s*<a\b[^>]*href="\/blog\/([^/]+)\/"/g)].map((match) => match[1]);
  const singleSlugs = [...single.matchAll(/<h2>\s*<a\b[^>]*href="\/blog\/([^/]+)\/"/g)].map((match) => match[1]);
  assert.deepEqual(multiSlugs, ["design-review-multiple-one", "design-review-multiple-two", "design-review-multiple-three"]);
  assert.deepEqual(singleSlugs, ["design-review-single"]);
  assert.match(multi, /class="blog-index-entry__image-link"/);
  assert.equal((multi.match(/class="blog-index-entry(?:\s[^"]*)?"/g) ?? []).length, 3);
  assert.equal((single.match(/class="blog-index-entry(?:\s[^"]*)?"/g) ?? []).length, 1);
  assert.doesNotMatch(multi + single, /design-review-draft/);
}

function retainedOutputFiles(directory) {
  const files = [];
  const visit = (currentDirectory) => {
    readdirSync(currentDirectory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = resolve(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    });
  };
  visit(directory);
  return files;
}

function assertRetainedReferenceExists(directory, source, referringFile) {
  const trimmedSource = source.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmedSource || trimmedSource.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(trimmedSource)) {
    return;
  }
  if (referringFile.endsWith("/blog/rss-production-fixture/index.html") &&
    /^\/(?:fixture-root|quoted-root|quoted-image\.svg)(?:\/|\?|$)/.test(trimmedSource)) {
    return;
  }

  const resource = resolveRetainedResource(directory, trimmedSource, referringFile);
  const resolvedAssetPath = resource.isDirectory ? resolve(resource.path, "index.html") : resource.path;
  assert.ok(existsSync(resolvedAssetPath), `retained reference must exist: ${source} from ${referringFile}`);
}

function assertRetainedReferences(directory, files) {
  files.forEach((filePath) => {
    if (filePath.endsWith(".html")) {
      const html = readFileSync(filePath, "utf8");
      for (const match of html.matchAll(/\bsrc="([^"]+)"/g)) {
        assertRetainedReferenceExists(directory, match[1] ?? "", filePath);
      }
      for (const match of html.matchAll(/<link\b(?=[^>]*\brel="(?:stylesheet|icon|preload|modulepreload)[^"]*")[^>]*\bhref="([^"]+)"/g)) {
        assertRetainedReferenceExists(directory, match[1] ?? "", filePath);
      }
      for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
        for (const candidate of (match[1] ?? "").split(",")) {
          assertRetainedReferenceExists(directory, candidate.trim().split(/\s+/)[0] ?? "", filePath);
        }
      }
    } else if (filePath.endsWith(".css")) {
      const css = readFileSync(filePath, "utf8");
      for (const match of css.matchAll(/url\(\s*([^)]+?)\s*\)/g)) {
        assertRetainedReferenceExists(directory, match[1] ?? "", filePath);
      }
      for (const match of css.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) {
        assertRetainedReferenceExists(directory, match[1] ?? "", filePath);
      }
    }
  });
}

function assertRetainedReviewOutput(directory) {
  const projectsPath = resolve(directory, "projects/index.html");
  const multiPath = resolve(directory, "blog/tags/design-review-multiple/index.html");
  const singlePath = resolve(directory, "blog/tags/design-review-single/index.html");
  assert.ok(existsSync(projectsPath), "retained output must include the Projects index");
  assert.ok(existsSync(multiPath), "retained output must include the multi-entry archive");
  assert.ok(existsSync(singlePath), "retained output must include the single-entry archive");
  const projects = readFileSync(projectsPath, "utf8");
  assert.ok(getProjectIndexEntry(projects, "design-preview-minimal").includes("Project preview forthcoming"));
  assert.ok(getProjectIndexEntry(projects, "design-preview-covered").includes("<img"));
  assert.equal((readFileSync(multiPath, "utf8").match(/class="blog-index-entry(?:\s[^"]*)?"/g) ?? []).length, 3);
  assert.equal((readFileSync(singlePath, "utf8").match(/class="blog-index-entry(?:\s[^"]*)?"/g) ?? []).length, 1);
  const files = retainedOutputFiles(directory);
  assertRetainedReferences(directory, files);
  const projectImages = [...projects.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)];
  assert.ok(projectImages.length > 0, "retained project review must include a real local image");
}

function assertTemporaryFixturesRemoved(label) {
  fixturePaths.forEach((fixturePath) => {
    assert.equal(existsSync(fixturePath), false, `${label}: temporary fixture remains at ${fixturePath}`);
  });
}

function assertProjectFixtureOutput(relatedProjectSlug) {
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
  assert.equal(
    existsSync(noOptionalsProjectOutputPath),
    true,
    "published no-optionals project detail route was not generated",
  );

  const html = readFileSync(optionalProjectOutputPath, "utf8");
  const indexHtml = readFileSync(resolve(repositoryRoot, "dist/projects/index.html"), "utf8");
  const optionalIndexEntry = [
    ...indexHtml.matchAll(/<article class="project-index-entry(?:\s[^\"]*)?"[^>]*>[\s\S]*?<\/article>/g),
  ].find((match) => match[0]?.includes('href="/projects/optional-project-fixture/"'))?.[0] ?? "";
  const squareImageWrappers = getSquareImageWrappers(html);

  assert.ok(optionalIndexEntry, "optional project must appear in the generated catalogue");
  assert.match(optionalIndexEntry, /square-image project-index-entry__image/);
  assert.match(optionalIndexEntry, /<dt>Disciplines<\/dt>[\s\S]*?<dd>software · visual<\/dd>/);
  assert.match(optionalIndexEntry, /<dt>Status<\/dt>[\s\S]*?<dd>Published fixture<\/dd>/);
  assert.match(optionalIndexEntry, /<dt>Tags<\/dt>[\s\S]*?<dd>fixture · validation<\/dd>/);

  assert.equal(squareImageWrappers.length, 2, "cover and gallery must use SquareImage");
  squareImageWrappers.forEach((wrapper, index) => {
    assertSquareImageContract(wrapper, index === 0 ? "cover image" : "gallery image");
  });
  assert.match(html, /Status[\s\S]*Published fixture/);
  assert.match(html, /Role[\s\S]*Lead developer/);
  assert.match(html, /Collaborators[\s\S]*Marceline Belardo/);
  assert.match(html, /href="https:\/\/github\.com\/marcybelardo\/optional-project-fixture"/);
  assert.match(html, /href="https:\/\/example\.com\/optional-project-fixture"/);
  assert.match(html, /href="https:\/\/example\.com\/optional-project-reference"/);
  assert.match(html, /Gallery/);
  assert.match(html, /Optional gallery caption\./);
  assert.match(
    html,
    new RegExp(`Related projects[\\s\\S]*href="/projects/${relatedProjectSlug}/"`),
  );
  assert.match(html, /Related writing[\s\S]*href="\/blog\/footnote-production-fixture\/"/);
  assert.doesNotMatch(html, /missing-project|missing-writing|href="#"|href=""|<p>\s*<img\b/);
  assert.equal(
    readFileSync(resolve(repositoryRoot, "dist/sitemap-0.xml"), "utf8").includes(
      "draft-project-fixture",
    ),
    false,
    "draft project must not appear in the production sitemap",
  );

  const noOptionalsHtml = readFileSync(noOptionalsProjectOutputPath, "utf8");

  assert.doesNotMatch(noOptionalsHtml, /<section class="project-layout__links\b/);
  assert.doesNotMatch(noOptionalsHtml, /<dt class="metadata"[^>]*>Status<\/dt>/);
  assert.doesNotMatch(noOptionalsHtml, /<dt class="metadata"[^>]*>Role<\/dt>/);
  assert.doesNotMatch(noOptionalsHtml, /<dt class="metadata"[^>]*>Collaborators<\/dt>/);
  assert.doesNotMatch(noOptionalsHtml, /class="project-layout__cover"/);
  assert.doesNotMatch(noOptionalsHtml, /class="project-layout__gallery"/);
  assert.doesNotMatch(noOptionalsHtml, /class="project-layout__related"/);
  assert.doesNotMatch(removePageScripts(noOptionalsHtml), /href="#"|href=""|undefined|null/);
}

function assertFootnoteBaseline(html) {
  const references = [...html.matchAll(
    /<a\b[^>]*href="#([^"]+)"[^>]*id="([^"]+)"[^>]*data-footnote-ref/g,
  )];
  const definitions = new Set(
    [...html.matchAll(/<li\b[^>]*id="([^"]+)"[^>]*>/g)].map(
      (match) => match[1] ?? "",
    ),
  );
  let backlinks = 0;

  assert.ok(references.length > 0, "fixture must contain a footnote reference");
  assert.ok(definitions.size > 0, "fixture must contain a footnote definition");

  references.forEach((reference) => {
    const definitionId = reference[1] ?? "";
    const referenceId = reference[2] ?? "";

    assert.ok(definitions.has(definitionId), `${referenceId} must target a footnote definition`);
    assert.match(
      html,
      new RegExp(`href="#${referenceId.replaceAll("-", "\\-")}"[^>]*data-footnote-backref`),
      `${definitionId} must retain a backlink to ${referenceId}`,
    );
    backlinks += 1;
  });

  assert.ok(backlinks > 0, "fixture must contain a footnote backlink");
}

function assertFootnoteFixtureOutput() {
  assert.ok(existsSync(footnoteFixtureOutputPath), "published post fixture route was not generated");
  const html = readFileSync(footnoteFixtureOutputPath, "utf8");

  assert.match(html, /A source with/);
  assert.match(html, /data-footnote-ref/);
  assert.match(html, /<li\b[^>]*id="[^"]+"[^>]*>/);
  assert.match(html, /data-footnote-backref/);
  assertFootnoteBaseline(html);
}

function runFixtureCheck(name, check) {
  try {
    check();
    console.log(`fixture check passed: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`fixture check failed: ${name}\n${message}`, { cause: error });
  }
}

function readStandardSiteExportRaw() {
  assert.ok(
    existsSync(standardSiteExportOutputPath),
    "the production build must emit dist/standard-site/records.json",
  );

  return readFileSync(standardSiteExportOutputPath, "utf8");
}

function parseStandardSiteExport(raw) {
  try {
    return validateRecordExport(JSON.parse(raw));
  } catch (error) {
    assert.fail(
      `dist/standard-site/records.json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Assert the planned-record envelope every consumer reads: `collection`, `rkey`,
 * `uri`, and the lexicon `value`.
 */
function assertPlannedRecord(planned, collection, label) {
  assert.ok(planned && typeof planned === "object", `${label} must be a planned record`);
  assert.equal(planned.collection, collection, `${label}.collection`);
  assert.equal(typeof planned.rkey, "string", `${label}.rkey must be a string`);
  assert.ok(isTid(planned.rkey), `${label}.rkey must be a TID`);
  assert.equal(
    planned.uri,
    `at://${STANDARD_SITE_DEFAULT_DID}/${collection}/${planned.rkey}`,
    `${label}.uri must match its DID, collection, and rkey`,
  );
  assert.ok(planned.value && typeof planned.value === "object", `${label}.value must be the record`);
  assert.equal(planned.value.$type, collection, `${label}.value.$type`);
}

/** Read the document slug from its canonical path in the planned record. */
function getPlannedDocumentSlug(planned) {
  const path = planned?.value?.path;
  assert.equal(typeof path, "string", "a planned document must carry its canonical path");

  const match = /^\/blog\/([^/]+)\/$/u.exec(path);
  assert.ok(match, `a planned document path must be a blog detail route: ${path}`);

  return match[1];
}

function findExportDocument(exportData, slug) {
  assert.ok(Array.isArray(exportData.documents), "records.json must plan document records");

  return exportData.documents.find((entry) => getPlannedDocumentSlug(entry) === slug) ?? null;
}

// Only a count is public: exposing draft IDs would violate the feed contract.
function assertDraftsExcluded(value) {
  assert.ok(Number.isInteger(value), "draftsExcluded must be an integer count");
  const countDrafts = (directory) => readdirSync(directory, { withFileTypes: true })
    .reduce((count, entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return count + countDrafts(path);
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) return count;
      return count + Number(parseFrontmatter(readFileSync(path, "utf8")).frontmatter.draft === true);
    }, 0);
  assert.equal(value, countDrafts(blogDirectory), "all authored drafts must be counted exactly");
}

/** Collapse whitespace so plaintext assertions do not depend on block spacing. */
function normalizeExportText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function countExportText(haystack, needle) {
  const normalizedHaystack = normalizeExportText(haystack);
  const normalizedNeedle = normalizeExportText(needle);
  let count = 0;
  let index = normalizedNeedle ? normalizedHaystack.indexOf(normalizedNeedle) : -1;

  while (index !== -1) {
    count += 1;
    index = normalizedHaystack.indexOf(normalizedNeedle, index + normalizedNeedle.length);
  }

  return count;
}

/**
 * standard_site_export_fixture
 *
 * Envelope version and publication identity, plus the full text of the
 * controlled article: frontmatter-driven prose, raw HTML, a code fence, a GFM
 * table, a body image alt, a footnote referenced twice, and article order.
 */
function assertStandardSiteExportFixture(exportData) {
  assert.equal(exportData.version, 1, "records.json must declare envelope version 1");
  assert.equal(
    exportData.did,
    STANDARD_SITE_DEFAULT_DID,
    "records.json must carry the configured publication DID",
  );

  const publication = exportData.publication;
  assertPlannedRecord(publication, "site.standard.publication", "publication");
  assert.equal(
    publication.rkey,
    publicationRecordKey(),
    "the planned publication must use the deterministic publication record key",
  );
  assert.equal(publication.uri, standardSitePublicationUri);
  assert.equal(publication.value.url, SITE_ORIGIN);
  assert.ok(
    typeof publication.value.name === "string" && publication.value.name.trim().length > 0,
    "the planned publication must carry a non-empty name",
  );
  assert.ok(
    typeof publication.value.description === "string" &&
      publication.value.description.trim().length > 0,
    "the planned publication must carry a non-empty description",
  );

  const slugs = exportData.documents.map((entry) => getPlannedDocumentSlug(entry));
  assert.ok(slugs.length > 0, "records.json must plan document records");
  assert.deepEqual(
    slugs,
    [...slugs].sort(),
    "planned documents must be ordered by slug for deterministic output",
  );

  const fixture = findExportDocument(exportData, standardSiteExportSlug);
  assert.ok(fixture, "the controlled export fixture must appear in the planned documents");

  assertPlannedRecord(fixture, "site.standard.document", "fixture document");
  assert.equal(
    fixture.rkey,
    deriveStableTid(`document:${standardSiteExportSlug}`),
    "a planned document must use its deterministic document record key",
  );
  assert.equal(fixture.uri, documentAtUri(STANDARD_SITE_DEFAULT_DID, standardSiteExportSlug));
  assert.equal(fixture.value.site, standardSitePublicationUri);
  assert.equal(fixture.value.title, "Standard Site Export Fixture");
  assert.equal(
    fixture.value.description,
    "Controlled fixture for the Standard.site records export.",
  );
  assert.equal(fixture.value.publishedAt, "2026-07-04T00:00:00.000Z");
  assert.equal(fixture.value.path, `/blog/${standardSiteExportSlug}/`);
  assert.deepEqual(fixture.value.tags, ["Export Fixture", "Standard Site"]);

  const text = fixture.value.textContent;
  assert.equal(typeof text, "string", "document textContent must be a string");
  assert.ok(normalizeExportText(text).length > 0, "document textContent must carry the article");

  [
    "STANDARD_SITE_YAML_MARKER_a41f: controlled fixture prose from the frontmatter body.",
    "Controlled HTML Section",
    "STANDARD_SITE_HTML_MARKER_b52a: strong fixture and emphasis.",
    "const STANDARD_SITE_CODE_MARKER_c63b = 42;",
    "STANDARD_SITE_IMAGE_ALT_f96e",
    "STANDARD_SITE_LAST_MARKER_i29b",
  ].forEach((expected) => {
    assert.equal(
      countExportText(text, expected),
      1,
      `exported text must carry exactly one copy of the controlled text: ${expected}`,
    );
  });

  assert.equal(
    countExportText(text, "STANDARD_SITE_TABLE_MARKER_d74c"),
    1,
    "table cell text must reach the exported text",
  );
  assert.equal(
    countExportText(text, "STANDARD_SITE_TABLE_CELL_e85d"),
    1,
    "table cell text must reach the exported text",
  );
  assert.equal(
    countExportText(text, "STANDARD_SITE_FOOTNOTE_REF_g07f repeated reference"),
    1,
    "footnote references must reach the exported text",
  );
  assert.equal(
    countExportText(text, "STANDARD_SITE_FOOTNOTE_DEFINITION_h18a repeated definition body."),
    1,
    "a footnote referenced twice must contribute exactly one definition copy",
  );

  const normalizedText = normalizeExportText(text);
  assert.ok(
    normalizedText.indexOf("STANDARD_SITE_YAML_MARKER_a41f") <
      normalizedText.lastIndexOf("STANDARD_SITE_LAST_MARKER_i29b"),
    "exported text must preserve article order",
  );
}

/**
 * standard_site_export_privacy_and_legacy
 *
 * No drafts (with or without an explicit slug) reach the export, no layout or
 * signature chrome reaches textContent, and a legacy title-derived route keeps
 * building while its route ID is listed in `missingSlugIds`.
 */
function assertStandardSiteExportPrivacyAndLegacy(exportData) {
  assertDraftsExcluded(exportData.draftsExcluded);

  const exportRaw = JSON.stringify(exportData);
  [
    "STANDARD_SITE_DRAFT_SENTINEL_z19b",
    "STANDARD_SITE_DRAFT_SLUGLESS_SENTINEL_y28c",
  ].forEach((sentinel) => {
    assert.equal(
      exportRaw.includes(sentinel),
      false,
      `draft body text must never reach the export: ${sentinel}`,
    );
  });
  assert.equal(
    findExportDocument(exportData, standardSiteDraftSlug),
    null,
    "a draft with an explicit slug must not be planned",
  );
  assert.equal(
    findExportDocument(exportData, standardSiteDraftSluglessId),
    null,
    "a draft without a slug must not be planned",
  );
  [
    resolve(repositoryRoot, `dist/blog/${standardSiteDraftSlug}/index.html`),
    resolve(repositoryRoot, `dist/blog/${standardSiteDraftSluglessId}/index.html`),
  ].forEach((outputPath) => {
    assert.equal(
      existsSync(outputPath),
      false,
      `draft routes must not build in production: ${outputPath}`,
    );
  });

  assert.ok(Array.isArray(exportData.missingSlugIds), "missingSlugIds must be an array");
  assert.deepEqual(
    exportData.missingSlugIds,
    [...exportData.missingSlugIds].sort(),
    "missingSlugIds must be ordered for deterministic output",
  );
  assert.ok(
    exportData.missingSlugIds.includes(standardSiteLegacySluglessId),
    "a published post without a frontmatter slug must be listed by its title-derived route ID",
  );
  assert.equal(
    exportData.missingSlugIds.includes(standardSiteDraftSluglessId),
    false,
    "a draft without a slug is an excluded draft, not a missing-slug published post",
  );

  const legacyRoutePath = resolve(
    repositoryRoot,
    `dist/blog/${standardSiteLegacySluglessId}/index.html`,
  );
  assert.equal(
    existsSync(legacyRoutePath),
    true,
    "a legacy title-derived route must keep building in production",
  );
  const legacyHtml = readFileSync(legacyRoutePath, "utf8");
  assert.match(legacyHtml, /STANDARD_SITE_LEGACY_SENTINEL_x37d/);
  assert.doesNotMatch(
    legacyHtml,
    /rel="site\.standard\.document"/,
    "a title-derived route advertises no document identity until it gains an explicit slug",
  );

  assert.equal(
    findExportDocument(exportData, standardSiteLegacySluglessId),
    null,
    "a published post without an explicit slug must not be planned as a document",
  );
  assert.equal(
    exportRaw.includes("STANDARD_SITE_LEGACY_SENTINEL_x37d"),
    false,
    "the omitted legacy route must not leak its body into the export",
  );

  const fixtureText = findExportDocument(exportData, standardSiteExportSlug)?.value?.textContent ?? "";
  assert.doesNotMatch(fixtureText, /<[a-z!/]/iu, "exported text must not contain markup");
  assert.doesNotMatch(
    fixtureText,
    /class=|aria-hidden|data-footnote/u,
    "layout attributes must not reach exported text",
  );
  assert.doesNotMatch(
    fixtureText,
    /\/_astro\//u,
    "generated asset paths must not reach exported text",
  );
  assert.doesNotMatch(
    fixtureText,
    /Marceline Belardo is a stay-at-home software developer/u,
    "the shared author signature is site chrome, not article text",
  );
  assert.doesNotMatch(
    fixtureText,
    /\bdraft:|\bslug:|^---$/mu,
    "YAML frontmatter syntax must not reach exported text",
  );
  assert.doesNotMatch(
    fixtureText,
    /src\/content|assets\/|__standard-site/u,
    "source paths must not reach exported text",
  );
}

/**
 * standard_site_export_discovery_consistency
 *
 * Discovery, route links, and planned identities must all describe the same
 * publication, and the export must stay out of the sitemap.
 */
function assertStandardSiteExportDiscoveryConsistency(exportData) {
  assert.ok(
    existsSync(standardSiteDiscoveryOutputPath),
    "the Standard.site discovery endpoint must be emitted",
  );
  assert.equal(
    readFileSync(standardSiteDiscoveryOutputPath, "utf8").trim(),
    standardSitePublicationUri,
    "discovery must advertise the same publication identity as the export",
  );

  const missingSlugIds = new Set(exportData.missingSlugIds);
  const plannedUris = new Map(
    exportData.documents.map((planned) => {
      const slug = getPlannedDocumentSlug(planned);
      assertPlannedRecord(planned, "site.standard.document", `document ${slug}`);
      assert.equal(
        planned.rkey,
        deriveStableTid(`document:${slug}`),
        `document ${slug} must use its deterministic record key`,
      );
      assert.equal(
        planned.uri,
        documentAtUri(STANDARD_SITE_DEFAULT_DID, slug),
        `document ${slug} must use its deterministic AT-URI`,
      );
      return [slug, planned.uri];
    }),
  );
  assert.equal(
    plannedUris.size,
    exportData.documents.length,
    "each planned document must have a distinct slug",
  );
  missingSlugIds.forEach((id) => {
    assert.equal(
      plannedUris.has(id),
      false,
      `the missing-slug route ${id} must not be planned as a document`,
    );
  });

  const blogRoot = resolve(repositoryRoot, "dist/blog");
  const advertised = new Map();
  readdirSync(blogRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "tags")
    .forEach((entry) => {
      const pagePath = resolve(blogRoot, entry.name, "index.html");
      if (!existsSync(pagePath)) {
        return;
      }
      const linkTag = readFileSync(pagePath, "utf8").match(
        /<link\b[^>]*rel="site\.standard\.document"[^>]*>/,
      )?.[0];
      if (!linkTag) {
        return;
      }
      const href = linkTag.match(/\bhref="([^"]+)"/)?.[1] ?? "";
      assert.equal(
        href,
        plannedUris.get(entry.name),
        `route ${entry.name} must advertise the planned document identity`,
      );
      advertised.set(href, entry.name);
    });

  assert.deepEqual(
    [...advertised.keys()].sort(),
    [...plannedUris.values()].sort(),
    "every advertised document link must match a planned document identity",
  );

  [
    "dist/sitemap-0.xml",
    "dist/sitemap-index.xml",
  ].forEach((fileName) => {
    const sitemapPath = resolve(repositoryRoot, fileName);
    if (!existsSync(sitemapPath)) {
      return;
    }
    const sitemap = readFileSync(sitemapPath, "utf8");
    assert.doesNotMatch(
      sitemap,
      /standard-site\/records\.json/u,
      `${fileName} must not list the records export`,
    );
    assert.doesNotMatch(
      sitemap,
      /site\.standard\.publication/u,
      `${fileName} must not list the records export`,
    );
  });
}

/**
 * standard_site_export_is_deterministic
 *
 * Two production builds over the same content must emit byte-identical JSON.
 */
function assertStandardSiteExportIsDeterministic(firstRaw) {
  const secondRaw = readStandardSiteExportRaw();

  assert.equal(
    secondRaw,
    firstRaw,
    "two production builds over the same content must emit identical records.json bytes",
  );

  const plannedShape = (raw) =>
    JSON.parse(raw).documents.map((planned) => [
      getPlannedDocumentSlug(planned),
      planned.collection,
      planned.rkey,
      planned.uri,
      planned.value.textContent,
    ]);

  assert.deepEqual(
    plannedShape(secondRaw),
    plannedShape(firstRaw),
    "the rebuild must keep every planned document identity and its full text",
  );
}

/**
 * standard_site_export_disabled_build
 *
 * An explicit empty PUBLIC_STANDARD_SITE_DID disables the export: no identity,
 * no publication, no documents, no discovery, and no route advertisement.
 */
function assertDisabledStandardSiteExport() {
  assert.ok(
    existsSync(standardSiteExportOutputPath),
    "a disabled build must still emit the export envelope",
  );

  const exportData = parseStandardSiteExport(readStandardSiteExportRaw());
  assert.equal(exportData.version, 1);
  assert.equal(
    exportData.did,
    null,
    "an empty PUBLIC_STANDARD_SITE_DID must disable the publication identity",
  );
  assert.equal(exportData.publication, null, "a disabled export must plan no publication");
  assert.deepEqual(exportData.documents, [], "a disabled export must plan no documents");
  assert.equal(exportData.draftsExcluded, 0, "a disabled export must report no draft details");
  assert.deepEqual(
    exportData.missingSlugIds,
    [],
    "a disabled export must list no missing-slug route IDs",
  );
  assert.doesNotMatch(
    JSON.stringify(exportData),
    /at:\/\//u,
    "a disabled export must not publish any record identity",
  );
  assert.equal(
    existsSync(standardSiteDiscoveryOutputPath),
    false,
    "a disabled publication must not emit discovery",
  );

  const blogRoot = resolve(repositoryRoot, "dist/blog");
  readdirSync(blogRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "tags")
    .forEach((entry) => {
      const pagePath = resolve(blogRoot, entry.name, "index.html");
      if (!existsSync(pagePath)) {
        return;
      }
      assert.doesNotMatch(
        readFileSync(pagePath, "utf8"),
        /rel="site\.standard\.document"/,
        `a disabled publication must not advertise ${entry.name}`,
      );
    });
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function decodeXmlEntities(value) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|[0-9]+));/gi,
    (entity) => {
      const normalized = entity.toLowerCase();
      const namedEntities = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };

      if (namedEntities[normalized]) {
        return namedEntities[normalized];
      }

      const codePoint = normalized.startsWith("&#x")
        ? Number.parseInt(normalized.slice(3, -1), 16)
        : Number.parseInt(normalized.slice(2, -1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    },
  );
}

function getTagValue(item, tagName) {
  const matches = [...item.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "g"))];
  assert.equal(matches.length, 1, `${tagName} must appear exactly once in a fixture item`);
  return decodeXmlEntities(matches[0]?.[1] ?? "");
}

function getContent(item) {
  const matches = [...item.matchAll(/<content:encoded>([\s\S]*?)<\/content:encoded>/g)];
  assert.equal(matches.length, 1, "fixture item must contain exactly one content:encoded element");
  return decodeXmlEntities(matches[0]?.[1] ?? "");
}

function assertFixtureItem(item) {
  assert.equal(getTagValue(item, "title"), fixtureTitle);
  assert.equal(getTagValue(item, "link"), fixtureLink);
  assert.equal(getTagValue(item, "guid"), fixtureLink);
  assert.equal(getTagValue(item, "description"), fixtureDescription);
  assert.deepEqual(
    [...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((match) =>
      decodeXmlEntities(match[1] ?? ""),
    ),
    fixtureCategories,
  );

  const html = getContent(item);
  const signature = html.match(/<footer class="blog-author-signature">[\s\S]*?<\/footer>/)?.[0];
  assert.ok(signature, "RSS must include the shared author signature");
  assert.equal(html.replace(signature, ""), expectedFixtureBodyHtml, "decoded fixture body HTML must be exact");
  const detail = readFileSync(resolve(repositoryRoot, "dist/blog/rss-production-fixture/index.html"), "utf8");
  const detailSignature = detail.match(/<footer class="blog-author-signature">[\s\S]*?<\/footer>/)?.[0];
  assert.ok(detailSignature);
  assert.equal(signature, detailSignature.replace(/(href|src)="\/(?!\/)/g, `$1="${siteOrigin}/`));
  assert.match(html, /^<p>RSS_FIXTURE_FIRST_MARKER_7c1b:/);
  assert.match(html, /<p>RSS_FIXTURE_LAST_MARKER_9d2f<\/p>\n<section data-footnotes=/);
  assert.match(html, /<h2 id="formatted-rss-fixture-section">Formatted RSS Fixture Section<\/h2>/);
  assert.match(html, /data-footnote-ref/);
  assert.match(html, /id="user-content-fn-fixture"/);
  assert.match(html, /data-footnote-backref/);
  assert.match(html, new RegExp(`href="${siteOrigin.replaceAll(".", "\\.")}\/fixture-root\/\\?one=1&#x26;two=2"`));
  assert.match(html, new RegExp(`src="${siteOrigin.replaceAll(".", "\\.")}\/quoted-image\\.svg\\?src=1&#x26;src=2"`));
  assert.match(html, /href="https:\/\/external\.example\/path\?external=1&#x26;external=2"/);
  assert.match(html, /href="mailto:fixture@example\.com\?subject=RSS&#x26;body=XML"/);
  assert.match(html, /href="#fixture-fragment"/);
  assert.match(html, /href="\/\/cdn\.example\.com\/fixture\.svg\?cdn=1&#x26;cdn=2"/);
  assert.match(html, /&#x26;/, "reserved ampersands must remain represented in HTML");
  assert.match(html, /&#x3C;/, "reserved less-than signs must remain represented in HTML");
}

function assertFeed(rss) {
  assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(rss, /<rss version="2\.0" xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/">/);
  assert.match(rss, /<channel>[\s\S]*<\/channel><\/rss>$/);
  assert.equal(countMatches(rss, /<item>/g), countMatches(rss, /<\/item>/g));
  const itemCount = countMatches(rss, /<item>/g);
  assert.ok(itemCount >= 2, "both controlled published fixtures must appear");
  assert.equal(countMatches(rss, /<content:encoded>/g), itemCount, "every published item must expose exactly one content:encoded element");
  assert.equal(countMatches(rss, /<\/content:encoded>/g), itemCount);
  assert.match(rss, /<description>[^<]+<\/description>/);
  assert.match(rss, /<title>RSS Fixture &amp; &lt;Quotes&gt; &quot;Round Trip&quot;<\/title>/);
  assert.match(rss, /<description>RSS fixture &amp; &lt;description&gt; &quot;round trip&quot; &apos;apostrophe&apos;<\/description>/);
  assert.match(rss, /<category>Fixture &amp; XML<\/category>/);
  assert.match(rss, /<category>Quotes &lt;Tags&gt;<\/category>/);
  assert.match(rss, /<content:encoded>&lt;p&gt;/);
  assert.doesNotMatch(rss, /<content:encoded>[\s\S]*<p>/);
  assert.doesNotMatch(rss, /draft-route-fixture|draft-only-review/i);

  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1] ?? "");
  const titles = items.map((item) => getTagValue(item, "title"));
  const links = items.map((item) => getTagValue(item, "link"));

  assert.ok(titles.includes(fixtureTitle));
  assert.ok(links.includes(`${siteOrigin}/blog/footnote-production-fixture/`));
  assert.ok(links.includes(fixtureLink));
  items.forEach((item, index) => {
    assert.equal(countMatches(getContent(item), /<footer class="blog-author-signature">/g), 1,
      `the shared signature must occur exactly once in item ${index + 1}`);
  });
  assertFixtureItem(items.find((item) => getTagValue(item, "link") === fixtureLink) ?? "");
}

function runNegativeValidationChecks() {
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
    assertAstroSyncRejects(path, createInvalidUrlFixture(field, value), new RegExp(field));
  });
}

if (reviewOutputDirectory) {
  validateReviewOutputDestination(reviewOutputDirectory, { repositoryRoot });
}

for (const fixturePath of fixturePaths) {
  if (existsSync(fixturePath)) {
    throw new Error(`refusing to overwrite ${fixturePath}`);
  }
}

const footnoteFixtureFrontmatter = `---
slug: footnote-production-fixture
title: Controlled Footnote Fixture
date: 2026-06-01
description: Controlled content for footnotes and related writing.
---
A controlled published post.
`;
const footnoteBody = readFileSync(
  resolve(repositoryRoot, "tests/fixtures/footnotes.md"),
  "utf8",
);
const footnoteFixturePost = `${footnoteFixtureFrontmatter.trimEnd()}\n\n${footnoteBody}`;
const relatedProjectSlug = getRelatedProjectSlug();

try {
  runNegativeValidationChecks();

  writeFileSync(draftRouteFixturePath, draftRouteFixture, "utf8");
  writeFileSync(draftProjectFixturePath, draftProjectFixture, "utf8");
  writeFileSync(
    optionalProjectFixturePath,
    optionalProjectFixture(relatedProjectSlug),
    "utf8",
  );
  writeFileSync(noOptionalsProjectFixturePath, noOptionalsProjectFixture, "utf8");
  writeFileSync(rssFixturePath, rssFixture, "utf8");
  writeFileSync(footnoteFixturePath, footnoteFixturePost, "utf8");
  writeFileSync(standardSiteExportFixturePath, standardSiteExportFixture, "utf8");
  writeFileSync(standardSiteDraftFixturePath, standardSiteDraftFixture, "utf8");
  writeFileSync(
    standardSiteDraftSluglessFixturePath,
    standardSiteDraftSluglessFixture,
    "utf8",
  );
  writeFileSync(
    standardSiteLegacySluglessFixturePath,
    standardSiteLegacySluglessFixture,
    "utf8",
  );
  writeFileSync(coveredReviewProjectPath, projectReviewFixture(
    "design-preview-covered", true, "2026-06-30", "Design Preview Covered",
  ), "utf8");
  writeFileSync(minimalReviewProjectPath, projectReviewFixture(
    "design-preview-minimal", false, "2026-06-29", "Design Preview Minimal",
  ), "utf8");
  reviewBlogFixturePaths.forEach((fixturePath, index) => {
    writeFileSync(fixturePath, reviewBlogFixtures[index], "utf8");
  });

  if (simulatedFixtureFailure) {
    throw new Error("simulated fixture build failure for cleanup verification");
  }

  runCommand("pnpm", ["build"], "combined production fixture build failed");

  assertDraftRouteOutput();
  assertProjectFixtureOutput(relatedProjectSlug);
  assertDesignReviewFixtureOutput();
  assertFootnoteFixtureOutput();
  assert.ok(existsSync(rssOutputPath), "production RSS fixture output was not generated");
  assertFeed(readFileSync(rssOutputPath, "utf8"));

  const standardSiteExportRaw = readStandardSiteExportRaw();
  const standardSiteExport = parseStandardSiteExport(standardSiteExportRaw);
  runFixtureCheck("standard_site_export_fixture", () =>
    assertStandardSiteExportFixture(standardSiteExport),
  );
  runFixtureCheck("standard_site_export_privacy_and_legacy", () =>
    assertStandardSiteExportPrivacyAndLegacy(standardSiteExport),
  );
  runFixtureCheck("standard_site_export_discovery_consistency", () =>
    assertStandardSiteExportDiscoveryConsistency(standardSiteExport),
  );

  if (reviewOutputDirectory) {
    cpSync(resolve(repositoryRoot, "dist"), reviewOutputDirectory, { recursive: true, errorOnExist: true });
    assertRetainedReviewOutput(reviewOutputDirectory);
    console.log(`Retained complete fixture output at ${reviewOutputDirectory}`);
  }

  // Astro normally empties outDir between builds; removing the artifacts first
  // keeps the disabled-build assertions about *emission*, not stale files.
  rmSync(standardSiteExportOutputPath, { force: true });
  rmSync(standardSiteDiscoveryOutputPath, { force: true });
  runCommand("pnpm", ["build"], "disabled Standard.site export build failed", {
    PUBLIC_STANDARD_SITE_DID: "",
  });
  runFixtureCheck("standard_site_export_disabled_build", assertDisabledStandardSiteExport);

  // Rebuild with the configured identity so the harness leaves an enabled build
  // behind, and prove the interruption did not change the planned records.
  runCommand("pnpm", ["build"], "deterministic Standard.site export rebuild failed");
  runFixtureCheck("standard_site_export_is_deterministic", () =>
    assertStandardSiteExportIsDeterministic(standardSiteExportRaw),
  );
} finally {
  fixturePaths.forEach((fixturePath) => rmSync(fixturePath, { force: true }));
}

assertTemporaryFixturesRemoved("normal fixture build");
if (!simulatedFixtureFailure) {
  const failure = spawnSync(process.execPath, [
    resolve(repositoryRoot, "tests/production-fixture-build.mjs"),
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, PORTFOLIO_FIXTURE_SIMULATE_FAILURE: "1" },
  });
  assert.notEqual(failure.status, 0, "simulated fixture build must fail intentionally");
  assert.match(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`, /simulated fixture build failure/);
  assertTemporaryFixturesRemoved("simulated fixture build failure");
}
