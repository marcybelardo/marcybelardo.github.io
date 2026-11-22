import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PUBLICATION_DESCRIPTION,
  PUBLICATION_NAME,
  RECORD_EXPORT_VERSION,
  buildRecordExport,
  documentPathForSlug,
  validateRecordExport,
  type PlannedRecord,
  type RecordExport,
  type RecordExportSource,
} from "../src/standard-site/records.ts";
import { htmlToTextContent } from "../src/standard-site/html-to-text.ts";
import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  deriveStableTid,
  documentAtUriForRkey,
  publicationAtUri,
} from "../src/standard-site/identity.ts";
import {
  SITE_ORIGIN,
  STANDARD_SITE_PUBLICATION_RECORD_KEY,
} from "../src/site-config.ts";

const did = "did:plc:fakq3c4v2fvivhoc3cgom3nc";

function source(overrides: Partial<RecordExportSource> = {}): RecordExportSource {
  return {
    id: "a-post",
    slug: "a-post",
    title: "A post",
    date: "2024-01-02",
    description: "A short description",
    tags: [],
    draft: false,
    html: "<p>Body text.</p>",
    ...overrides,
  };
}

function build(sources: ReadonlyArray<RecordExportSource>): RecordExport {
  return buildRecordExport({ did, sources });
}

function clone(recordExport: RecordExport): RecordExport {
  return structuredClone(recordExport);
}

/** Read the document slug the same way the export orders documents. */
function slugOf(planned: PlannedRecord<RecordExport["documents"][number]["value"]>): string {
  const path = planned.value.path ?? "";

  return path.slice("/blog/".length, -1);
}

describe("article HTML to plaintext", () => {
  it("removes scripts, styles, templates, comments, and decorative subtrees", () => {
    const text = htmlToTextContent(`
      <p>Kept prose.</p>
      <script>console.log("noise")</script>
      <style>.noise { color: red }</style>
      <template><p>Template copy</p></template>
      <noscript><p>Noscript copy</p></noscript>
      <!-- editorial comment -->
      <svg><title>Vector title</title></svg>
      <p aria-hidden="true">Decorative duplicate</p>
      <p><span aria-hidden="true">Glow copy</span>Visible copy</p>
    `);

    assert.equal(text, "Kept prose.\n\nVisible copy");
  });

  it("uses meaningful image alt text and drops decorative images", () => {
    const text = htmlToTextContent(`
      <p>Before <img src="/a.png" alt="A described figure"> after.</p>
      <p>Edge <img src="/b.png" alt=""> case.</p>
      <p>Missing <img src="/c.png"> alt.</p>
    `);

    assert.match(text, /Before A described figure after\./u);
    assert.doesNotMatch(text, /a\.png|b\.png|c\.png/u);
    assert.match(text, /Edge case\./u);
    assert.match(text, /Missing alt\./u);
  });

  it("preserves code block lines and indentation", () => {
    const text = htmlToTextContent(
      `<p>Run this:</p><pre><code>const value = 1;\n\nif (value) {\n  run(value);\n}</code></pre><p>Then continue.</p>`,
    );

    assert.match(text, /const value = 1;\n\nif \(value\) \{\n  run\(value\);\n\}/u);
    assert.match(text, /Run this:/u);
    assert.match(text, /Then continue\./u);
  });

  it("keeps footnote definitions and drops the backlink markers", () => {
    const text = htmlToTextContent(`
      <p>Claim in text.<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup></p>
      <section data-footnotes class="footnotes">
        <h2 id="footnote-label">Footnotes</h2>
        <ol>
          <li id="user-content-fn-1">
            <p>The note body. <a href="#user-content-fnref-1" data-footnote-backref="" aria-label="Back to reference 1">↩</a></p>
          </li>
        </ol>
      </section>
    `);

    assert.match(text, /Claim in text\.1/u);
    assert.match(text, /Footnotes/u);
    assert.match(text, /The note body\./u);
    assert.doesNotMatch(text, /↩/u);
  });

  it("decodes entities and collapses whitespace", () => {
    assert.equal(
      htmlToTextContent("<p>\n  Tom &amp; Jerry &lt;tag&gt;   spaced\n</p>"),
      "Tom & Jerry <tag> spaced",
    );
  });

  it("returns an empty string when the article has no readable text", () => {
    assert.equal(htmlToTextContent(""), "");
    assert.equal(htmlToTextContent("   \n\t "), "");
    assert.equal(htmlToTextContent("<script>only()</script>"), "");
    assert.equal(htmlToTextContent("<p>   </p>"), "");
    assert.equal(htmlToTextContent('<img src="/decorative.png" alt="">'), "");
  });
});

