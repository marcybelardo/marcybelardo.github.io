// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const primaryDestinations = ["/projects/", "/blog/", "/bio/", "/contact/"];
const migrationRoutes = ["code", "paintings", "photography"];
const publishedProjectSlugs = ["cmprsr-rs", "lilyhttpd", "osborne", "portfolio-site"];
const publishedBlogTags = ["ai", "politics", "technology"];
const draftMarkers = /draft-route-fixture|draft-only-review|draft-project-fixture/i;

type JsonLdEntry = Readonly<Record<string, unknown>>;

function getHtmlFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return getHtmlFiles(entryPath);
    }

    return entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

function readArtifact(relativePath: string): string {
  const artifactPath = resolve(distDirectory, relativePath);

  assert.ok(existsSync(artifactPath), `${relativePath} must be generated`);
  return readFileSync(artifactPath, "utf8");
}

function getRouteFromHtmlPath(htmlPath: string): string {
  const relativePath = relative(distDirectory, htmlPath);

  if (relativePath === "index.html") {
    return "/";
  }

  return `/${relativePath.replace(/\/index\.html$/, "")}/`;
}

function getMigrationPath(route: string): string {
  return `${route}/index.html`;
}

function isNoindexDocument(html: string): boolean {
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
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

function getSingleMatch(html: string, pattern: RegExp, label: string): string {
  const matches = [...html.matchAll(pattern)];

  assert.equal(matches.length, 1, `${label} must appear exactly once`);
  return decodeHtmlEntities(matches[0]?.[1] ?? "");
}

function getMetaValue(html: string, pattern: RegExp, label: string): string {
  return getSingleMatch(html, pattern, label);
}

function getStructuredData(html: string, label: string): JsonLdEntry {
  const serialized = getSingleMatch(
    html,
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    `${label} JSON-LD`,
  );

  return JSON.parse(serialized) as JsonLdEntry;
}

function getGraphEntries(structuredData: JsonLdEntry, label: string): Array<JsonLdEntry> {
  const graph = structuredData["@graph"];

  assert.ok(Array.isArray(graph), `${label} JSON-LD must expose a graph`);
  return graph.filter(
    (entry): entry is JsonLdEntry =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

function getPrimaryNavigation(html: string): string {
  return getSingleMatch(
    html,
    /<nav\b[^>]*aria-label="Primary"[^>]*>([\s\S]*?)<\/nav>/g,
    "primary navigation",
  );
}

function getPrimaryDestinationHrefs(navigation: string): Array<string> {
  const panelMatch = navigation.match(
    /<div class="primary-navigation__panel"[^>]*>([\s\S]*?)<\/div>/,
  );

  assert.ok(panelMatch?.[1], "primary navigation must contain its destination panel");
  return [...panelMatch[1].matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

function getImages(html: string): Array<string> {
  return [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0] ?? "");
}

function getSquareImageWrappers(html: string): Array<string> {
  return [
    ...html.matchAll(
      /<div class="square-image(?:\s[^>]*)?"[^>]*>[\s\S]*?<\/div>/g,
    ),
  ].map((match) => match[0] ?? "");
}

function assertFootnoteBaseline(html: string): void {
  const references = [...html.matchAll(
    /<a\b[^>]*href="#([^"]+)"[^>]*id="([^"]+)"[^>]*data-footnote-ref/g,
  )];
  const definitions = new Set(
    [...html.matchAll(/<li\b[^>]*id="([^"]+)"[^>]*>/g)].map(
      (match) => match[1] ?? "",
    ),
  );
  let backlinks = 0;

  assert.ok(references.length > 0, "production fixture must contain a footnote reference");
  assert.ok(definitions.size > 0, "production fixture must contain a footnote definition");

  references.forEach((reference) => {
    const definitionId = reference[1] ?? "";
    const referenceId = reference[2] ?? "";

    assert.ok(definitions.has(definitionId), `${referenceId} must target a footnote definition`);
    const backlinkPattern = new RegExp(
      `href="#${referenceId.replaceAll("-", "\\-")}"[^>]*data-footnote-backref`,
    );

    assert.match(html, backlinkPattern, `${definitionId} must retain a backlink to ${referenceId}`);
    backlinks += 1;
  });

  assert.ok(backlinks > 0, "production fixture must contain a footnote backlink");
}

test("portfolio-redesign.AC1.1 production artifact contains the complete static route inventory", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before artifact assertions");

  const requiredHtmlRoutes = [
    "/",
    "/projects/",
    "/blog/",
    "/bio/",
    "/contact/",
    "/blog/the-devil-you-know/",
    ...publishedBlogTags.map((tag) => `/blog/tags/${tag}/`),
    ...publishedProjectSlugs.map((slug) => `/projects/${slug}/`),
    ...migrationRoutes.map((route) => `/${route}/`),
  ];

  requiredHtmlRoutes.forEach((route) => {
    const relativePath = route === "/" ? "index.html" : `${route.slice(1)}index.html`;
    assert.ok(existsSync(resolve(distDirectory, relativePath)), `${route} must be generated`);
  });

  ["404.html", "robots.txt", "rss.xml", "sitemap-index.xml", "sitemap-0.xml"].forEach(
    (relativePath) => {
      assert.ok(existsSync(resolve(distDirectory, relativePath)), `${relativePath} must be generated`);
    },
  );
});

test("portfolio-redesign.AC1.3 primary navigation exposes only the integrated sections", () => {
  getHtmlFiles(distDirectory).forEach((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const navigation = getPrimaryNavigation(html);

    assert.deepEqual(getPrimaryDestinationHrefs(navigation), primaryDestinations);
    assert.doesNotMatch(navigation, />\s*(Code|Paintings|Photography)\s*</i);
  });
});

test("portfolio-redesign.AC1.4 production output contains no draft routes, tags, content, or relations", () => {
  const artifactPaths = [
    ...getHtmlFiles(distDirectory),
    resolve(distDirectory, "rss.xml"),
    resolve(distDirectory, "sitemap-index.xml"),
    resolve(distDirectory, "sitemap-0.xml"),
    resolve(distDirectory, "robots.txt"),
  ];

  artifactPaths.forEach((artifactPath) => {
    assert.doesNotMatch(
      readFileSync(artifactPath, "utf8"),
      draftMarkers,
      `${relative(distDirectory, artifactPath)} must not expose draft fixture output`,
    );
  });
});

test("portfolio-redesign.AC5.1 every indexable HTML document has distinct self-referencing metadata", () => {
  const indexableDocuments = getHtmlFiles(distDirectory)
    .map((htmlPath) => ({
      htmlPath,
      html: readFileSync(htmlPath, "utf8"),
    }))
    .filter(({ html }) => !isNoindexDocument(html));
  const metadata = indexableDocuments.map(({ htmlPath, html }) => {
    const route = getRouteFromHtmlPath(htmlPath);
    const title = getSingleMatch(html, /<title>([^<]+)<\/title>/g, `${route} title`);
    const description = getMetaValue(
      html,
      /<meta name="description" content="([^"]+)"\s*\/?\s*>/g,
      `${route} description`,
    );
    const canonical = getMetaValue(
      html,
      /<link rel="canonical" href="([^"]+)"\s*\/?\s*>/g,
      `${route} canonical`,
    );

    assert.equal(canonical, `${configuredOrigin}${route}`);
    assert.doesNotMatch(html, /<meta name="robots"[^>]*noindex/i);
    assert.equal(
      getMetaValue(html, /<meta property="og:type" content="([^"]+)"/g, `${route} og:type`).length > 0,
      true,
    );
    assert.equal(
      getMetaValue(html, /<meta property="og:title" content="([^"]+)"/g, `${route} og:title`),
      title,
    );
    assert.equal(
      getMetaValue(
        html,
        /<meta property="og:description" content="([^"]+)"/g,
        `${route} og:description`,
      ),
      description,
    );
    assert.equal(
      getMetaValue(html, /<meta property="og:url" content="([^"]+)"/g, `${route} og:url`),
      canonical,
    );
    assert.equal(
      getMetaValue(html, /<meta name="twitter:card" content="([^"]+)"/g, `${route} twitter:card`).length > 0,
      true,
    );
    assert.equal(
      getMetaValue(html, /<meta name="twitter:title" content="([^"]+)"/g, `${route} twitter:title`),
      title,
    );
    assert.equal(
      getMetaValue(
        html,
        /<meta name="twitter:description" content="([^"]+)"/g,
        `${route} twitter:description`,
      ),
      description,
    );

    return { title, description };
  });

  assert.equal(new Set(metadata.map((page) => page.title)).size, metadata.length);
  assert.equal(new Set(metadata.map((page) => page.description)).size, metadata.length);
});

