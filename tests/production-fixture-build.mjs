// pattern: Imperative Shell

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const publishedPostPath = resolve(blogDirectory, "the-devil-you-know.md");

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
  "dist/blog/the-devil-you-know/index.html",
);
const rssOutputPath = resolve(repositoryRoot, "dist/rss.xml");

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
coverImage: ../../assets/20260425_29.jpg
coverImageAlt: A portrait image used by the optional project fixture
gallery:
  - image: ../../assets/20260425_29.jpg
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
  - the-devil-you-know
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
  '</section><footer class="blog-author-signature"> <hr> <p> <em>\n' +
  'Marceline Belardo is a stay-at-home software developer, conceptual artist, and reluctant content creator. She is based in Makati City, Philippines. She writes these blogs as a public service, and you can see new posts by following her on <a href="https://bsky.app/profile/marcelinebelardo.com">BlueSky @marcelinebelardo.com</a>, or by using the <a href="' +
  `${siteOrigin}/rss.xml` +
  '">RSS feed</a> with your favorite reader. If you\'d like to support her, consider some words of encouragement, or if your company is hiring, find out how to contact her at the <a href="' +
  `${siteOrigin}/about/` +
  '">About page</a>.\n</em> </p> </footer>';

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

function runCommand(command, args, failureMessage) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
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
  assert.match(optionalIndexEntry, /project-index-entry--has-cover/);
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
  assert.match(html, /Related writing[\s\S]*href="\/blog\/the-devil-you-know\/"/);
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
  assert.equal(html, expectedFixtureBodyHtml, "decoded fixture RSS HTML must be exact");
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
  assert.equal(countMatches(rss, /<item>/g), 2, "fixture build must expose exactly two published items");
  assert.equal(countMatches(rss, /<content:encoded>/g), 2, "every published item must expose exactly one content:encoded element");
  assert.equal(countMatches(rss, /<\/content:encoded>/g), 2);
  assert.match(rss, /<description>Marceline Belardo&apos;s thoughts on tech, politics, and art<\/description>/);
  assert.match(rss, /<title>RSS Fixture &amp; &lt;Quotes&gt; &quot;Round Trip&quot;<\/title>/);
  assert.match(rss, /<description>RSS fixture &amp; &lt;description&gt; &quot;round trip&quot; &apos;apostrophe&apos;<\/description>/);
  assert.match(rss, /<category>Fixture &amp; XML<\/category>/);
  assert.match(rss, /<category>Quotes &lt;Tags&gt;<\/category>/);
  assert.match(rss, /<content:encoded>&lt;p&gt;/);
  assert.doesNotMatch(rss, /<content:encoded>[\s\S]*<p>/);
  assert.doesNotMatch(rss, /Blog 2|draft-route-fixture|draft-only-review/i);

  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1] ?? "");
  const titles = items.map((item) => getTagValue(item, "title"));
  const links = items.map((item) => getTagValue(item, "link"));

  assert.deepEqual(titles, [fixtureTitle, "The Devil You Know, the Devil You Don't"]);
  assert.deepEqual(links, [fixtureLink, `${siteOrigin}/blog/the-devil-you-know/`]);
  items.forEach((item, index) => {
    assert.equal(
      countMatches(item, /Marceline Belardo is a stay-at-home software developer/g),
      1,
      `the shared signature must occur exactly once in item ${index + 1}`,
    );
  });
  assertFixtureItem(items[0] ?? "");
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

for (const fixturePath of fixturePaths) {
  if (existsSync(fixturePath)) {
    throw new Error(`refusing to overwrite ${fixturePath}`);
  }
}

const originalPost = readFileSync(publishedPostPath, "utf8");
const footnoteBody = readFileSync(
  resolve(repositoryRoot, "tests/fixtures/footnotes.md"),
  "utf8",
);
const footnoteFixturePost = `${originalPost.trimEnd()}\n\n${footnoteBody}`;
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
  writeFileSync(publishedPostPath, footnoteFixturePost, "utf8");

  runCommand("pnpm", ["build"], "combined production fixture build failed");

  assertDraftRouteOutput();
  assertProjectFixtureOutput(relatedProjectSlug);
  assertFootnoteFixtureOutput();
  assert.ok(existsSync(rssOutputPath), "production RSS fixture output was not generated");
  assertFeed(readFileSync(rssOutputPath, "utf8"));
} finally {
  writeFileSync(publishedPostPath, originalPost, "utf8");
  fixturePaths.forEach((fixturePath) => rmSync(fixturePath, { force: true }));
}