describe("Standard.site records export", () => {
  it("exports the publication with unchanged metadata and coordinates", () => {
    const recordExport = build([source()]);
    const publication = recordExport.publication;

    assert.equal(recordExport.version, RECORD_EXPORT_VERSION);
    assert.equal(recordExport.did, did);
    assert.equal(publication?.collection, PUBLICATION_COLLECTION);
    assert.equal(publication?.rkey, STANDARD_SITE_PUBLICATION_RECORD_KEY);
    assert.equal(
      publication?.uri,
      publicationAtUri(did, STANDARD_SITE_PUBLICATION_RECORD_KEY),
    );
    assert.equal(publication?.value.$type, PUBLICATION_COLLECTION);
    assert.equal(publication?.value.url, SITE_ORIGIN);
    assert.equal(publication?.value.name, PUBLICATION_NAME);
    assert.equal(publication?.value.description, PUBLICATION_DESCRIPTION);
    assert.equal(PUBLICATION_NAME, "Art Computer Insanity Posting");
    assert.equal(
      PUBLICATION_DESCRIPTION,
      "Marceline Belardo's thoughts on tech, politics, and art",
    );
  });

  it("exports documents with record coordinates and canonical paths", () => {
    const recordExport = build([source({ tags: ["astro"] })]);
    const document = recordExport.documents[0];
    const rkey = deriveStableTid("document:a-post");

    assert.equal(document.collection, DOCUMENT_COLLECTION);
    assert.equal(document.rkey, rkey);
    assert.equal(document.uri, documentAtUriForRkey(did, rkey));
    assert.equal(document.value.$type, DOCUMENT_COLLECTION);
    assert.equal(document.value.site, recordExport.publication?.uri);
    assert.equal(document.value.path, documentPathForSlug("a-post"));
    assert.equal(document.value.publishedAt, "2024-01-02T00:00:00.000Z");
    assert.equal(document.value.textContent, "Body text.");
    assert.deepEqual(document.value.tags, ["astro"]);
    assert.deepEqual(Object.keys(document).sort(), ["collection", "rkey", "uri", "value"]);
  });

  it("orders documents by the slug their path carries, independent of input order", () => {
    const sources = [
      source({ id: "third", slug: "third" }),
      source({ id: "first", slug: "first" }),
      source({ id: "second", slug: "second", date: new Date("2024-03-04T05:06:07.000Z") }),
      source({ id: "draft-post", slug: "draft-post", draft: true, html: "<p>Draft body</p>" }),
    ];

    const ordered = build(sources);
    assert.deepEqual(ordered.documents.map(slugOf), ["first", "second", "third"]);
    assert.equal(
      JSON.stringify(ordered),
      JSON.stringify(build([...sources].reverse())),
    );
  });

  it("excludes drafts while counting them and never exposes their content", () => {
    const recordExport = build([
      source(),
      source({
        id: "draft-one",
        slug: "draft-one",
        draft: true,
        title: "Draft one",
        html: "<p>Draft body</p>",
      }),
      source({ id: "draft-two", slug: "draft-two", draft: true, title: "Draft two", html: "" }),
    ]);

    assert.equal(recordExport.draftsExcluded, 2);
    assert.deepEqual(recordExport.documents.map(slugOf), ["a-post"]);
    assert.deepEqual(recordExport.missingSlugIds, []);

    const serialized = JSON.stringify(recordExport);
    assert.doesNotMatch(serialized, /draft-one|draft-two|Draft body|Draft one/u);
  });

  it("omits published posts without an explicit slug and reports their route IDs", () => {
    const recordExport = build([
      source({ id: "legacy-title-id", slug: undefined }),
      source({ id: "explicit-post", slug: "explicit-post" }),
      source({ id: "draft-legacy", slug: undefined, draft: true }),
    ]);

    assert.deepEqual(recordExport.missingSlugIds, ["legacy-title-id"]);
    assert.deepEqual(recordExport.documents.map(slugOf), ["explicit-post"]);
    assert.doesNotMatch(JSON.stringify(recordExport.documents), /legacy-title-id/u);
  });

  it("keeps nonempty tags and requires a published description", () => {
    for (const description of [undefined, "", "   "]) {
      assert.throws(() => build([source({ description })]), /description must be non-empty/);
    }
    const recordExport = build([
      source({ id: "no-tags", slug: "no-tags", tags: [] }),
      source({ id: "with-tags", slug: "with-tags", tags: ["astro", "records"] }),
    ]);

    const [noTags, withTags] = recordExport.documents;
    assert.equal(noTags.value.tags, undefined);
    assert.equal(noTags.value.description, "A short description");
    assert.deepEqual(withTags.value.tags, ["astro", "records"]);
    assert.equal(withTags.value.description, "A short description");
  });

  it("exports an empty textContent when the article body has no text", () => {
    const recordExport = build([source({ html: "" })]);

    assert.equal(recordExport.documents[0].value.textContent, "");
    assert.doesNotThrow(() => validateRecordExport(recordExport, did));
  });

  it("emits a disabled envelope without any article or draft detail", () => {
    const recordExport = buildRecordExport({
      did: null,
      sources: [
        source(),
        source({ id: "draft-post", slug: "draft-post", draft: true, title: "Draft title" }),
      ],
    });

    assert.deepEqual(recordExport, {
      version: RECORD_EXPORT_VERSION,
      did: null,
      publication: null,
      documents: [],
      draftsExcluded: 0,
      missingSlugIds: [],
    });
    assert.doesNotMatch(JSON.stringify(recordExport), /a-post|Draft title|Body text/u);
  });

  it("rejects duplicate slugs and an unusable date", () => {
    assert.throws(
      () =>
        build([
          source({ id: "one", slug: "shared" }),
          source({ id: "two", slug: "shared" }),
        ]),
      /repeats the slug shared/u,
    );
    assert.throws(
      () => build([source({ date: "not a date" })]),
      /published date is not a valid date/u,
    );
  });

  it("validates its own output against the expected DID", () => {
    const recordExport = build([source({ tags: ["astro"] })]);

    assert.deepEqual(validateRecordExport(recordExport, did), recordExport);
    assert.throws(
      () => validateRecordExport(recordExport, "did:plc:otheridentity"),
      /does not match the expected DID/u,
    );
  });
});

