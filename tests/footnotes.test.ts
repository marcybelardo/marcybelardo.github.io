import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createMarkdownProcessor } from "@astrojs/markdown-remark";

import rehypeMarginNotes from "../src/markdown/rehype-margin-notes.mjs";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "footnotes.md",
);

async function renderFixture(): Promise<string> {
  const processor = await createMarkdownProcessor({
    rehypePlugins: [rehypeMarginNotes],
  });
  const source = readFileSync(fixturePath, "utf8");
  const result = await processor.render(source);

  return result.code;
}

test("GFM footnotes preserve references, definitions, backlinks, and one note copy", async () => {
  const html = await renderFixture();

  assert.match(html, /href="#user-content-fn-source"[^>]*id="user-content-fnref-source"/);
  assert.match(html, /href="#user-content-fn-source"[^>]*id="user-content-fnref-source-2"/);
  assert.match(html, /href="#user-content-fn-second"[^>]*id="user-content-fnref-second"/);
  assert.match(html, /<li id="user-content-fn-source"[^>]*>/);
  assert.match(html, /<li id="user-content-fn-second"[^>]*>/);
  assert.equal(
    (html.match(/(?:id|href)="#?user-content-fnref-source"/g) ?? []).length,
    2,
    "the first note keeps its first reference and backlink",
  );
  assert.match(html, /href="#user-content-fnref-source-2"[^>]*data-footnote-backref/);
  assert.match(html, /href="#user-content-fnref-second"[^>]*data-footnote-backref/);
  assert.match(html, /data-margin-note-ref="user-content-fn-source"/);
  assert.match(html, /data-margin-note-ref="user-content-fn-second"/);
  assert.match(
    html,
    /<li id="user-content-fn-source"[^>]*data-margin-note-anchor="user-content-fnref-source"/,
  );
  assert.match(
    html,
    /<li id="user-content-fn-second"[^>]*data-margin-note-anchor="user-content-fnref-second"/,
  );
  assert.equal((html.match(/A source with/g) ?? []).length, 1);
  assert.equal((html.match(/A second note with/g) ?? []).length, 1);
  assert.match(html, /<em>inline emphasis<\/em>/);
  assert.match(html, /href="https:\/\/example\.com\/project"/);
});

test("unpaired footnote nodes remain unchanged and unenhanced", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "a",
            properties: {
              href: "#missing-definition",
              id: "user-content-fnref-missing",
              dataFootnoteRef: "",
            },
            children: [{ type: "text", value: "1" }],
          },
        ],
      },
    ],
  };
  const before = structuredClone(tree);
  const transformer = rehypeMarginNotes();

  transformer(tree);

  assert.deepEqual(tree, before);
  assert.doesNotMatch(JSON.stringify(tree), /dataMarginNote/);
});

test("mixed paired and unpaired footnotes remain completely unannotated", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "a",
            properties: {
              href: "#fn-source",
              id: "fnref-source",
              dataFootnoteRef: true,
            },
            children: [{ type: "text", value: "1" }],
          },
          {
            type: "element",
            tagName: "a",
            properties: {
              href: "#fn-missing",
              id: "fnref-missing",
              dataFootnoteRef: true,
            },
            children: [{ type: "text", value: "2" }],
          },
        ],
      },
      {
        type: "element",
        tagName: "section",
        properties: { dataFootnotes: true },
        children: [
          {
            type: "element",
            tagName: "ol",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "li",
                properties: { id: "fn-source" },
                children: [{ type: "text", value: "source" }],
              },
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(tree);

  rehypeMarginNotes()(tree);

  assert.deepEqual(tree, before);
});

test("a definition without a reference prevents all annotation", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "a",
            properties: {
              href: "#fn-source",
              id: "fnref-source",
              dataFootnoteRef: true,
            },
            children: [{ type: "text", value: "1" }],
          },
        ],
      },
      {
        type: "element",
        tagName: "section",
        properties: { dataFootnotes: true },
        children: [
          {
            type: "element",
            tagName: "ol",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "li",
                properties: { id: "fn-source" },
                children: [{ type: "text", value: "source" }],
              },
              {
                type: "element",
                tagName: "li",
                properties: { id: "fn-orphan" },
                children: [{ type: "text", value: "orphan" }],
              },
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(tree);

  rehypeMarginNotes()(tree);

  assert.deepEqual(tree, before);
});
