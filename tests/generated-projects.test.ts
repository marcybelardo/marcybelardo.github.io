import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsIndexPath = resolve(repositoryRoot, "dist/projects/index.html");

test("the project index renders one ordered editorial list of stable project links", () => {
  assert.ok(existsSync(projectsIndexPath), "project index output must exist");

  const html = readFileSync(projectsIndexPath, "utf8");
  const projectIds = [...html.matchAll(/href="\/projects\/([^/]+)\/"/g)].map(
    (match) => match[1],
  );

  assert.deepEqual(projectIds, [
    "osborne",
    "portfolio-site",
    "cmprsr-rs",
    "lilyhttpd",
  ]);
  assert.equal(
    (html.match(/class="project-index-entry"/g) ?? []).length,
    4,
  );
  assert.match(html, /<ul class="editorial-list" aria-label="Projects">/);
  assert.doesNotMatch(html, /ProjectCard|project-card|border-neutral-900/);
});

test("the project index emits the published project metadata", () => {
  assert.ok(existsSync(projectsIndexPath), "project index output must exist");

  const html = readFileSync(projectsIndexPath, "utf8");

  [
    "Budget management app for personal and group spending, built with Java Spring Boot and React",
    "This very website — a static personal portfolio built with Astro, React, and TailwindCSS.",
    "Canonical Huffman compression tool written in Rust",
    "An HTTP server for static files written in C",
  ].forEach((description) => assert.match(html, new RegExp(description)));
  assert.match(html, />2026</);
  assert.match(html, />2025</);
  assert.doesNotMatch(html, /No image|Coming soon|undefined|null/);
});
