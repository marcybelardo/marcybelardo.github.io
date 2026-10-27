import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  BLOG_SOURCE_DIRECTORY,
  preflightBlogSources,
} from "../scripts/standard-site/source-preflight.ts";
import { PublisherError } from "../scripts/standard-site/types.ts";

const published = (fields: string, body = "Body.\n") => `---\n${fields}---\n${body}`;

interface Fixture {
  readonly root: string;
  readonly blogDirectory: string;
  cleanup(): Promise<void>;
}

async function createFixture(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "standard-site-preflight-"));
  const blogDirectory = join(root, BLOG_SOURCE_DIRECTORY);
  await mkdir(blogDirectory, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const path = join(blogDirectory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return {
    root,
    blogDirectory,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("preflight counts drafts, builds membership, and reports legacy IDs", async () => {
  const fixture = await createFixture({
    "explicit.md": published("slug: explicit-post\ntitle: Explicit\ndate: 2024-01-01\n"),
    "legacy.md": published('title: "Legacy Title Here Now"\ndate: 2024-02-01\n'),
    "draft.md": published("title: Draft Post\ndate: 2024-03-01\ndraft: true\n"),
    "nested/another.md": published("slug: nested-post\ntitle: Nested\ndate: 2024-04-01\n"),
  });
  try {
    const result = await preflightBlogSources(fixture.root);
    assert.deepEqual(result.publishedSlugs, ["explicit-post", "nested-post"]);
    assert.equal(result.draftsExcluded, 1);
    assert.deepEqual(result.missingSlugIds, ["legacy-title-here-now"]);
  } finally {
    await fixture.cleanup();
  }
});

test("preflight does not render Markdown/MDX bodies", async () => {
  const fixture = await createFixture({
    "unrenderable.mdx": published(
      "slug: mdx-post\ntitle: MDX\ndate: 2024-01-01\n",
      'import Missing from "./missing.tsx";\n\n<Missing prop={notValid(\n',
    ),
  });
  try {
    const result = await preflightBlogSources(fixture.root);
    assert.deepEqual(result.publishedSlugs, ["mdx-post"]);
    assert.equal(result.draftsExcluded, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("preflight accepts inline and block YAML tag lists", async () => {
  const fixture = await createFixture({
    "inline.md": published(
      "slug: inline-tags\ntitle: Inline tags\ndate: 2024-01-01\ntags: [alpha, beta]\n",
    ),
    "block.md": published(
      "slug: block-tags\ntitle: Block tags\ndate: 2024-01-02\ntags:\n  - alpha\n  - beta\n",
    ),
  });
  try {
    const result = await preflightBlogSources(fixture.root);
    assert.deepEqual(result.publishedSlugs, ["block-tags", "inline-tags"]);
    assert.deepEqual(result.missingSlugIds, []);
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects duplicate explicit published slugs", async () => {
  const fixture = await createFixture({
    "one.md": published("slug: same-slug\ntitle: One\ndate: 2024-01-01\n"),
    "two.md": published("slug: same-slug\ntitle: Two\ndate: 2024-01-02\n"),
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      (error: unknown) =>
        error instanceof PublisherError &&
        /duplicate explicit published slug same-slug/.test(error.message),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects a legacy ID that collides with an explicit slug", async () => {
  const fixture = await createFixture({
    "explicit.md": published("slug: legacy-title-here-now\ntitle: Explicit\ndate: 2024-01-01\n"),
    "legacy.md": published('title: "Legacy Title Here Now"\ndate: 2024-02-01\n'),
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /duplicate published blog ID legacy-title-here-now/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects a symlinked Markdown source before following it", async () => {
  const fixture = await createFixture({
    "regular.md": published("slug: regular\ntitle: Regular\ndate: 2024-01-01\n"),
  });
  const outside = join(fixture.root, "outside.md");
  try {
    await writeFile(outside, published("slug: outside\ntitle: Outside\ndate: 2024-01-01\n"));
    await symlink(outside, join(fixture.blogDirectory, "linked.md"));
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /may not contain symlink/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects a symlinked directory before descending", async () => {
  const fixture = await createFixture({
    "regular.md": published("slug: regular\ntitle: Regular\ndate: 2024-01-01\n"),
  });
  const outside = join(fixture.root, "outside");
  try {
    await mkdir(outside);
    await writeFile(
      join(outside, "hidden.md"),
      published("slug: hidden\ntitle: Hidden\ndate: 2024-01-01\n"),
    );
    await symlink(outside, join(fixture.blogDirectory, "linked-directory"));
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /may not contain symlink/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects a symlinked blog directory and symlinked ancestors", async () => {
  const fixture = await createFixture({
    "regular.md": published("slug: regular\ntitle: Regular\ndate: 2024-01-01\n"),
  });
  try {
    const linkedRoot = join(fixture.root, "linked-root");
    await symlink(fixture.blogDirectory, linkedRoot);
    await assert.rejects(
      () => preflightBlogSources(fixture.root, "linked-root"),
      /may not contain symlink component/,
    );

    const linkedParent = join(fixture.root, "linked-parent");
    await symlink(join(fixture.root, "src"), linkedParent);
    await assert.rejects(
      () => preflightBlogSources(fixture.root, "linked-parent/content/blog"),
      /may not contain symlink component/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects duplicate legacy route IDs", async () => {
  const fixture = await createFixture({
    "one.md": published('title: "Same Title"\ndate: 2024-01-01\n'),
    "two.md": published('title: "Same Title"\ndate: 2024-01-02\n'),
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /duplicate published blog ID same-title/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects a published post with no ID source", async () => {
  const fixture = await createFixture({
    "no-title.md": "---\nslug: \"\"\ndate: 2024-01-01\n---\nBody.\n",
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /empty legacy blog ID|duplicate|title/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects invalid UTF-8 before parsing frontmatter", async () => {
  const fixture = await createFixture({
    "broken.md": new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0x0a, 0x2d, 0x2d, 0x2d, 0x0a]),
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /invalid UTF-8/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("preflight rejects malformed YAML with the parser message", async () => {
  const fixture = await createFixture({
    "malformed.md": "---\nslug: malformed\ntitle: [unclosed\n---\nBody.\n",
  });
  try {
    await assert.rejects(
      () => preflightBlogSources(fixture.root),
      /flow collection|unexpected end/,
    );
  } finally {
    await fixture.cleanup();
  }
});
