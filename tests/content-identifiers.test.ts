import assert from "node:assert/strict";
import test from "node:test";

import {
  generateBlogId,
  generateLegacyBlogId,
  generateProjectId,
} from "../src/content/content-identifiers.ts";

test("project IDs are derived from explicit slugs, not titles", () => {
  assert.equal(
    generateProjectId({ slug: "lilyhttpd", title: "Lily HTTPD" }),
    "lilyhttpd",
  );
  assert.equal(
    generateProjectId({ slug: "lilyhttpd", title: "A Completely New Title" }),
    "lilyhttpd",
  );
});

test("blog IDs prefer explicit slugs", () => {
  assert.equal(
    generateBlogId({
      title: "A Changed Published Title",
      slug: "the-devil-you-know",
    }),
    "the-devil-you-know",
  );
});

test("blog IDs retain the legacy four-word title fallback", () => {
  const title = "The Devil You Know, the Devil You Don't";

  assert.equal(generateLegacyBlogId(title), "the-devil-you-know");
  assert.equal(generateBlogId({ title }), "the-devil-you-know");
});
