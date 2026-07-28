import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";

function readBlogOutput(...segments: ReadonlyArray<string>): string {
  const outputPath = resolve(distDirectory, "blog", ...segments, "index.html");

  assert.ok(existsSync(outputPath), `${segments.join("/")} blog output must exist`);
  return readFileSync(outputPath, "utf8");
}

function readRssOutput(): string {
  const outputPath = resolve(distDirectory, "rss.xml");

  assert.ok(existsSync(outputPath), "RSS output must exist");
  return readFileSync(outputPath, "utf8");
}

function getJsonLd(html: string): Readonly<Record<string, unknown>> {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );

  assert.ok(match?.[1], "blog detail must contain JSON-LD");
  return JSON.parse(match[1]) as Readonly<Record<string, unknown>>;
}

test("production blog output preserves the published post and tag routes", () => {
  const indexHtml = readBlogOutput();
  const detailHtml = readBlogOutput("the-devil-you-know");

  ["ai", "technology", "politics"].forEach((tag) => {
    readBlogOutput("tags", tag);
    assert.match(indexHtml, new RegExp(`href="/blog/tags/${tag}/"`));
    assert.match(detailHtml, new RegExp(`href="/blog/tags/${tag}/"`));
  });
  assert.match(indexHtml, /href="\/blog\/the-devil-you-know\/"/);
  assert.match(detailHtml, /<link rel="canonical" href="https:\/\/www\.marcelinebelardo\.com\/blog\/the-devil-you-know\/"/);
  assert.equal(
    existsSync(resolve(distDirectory, "blog", "tags", "draft-only-review", "index.html")),
    false,
  );
  assert.match(detailHtml, /data-margin-note-article/);
  assert.match(detailHtml, /data-margin-note-rail/);
  assert.match(detailHtml, /data-margin-note-rail[\s\S]*<ol aria-label="Margin notes"><\/ol>/);
  assert.doesNotMatch(detailHtml, /data-margin-notes-enhanced="true"/);
});

test("margin-note CSS positions list items beneath the semantic rail wrapper", () => {
  const stylesheet = readFileSync(resolve(repositoryRoot, "src/styles/global.css"), "utf8");

  assert.match(stylesheet, /\.margin-note-rail > ol > li/);
  assert.doesNotMatch(stylesheet, /\.margin-note-rail > li/);
});

test("blog detail JSON-LD contains only the visible published fields", () => {
  const html = readBlogOutput("the-devil-you-know");
  const jsonLd = getJsonLd(html);

  assert.deepEqual(Object.keys(jsonLd).sort(), [
    "@context",
    "@id",
    "@type",
    "datePublished",
    "description",
    "headline",
    "keywords",
    "url",
  ]);
  assert.equal(jsonLd["@context"], "https://schema.org");
  assert.equal(jsonLd["@type"], "BlogPosting");
  assert.equal(jsonLd["@id"], `${configuredOrigin}/blog/the-devil-you-know/`);
  assert.equal(jsonLd.url, jsonLd["@id"]);
  assert.equal(jsonLd.headline, "The Devil You Know, the Devil You Don't");
  assert.equal(
    jsonLd.description,
    "Where Marceline comes to terms with AI's usefulness, and why its issues run deeper than technology",
  );
  assert.equal(jsonLd.datePublished, "2026-06-02T00:00:00.000Z");
  assert.deepEqual(jsonLd.keywords, ["AI", "Technology", "Politics"]);
  assert.equal("image" in jsonLd, false);
  assert.doesNotMatch(html, /draft-route-fixture|draft-only-review/i);
});

test("RSS contains deterministic published-only canonical discovery output", () => {
  const rss = readRssOutput();
  const canonicalPostUrl = `${configuredOrigin}/blog/the-devil-you-know/`;

  assert.match(rss, new RegExp(`<link>${configuredOrigin.replaceAll(".", "\\.")}\/</link>`));
  assert.match(rss, new RegExp(`<link>${canonicalPostUrl.replaceAll(".", "\\.")}</link>`));
  assert.match(rss, new RegExp(`<guid isPermaLink="true">${canonicalPostUrl.replaceAll(".", "\\.")}</guid>`));
  assert.match(rss, /<category>AI<\/category>/);
  assert.match(rss, /<category>Technology<\/category>/);
  assert.match(rss, /<category>Politics<\/category>/);
  assert.match(rss, /The Devil You Know, the Devil You Don&apos;t/);
  assert.match(
    rss,
    /Where Marceline comes to terms with AI&apos;s usefulness, and why its issues run deeper than technology/,
  );
  assert.doesNotMatch(rss, /draft-route-fixture|draft-only-review|marcybelardo\.github\.io/i);
});

test("blog routes contain no untyped any annotations", () => {
  const routeSources = [
    resolve(repositoryRoot, "src/pages/blog/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/[...slug]/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/tags/[tag].astro"),
  ].map((sourcePath) => readFileSync(sourcePath, "utf8"));

  routeSources.forEach((source) => {
    assert.doesNotMatch(source, /\bany\b/);
  });
});

test("blog routes use the editorial presentation without legacy utility or prose classes", () => {
  const routeSources = [
    resolve(repositoryRoot, "src/pages/blog/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/[...slug]/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/tags/[tag].astro"),
  ].map((sourcePath) => readFileSync(sourcePath, "utf8"));

  routeSources.forEach((source) => {
    assert.doesNotMatch(source, /\b(?:text-red-\d+|font-bold|text-neutral-[^\s"]+|prose)\b/);
    assert.match(source, /editorial-(?:page|measure|list|article)/);
  });

  const stylesheet = readFileSync(resolve(repositoryRoot, "src/styles/global.css"), "utf8");
  assert.match(stylesheet, /\.blog-article__body/);
  assert.match(stylesheet, /\.blog-article__body\s+h2/);
  assert.match(stylesheet, /\.blog-article__body\s+blockquote/);

  const detailHtml = readBlogOutput("the-devil-you-know");
  assert.match(detailHtml, /class="[^"]*blog-article__body[^"]*"/);
  assert.doesNotMatch(detailHtml, /class="[^"]*\bprose\b/);
});
