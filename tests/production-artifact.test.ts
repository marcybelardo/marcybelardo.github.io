// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertGeneratedImageContract,
  decodeHtmlEntities,
  getGraphEntries,
  getHtmlFiles,
  getInkHoverVisibleText,
  getImages,
  getImagesInsideSquareWrappers,
  getPrimaryDestinationHrefs,
  getPrimaryNavigation,
  getRouteFromHtmlPath,
  getSingleMatch,
  getStructuredData,
  isNoindexDocument,
} from "./generated-artifact-helpers.ts";
import { getGeneratedProjectSlugs } from "./generated-project-artifacts.ts";
import {
  createStandardSiteDocumentUri,
  getStandardSitePublicationUri,
} from "../src/site-config.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const bioPath = resolve(distDirectory, "bio", "index.html");
const configuredOrigin = "https://www.marcelinebelardo.com";
const googleTagManagerContainerId = "GTM-N4JNKN2H";
const primaryDestinations = ["/projects/", "/blog/", "/bio/", "/contact/"];
const retiredRoutes = ["code", "paintings", "photography"];
const publishedProjectSlugs = getGeneratedProjectSlugs(distDirectory);
const publishedBlogTags = ["ai", "politics", "technology"];
const draftMarkers = /draft-route-fixture|draft-only-review|draft-project-fixture/i;
const footnoteFixtureMarker = "A source with";

function readArtifact(relativePath: string): string {
  const artifactPath = resolve(distDirectory, relativePath);

  assert.ok(existsSync(artifactPath), `${relativePath} must be generated`);
  return readFileSync(artifactPath, "utf8");
}

