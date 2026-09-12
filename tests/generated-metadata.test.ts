import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  decodeHtmlEntities,
  getCssFiles,
  getGraphEntries,
  getHtmlFiles,
  getInkHoverVisibleText,
  getPrimaryDestinationHrefs,
  getPrimaryNavigation,
  getRouteFromHtmlPath,
  getSingleMatch,
  getStructuredData,
  isNoindexDocument,
} from "./generated-artifact-helpers.ts";
import {
  getGeneratedProjectRoutes,
  getGeneratedProjectSlugs,
} from "./generated-project-artifacts.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const projectSlugs = getGeneratedProjectSlugs(distDirectory);
const blogDetailPath = resolve(
  distDirectory,
  "blog",
  "the-devil-you-know",
  "index.html",
);
const primaryDestinations = ["/projects/", "/blog/", "/about/"];
const requiredHtmlArtifacts = [
  "404.html",
  "about/index.html",
  "bio/index.html",
  "blog/index.html",
  "blog/tags/ai/index.html",
  "blog/tags/politics/index.html",
  "blog/tags/technology/index.html",
  "blog/the-devil-you-know/index.html",
  "contact/index.html",
  "index.html",
  "projects/index.html",
  ...projectSlugs.map((slug) => `projects/${slug}/index.html`),
];
const requiredNonHtmlArtifacts = ["rss.xml", "sitemap-0.xml", "sitemap-index.xml"];

function getDuplicateIds(html: string): Array<string> {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const counts = new Map<string, number>();

  ids.forEach((id) => {
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  });

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
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

test("BaseLayout validates explicit canonical URLs against the configured origin", () => {
  const baseLayoutSource = readFileSync(
    resolve(repositoryRoot, "src/layouts/BaseLayout.astro"),
    "utf8",
  );

  assert.match(baseLayoutSource, /validateCanonicalUrl\(canonicalUrl,\s*SITE_ORIGIN\)/);
  assert.doesNotMatch(baseLayoutSource, /canonicalUrl\s*\?\?\s*createCanonicalUrl/);
});

test("production output includes every current route and discovery artifact", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before route assertions");

  requiredHtmlArtifacts.forEach((relativePath) => {
    assert.ok(
      existsSync(resolve(distDirectory, relativePath)),
      `${relativePath} must be generated`,
    );
  });
  requiredNonHtmlArtifacts.forEach((relativePath) => {
    assert.ok(
      existsSync(resolve(distDirectory, relativePath)),
      `${relativePath} must be generated`,
    );
  });

  assert.match(
    readFileSync(resolve(distDirectory, "rss.xml"), "utf8"),
    /<rss\b[\s\S]*the-devil-you-know/,
  );
  assert.match(
    readFileSync(resolve(distDirectory, "sitemap-index.xml"), "utf8"),
    /sitemap-0\.xml/,
  );
  assert.match(
    readFileSync(resolve(distDirectory, "sitemap-0.xml"), "utf8"),
    new RegExp(`${configuredOrigin.replaceAll(".", "\\.")}\\/projects\\/`),
  );
});

