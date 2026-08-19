// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePostPath = resolve(
  repositoryRoot,
  "src/content/blog/__rss-production-fixture.md",
);
const rssOutputPath = resolve(repositoryRoot, "dist/rss.xml");
const siteOrigin = "https://www.marcelinebelardo.com";
const fixtureSlug = "rss-production-fixture";
const fixtureTitle = 'RSS Fixture & <Quotes> "Round Trip"';
const fixtureDescription = 'RSS fixture & <description> "round trip" \'apostrophe\'';
const fixtureLink = `${siteOrigin}/blog/${fixtureSlug}/`;
const fixtureCategories = ["Fixture & XML", "Quotes <Tags>", "RSS"];
const fixturePost = `---
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
  `${siteOrigin}/bio/` +
  '">Bio page</a>.\n</em> </p> </footer>';

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

  assert.equal(result.status, 0, `production RSS fixture build failed:\n${output}`);
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
  assert.equal(
    getTagValue(item, "description"),
    fixtureDescription,
  );
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
  assert.equal(
    countMatches(rss, /<content:encoded>/g),
    2,
    "every published item must expose exactly one content:encoded element",
  );
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

if (existsSync(fixturePostPath)) {
  throw new Error(`refusing to overwrite ${fixturePostPath}`);
}

try {
  writeFileSync(fixturePostPath, fixturePost, "utf8");
  runFixtureBuild();

  assert.ok(existsSync(rssOutputPath), "production RSS fixture output was not generated");
  assertFeed(readFileSync(rssOutputPath, "utf8"));
} finally {
  rmSync(fixturePostPath, { force: true });
}