test("portfolio-redesign.AC5.2 structured data and visible media contracts remain canonical", () => {
  const homepageHtml = readArtifact("index.html");
  const homepageData = getStructuredData(homepageHtml, "homepage");
  const homepageEntries = getGraphEntries(homepageData, "homepage");
  const website = homepageEntries.find((entry) => entry["@type"] === "WebSite");
  const person = homepageEntries.find((entry) => entry["@type"] === "Person");

  assert.equal(website?.url, `${configuredOrigin}/`);
  assert.equal(website?.name, getSingleMatch(homepageHtml, /<title>([^<]+)<\/title>/g, "homepage title"));
  assert.equal(person?.url, `${configuredOrigin}/`);
  assert.equal(person?.name, "Marceline Belardo");

  const blogHtml = readArtifact("blog/the-devil-you-know/index.html");
  const blogData = getStructuredData(blogHtml, "blog detail");
  const blogCanonical = `${configuredOrigin}/blog/the-devil-you-know/`;

  assert.equal(blogData["@type"], "BlogPosting");
  assert.equal(blogData["@id"], blogCanonical);
  assert.equal(blogData.url, blogCanonical);
  assert.equal(
    blogData.headline,
    getSingleMatch(blogHtml, /<h1[^>]*>([^<]+)<\/h1>/g, "blog headline").trim(),
  );
  assert.equal(
    blogData.description,
    getMetaValue(blogHtml, /<meta name="description" content="([^"]+)"/g, "blog description"),
  );
  assert.deepEqual(
    blogData.keywords,
    [...blogHtml.matchAll(/<a href="\/blog\/tags\/[^/]+\/"[^>]*>([^<]+)<\/a>/g)].map(
      (match) => decodeHtmlEntities(match[1] ?? "").trim(),
    ),
  );

  publishedProjectSlugs.forEach((slug) => {
    const projectHtml = readArtifact(`projects/${slug}/index.html`);
    const projectData = getStructuredData(projectHtml, `${slug} project`);

    assert.equal(projectData["@type"], "CreativeWork");
    assert.equal(projectData["@id"], `${configuredOrigin}/projects/${slug}/`);
    assert.equal(projectData.url, projectData["@id"]);
    assert.equal(
      projectData.name,
      getSingleMatch(projectHtml, /<h1[^>]*>([^<]+)<\/h1>/g, `${slug} project heading`).trim(),
    );
    assert.equal(
      projectData.description,
      getMetaValue(
        projectHtml,
        /<meta name="description" content="([^"]+)"/g,
        `${slug} project description`,
      ),
    );
  });

  getHtmlFiles(distDirectory).forEach((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const images = getImages(html);

    images.forEach((image) => {
      assert.match(image, /\bwidth="\d+"/);
      assert.match(image, /\bheight="\d+"/);
      assert.match(image, /\bsrcset="[^"]+"/);
      assert.match(image, /\bsizes="[^"]+"/);
      assert.match(image, /data-astro-image-fit="contain"/);
    });
    assert.equal(
      getSquareImageWrappers(html).flatMap((wrapper) => getImages(wrapper)).length,
      images.length,
      `${getRouteFromHtmlPath(htmlPath)} images must remain inside square frames`,
    );
  });
});