test("every current indexable document has complete, self-referencing metadata", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before metadata tests");

  const htmlFiles = getHtmlFiles(distDirectory);
  const indexableFiles = htmlFiles.filter(
    (htmlPath) => !isNoindexDocument(readFileSync(htmlPath, "utf8")),
  );
  const indexableRoutes = indexableFiles
    .map((htmlPath) => getRouteFromHtmlPath(htmlPath, distDirectory))
    .sort();

  assert.deepEqual(indexableRoutes, [
    "/",
    "/about/",
    "/blog/",
    "/blog/tags/ai/",
    "/blog/tags/politics/",
    "/blog/tags/technology/",
    "/blog/the-devil-you-know/",
    "/projects/",
    ...getGeneratedProjectRoutes(distDirectory),
  ]);

  const metadata = indexableFiles.map((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const pageMetadata = getMetadata(html);
    const route = getRouteFromHtmlPath(htmlPath, distDirectory);

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

test("the current 404 is noindex and the homepage emits required JSON-LD", () => {
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
  assert.match(indexHtml, /application\/ld\+json/);
});

test("blog detail JSON-LD matches its visible article metadata and tags", () => {
  assert.ok(existsSync(blogDetailPath), "blog detail output must exist");

  const html = readFileSync(blogDetailPath, "utf8");
  const jsonLd = getStructuredData(html, "blog detail");
  const canonical = `${configuredOrigin}/blog/the-devil-you-know/`;
  const headline = getInkHoverVisibleText(
    getSingleMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/g, "blog headline"),
    "blog headline",
  ).trim();
  const description = getSingleMatch(
    html,
    /<meta name="description" content="([^"]*)"\s*\/?\s*>/g,
    "blog description",
  );
  const datePublished = getSingleMatch(
    html,
    /<time[^>]*datetime="([^"]+)"[^>]*>/g,
    "blog publication date",
  );
  const visibleTags = [...html.matchAll(
    /<a href="\/blog\/tags\/[^/]+\/"[^>]*>([^<]+)<\/a>/g,
  )].map((match) => decodeHtmlEntities(match[1] ?? "").trim());

  assert.equal(jsonLd["@context"], "https://schema.org");
  assert.equal(jsonLd["@type"], "BlogPosting");
  assert.equal(jsonLd["@id"], canonical);
  assert.equal(jsonLd.url, canonical);
  assert.equal(jsonLd.headline, headline);
  assert.equal(jsonLd.description, description);
  assert.equal(jsonLd.datePublished, datePublished);
  assert.deepEqual(jsonLd.keywords, visibleTags);
  assert.deepEqual(visibleTags, ["AI", "Technology", "Politics"]);
});

