// pattern: Imperative Shell

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const configuredOrigin = "https://www.marcelinebelardo.com";
const retiredRoutes = ["code", "paintings", "photography"];

test("retired section routes are not generated", () => {
  retiredRoutes.forEach((route) => {
    assert.equal(
      existsSync(resolve(distDirectory, route, "index.html")),
      false,
      `${route} output must remain absent`,
    );
  });
});

test("retired section routes are excluded from sitemap discovery", () => {
  const sitemap = readFileSync(resolve(distDirectory, "sitemap-0.xml"), "utf8");

  retiredRoutes.forEach((route) => {
    assert.doesNotMatch(sitemap, new RegExp(`${configuredOrigin}/${route}/`));
  });
});
