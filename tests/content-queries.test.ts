import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPublishedEntries,
  getFeaturedProjects,
  limitRecentPosts,
  sortByDateDescending,
  sortFeaturedProjects,
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

test("featured sorting uses order, date, then ID", () => {
  const sorted = sortFeaturedProjects(entries);

  assert.deepEqual(sorted.map((entry) => entry.id), ["draft", "alpha", "zeta", "older"]);
  assert.deepEqual(getFeaturedProjects(entries, true).map((entry) => entry.id), ["alpha", "zeta"]);
});

test("recent post limiting sorts a copy before slicing", () => {
  const recent = limitRecentPosts(entries, 2);

  assert.deepEqual(recent.map((entry) => entry.id), ["draft", "alpha"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["zeta", "alpha", "draft", "older"]);
  assert.notEqual(recent, entries);
});
