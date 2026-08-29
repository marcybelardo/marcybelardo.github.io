import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ConversionError,
  buildDocumentRecord,
  convertBlogDirectory,
  discoverBlogSources,
  documentAtUri,
  deriveDocumentIdentities,
  deriveDocumentRecordKeys,
  deriveStableTid,
  isTid,
  markdownToPlainText,
  normalizeDatetime,
  parseFrontmatter,
  parsePublicationAtUri,
  publicationRecordKey,
  publicationAtUri,
  validateTid,
} from "../src/standard-site/converter.ts";

describe("Standard.site conversion core", () => {
  it("normalizes date-only and offset date-times to UTC milliseconds", () => {
    assert.equal(normalizeDatetime("2024-01-02"), "2024-01-02T00:00:00.000Z");
    assert.equal(
      normalizeDatetime("2024-01-02T03:04:05.1-03:00"),
      "2024-01-02T06:04:05.100Z",
    );
    assert.equal(
      normalizeDatetime("2024-01-02T03:04:05,123Z"),
      "2024-01-02T03:04:05.123Z",
    );
    for (const value of [
      "2024-02-30",
      "2024-01-02T03:04:05",
      "2024-01-02T03:04:05.1234Z",
      "2024-01-02T03:04:05+24:00",
      "2024-01-02 03:04:05Z",
    ]) {
      assert.throws(() => normalizeDatetime(value), ConversionError);
    }
  });

  it("parses the supported frontmatter grammar and returns the body", () => {
    const parsed = parseFrontmatter(
      "post.md",
      "---\nslug: hello-world\ntitle: 'Hello, world!'\ndate: 2024-01-02\ndescription: A description\ntags:\n  - zeta\n  - alpha\n---\nBody **here**.\n",
    );
    assert.deepEqual(parsed.data, {
      slug: "hello-world",
      title: "Hello, world!",
      date: "2024-01-02",
      description: "A description",
      tags: ["zeta", "alpha"],
      draft: false,
    });
    assert.equal(parsed.body, "Body **here**.\n");

    assert.throws(
      () => parseFrontmatter("bad.md", "---\ntitle: Title\ndate: 2024-01-01\nunknown: value\n---\n"),
      /unknown top-level field/,
    );
    assert.throws(
      () => parseFrontmatter("bad.md", "---\ntitle: Title\ndate: 2024-01-01\ntags:\n - one\n---\n"),
      /exactly two spaces/,
    );
  });

  it("renders Markdown and MDX safely as readable plaintext", () => {
    const text = markdownToPlainText(
      "import Widget from './Widget.astro';\n\n# Heading\n\nA **bold** [visible link](https://example.com) and `code`.\n\n- first\n- second\n\n<Widget value={danger} />\n\n[^note]\n\n[^note]: A footnote with _detail_.\n",
    );
    assert.equal(
      text,
      "Heading\n\nA bold visible link and code.\n\nfirst\n\nsecond\n\n[Footnote note]\n\n[Footnote note] A footnote with detail.",
    );
    assert.doesNotMatch(text, /[*_`<>]/u);
    assert.doesNotMatch(text, /danger/u);
  });

  it("uses stable TID AT-URI identities and validates authorities", () => {
    assert.equal(deriveStableTid("document:hello-world"), "3sp2q2tmsdo2w");
    assert.equal(deriveStableTid("document:hello-world"), deriveStableTid("document:hello-world"));
    assert.equal(publicationRecordKey(), "5jpjlmfobo2uz");
    assert.equal(isTid("3sp2q2tmsdo2w"), true);
    assert.equal(isTid("hello-world"), false);
    assert.throws(() => validateTid("hello-world"), /13-character TID/);
    assert.deepEqual([...deriveDocumentRecordKeys(["zeta", "alpha"]).keys()], ["alpha", "zeta"]);
    assert.throws(() => deriveDocumentRecordKeys(["alpha", "alpha"]), /duplicate document slug/);
    assert.deepEqual(deriveDocumentIdentities("did:plc:abc123", ["hello-world"]), [
      {
        slug: "hello-world",
        rkey: "3sp2q2tmsdo2w",
        uri: "at://did:plc:abc123/site.standard.document/3sp2q2tmsdo2w",
      },
    ]);
    assert.equal(
      publicationAtUri("did:plc:abc123"),
      "at://did:plc:abc123/site.standard.publication/5jpjlmfobo2uz",
    );
    assert.equal(
      documentAtUri("did:plc:abc123", "hello-world"),
      "at://did:plc:abc123/site.standard.document/3sp2q2tmsdo2w",
    );
    assert.equal(
      parsePublicationAtUri("at://alice.example/site.standard.publication/3sp2q2tmsdo2w"),
      "at://alice.example/site.standard.publication/3sp2q2tmsdo2w",
    );
    assert.throws(() => documentAtUri("did:plc:abc123", "Hello-World"), /stable slug syntax/);
    assert.throws(() => publicationAtUri("example", "main"), /normalized AT Protocol handle/);
    assert.throws(
      () => parsePublicationAtUri("at://did:plc:abc123/site.standard.publication/main?x=1"),
      /query or fragment/,
    );
    assert.throws(
      () => parsePublicationAtUri("at://did:plc:abc123/site.standard.publication/main"),
      /13-character TID/,
    );
  });

  it("converts only published posts in deterministic slug order", async () => {
    const root = await mkdtemp(join(tmpdir(), "standard-site-converter-"));
    try {
      const nested = join(root, "nested");
      await mkdir(nested);
      await writeFile(
        join(root, "zeta.md"),
        "---\nslug: zeta\ntitle: Zeta\ndate: 2024-01-02T03:04:05.123+03:00\ndescription: Z\ntags: []\n---\nZeta body.\n",
      );
      await writeFile(
        join(nested, "alpha.mdx"),
        "---\nslug: alpha\ntitle: Alpha\ndate: 2024-01-01\ndescription: A\n---\nAlpha <em>body</em>.\n",
      );
      await writeFile(
        join(root, "draft.md"),
        "---\ntitle: Draft\ndate: 2024-01-03\ndraft: true\n---\nDraft only.\n",
      );

      const result = await convertBlogDirectory(root, { authority: "did:plc:abc123" });
      assert.equal(result.publicationUri, "at://did:plc:abc123/site.standard.publication/5jpjlmfobo2uz");
      assert.deepEqual(result.documents.map((post) => post.slug), ["alpha", "zeta"]);
      assert.deepEqual(result.documents.map((post) => post.rkey), ["6pioqbuxy6bjr", "5eliqir6rxkpt"]);
      assert.match(result.documents[0].uri, /^at:\/\/did:plc:abc123\/site\.standard\.document\/[234567a-z]{13}$/u);
      assert.equal(result.documents[0].document.site, result.publicationUri);
      assert.equal(result.documents[0].document.path, "/blog/alpha/");
      assert.equal(result.documents[0].document.textContent, "Alpha body.");
      assert.equal(result.documents[1].document.publishedAt, "2024-01-02T00:04:05.123Z");
      assert.deepEqual(result.documents[1].document.tags, undefined);
      assert.deepEqual(result.drafts.map((post) => post.frontmatter.title), ["Draft"]);
      assert.deepEqual(
        (await discoverBlogSources(root)).map((post) => post.relativePath),
        ["draft.md", "nested/alpha.mdx", "zeta.md"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects missing published metadata and duplicate slugs before conversion", async () => {
    const root = await mkdtemp(join(tmpdir(), "standard-site-converter-"));
    try {
      await writeFile(
        join(root, "missing.md"),
        "---\ntitle: Missing slug\ndate: 2024-01-01\ndescription: Description\n---\nBody\n",
      );
      await assert.rejects(
        () => convertBlogDirectory(root, { authority: "did:plc:abc123" }),
        /explicit non-empty slug/,
      );
      await rm(join(root, "missing.md"));
      await writeFile(
        join(root, "one.md"),
        "---\nslug: duplicate\ntitle: One\ndate: 2024-01-01\ndescription: Description\n---\nOne\n",
      );
      await writeFile(
        join(root, "two.md"),
        "---\nslug: duplicate\ntitle: Two\ndate: 2024-01-02\ndescription: Description\n---\nTwo\n",
      );
      await assert.rejects(
        () => convertBlogDirectory(root, { authority: "did:plc:abc123" }),
        /duplicate published slug/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked input trees before reading content", async () => {
    const root = await mkdtemp(join(tmpdir(), "standard-site-converter-"));
    const outside = await mkdtemp(join(tmpdir(), "standard-site-outside-"));
    try {
      await writeFile(
        join(outside, "post.md"),
        "---\nslug: post\ntitle: Post\ndate: 2024-01-01\ndescription: Description\n---\nBody\n",
      );
      await symlink(join(outside, "post.md"), join(root, "post.md"));
      await assert.rejects(
        () => discoverBlogSources(root),
        /may not contain symlink/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("builds a document only from a non-draft source", () => {
    const source = {
      path: "post.md",
      relativePath: "post.md",
      markdown: "A body.",
      frontmatter: {
        slug: "post",
        title: "Post",
        date: "2024-01-01",
        description: "Description",
        tags: [],
        draft: false,
      },
    } as const;
    const record = buildDocumentRecord(source, {
      publicationUri: publicationAtUri("did:plc:abc123"),
    });
    assert.equal(record.textContent, "A body.");
    assert.throws(
      () => buildDocumentRecord({ ...source, frontmatter: { ...source.frontmatter, draft: true } }, { publicationUri: record.site }),
      /draft posts cannot be converted/,
    );
  });
});
