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

function getCssFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return getCssFiles(entryPath);
    }

    return entry.name.endsWith(".css") ? [entryPath] : [];
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

function isNoindexDocument(html: string): boolean {
  const robotsMatch = html.match(
    /<meta\s+name="robots"\s+content="([^"]*)"\s*\/?\s*>/i,
  );

  return robotsMatch?.[1]?.toLowerCase().includes("noindex") ?? false;
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

test("robots index directives remain part of the indexable metadata contract", () => {
  assert.equal(
    isNoindexDocument('<meta name="robots" content="index, follow" />'),
    false,
  );
  assert.equal(
    isNoindexDocument('<meta name="robots" content="noindex, nofollow" />'),
    true,
  );
});

test("every current indexable document has complete, self-referencing metadata", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before metadata tests");

  const htmlFiles = getHtmlFiles(distDirectory);
  const indexableFiles = htmlFiles.filter(
    (htmlPath) => !isNoindexDocument(readFileSync(htmlPath, "utf8")),
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

test("generated output uses the editorial visual system without parallax or cards", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before visual assertions");

  const css = getCssFiles(distDirectory)
    .map((cssPath) => readFileSync(cssPath, "utf8"))
    .join("\n");
  const html = getHtmlFiles(distDirectory)
    .map((htmlPath) => readFileSync(htmlPath, "utf8"))
    .join("\n");
  const codeHtml = readFileSync(resolve(distDirectory, "code", "index.html"), "utf8");

  assert.match(css, /--color-paper:\s*#f6f4ee/);
  assert.match(css, /--color-ink:\s*#171717/);
  assert.match(css, /--color-muted-ink:\s*#68655f/);
  assert.match(css, /--color-rule:\s*#c9c4b8/);
  assert.match(css, /--color-prussian-blue:\s*#003153/);
  assert.match(css, /--font-reading:Georgia/);
  assert.match(css, /--font-utility:"Helvetica Neue"/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*print/);
  assert.match(css, /a:focus-visible/);
  assert.match(css, /button:focus-visible/);
  assert.doesNotMatch(html, /data-parallax-speed/);
  assert.doesNotMatch(codeHtml, /ProjectCard|grid-cols-|border-neutral-900/);
});

test("the tracked blog post keeps its stable published route", () => {
  const blogPath = resolve(distDirectory, "blog", "the-devil-you-know", "index.html");

  assert.ok(existsSync(blogPath));
  assert.equal(getRouteFromHtmlPath(blogPath), "/blog/the-devil-you-know/");
});
