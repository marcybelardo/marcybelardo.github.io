import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  getInkHoverVisibleText,
  getStructuredData,
} from "./generated-artifact-helpers.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const approvedSignature =
  "Marceline Belardo is a stay-at-home software developer, conceptual artist, and reluctant content creator. She is based in Makati City, Philippines. She writes these blogs as a public service, and you can see new posts by following her on BlueSky @marcelinebelardo.com, or by using the RSS feed with your favorite reader. If you'd like to support her, consider some words of encouragement, or if your company is hiring, find out how to contact her at the Bio page.";

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
  assert.doesNotMatch(detailHtml, /class="eyebrow"/);
  const articleHeading = detailHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  assert.equal(
    getInkHoverVisibleText(articleHeading, "blog article title"),
    "The Devil You Know, the Devil You Don't",
  );
});

test("blog index and tag archives use the same full-width contents entry", () => {
  const indexHtml = readBlogOutput();
  const tagHtml = readBlogOutput("tags", "technology");
  const indexHeading = indexHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  const tagHeading = tagHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";

  assert.equal(getInkHoverVisibleText(indexHeading, "blog index title"), "Blog");
  assert.equal(
    getInkHoverVisibleText(tagHeading, "tag archive title"),
    "Posts tagged: Technology",
  );
  [indexHtml, tagHtml].forEach((html) => {
    assert.match(html, /class="[^"]*\bblog-index-page\b/);
    assert.match(html, /href="\/rss\.xml" class="blog-index__rss">RSS feed<\/a>/);
    assert.match(html, /class="blog-index-entry"/);
    assert.match(html, /<time class="metadata blog-index-entry__date"/);
    assert.match(html, /<div class="blog-index-entry__summary">/);
    assert.match(html, /class="blog-index-entry__tags" aria-label="Tags"/);
    assert.doesNotMatch(html, /class="eyebrow"/);
  });

  const indexEntryTitle = indexHtml.match(
    /<h2>\s*<a\b(?=[^>]*href="\/blog\/the-devil-you-know\/"?)(?=[^>]*data-ink-hover="text")[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/,
  )?.[1] ?? "";
  assert.equal(
    getInkHoverVisibleText(indexEntryTitle, "blog index entry title"),
    "The Devil You Know, the Devil You Don't",
  );
  assert.match(
    indexHtml,
    /<p>Where Marceline comes to terms with AI&#39;s usefulness, and why its issues run deeper than technology<\/p>/,
  );
  assert.match(indexHtml, /href="\/blog\/tags\/technology\/">Technology<\/a>/);

  const blogStyles = readFileSync(
    resolve(repositoryRoot, "src/styles/blog-design.css"),
    "utf8",
  );
  assert.match(blogStyles, /grid-template-columns:\s*minmax\(7rem,\s*0\.2fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(9rem,\s*0\.23fr\)/);
  assert.match(blogStyles, /\.blog-index-entry--with-image/);
  assert.match(blogStyles, /@media \(max-width:\s*47\.999rem\)/);
  assert.match(blogStyles, /font-family:\s*var\(--font-reading\)/);
});

test("blog detail renders one shared author signature between the body and margin-note rail", () => {
  const html = readBlogOutput("the-devil-you-know");
  const signatureMatches = [
    ...html.matchAll(/<footer class="blog-author-signature">([\s\S]*?)<\/footer>/g),
  ];

  assert.equal(signatureMatches.length, 1, "blog detail must render one author signature");
  const signature = signatureMatches[0]?.[0] ?? "";
  const bodyStart = html.indexOf('<div class="blog-article__body">');
  const signatureStart = html.indexOf('<footer class="blog-author-signature">');
  const railStart = html.indexOf('<aside class="margin-note-rail"');
  const bodyEnd = html.indexOf("</div>", bodyStart);

  assert.ok(bodyStart >= 0, "blog detail must contain the article body");
  assert.ok(bodyEnd >= 0, "blog detail article body must close");
  assert.ok(signatureStart > bodyEnd, "signature must follow the article body");
  assert.ok(railStart > signatureStart, "signature must precede the margin-note rail");
  assert.equal((signature.match(/<hr\s*\/?\s*>/g) ?? []).length, 1);
  assert.equal((signature.match(/<p\b/g) ?? []).length, 1);
  assert.equal((signature.match(/<em>/g) ?? []).length, 1);
  assert.match(signature, /<p>\s*<em>[\s\S]*<\/em>\s*<\/p>/);

  const visibleText = signature
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  assert.equal(visibleText, approvedSignature);

  const links = [...signature.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(
    (match) => [match[1] ?? "", match[2] ?? ""] as const,
  );
  assert.deepEqual(links, [
    ["https://bsky.app/profile/marcelinebelardo.com", "BlueSky @marcelinebelardo.com"],
    ["/rss.xml", "RSS feed"],
    ["/bio/", "Bio page"],
  ]);
});

test("margin-note CSS positions list items beneath the semantic rail wrapper", () => {
  const stylesheet = readFileSync(resolve(repositoryRoot, "src/styles/global.css"), "utf8");

  assert.match(stylesheet, /\.margin-note-rail > ol > li/);
  assert.doesNotMatch(stylesheet, /\.margin-note-rail > li/);
});

test("blog detail JSON-LD contains only the visible published fields", () => {
  const html = readBlogOutput("the-devil-you-know");
  const jsonLd = getStructuredData(html, "blog detail");

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
    resolve(repositoryRoot, "src/pages/blog/[slug]/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/tags/[tag].astro"),
  ].map((sourcePath) => readFileSync(sourcePath, "utf8"));

  routeSources.forEach((source) => {
    assert.doesNotMatch(source, /\bany\b/);
  });
});

test("blog routes use the editorial presentation without legacy utility or prose classes", () => {
  const routeSources = [
    resolve(repositoryRoot, "src/pages/blog/index.astro"),
    resolve(repositoryRoot, "src/pages/blog/[slug]/index.astro"),
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