function getBioPortraitFrames(html: string): Array<string> {
  return [...html.matchAll(/<figure class="bio-portrait-frame">([\s\S]*?)<\/figure>/g)].map(
    (match) => match[0] ?? "",
  );
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

test("production artifact uses the MB monogram SVG favicon", () => {
  const favicon = readArtifact("favicon.svg");
  const homepage = readArtifact("index.html");

  assert.match(favicon, /viewBox="0 0 128 128"/);
  assert.match(favicon, /<title\b[^>]*>\s*MB\s*<\/title>/i);
  assert.match(favicon, /#003153/i);
  assert.match(favicon, /#f6f4ee/i);
  assert.doesNotMatch(favicon, /<text\b/i);
  assert.match(
    homepage,
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"\s*\/?>/,
  );
  assert.doesNotMatch(homepage, /href="\/favicon\.ico"/);
  assert.equal(existsSync(resolve(distDirectory, "favicon.ico")), false);
});

test("production artifact includes Google Tag Manager in every document shell", () => {
  getHtmlFiles(distDirectory).forEach((htmlPath) => {
    const relativePath = relative(distDirectory, htmlPath);
    const html = readFileSync(htmlPath, "utf8");
    const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

    assert.ok(headMatch?.[1], `${relativePath} must contain a head`);
    assert.ok(bodyMatch?.[1], `${relativePath} must contain a body`);

    const headGtmScripts = [
      ...headMatch[1].matchAll(
        new RegExp(
          `<script\\b[^>]*>[\\s\\S]*?googletagmanager\\.com/gtm\\.js\\?id=[\\s\\S]*?${googleTagManagerContainerId}[\\s\\S]*?<\\/script>`,
          "gi",
        ),
      ),
    ];
    const bodyGtmNoscripts = [
      ...bodyMatch[1].matchAll(
        new RegExp(
          `<noscript>\\s*<iframe\\b[^>]*src="https://www\\.googletagmanager\\.com/ns\\.html\\?id=${googleTagManagerContainerId}"`,
          "gi",
        ),
      ),
    ];

    assert.equal(
      headGtmScripts.length,
      1,
      `${relativePath} must contain exactly one GTM head script for ${googleTagManagerContainerId}`,
    );
    assert.equal(
      bodyGtmNoscripts.length,
      1,
      `${relativePath} must contain exactly one GTM noscript iframe for ${googleTagManagerContainerId}`,
    );
  });
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
    const route = getRouteFromHtmlPath(htmlPath, distDirectory);
    const title = getSingleMatch(html, /<title>([^<]+)<\/title>/g, `${route} title`);
    const description = getSingleMatch(
      html,
      /<meta name="description" content="([^"]+)"\s*\/?\s*>/g,
      `${route} description`,
    );
    const canonical = getSingleMatch(
      html,
      /<link rel="canonical" href="([^"]+)"\s*\/?\s*>/g,
      `${route} canonical`,
    );

    assert.equal(canonical, `${configuredOrigin}${route}`);
    assert.doesNotMatch(html, /<meta name="robots"[^>]*noindex/i);
    assert.equal(
      getSingleMatch(html, /<meta property="og:type" content="([^"]+)"/g, `${route} og:type`).length > 0,
      true,
    );
    assert.equal(
      getSingleMatch(html, /<meta property="og:title" content="([^"]+)"/g, `${route} og:title`),
      title,
    );
    assert.equal(
      getSingleMatch(
        html,
        /<meta property="og:description" content="([^"]+)"/g,
        `${route} og:description`,
      ),
      description,
    );
    assert.equal(
      getSingleMatch(html, /<meta property="og:url" content="([^"]+)"/g, `${route} og:url`),
      canonical,
    );
    assert.equal(
      getSingleMatch(html, /<meta name="twitter:card" content="([^"]+)"/g, `${route} twitter:card`).length > 0,
      true,
    );
    assert.equal(
      getSingleMatch(html, /<meta name="twitter:title" content="([^"]+)"/g, `${route} twitter:title`),
      title,
    );
    assert.equal(
      getSingleMatch(
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
    getInkHoverVisibleText(
      blogHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "",
      "blog headline",
    ).trim(),
  );
  assert.equal(
    blogData.description,
    getSingleMatch(blogHtml, /<meta name="description" content="([^"]+)"/g, "blog description"),
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
      getSingleMatch(
        projectHtml,
        /<meta name="description" content="([^"]+)"/g,
        `${slug} project description`,
      ),
    );
  });

  getHtmlFiles(distDirectory).forEach((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const images = getImages(html);
    const isHomepage = htmlPath === resolve(distDirectory, "index.html");
    const isBio = htmlPath === bioPath;
    const heroImages = isHomepage ? images.filter((image) => image.includes('class="home-photograph__image"')) : [];
    assert.ok(heroImages.length <= 1, "only one homepage photograph may use cover framing");
    heroImages.forEach((image) => {
      assert.match(image, /alt="[^"\s][^"]+"/);
      assert.match(
        image,
        /sizes="\(max-width: 35rem\) 100vw, min\(72vw, 64rem\)"/,
        "homepage photo sizes must match its constrained frame",
      );
      assert.match(image, /fetchpriority="high"/);
      assert.ok(html.includes('<figure class="home-photograph">'));
    });

    images.forEach((image) => {
      assertGeneratedImageContract(
        image,
        `${getRouteFromHtmlPath(htmlPath, distDirectory)} image`,
        heroImages.includes(image) ? "cover" : "contain",
      );
    });

    if (isBio) {
      const portraitFrames = getBioPortraitFrames(html);
      assert.equal(portraitFrames.length, 3, "Bio must contain three portrait frames");
      portraitFrames.forEach((frame) => {
        assert.match(frame, /<img\b[^>]*data-astro-image-fit="contain"/);
        assert.match(frame, /<img\b[^>]*style="object-fit:\s*contain;"/);
      });
    }

    assert.equal(
      getImagesInsideSquareWrappers(html).length +
        (isBio ? getBioPortraitFrames(html).reduce((count, frame) => count + getImages(frame).length, 0) : 0),
      images.length - heroImages.length,
      `${getRouteFromHtmlPath(htmlPath, distDirectory)} images must remain inside a contained-image frame`,
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
  publishedProjectSlugs.forEach((slug) => {
    assert.match(
      sitemap,
      new RegExp(
        `<loc>${configuredOrigin.replaceAll(".", "\\.")}\\/projects\\/${slug}\\/</loc>`,
      ),
    );
  });
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

test("portfolio-redesign.AC5.6 retired section routes remain absent", () => {
  const sitemap = readArtifact("sitemap-0.xml");

  retiredRoutes.forEach((route) => {
    assert.equal(
      existsSync(resolve(distDirectory, route, "index.html")),
      false,
      `${route} output must remain absent`,
    );
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

test("production artifact excludes temporary footnote fixture content", () => {
  getHtmlFiles(distDirectory).forEach((htmlPath) => {
    assert.doesNotMatch(
      readFileSync(htmlPath, "utf8"),
      new RegExp(footnoteFixtureMarker),
      `${relative(distDirectory, htmlPath)} must not expose the temporary footnote fixture`,
    );
  });
});

test("production artifact exposes the configured Standard.site publication and document links", () => {
  const publicationPath = resolve(
    distDirectory,
    ".well-known",
    "site.standard.publication",
  );
  const publicationUri = getStandardSitePublicationUri();

  if (publicationUri === null) {
    assert.equal(
      existsSync(publicationPath),
      false,
      "unconfigured Standard.site publication output must be omitted",
    );

    getHtmlFiles(distDirectory).forEach((htmlPath) => {
      const relativePath = relative(distDirectory, htmlPath);
      assert.doesNotMatch(
        readFileSync(htmlPath, "utf8"),
        /rel=["']site\.standard\.document["']/i,
        `${relativePath} must not advertise an unconfigured Standard.site document`,
      );
    });
    return;
  }

  assert.ok(existsSync(publicationPath), "Standard.site publication endpoint must be generated");
  const publicationOutput = readFileSync(publicationPath, "utf8");
  assert.equal(publicationOutput, `${publicationUri}\n`);

  const detailPages = getHtmlFiles(distDirectory).filter((htmlPath) =>
    /\/blog\/[^/]+\/index\.html$/.test(htmlPath),
  );
  assert.ok(detailPages.length > 0, "configured Standard.site output needs published blog details");

  detailPages.forEach((htmlPath) => {
    const html = readFileSync(htmlPath, "utf8");
    const slug = htmlPath.match(/\/blog\/([^/]+)\/index\.html$/)?.[1];

    assert.ok(slug, `${relative(distDirectory, htmlPath)} must have a blog slug`);
    const expectedUri = createStandardSiteDocumentUri(slug);
    assert.ok(expectedUri, `${slug} must have a Standard.site document URI`);
    assert.equal(
      [...html.matchAll(/<link rel="site\.standard\.document" href="([^"]+)"\s*\/?>(?:<\/link>)?/g)].length,
      1,
      `${slug} must advertise exactly one Standard.site document`,
    );
    assert.match(
      html,
      new RegExp(
        `<link rel="site\\.standard\\.document" href="${expectedUri.replaceAll(".", "\\.")}"`,
      ),
    );
  });

  getHtmlFiles(distDirectory)
    .filter((htmlPath) => !detailPages.includes(htmlPath))
    .forEach((htmlPath) => {
      assert.doesNotMatch(
        readFileSync(htmlPath, "utf8"),
        /rel=["']site\.standard\.document["']/i,
        `${relative(distDirectory, htmlPath)} must not claim to be a Standard.site document`,
      );
    });
});
