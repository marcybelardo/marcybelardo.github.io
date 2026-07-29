// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getGeneratedProjectRoutes } from "./generated-project-artifacts.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const retiredRoutes = ["/code/", "/paintings/", "/photography/"];
const requiredRoutes = [
  "/",
  "/bio/",
  "/blog/",
  "/blog/tags/ai/",
  "/blog/tags/politics/",
  "/blog/tags/technology/",
  "/blog/the-devil-you-know/",
  "/contact/",
  "/projects/",
  ...getGeneratedProjectRoutes(distDirectory),
];

function readDiscoveryArtifact(relativePath: string): string {
  const artifactPath = resolve(distDirectory, relativePath);

  assert.ok(existsSync(artifactPath), `${relativePath} must be generated`);
  return readFileSync(artifactPath, "utf8");
}

function getSitemapUrls(xml: string): Array<string> {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
}

test("production discovery output contains required routes and artifacts", () => {
  requiredRoutes.forEach((route) => {
    const routePath = route === "/"
      ? resolve(distDirectory, "index.html")
      : resolve(distDirectory, route.slice(1), "index.html");

    assert.ok(existsSync(routePath), `${route} must be generated`);
  });

  ["404.html", "robots.txt", "sitemap-index.xml", "sitemap-0.xml"].forEach(
    (relativePath) => {
      assert.ok(
        existsSync(resolve(distDirectory, relativePath)),
        `${relativePath} must be generated`,
      );
    },
  );
});

test("sitemap contains canonical published routes and excludes retired routes, 404, and drafts", () => {
  const sitemap = readDiscoveryArtifact("sitemap-0.xml");
  const sitemapUrls = getSitemapUrls(sitemap);
  const sitemapRoutes = sitemapUrls.map((url) => new URL(url).pathname).sort();

  assert.deepEqual(sitemapRoutes, requiredRoutes.slice().sort());
  sitemapUrls.forEach((url) => {
    assert.equal(new URL(url).origin, configuredOrigin);
    assert.doesNotMatch(url, /marcybelardo\.github\.io/i);
  });
  retiredRoutes.forEach((route) => {
    assert.doesNotMatch(sitemap, new RegExp(`${configuredOrigin}${route}`));
  });
  assert.doesNotMatch(sitemap, /(?:404|draft-route-fixture|draft-only-review)/i);
});

test("robots publishes canonical sitemap discovery", () => {
  const robots = readDiscoveryArtifact("robots.txt");

  assert.equal(
    robots,
    "User-agent: *\nAllow: /\nSitemap: https://www.marcelinebelardo.com/sitemap-index.xml\n",
  );
});

test("404 output is noindex and keeps navigation plus a visible homepage fallback", () => {
  const notFound = readDiscoveryArtifact("404.html");

  assert.match(notFound, /<title>Page not found \| Marceline Belardo<\/title>/);
  assert.match(
    notFound,
    /<meta name="description" content="The page you requested could not be found\."/,
  );
  assert.match(notFound, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(notFound, /<nav[^>]*aria-label="Primary"/);
  assert.match(notFound, /<a href="\/"[^>]*>[^<]*(?:home|Home)[^<]*<\/a>/);
});