test("generated output uses the editorial visual system without parallax or cards", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before visual assertions");

  const css = getCssFiles(distDirectory)
    .map((cssPath) => readFileSync(cssPath, "utf8"))
    .join("\n");
  const html = getHtmlFiles(distDirectory)
    .map((htmlPath) => readFileSync(htmlPath, "utf8"))
    .join("\n");

  assert.match(css, /--color-paper:\s*#f6f4ee/);
  assert.match(css, /--color-ink:\s*#171717/);
  assert.match(css, /--color-muted-ink:\s*#68655f/);
  assert.match(css, /--color-rule:\s*#c9c4b8/);
  assert.match(
    css,
    /\.site-header\{[^}]*border-bottom:\s*1px solid var\(--color-rule\)/,
  );
  assert.match(
    css,
    /\.editorial-list>li\{[^}]*border-top:\s*1px solid var\(--color-rule\)/,
  );
  assert.match(
    css,
    /\.editorial-list>li:last-child\{[^}]*border-bottom:\s*1px solid var\(--color-rule\)/,
  );
  assert.match(css, /--color-prussian-blue:\s*#003153/);
  assert.match(css, /--font-reading:\s*Georgia/);
  assert.match(css, /--font-utility:\s*"Helvetica Neue"/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*print/);
  assert.match(css, /a:focus-visible/);
  assert.match(css, /button:focus-visible/);
  assert.doesNotMatch(html, /data-parallax-speed/);
  assert.doesNotMatch(html, /ProjectCard|grid-cols-|border-neutral-900/);
});

test("generated documents expose the accessible primary navigation contract", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before navigation assertions");

  const htmlFiles = getHtmlFiles(distDirectory);
  const htmlDocuments = htmlFiles.map((htmlPath) => readFileSync(htmlPath, "utf8"));
  const allHtml = htmlDocuments.join("\n");
  htmlDocuments.forEach((html, index) => {
    if (html.includes('http-equiv="refresh"')) {
      assert.match(html, /<meta name="robots" content="noindex, follow"/);
      assert.match(html, /<link rel="canonical" href="https:\/\/www\.marcelinebelardo\.com\/about\/"/);
      return;
    }

    const navigation = getPrimaryNavigation(html);
    assert.deepEqual(getPrimaryDestinationHrefs(navigation), primaryDestinations);

    primaryDestinations.forEach((destination) => {
      assert.match(
        navigation,
        new RegExp(`href="${destination.replaceAll("/", "\\/")}"`),
      );
    });
    assert.doesNotMatch(navigation, />\s*(Code|Paintings|Photography)\s*</);
    assert.match(navigation, /<button\b[^>]*aria-controls="primary-navigation"/);
    assert.match(navigation, /aria-expanded="true"/);
    assert.match(navigation, /aria-label="Close primary navigation"/);
    assert.match(navigation, /data-menu-button/);
    assert.match(navigation, /data-compact="always"/);
    assert.match(navigation, /data-ink-hover="surface"/);
    assert.match(navigation, /<a href="\/" class="site-brand no-underline"/);
    assert.match(navigation, /id="primary-navigation"[^>]*data-open="true"/);
    if (getRouteFromHtmlPath(htmlFiles[index] ?? "", distDirectory) === "/") {
      assert.match(navigation, /data-home="true"/);
    } else {
      assert.doesNotMatch(navigation, /data-home=/);
    }
  });

  const routeExpectations = [
    ["/", "/"],
    ["/projects/", "/projects/"],
    ["/blog/", "/blog/"],
    ["/about/", "/about/"],
  ] as const;

  routeExpectations.forEach(([route, activeHref]) => {
    const htmlPath = route === "/"
      ? resolve(distDirectory, "index.html")
      : resolve(distDirectory, route.slice(1), "index.html");
    const navigation = getPrimaryNavigation(readFileSync(htmlPath, "utf8"));

    assert.match(
      navigation,
      new RegExp(`href="${activeHref.replaceAll("/", "\\/")}"[^>]*aria-current="page"`),
      `${route} must mark its exact primary destination as current`,
    );
  });

  assert.match(allHtml, /href="https:\/\/instagram\.com\/marcelinebelardo"[^>]*aria-label="Instagram"/);
  assert.match(allHtml, /href="https:\/\/github\.com\/marcybelardo"[^>]*aria-label="GitHub"/);
  assert.doesNotMatch(getPrimaryNavigation(htmlDocuments[0] ?? ""), /aria-label="(Bluesky|Instagram|GitHub)"/);
});

test("homepage and project JSON-LD contain only visible fields", () => {
  const homepageHtml = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const homepageData = getStructuredData(homepageHtml, "homepage");
  const homepageEntries = getGraphEntries(homepageData, "homepage");
  const canonical = `${configuredOrigin}/`;
  const website = homepageEntries.find((entry) => entry["@type"] === "WebSite");
  const person = homepageEntries.find((entry) => entry["@type"] === "Person");

  assert.deepEqual(website, {
    "@id": canonical,
    "@type": "WebSite",
    name: "Marceline Belardo",
    url: canonical,
  });
  assert.deepEqual(person, {
    "@id": `${canonical}#person`,
    "@type": "Person",
    name: "Marceline Belardo",
    sameAs: [
      "https://github.com/marcybelardo",
      "https://bsky.app/profile/marcelinebelardo.com",
      "https://instagram.com/marcelinebelardo",
    ],
    url: canonical,
  });

  projectSlugs.forEach((slug) => {
    const projectPath = resolve(distDirectory, "projects", slug, "index.html");
    const projectHtml = readFileSync(projectPath, "utf8");
    const projectData = getStructuredData(projectHtml, `${slug} project`);

    assert.deepEqual(Object.keys(projectData).sort(), [
      "@context",
      "@id",
      "@type",
      "datePublished",
      "description",
      "keywords",
      "name",
      "url",
    ]);
    assert.equal(projectData["@type"], "CreativeWork");
    assert.equal(projectData["@id"], `${configuredOrigin}/projects/${slug}/`);
    assert.equal(projectData.url, projectData["@id"]);
    assert.equal(
      projectData.name,
      getInkHoverVisibleText(
        getSingleMatch(projectHtml, /<h1\b[^>]*>([\s\S]*?)<\/h1>/g, `${slug} project heading`),
        `${slug} project heading`,
      ).trim(),
    );
    assert.equal(
      projectData.description,
      getSingleMatch(
        projectHtml,
        /<meta name="description" content="([^"]*)"\s*\/?\s*>/g,
        `${slug} project description`,
      ),
    );
  });
});

test("server-rendered mobile navigation remains usable without JavaScript", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before no-JS assertions");

  const homepageHtml = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const navigation = getPrimaryNavigation(homepageHtml);
  const css = getCssFiles(distDirectory)
    .map((cssPath) => readFileSync(cssPath, "utf8"))
    .join("\n");
  const panelMatch = navigation.match(
    /<div class="primary-navigation__panel"[^>]*>[\s\S]*?<\/div>/,
  );

  assert.ok(panelMatch, "server-rendered navigation must include its panel");
  assert.match(panelMatch[0], /data-open="true"/);
  assert.doesNotMatch(panelMatch[0], /aria-hidden|\binert\b/);
  assert.match(
    css,
    /\.primary-navigation\[data-js-ready\] \.primary-navigation__panel\[data-open(?:="false"|=false)\]/,
    "only the enhanced navigation may hide its closed panel",
  );
  assert.match(
    css,
    /\.primary-navigation\[data-js-ready\] \.primary-navigation__menu-button/,
    "the menu control must be progressively enhanced",
  );
});