test("portfolio-redesign.AC5.3 RSS and sitemap expose only canonical published URLs", () => {
  const rss = readArtifact("rss.xml");
  const sitemapIndex = readArtifact("sitemap-index.xml");
  const sitemap = readArtifact("sitemap-0.xml");
  const discoveredUrls = [
    ...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g),
    ...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g),
    ...rss.matchAll(/<(?:link|guid)(?:\s[^>]*)?>([^<]+)<\/(?:link|guid)>/g),
  ].map((match) => match[1] ?? "");

  assert.match(rss, /the-devil-you-know/);
  assert.match(sitemap, /<loc>https:\/\/www\.marcelinebelardo\.com\/projects\/portfolio-site\/<\/loc>/);
  discoveredUrls.forEach((url) => {
    assert.equal(new URL(url).origin, configuredOrigin);
    assert.doesNotMatch(url, /marcybelardo\.github\.io/i);
    assert.doesNotMatch(url, draftMarkers);
  });
  assert.doesNotMatch(rss, draftMarkers);
  assert.doesNotMatch(sitemap, draftMarkers);
});

test("portfolio-redesign.AC5.4 robots publishes the canonical sitemap discovery URL", () => {
  assert.equal(
    readArtifact("robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: https://www.marcelinebelardo.com/sitemap-index.xml\n",
  );
});

test("portfolio-redesign.AC5.5 preserves the published blog detail URL in HTML and RSS", () => {
  const canonicalPostUrl = `${configuredOrigin}/blog/the-devil-you-know/`;
  const detailHtml = readArtifact("blog/the-devil-you-know/index.html");
  const rss = readArtifact("rss.xml");

  assert.match(detailHtml, new RegExp(`<link rel="canonical" href="${canonicalPostUrl.replaceAll(".", "\\.")}"`));
  assert.match(rss, new RegExp(`<link>${canonicalPostUrl.replaceAll(".", "\\.")}<\/link>`));
  assert.match(rss, new RegExp(`<guid isPermaLink="true">${canonicalPostUrl.replaceAll(".", "\\.")}<\/guid>`));
});

test("portfolio-redesign.AC5.6 migrations retain noindex refresh and visible fallback contracts", () => {
  const projectsCanonical = `${configuredOrigin}/projects/`;
  const sitemap = readArtifact("sitemap-0.xml");

  migrationRoutes.forEach((route) => {
    const html = readArtifact(getMigrationPath(route));

    assert.match(html, /<meta name="robots" content="noindex,follow"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${projectsCanonical}"`));
    assert.match(html, /<meta http-equiv="refresh" content="0; url=\/projects\/"/);
    assert.match(html, /<a href="\/projects\/"[^>]*>\s*Continue to Projects\s*<\/a>/);
    assert.doesNotMatch(sitemap, new RegExp(`${configuredOrigin}\/${route}\/`));
  });
});

test("portfolio-redesign.AC5.8 generated discovery and JSON-LD output contains no legacy GitHub hostname", () => {
  const canonicalOutput = getHtmlFiles(distDirectory)
    .map((htmlPath) => readFileSync(htmlPath, "utf8"))
    .join("\n")
    .match(/<link rel="canonical"[^>]*>/g)
    ?.join("\n") ?? "";
  const jsonLdOutput = getHtmlFiles(distDirectory)
    .map((htmlPath) => readFileSync(htmlPath, "utf8"))
    .flatMap((html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)])
    .map((match) => match[1] ?? "")
    .join("\n");
  const discoveryOutput = [
    readArtifact("rss.xml"),
    readArtifact("sitemap-index.xml"),
    readArtifact("sitemap-0.xml"),
  ].join("\n");

  assert.doesNotMatch(canonicalOutput, /marcybelardo\.github\.io/i);
  assert.doesNotMatch(discoveryOutput, /marcybelardo\.github\.io/i);
  assert.doesNotMatch(jsonLdOutput, /marcybelardo\.github\.io/i);
});

test("production artifact preserves baseline footnote links and backlinks when notes are present", () => {
  const blogHtml = readArtifact("blog/the-devil-you-know/index.html");

  assert.match(blogHtml, /data-margin-note-article/);
  assert.match(blogHtml, /data-margin-note-rail/);
  assertFootnoteBaseline(blogHtml);
});
