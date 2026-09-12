import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  decodeHtmlEntities,
  getInkHoverVisibleText,
  getStructuredData,
} from "./generated-artifact-helpers.ts";
import { getGeneratedProjectSlugs } from "./generated-project-artifacts.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const projectsIndexPath = resolve(repositoryRoot, "dist/projects/index.html");
const projectsStylesPath = resolve(repositoryRoot, "src/styles/projects-design.css");
const projectsSourceDirectory = resolve(repositoryRoot, "src/content/projects");
const configuredOrigin = "https://www.marcelinebelardo.com";

const projectIds = getGeneratedProjectSlugs(distDirectory);

function getProjectPagePath(projectId: string): string {
  return resolve(repositoryRoot, "dist", "projects", projectId, "index.html");
}

function readProjectPage(projectId: string): string {
  const pagePath = getProjectPagePath(projectId);
  assert.ok(existsSync(pagePath), `${projectId} detail output must exist`);
  return readFileSync(pagePath, "utf8");
}

function getProjectOutputFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return getProjectOutputFiles(entryPath);
    }

    return [entryPath];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeScripts(html: string): string {
  return html.replace(
    /<script\b([^>]*)>[\s\S]*?<\/script>/g,
    (script, attributes: string) =>
      attributes.includes('type="application/ld+json"') ? script : "",
  );
}

test("the project index renders a full-width typographic catalogue of stable project links", () => {
  assert.ok(existsSync(projectsIndexPath), "project index output must exist");

  const html = readFileSync(projectsIndexPath, "utf8");
  const linkedProjectIds = [...html.matchAll(/href="\/projects\/([^/]+)\/"/g)].map(
    (match) => match[1],
  );
  const entries = [
    ...html.matchAll(/<article class="project-index-entry(?:\s[^\"]*)?"[^>]*>[\s\S]*?<\/article>/g),
  ];

  assert.ok(projectIds.length > 0);
  assert.deepEqual(linkedProjectIds.slice().sort(), projectIds);
  assert.equal(new Set(linkedProjectIds).size, linkedProjectIds.length);
  assert.equal(entries.length, linkedProjectIds.length);
  assert.match(html, /<ol class="projects-index__list" aria-label="Projects">/);
  const pageTitleMarkup = html.match(/<h1 data-ink-hover="text">([\s\S]*?)<\/h1>/)?.[1] ?? "";
  assert.equal(getInkHoverVisibleText(pageTitleMarkup, "projects page title"), "Projects");
  assert.doesNotMatch(html, /<p class="eyebrow">/);
  assert.doesNotMatch(html, /ProjectCard|project-card|border-neutral-900/);

  entries.forEach((match, index) => {
    const entry = match[0] ?? "";
    const heading = entry.match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";

    assert.ok(getInkHoverVisibleText(heading, `project index heading ${index + 1}`));
    assert.match(entry, /class="project-index-entry__ordinal"[\s\S]*?<time\b[^>]*>(?:19|20)\d{2}<\/time>/);
    assert.match(entry, /class="project-index-entry__main"[\s\S]*?<p class="project-index-entry__description">[^<]+<\/p>/);
    assert.match(entry, /<aside class="project-index-entry__metadata"[\s\S]*?<dt>Disciplines<\/dt>/);
  });
});

test("the project index emits the published project metadata", () => {
  assert.ok(existsSync(projectsIndexPath), "project index output must exist");

  const html = readFileSync(projectsIndexPath, "utf8");
  const entries = [
    ...html.matchAll(
      /<article class="project-index-entry(?:\s[^\"]*)?"[^>]*>[\s\S]*?<\/article>/g,
    ),
  ].map((match) => match[0] ?? "");

  projectIds.forEach((projectId) => {
    const entry = entries.find((candidate) =>
      candidate.includes(`href="/projects/${projectId}/"`)
    ) ?? "";

    assert.ok(entry, `${projectId} must have one project index entry`);
    assert.match(
      entry,
      /<time\b[^>]*datetime="[^"]+"[^>]*>(?:19|20)\d{2}<\/time>/,
    );
    assert.match(entry, /class="project-index-entry__description">[^<]+<\/p>/);
    assert.match(entry, /<dt>Disciplines<\/dt>[\s\S]*?<dd>[^<]+<\/dd>/);
    assert.match(entry, /<dt>Tags<\/dt>[\s\S]*?<dd>[^<]+<\/dd>/);
  });

  assert.doesNotMatch(removeScripts(html), /No image|Coming soon|undefined|null/);
});

