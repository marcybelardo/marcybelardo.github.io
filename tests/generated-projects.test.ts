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

  assert.deepEqual(linkedProjectIds.slice().sort(), projectIds);
  assert.equal(new Set(linkedProjectIds).size, linkedProjectIds.length);
  assert.equal(entries.length, linkedProjectIds.length);
  assert.match(html, /<ol class="projects-index__list" aria-label="Projects">/);
  const pageTitleMarkup = html.match(/<h1 data-ink-hover="text">([\s\S]*?)<\/h1>/)?.[1] ?? "";
  assert.ok(getInkHoverVisibleText(pageTitleMarkup, "projects page title"));
  assert.doesNotMatch(html, /<p class="eyebrow">/);
  assert.doesNotMatch(html, /ProjectCard|project-card|border-neutral-900/);

  entries.forEach((match, index) => {
    const entry = match[0] ?? "";
    const heading = entry.match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";

    assert.ok(getInkHoverVisibleText(heading, `project index heading ${index + 1}`));
    assert.match(entry, /class="project-index-entry__ordinal"[\s\S]*?<time\b[^>]*>(?:19|20)\d{2}<\/time>/);
    assert.match(entry, /class="project-index-entry__main"[\s\S]*?<p class="project-index-entry__description">[^<]+<\/p>/);
    assert.match(entry, /<aside class="project-index-entry__metadata"[\s\S]*?<dt>Disciplines<\/dt>/);
    const hasImage = /class="square-image project-index-entry__image"/.test(entry);
    const hasPlaceholder = /class="project-index-entry__placeholder"/.test(entry);
    assert.notEqual(hasImage, hasPlaceholder, `entry ${index + 1} must have exactly one preview variant`);
    if (hasImage) {
      assert.match(entry, /<img\b[^>]*\balt="[^"\s][^"]*"/);
      assert.match(entry, /<img\b[^>]*\bsrcset="[^"]+"/);
    } else {
      assert.match(entry, /<div class="project-index-entry__placeholder" role="note">\s*<span>Project preview forthcoming<\/span>\s*<\/div>/);
      assert.doesNotMatch(entry, /<img\b|<a\b[^>]*project-index-entry__placeholder/);
    }
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
    const hasImage = /class="square-image project-index-entry__image"/.test(entry);
    const hasPlaceholder = /class="project-index-entry__placeholder"/.test(entry);
    assert.notEqual(hasImage, hasPlaceholder, `${projectId} must have one index preview variant`);
    assert.match(
      entry,
      /<time\b[^>]*datetime="[^"]+"[^>]*>(?:19|20)\d{2}<\/time>/,
    );
    assert.match(entry, /class="project-index-entry__description">[^<]+<\/p>/);
    assert.match(entry, /<dt>Disciplines<\/dt>[\s\S]*?<dd>[^<]+<\/dd>/);
    if (entry.includes("<dt>Tags</dt>")) {
      assert.match(entry, /<dt>Tags<\/dt>[\s\S]*?<dd>[^<]+<\/dd>/);
    }
  });

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
  assert.match(styles, /\.project-index-entry__image,\s*\.project-index-entry__placeholder\s*\{[^}]*aspect-ratio:\s*1/);
  assert.match(styles, /@media\s*\(min-width:\s*56rem\)[\s\S]*?\.project-index-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.52fr\)\s+minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(styles, /project-index-entry--has-cover/);
  assert.match(styles, /\.project-layout__overview\s*\{\s*display:\s*grid/);
  assert.match(styles, /\.project-layout__body\s*\{\s*width:\s*min\(100%,\s*var\(--reading-measure\)\)/);
  assert.match(styles, /@media\s*\(min-width:\s*56rem\)/);
});

test("every published project has a stable static case-study route", () => {
  projectIds.forEach((projectId) => {
    const html = removeScripts(readProjectPage(projectId));

    assert.doesNotMatch(html, /href="#"|href=""/);
    assert.doesNotMatch(html, /<p>\s*<img\b/);
  });
});

test("project index placeholders stay accessible and project details never contain preview placeholders", () => {
  const indexHtml = readFileSync(projectsIndexPath, "utf8");
  const placeholders = [...indexHtml.matchAll(/<div class="project-index-entry__placeholder"[^>]*>([\s\S]*?)<\/div>/g)];
  placeholders.forEach((match) => {
    assert.match(match[0] ?? "", /role="note"/);
    assert.match(match[1] ?? "", /Project preview forthcoming/);
    assert.doesNotMatch(match[0] ?? "", /<a\b|<button\b|<img\b/);
  });
  projectIds.forEach((projectId) => assert.doesNotMatch(readProjectPage(projectId), /Project preview forthcoming|project-index-entry__placeholder/));
});

test("project output has no empty controls, placeholders outside the index, cards, or draft content", () => {
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
  assert.doesNotMatch(detailHtml.join("\n"), /Project preview forthcoming|project-index-entry__placeholder/);
  assert.doesNotMatch(projectOutput.replace(indexHtml, ""), /Project preview forthcoming|project-index-entry__placeholder/);
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
