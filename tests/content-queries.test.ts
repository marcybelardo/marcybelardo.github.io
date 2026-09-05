import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { generateProjectId } from "../src/content/content-identifiers.ts";
import {
  getBlogTagArchives,
  filterPublishedEntries,
  getFeaturedProjects,
  getPublishedBlogPosts,
  getRecentPosts,
  resolveRelatedEntries,
  sortByDateDescending,
  toTagSlug,
} from "../src/content/content-queries.ts";

type TestEntry = {
  readonly id: string;
  readonly data: {
    readonly date: Date;
    readonly draft?: boolean;
    readonly featured?: boolean;
    readonly featuredOrder?: number;
  };
};

const entries: ReadonlyArray<TestEntry> = [
  {
    id: "zeta",
    data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 2 },
  },
  {
    id: "alpha",
    data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 1 },
  },
  {
    id: "draft",
    data: { date: new Date("2026-06-14"), draft: true, featured: true, featuredOrder: 0 },
  },
  {
    id: "older",
    data: { date: new Date("2025-06-14"), featured: false },
  },
];

test("production publication filtering excludes drafts without mutating input", () => {
  const originalIds = entries.map((entry) => entry.id);
  const published = filterPublishedEntries(entries, true);

  assert.deepEqual(published.map((entry) => entry.id), ["zeta", "alpha", "older"]);
  assert.deepEqual(entries.map((entry) => entry.id), originalIds);
  assert.notEqual(published, entries);
  assert.deepEqual(
    filterPublishedEntries(entries, false).map((entry) => entry.id),
    ["zeta", "alpha", "draft", "older"],
  );
});

test("date sorting uses descending dates and ascending IDs for ties", () => {
  const sorted = sortByDateDescending(entries);

  assert.deepEqual(sorted.map((entry) => entry.id), ["draft", "alpha", "zeta", "older"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["zeta", "alpha", "draft", "older"]);
  assert.notEqual(sorted, entries);
});

test("featured selection uses configured order", () => {
  assert.deepEqual(getFeaturedProjects(entries, true).map((entry) => entry.id), ["alpha", "zeta"]);
});

test("featured selection rejects duplicate featured orders with the conflicting IDs", () => {
  const duplicateOrders: ReadonlyArray<TestEntry> = [
    {
      id: "first",
      data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 1 },
    },
    {
      id: "second",
      data: { date: new Date("2026-06-11"), featured: true, featuredOrder: 1 },
    },
  ];

  assert.throws(
    () => getFeaturedProjects(duplicateOrders, true),
    /featuredOrder must be unique.*first.*second/i,
  );
});

test("featured selection validates authored draft orders before production filtering", () => {
  const duplicateDraftOrder: ReadonlyArray<TestEntry> = [
    {
      id: "published",
      data: { date: new Date("2026-06-12"), featured: true, featuredOrder: 1 },
    },
    {
      id: "draft",
      data: {
        date: new Date("2026-06-11"),
        draft: true,
        featured: true,
        featuredOrder: 1,
      },
    },
  ];

  assert.throws(
    () => getFeaturedProjects(duplicateDraftOrder, true),
    /featuredOrder must be unique.*published.*draft/i,
  );
});

test("featured and recent selections apply deterministic limits after publication filtering", () => {
  const manyFeatured: ReadonlyArray<TestEntry> = [
    ...entries,
    {
      id: "bravo",
      data: { date: new Date("2026-06-11"), featured: true, featuredOrder: 3 },
    },
    {
      id: "charlie",
      data: { date: new Date("2026-06-10"), featured: true, featuredOrder: 4 },
    },
  ];

  assert.deepEqual(
    getFeaturedProjects(manyFeatured, true, 3).map((entry) => entry.id),
    ["alpha", "zeta", "bravo"],
  );
  assert.deepEqual(
    getRecentPosts(manyFeatured, true, 3).map((entry) => entry.id),
    ["alpha", "zeta", "bravo"],
  );
});