test("each project detail emits its published metadata and canonical JSON-LD", () => {
  projectIds.forEach((projectId) => {
    const html = removeScripts(readProjectPage(projectId));
    const canonical = `${configuredOrigin}/projects/${projectId}/`;
    const jsonLd = getStructuredData(html, `${projectId} project`);
    const titleMarkup = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    const title = getInkHoverVisibleText(titleMarkup, `${projectId} project title`);
    const description = decodeHtmlEntities(
      html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "",
    );
    const datePublished = html.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? "";
    const disciplines = decodeHtmlEntities(
      html.match(
        /<dt class="metadata"[^>]*>Disciplines<\/dt>[\s\S]*?<dd[^>]*>([^<]+)<\/dd>/,
      )?.[1] ?? "",
    ).split(" · ");

    assert.ok(title);
    assert.ok(description);
    assert.ok(datePublished);
    assert.ok(disciplines.every((discipline) => discipline.length > 0));
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${escapeRegExp(canonical)}"`),
    );
    assert.match(html, /<h1 data-ink-hover="text"><span class="ink-hover__glow-copy" aria-hidden="true">[\s\S]*?<\/span>\s*<span class="ink-hover__foreground">[\s\S]*?<\/span><\/h1>/);
    assert.match(html, /class="project-layout__overview"[\s\S]*?class="project-layout__description"/);
    assert.match(html, /<aside class="project-layout__marginalia"[\s\S]*?class="project-layout__metadata"/);
    assert.deepEqual(jsonLd, {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "@id": canonical,
      url: canonical,
      name: title,
      description,
      datePublished,
      keywords: disciplines,
    });
  });
});

test("project stylesheet provides responsive catalogue and readable case-study columns", () => {
  const styles = readFileSync(projectsStylesPath, "utf8");

  assert.match(styles, /\.projects-index__header h1\s*\{[^}]*font-size:\s*clamp\(/);
  assert.match(styles, /\.project-index-entry--has-cover\s*\{\s*grid-template-columns:/);
  assert.match(styles, /\.project-layout__overview\s*\{\s*display:\s*grid/);
  assert.match(styles, /\.project-layout__body\s*\{\s*width:\s*min\(100%,\s*var\(--reading-measure\)\)/);
  assert.match(styles, /@media\s*\(min-width:\s*56rem\)/);
});

test("every published project has a stable static case-study route", () => {
  projectIds.forEach((projectId) => {
    const html = removeScripts(readProjectPage(projectId));

    assert.doesNotMatch(html, /href="#"|href=""|Coming soon|undefined|null/);
    assert.doesNotMatch(html, /<p>\s*<img\b/);
    assert.doesNotMatch(html, /Related projects|Related writing|Gallery/);
  });
});

test("project output has no empty controls, placeholders, cards, or draft content", () => {
  const projectOutputFiles = getProjectOutputFiles(
    resolve(repositoryRoot, "dist", "projects"),
  );
  const projectOutput = projectOutputFiles
    .map((filePath) => readFileSync(filePath, "utf8"))
    .map(removeScripts)
    .join("\n");
  const indexHtml = removeScripts(readFileSync(projectsIndexPath, "utf8"));
  const detailHtml = projectIds.map((projectId) => removeScripts(readProjectPage(projectId)));
  const relationOutput = detailHtml
    .map(
      (html) =>
        html.match(
          /<section class="project-layout__related"[\s\S]*?<\/section>/g,
        ) ?? [],
    )
    .flat()
    .join("\n");
  const sitemap = readFileSync(resolve(repositoryRoot, "dist/sitemap-0.xml"), "utf8");

  assert.doesNotMatch(projectOutput, /href="\s*"|href="#"/);
  assert.doesNotMatch(
    projectOutput,
    /Coming soon|No image|Placeholder|placeholder|undefined|null/,
  );
  assert.doesNotMatch(projectOutput, /ProjectCard|project-card|card__|card-/);

  [indexHtml, ...detailHtml, relationOutput, sitemap].forEach((output) => {
    assert.doesNotMatch(output, /draft-project-fixture|Draft Project Fixture|draft-only-review/i);
  });
});

type ProjectBodyImagePattern = {
  readonly label: string;
  readonly pattern: RegExp;
};

const projectBodyImagePatterns: ReadonlyArray<ProjectBodyImagePattern> = [
  { label: "inline Markdown image", pattern: /!\[[^\]]*\]\(\s*[^)]*\)/ },
  {
    label: "reference-style Markdown image",
    pattern: /!\[[^\]]*\](?:\s*\[[^\]]*\])?/,
  },
  { label: "HTML or JSX img element", pattern: /<img\b/i },
];

function getProjectBody(contents: string): string {
  return contents.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function findProjectBodyImage(contents: string): ProjectBodyImagePattern | null {
  const body = getProjectBody(contents);
  return projectBodyImagePatterns.find(({ pattern }) => pattern.test(body)) ?? null;
}

test("project Markdown and MDX bodies remain prose-only so images use the square contract", () => {
  readdirSync(projectsSourceDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"))
    .forEach((fileName) => {
      const contents = readFileSync(resolve(projectsSourceDirectory, fileName), "utf8");
      const imagePattern = findProjectBodyImage(contents);

      assert.equal(
        imagePattern,
        null,
        `${fileName} contains a ${imagePattern?.label ?? "body image"}`,
      );
    });
});

test("the prose-only guard catches every supported project body image form", () => {
  const fixtures: ReadonlyArray<{ readonly body: string; readonly label: string }> = [
    { body: "![inline](image.jpg)", label: "inline Markdown image" },
    { body: "![reference][image]\n\n[image]: image.jpg", label: "reference-style Markdown image" },
    { body: '<img src="image.jpg" alt="Image">', label: "HTML or JSX img element" },
    { body: '<img src={image} alt="Image" />', label: "HTML or JSX img element" },
  ];

  fixtures.forEach(({ body, label }) => {
    const imagePattern = findProjectBodyImage(`---\ntitle: fixture\n---\n${body}`);

    assert.equal(imagePattern?.label, label, `${label} must be rejected`);
  });
});
