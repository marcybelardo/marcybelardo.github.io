import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";

function getHtmlFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return getHtmlFiles(entryPath);
    }

    return entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

function getSingleMatch(html: string, pattern: RegExp, label: string): string {
  const matches = [...html.matchAll(pattern)];

  assert.equal(matches.length, 1, `${label} must appear exactly once`);
  return decodeHtmlEntities(matches[0]?.[1] ?? "");
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|quot|#39|#x27|lt|gt);/g,
    (entity, name: string) => {
      const entities: Readonly<Record<string, string>> = {
        amp: "&",
        quot: '"',
        "#39": "'",
        "#x27": "'",
        lt: "<",
        gt: ">",
      };

      return entities[name] ?? entity;
    },
  );
}

function getRouteFromHtmlPath(htmlPath: string): string {
  const relativePath = relative(distDirectory, htmlPath);

  if (relativePath === "index.html") {
    return "/";
  }

  return `/${relativePath.replace(/\/index\.html$/, "")}/`;
}

function getMetadata(html: string): {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly openGraphUrl: string;
  readonly openGraphTitle: string;
  readonly openGraphDescription: string;
  readonly twitterTitle: string;
  readonly twitterDescription: string;
} {
  return {
    title: getSingleMatch(html, /<title>([^<]*)<\/title>/g, "title"),
    description: getSingleMatch(
      html,
      /<meta name="description" content="([^"]*)"\s*\/?\s*>/g,
      "description",
    ),
    canonical: getSingleMatch(
      html,
      /<link rel="canonical" href="([^"]*)"\s*\/?\s*>/g,
      "canonical",
    ),
    openGraphUrl: getSingleMatch(
      html,
      /<meta property="og:url" content="([^"]*)"\s*\/?\s*>/g,
      "og:url",
    ),
    openGraphTitle: getSingleMatch(
      html,
      /<meta property="og:title" content="([^"]*)"\s*\/?\s*>/g,
      "og:title",
    ),
    openGraphDescription: getSingleMatch(
      html,
      /<meta property="og:description" content="([^"]*)"\s*\/?\s*>/g,
      "og:description",
    ),
    twitterTitle: getSingleMatch(
      html,
      /<meta name="twitter:title" content="([^"]*)"\s*\/?\s*>/g,
      "twitter:title",
    ),
    twitterDescription: getSingleMatch(
      html,
      /<meta name="twitter:description" content="([^"]*)"\s*\/?\s*>/g,
      "twitter:description",
    ),
  };
}

test("every current indexable document has complete, self-referencing metadata", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before metadata tests");

  const htmlFiles = getHtmlFiles(distDirectory);
  const indexableFiles = htmlFiles.filter(
    (htmlPath) => !readFileSync(htmlPath, "utf8").includes('name="robots"'),
  );
  const indexableRoutes = indexableFiles.map(getRouteFromHtmlPath).sort();

  assert.deepEqual(indexableRoutes, [
    "/",
    "/blog/",
    "/blog/tags/ai/",
    "/blog/tags/politics/",
    "/blog/tags/technology/",
    "/blog/the-devil-you-know/",
    "/code/",
    "/paintings/",
    "/photography/",
  ]);

  const metadata = indexableFiles.map((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const pageMetadata = getMetadata(html);
    const route = getRouteFromHtmlPath(htmlPath);

    assert.equal(pageMetadata.canonical, `${configuredOrigin}${route}`);
    assert.equal(pageMetadata.openGraphUrl, pageMetadata.canonical);
    assert.equal(pageMetadata.openGraphTitle, pageMetadata.title);
    assert.equal(pageMetadata.openGraphDescription, pageMetadata.description);
    assert.equal(pageMetadata.twitterTitle, pageMetadata.title);
    assert.equal(pageMetadata.twitterDescription, pageMetadata.description);
    assert.ok(pageMetadata.description.length > 0);
    assert.ok(!pageMetadata.canonical.includes("marcybelardo.github.io"));

    return pageMetadata;
  });

  assert.equal(new Set(metadata.map((page) => page.title)).size, metadata.length);
  assert.equal(new Set(metadata.map((page) => page.description)).size, metadata.length);
});

test("the current 404 is noindex and omits optional JSON-LD on ordinary pages", () => {
  const notFoundPath = resolve(distDirectory, "404.html");
  const notFoundHtml = readFileSync(notFoundPath, "utf8");
  const indexHtml = readFileSync(resolve(distDirectory, "index.html"), "utf8");

  assert.equal(
    getSingleMatch(
      notFoundHtml,
      /<meta name="robots" content="([^"]*)"\s*\/?\s*>/g,
      "404 robots",
    ),
    "noindex, nofollow",
  );
  assert.doesNotMatch(indexHtml, /<meta name="robots"/);
  assert.doesNotMatch(indexHtml, /application\/ld\+json/);
});

test("the tracked blog post keeps its stable published route", () => {
  const blogPath = resolve(distDirectory, "blog", "the-devil-you-know", "index.html");

  assert.ok(existsSync(blogPath));
  assert.equal(getRouteFromHtmlPath(blogPath), "/blog/the-devil-you-know/");
});
