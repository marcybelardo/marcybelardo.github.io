import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SITE_ORIGIN } from "../src/site-config.ts";
import { toTagSlug } from "../src/content/content-queries.ts";
import { publishedPosts, publishedTags } from "./published-blog-content.ts";
import { decodeHtmlEntities, getInkHoverVisibleText, getStructuredData, getSingleMatch } from "./generated-artifact-helpers.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const readBlog = (...segments: string[]) => readFileSync(resolve(distDirectory, "blog", ...segments, "index.html"), "utf8");
const text = (html: string) => decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Expectations come from authored content; fixtures separately test exact escaping and draft filtering.
test("published blog entries, metadata, and RSS agree with current source content", () => {
  const index = readBlog();
  const rss = readFileSync(resolve(distDirectory, "rss.xml"), "utf8");
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]!);
  assert.equal(items.length, publishedPosts.length);
  assert.equal([...index.matchAll(/class="blog-index-entry(?:\s[^"]*)?"/g)].length, publishedPosts.length);
  for (const [position, post] of publishedPosts.entries()) {
    const html = readBlog(post.id);
    const canonical = `${SITE_ORIGIN}/blog/${post.id}/`;
    const data = getStructuredData(html, post.id);
    const heading = getSingleMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/g, post.id);
    assert.equal(getInkHoverVisibleText(heading, post.id), post.data.title);
    assert.deepEqual(Object.keys(data).sort(), [
      "@context", "@id", "@type", "datePublished", "description", "headline",
      ...(post.data.tags.length ? ["keywords"] : []), "url",
    ].sort());
    assert.equal(data["@type"], "BlogPosting");
    assert.equal(data["@id"], canonical);
    assert.equal(data.url, canonical);
    assert.equal(data.headline, post.data.title);
    assert.equal(data.description, post.data.description);
    assert.equal(data.datePublished, post.data.date.toISOString());
    const tags = post.data.tags.map((label) => ({ label, slug: toTagSlug(label) }));
    assert.deepEqual(data.keywords ?? [], tags.map((tag) => tag.label));
    const entries = [...index.matchAll(/<article class="blog-index-entry[^>]*>([\s\S]*?)<\/article>/g)];
    const entry = entries.find((match) => match[1]?.includes(`href="/blog/${post.id}/"`))?.[1];
    assert.ok(entry, `${post.id} must appear in the index`);
    const entryTitle = entry.match(/<h2>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/)?.[1] ?? "";
    assert.equal(getInkHoverVisibleText(entryTitle, post.id), post.data.title);
    assert.equal(text(entry.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ""), post.data.description);
    for (const tag of tags) {
      assert.ok(entry.includes(`href="/blog/tags/${tag.slug}/"`));
      assert.ok(html.includes(`href="/blog/tags/${tag.slug}/"`));
    }
    assert.match(html, /data-margin-note-article/);
    assert.match(html, /data-margin-note-rail[\s\S]*<ol aria-label="Margin notes"><\/ol>/);
    assert.doesNotMatch(html, /data-margin-notes-enhanced="true"/);
    const item = items[position]!;
    assert.equal(getSingleMatch(item, /<link>([^<]+)<\/link>/g, "RSS link"), canonical);
    assert.equal(getSingleMatch(item, /<guid isPermaLink="true">([^<]+)<\/guid>/g, "RSS guid"), canonical);
    assert.equal(getSingleMatch(item, /<title>([\s\S]*?)<\/title>/g, "RSS title"), post.data.title);
    assert.equal(getSingleMatch(item, /<description>([\s\S]*?)<\/description>/g, "RSS description"), post.data.description);
    assert.deepEqual([...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((match) => decodeHtmlEntities(match[1]!)), post.data.tags);
  }
});

test("blog index and tag archives share the contents layout and current membership", () => {
  for (const archive of [{ html: readBlog(), posts: publishedPosts }, ...publishedTags.map((tag) => ({ html: readBlog("tags", tag.slug), posts: tag.posts }))]) {
    assert.match(archive.html, /class="[^"]*\bblog-index-page\b/);
    assert.match(archive.html, /href="\/rss\.xml"/);
    assert.ok(getInkHoverVisibleText(archive.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "", "index heading"));
    const links = [...archive.html.matchAll(/<h2>\s*<a\b[^>]*href="\/blog\/([^/]+)\/"/g)].map((match) => match[1]);
    assert.deepEqual(links, archive.posts.map((post) => post.id));
  }
});

test("every blog detail and RSS item renders the same non-empty author signature", () => {
  const rss = readFileSync(resolve(distDirectory, "rss.xml"), "utf8");
  const rssBodies = [...rss.matchAll(/<content:encoded>([\s\S]*?)<\/content:encoded>/g)].map((match) => decodeHtmlEntities(match[1]!));
  let sharedSignature: string | undefined;
  for (const [index, post] of publishedPosts.entries()) {
    const html = readBlog(post.id);
    const signatures = [...html.matchAll(/<footer class="blog-author-signature">([\s\S]*?)<\/footer>/g)];
    assert.equal(signatures.length, 1);
    const signature = signatures[0]![0];
    assert.ok(text(signature), "author signature must have readable content");
    sharedSignature ??= signature;
    assert.equal(signature, sharedSignature);
    assert.ok(html.indexOf(signature) > html.indexOf('<div class="blog-article__body">'));
    assert.ok(html.indexOf(signature) < html.indexOf('<aside class="margin-note-rail"'));
    const feedSignatures = [...rssBodies[index]!.matchAll(/<footer class="blog-author-signature">([\s\S]*?)<\/footer>/g)];
    assert.equal(feedSignatures.length, 1);
    // Feed root-relative links must resolve to the site origin.
    const absoluteSignature = signature.replace(/(href|src)="\/(?!\/)/g, `$1="${SITE_ORIGIN}/`);
    assert.equal(feedSignatures[0]![0], absoluteSignature);
  }
});

test("blog presentation retains editorial typography and semantic margin-note styling", () => {
  const styles = readFileSync(resolve(repositoryRoot, "src/styles/blog-design.css"), "utf8");
  const global = readFileSync(resolve(repositoryRoot, "src/styles/global.css"), "utf8");
  assert.match(styles, /font-family:\s*var\(--font-reading\)/);
  assert.match(styles, /\.blog-article__body/);
  assert.match(global, /\.margin-note-rail > ol > li/);
  assert.doesNotMatch(global, /\.margin-note-rail > li/);
  for (const post of publishedPosts) assert.doesNotMatch(readBlog(post.id), /class="[^"]*\bprose\b/);
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

  for (const post of publishedPosts) {
  const detailHtml = readBlog(post.id);
  assert.match(detailHtml, /class="[^"]*blog-article__body[^"]*"/);
  assert.doesNotMatch(detailHtml, /class="[^"]*\bprose\b/);
  }
});