describe("records export validation", () => {
  it("rejects a malformed envelope", () => {
    const valid = build([source()]);

    assert.throws(() => validateRecordExport(null), /must be an object/u);
    assert.throws(() => validateRecordExport([]), /must be an object/u);
    assert.throws(
      () => validateRecordExport({ ...clone(valid), version: 2 }),
      /version must be 1/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(valid), did: 7 }),
      /did must be a string or null/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(valid), documents: {} }),
      /documents must be an array/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(valid), draftsExcluded: -1 }),
      /draftsExcluded/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(valid), missingSlugIds: [""] }),
      /missingSlugIds/u,
    );
  });

  it("rejects a disabled envelope that still carries data", () => {
    const disabled: RecordExport = buildRecordExport({ did: null, sources: [] });
    const enabled = build([source()]);

    assert.throws(
      () => validateRecordExport({ ...clone(disabled), publication: enabled.publication }),
      /must not include a publication/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(disabled), documents: enabled.documents }),
      /must not include documents/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(disabled), draftsExcluded: 1 }),
      /must not include a draft count/u,
    );
    assert.throws(
      () => validateRecordExport({ ...clone(disabled), did: "" }),
      /did must be a DID/u,
    );
  });

  it("rejects publication coordinates and records that do not match", () => {
    const valid = clone(build([source()]));

    assert.throws(
      () =>
        validateRecordExport({
          ...valid,
          publication: { ...valid.publication!, collection: DOCUMENT_COLLECTION },
        }),
      /publication collection must be site\.standard\.publication/u,
    );
    assert.throws(
      () =>
        validateRecordExport({
          ...valid,
          publication: { ...valid.publication!, rkey: "2222222222222" },
        }),
      /publication rkey must be/u,
    );
    assert.throws(
      () =>
        validateRecordExport({
          ...valid,
          publication: { ...valid.publication!, uri: publicationAtUri(did, "2222222222222") },
        }),
      /publication uri must be/u,
    );
    assert.throws(
      () =>
        validateRecordExport({
          ...valid,
          publication: {
            ...valid.publication!,
            value: { ...valid.publication!.value, name: undefined },
          },
        }),
      /publication record is invalid/u,
    );
    assert.throws(
      () =>
        validateRecordExport({ ...valid, publication: null }),
      /publication must be an object/u,
    );
  });

  it("rejects document coordinates that do not match their path", () => {
    const valid = clone(build([source()]));

    const wrongCollection = clone(valid);
    wrongCollection.documents[0] = {
      ...wrongCollection.documents[0],
      collection: PUBLICATION_COLLECTION,
    };
    assert.throws(
      () => validateRecordExport(wrongCollection),
      /collection must be site\.standard\.document/u,
    );

    const wrongRkey = clone(valid);
    wrongRkey.documents[0] = { ...wrongRkey.documents[0], rkey: "2222222222222" };
    assert.throws(() => validateRecordExport(wrongRkey), /rkey must be the record key/u);

    const wrongUri = clone(valid);
    wrongUri.documents[0] = {
      ...wrongUri.documents[0],
      uri: documentAtUriForRkey(did, "2222222222222"),
    };
    assert.throws(() => validateRecordExport(wrongUri), /uri must be the record key|uri must be the document AT-URI/u);

    const foreignUri = clone(valid);
    foreignUri.documents[0] = {
      ...foreignUri.documents[0],
      uri: `at://did:plc:someoneelse/${DOCUMENT_COLLECTION}/2222222222222`,
    };
    assert.throws(() => validateRecordExport(foreignUri), /must belong to the publication DID/u);

    const wrongPath = clone(valid);
    wrongPath.documents[0].value = { ...wrongPath.documents[0].value, path: "/blog/other-post/" };
    assert.throws(() => validateRecordExport(wrongPath), /rkey must be the record key/u);

    const malformedPath = clone(valid);
    malformedPath.documents[0].value = { ...malformedPath.documents[0].value, path: "/blog/a-post" };
    assert.throws(() => validateRecordExport(malformedPath), /document path must match/u);

    const badSlugPath = clone(valid);
    badSlugPath.documents[0].value = {
      ...badSlugPath.documents[0].value,
      path: "/blog/Not A Slug/",
    };
    assert.throws(() => validateRecordExport(badSlugPath), /slug: must match/u);

    const missited = clone(valid);
    missited.documents[0].value = {
      ...missited.documents[0].value,
      site: publicationAtUri(did, "2222222222222"),
    };
    assert.throws(() => validateRecordExport(missited), /must reference the publication/u);
  });

  it("requires an own textContent string, including an empty one", () => {
    const valid = clone(build([source()]));

    const missing = clone(valid);
    delete (missing.documents[0].value as { textContent?: string }).textContent;
    assert.throws(() => validateRecordExport(missing), /textContent must be a string|invalid/u);

    const wrongType = clone(valid);
    (wrongType.documents[0].value as { textContent?: unknown }).textContent = 42;
    assert.throws(() => validateRecordExport(wrongType), /textContent must be a string|invalid/u);

    const inherited = clone(valid);
    delete (inherited.documents[0].value as { textContent?: string }).textContent;
    Object.setPrototypeOf(inherited.documents[0].value, { textContent: "Inherited body" });
    assert.throws(() => validateRecordExport(inherited), /textContent must be a string|invalid/u);

    for (const description of [undefined, "", "   "]) {
      const invalidDescription = clone(valid);
      invalidDescription.documents[0].value.description = description;
      assert.throws(() => validateRecordExport(invalidDescription), /description must be non-empty/);
    }

    const empty = clone(valid);
    empty.documents[0].value = { ...empty.documents[0].value, textContent: "" };
    assert.doesNotThrow(() => validateRecordExport(empty));
  });

  it("rejects document records that fail the generated schema", () => {
    const valid = clone(build([source()]));

    const badDatetime = clone(valid);
    (badDatetime.documents[0].value as { publishedAt: string }).publishedAt = "yesterday";
    assert.throws(() => validateRecordExport(badDatetime), /value is invalid/u);

    const badTitle = clone(valid);
    (badTitle.documents[0].value as { title: unknown }).title = 7;
    assert.throws(() => validateRecordExport(badTitle), /value is invalid/u);

    const badTags = clone(valid);
    (badTags.documents[0].value as { tags: unknown }).tags = ["ok", 3];
    assert.throws(() => validateRecordExport(badTags), /value is invalid/u);

    const badType = clone(valid);
    (badType.documents[0].value as { $type: string }).$type = "site.standard.publication";
    assert.throws(() => validateRecordExport(badType), /value is invalid/u);

    const longTitle = clone(valid);
    longTitle.documents[0].value = { ...longTitle.documents[0].value, title: "x".repeat(501) };
    assert.throws(() => validateRecordExport(longTitle), /value is invalid/u);
  });

  it("rejects unsorted or duplicated documents", () => {
    const valid = build([
      source({ id: "a-post", slug: "a-post" }),
      source({ id: "b-post", slug: "b-post" }),
    ]);

    const reversed = clone(valid);
    reversed.documents.reverse();
    assert.throws(() => validateRecordExport(reversed), /sorted by slug/u);

    const duplicated = clone(valid);
    duplicated.documents[1] = structuredClone(duplicated.documents[0]);
    assert.throws(() => validateRecordExport(duplicated), /repeats the slug a-post/u);
  });

  it("rejects missing slug IDs that describe an exported document or are unsorted", () => {
    const valid = clone(
      build([
        source({ id: "a-post", slug: "a-post" }),
        source({ id: "b-post", slug: "b-post" }),
      ]),
    );

    assert.throws(
      () => validateRecordExport({ ...valid, missingSlugIds: ["a-post"] }),
      /is also an exported document/u,
    );
    assert.throws(
      () => validateRecordExport({ ...valid, missingSlugIds: ["z-legacy", "y-legacy"] }),
      /sorted and unique/u,
    );
  });
});