test("representative documents preserve one accessible shared shell", () => {
  assert.ok(existsSync(distDirectory), "production output must exist before shell assertions");

  const representativePages: ReadonlyArray<Readonly<{ label: string; path: string }>> = [
    { label: "homepage", path: resolve(distDirectory, "index.html") },
    { label: "blog index", path: resolve(distDirectory, "blog", "index.html") },
    {
      label: "blog detail",
      path: resolve(distDirectory, "blog", "the-devil-you-know", "index.html"),
    },
    { label: "tag archive", path: resolve(distDirectory, "blog", "tags", "ai", "index.html") },
    ...projectSlugs.map((slug) => ({
      label: `${slug} project detail`,
      path: resolve(distDirectory, "projects", slug, "index.html"),
    })),
    { label: "404", path: resolve(distDirectory, "404.html") },
  ];

  const css = getCssFiles(distDirectory)
    .map((cssPath) => readFileSync(cssPath, "utf8"))
    .join("\n");

  // Generated output proves static markup contracts only. Manually check 360px,
  // 768px, and 1280px narrow/wide layout, keyboard-only navigation, print,
  // JavaScript-disabled navigation, and portrait/landscape composition.
  assert.match(css, /a:focus-visible/);
  assert.match(css, /button:focus-visible/);

  representativePages.forEach(({ label, path }) => {
    assert.ok(existsSync(path), `${label} output must exist`);
    const html = readFileSync(path, "utf8");
    const navigationMatches = [
      ...html.matchAll(/<nav\b[^>]*aria-label="Primary"[^>]*>[\s\S]*?<\/nav>/gi),
    ];

    assert.equal(navigationMatches.length, 1, `${label} must contain one primary navigation`);
    assert.deepEqual(getDuplicateIds(html), [], `${label} must not duplicate IDs`);
    assert.match(
      html,
      /href="https:\/\/instagram\.com\/marcelinebelardo"[^>]*aria-label="Instagram"/,
      `${label} must identify Instagram correctly`,
    );
    assert.match(
      html,
      /href="https:\/\/github\.com\/marcybelardo"[^>]*aria-label="GitHub"/,
      `${label} must identify GitHub correctly`,
    );
    assert.doesNotMatch(
      html,
      /href="https:\/\/instagram\.com\/marcelinebelardo"[^>]*aria-label="GitHub"/,
    );
    assert.doesNotMatch(
      html,
      /href="https:\/\/github\.com\/marcybelardo"[^>]*aria-label="Instagram"/,
    );
    assert.doesNotMatch(html, /data-parallax-speed/);
  });
});

test("the tracked blog post keeps its stable published route", () => {
  const blogPath = resolve(distDirectory, "blog", "the-devil-you-know", "index.html");

  assert.ok(existsSync(blogPath));
  assert.equal(
    getRouteFromHtmlPath(blogPath, distDirectory),
    "/blog/the-devil-you-know/",
  );
});