test("recent post limiting sorts a copy before slicing", () => {
  const recent = getRecentPosts(entries, false, 2);

  assert.deepEqual(recent.map((entry) => entry.id), ["draft", "alpha"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["zeta", "alpha", "draft", "older"]);
  assert.notEqual(recent, entries);
});

type RelationEntry = {
  readonly id: string;
  readonly data: {
    readonly draft?: boolean;
  };
};

const relationEntries: ReadonlyArray<RelationEntry> = [
  { id: "alpha", data: {} },
  { id: "beta", data: {} },
  { id: "draft", data: { draft: true } },
  { id: "self", data: {} },
];

test("related project resolution preserves author order and drops invalid IDs", () => {
  const resolved = resolveRelatedEntries({
    ids: ["beta", "missing", "draft", "self", "alpha", "beta"],
    entries: relationEntries,
    excludedId: "self",
  });

  assert.deepEqual(resolved.map((entry) => entry.id), ["beta", "alpha"]);
  assert.deepEqual(relationEntries.map((entry) => entry.id), [
    "alpha",
    "beta",
    "draft",
    "self",
  ]);
});

test("related writing resolution preserves author order and excludes drafts and missing IDs", () => {
  const resolved = resolveRelatedEntries({
    ids: ["self", "draft", "missing", "alpha"],
    entries: relationEntries,
  });

  assert.deepEqual(resolved.map((entry) => entry.id), ["self", "alpha"]);
});

type BlogTestEntry = {
  readonly id: string;
  readonly data: {
    readonly date: Date;
    readonly draft?: boolean;
    readonly tags?: ReadonlyArray<string>;
  };
};

const blogEntries: ReadonlyArray<BlogTestEntry> = [
  {
    id: "zeta",
    data: { date: new Date("2026-06-12"), tags: ["Technology"] },
  },
  {
    id: "alpha",
    data: { date: new Date("2026-06-12"), tags: ["ai", "AI", "C++", "C#"] },
  },
  {
    id: "draft",
    data: { date: new Date("2026-06-14"), draft: true, tags: ["Draft Only"] },
  },
  {
    id: "older",
    data: { date: new Date("2025-06-14"), tags: [" c++ ", "Politics"] },
  },
];

test("tag slugs normalize labels and reject labels with no safe characters", () => {
  assert.equal(toTagSlug("  Hello, World!  "), "hello-world");
  assert.equal(toTagSlug("C++"), "c");
  assert.equal(toTagSlug("!!!"), null);
  assert.equal(toTagSlug("   "), null);
});

test("published blog queries exclude drafts and sort deterministically", () => {
  const published = getPublishedBlogPosts(blogEntries, true);

  assert.deepEqual(published.map((entry) => entry.id), ["alpha", "zeta", "older"]);
  assert.deepEqual(blogEntries.map((entry) => entry.id), ["zeta", "alpha", "draft", "older"]);
});

test("authored invalid tags fail validation before production filtering", () => {
  const invalidDraft = {
    id: "invalid-draft",
    data: { date: new Date("2026-06-15"), draft: true, tags: ["!!!"] },
  };

  assert.throws(
    () => getPublishedBlogPosts([invalidDraft], true),
    /blog tag must normalize to a non-empty slug/,
  );
});

test("unique blog tags merge normalized collisions and deduplicate posts", () => {
  const archives = getBlogTagArchives(blogEntries, true);
  const tags = archives.map(({ label, slug }) => ({ label, slug }));

  assert.deepEqual(tags, [
    { label: "ai", slug: "ai" },
    { label: "C++", slug: "c" },
    { label: "Technology", slug: "technology" },
    { label: "Politics", slug: "politics" },
  ]);
  assert.deepEqual(
    archives.find((archive) => archive.slug === "c"),
    {
      label: "C++",
      slug: "c",
      posts: [blogEntries[1], blogEntries[3]],
    },
  );
  assert.equal(archives.filter((archive) => archive.slug === "c").length, 1);
});

test("blog tag queries reject authored labels that normalize to an empty slug", () => {
  assert.throws(
    () => getBlogTagArchives([
      {
        id: "invalid",
        data: { date: new Date("2026-06-15"), tags: ["!!!"] },
      },
    ], true),
    /tag.*slug/i,
  );
});

const projectsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/content/projects",
);

function getFrontmatterValue(contents: string, field: string): string {
  const match = contents.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));

  assert.ok(match, `${field} must be present in project frontmatter`);
  return match[1]?.trim() ?? "";
}

test("project IDs remain explicit and stable as the collection grows", () => {
  const projectFiles = readdirSync(projectsDirectory)
    .filter((fileName) => /\.(?:md|mdx)$/.test(fileName))
    .sort();
  const projectIds = projectFiles.map((fileName) => {
    const contents = readFileSync(resolve(projectsDirectory, fileName), "utf8");
    const slug = getFrontmatterValue(contents, "slug");
    const title = getFrontmatterValue(contents, "title");

    assert.equal(
      generateProjectId({ slug, title: `${title} with a changed title` }),
      slug,
    );
    return slug;
  });

  assert.ok(projectIds.length > 0);
  assert.ok(projectIds.every((projectId) => projectId.length > 0));
  assert.equal(new Set(projectIds).size, projectIds.length);
});
