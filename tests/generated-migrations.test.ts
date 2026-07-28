// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const projectsCanonical = `${configuredOrigin}/projects/`;
const migrationRoutes = ["code", "paintings", "photography"];

function readMigration(route: string): string {
  const outputPath = resolve(distDirectory, route, "index.html");

  assert.ok(existsSync(outputPath), `${route} migration output must exist`);
  return readFileSync(outputPath, "utf8");
}

test("obsolete sections render static noindex migration documents", () => {
  migrationRoutes.forEach((route) => {
    const html = readMigration(route);

    assert.match(html, /<meta name="robots" content="noindex,follow"/);
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${projectsCanonical}"`),
    );
    assert.match(
      html,
      /<meta http-equiv="refresh" content="0; url=\/projects\/"\s*\/?\s*>/,
    );
    assert.match(html, /<a href="\/projects\/"[^>]*>\s*Continue to Projects\s*<\/a>/);
    assert.match(html, /<nav[^>]*aria-label="Primary"/);
    assert.doesNotMatch(
      html,
      /Tools and languages|Selected software|lilyhttpd|Coming soon|parallax|ProjectCard/i,
    );
  });
});

test("obsolete migration documents are excluded from sitemap discovery", () => {
  const sitemap = readFileSync(resolve(distDirectory, "sitemap-0.xml"), "utf8");

  migrationRoutes.forEach((route) => {
    assert.doesNotMatch(sitemap, new RegExp(`${configuredOrigin}/${route}/`));
  });
});
