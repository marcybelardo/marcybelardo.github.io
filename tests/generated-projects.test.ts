import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsIndexPath = resolve(repositoryRoot, "dist/projects/index.html");
const projectsSourceDirectory = resolve(repositoryRoot, "src/content/projects");
const configuredOrigin = "https://www.marcelinebelardo.com";

type ProjectExpectation = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly datePublished: string;
  readonly disciplines: ReadonlyArray<string>;
};

type ProjectJsonLd = {
  readonly [key: string]: unknown;
};

const projectExpectations: ReadonlyArray<ProjectExpectation> = [
  {
    slug: "osborne",
    title: "Osborne",
    description:
      "Budget management app for personal and group spending, built with Java Spring Boot and React",
    datePublished: "2026-06-12T00:00:00.000Z",
    disciplines: ["software"],
  },
  {
    slug: "portfolio-site",
    title: "Portfolio Site",
    description:
      "This very website — a static personal portfolio built with Astro, React, and TailwindCSS.",
    datePublished: "2026-06-04T00:00:00.000Z",
    disciplines: ["software", "visual"],
  },
  {
    slug: "cmprsr-rs",
    title: "cmprsr-rs",
    description: "Canonical Huffman compression tool written in Rust",
    datePublished: "2026-06-01T00:00:00.000Z",
    disciplines: ["software"],
  },
  {
    slug: "lilyhttpd",
    title: "lilyhttpd",
    description: "An HTTP server for static files written in C",
    datePublished: "2025-06-14T00:00:00.000Z",
    disciplines: ["software"],
  },
];

const projectIds = projectExpectations.map(({ slug }) => slug);

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

function getProjectJsonLd(html: string): ProjectJsonLd {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );

  assert.ok(match?.[1], "project detail must contain JSON-LD");
  return JSON.parse(match[1]) as ProjectJsonLd;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  assert.equal(
    (html.match(/project-index-entry__body--no-cover/g) ?? []).length,
    4,
    "projects without covers must use the full-width index layout",
  );
  assert.equal(
    (html.match(/class="project-index-entry__body project-index-entry__body--has-cover"/g) ?? [])
      .length,
    0,
  );
  assert.match(html, /<ul class="editorial-list" aria-label="Projects">/);
  assert.doesNotMatch(html, /ProjectCard|project-card|border-neutral-900/);
});

test("the project index emits the published project metadata", () => {
  assert.ok(existsSync(projectsIndexPath), "project index output must exist");

  const html = readFileSync(projectsIndexPath, "utf8");

  projectExpectations.forEach((expectedProject) => {
    assert.match(html, new RegExp(escapeRegExp(expectedProject.description)));
    assert.match(html, new RegExp(`href="/projects/${expectedProject.slug}/"`));
    assert.match(html, new RegExp(`>${expectedProject.datePublished.slice(0, 4)}<`));

    expectedProject.disciplines.forEach((discipline) => {
      assert.match(html, new RegExp(`>${escapeRegExp(discipline)}<`));
    });
  });

  assert.doesNotMatch(html, /No image|Coming soon|undefined|null/);
});

test("each project detail emits its published metadata and canonical JSON-LD", () => {
  projectExpectations.forEach((expectedProject) => {
    const html = readProjectPage(expectedProject.slug);
    const canonical = `${configuredOrigin}/projects/${expectedProject.slug}/`;
    const jsonLd = getProjectJsonLd(html);

    assert.match(
      html,
      new RegExp(
        `<meta name="description" content="${escapeRegExp(expectedProject.description)}"`,
      ),
    );
    assert.match(html, new RegExp(`datetime="${expectedProject.datePublished}"`));
    assert.match(
      html,
      new RegExp(
        `<dt class="metadata"[^>]*>Disciplines</dt>[\\s\\S]*?${expectedProject.disciplines.join(
          " · ",
        )}`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${escapeRegExp(canonical)}"`),
    );
    assert.deepEqual(jsonLd, {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "@id": canonical,
      url: canonical,
      name: expectedProject.title,
      description: expectedProject.description,
      datePublished: expectedProject.datePublished,
      keywords: expectedProject.disciplines,
    });
  });
});

test("every published project has a stable static case-study route", () => {
  projectIds.forEach((projectId) => {
    const html = readProjectPage(projectId);

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
    .join("\n");
  const indexHtml = readFileSync(projectsIndexPath, "utf8");
  const detailHtml = projectIds.map((projectId) => readProjectPage(projectId));
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
