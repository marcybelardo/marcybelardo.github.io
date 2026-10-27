// pattern: Functional Core
//
// This module turns rendered article HTML into the plaintext `textContent`
// Standard.site documents require. It parses markup into a tree and walks it;
// it never matches tags with regular expressions, so nested markup, entity
// escapes, and attribute quoting are handled by the HTML parser instead.
//
// The input is expected to be the article body alone. Layout chrome and the
// shared author signature are not part of a document record, so callers render
// only the post content before calling this function.

import { fromHtml } from "hast-util-from-html";
import { toText } from "hast-util-to-text";

// Infer tree types from the declared parser API without importing a transitive
// package directly.
type Root = ReturnType<typeof fromHtml>;
type Node = Root["children"][number];
type Element = Extract<Node, { type: "element" }>;
type Text = Extract<Node, { type: "text" }>;
type Parents = Root | Element;

/**
 * Elements whose contents are never article prose. The text conversion already
 * ignores most of these; removing them here keeps the tree honest and covers
 * script-bearing or purely decorative inline content.
 */
const REMOVED_TAG_NAMES: ReadonlySet<string> = new Set([
  "canvas",
  "embed",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

/**
 * Convert rendered article HTML into trimmed plaintext.
 *
 * - comments, scripts, styles, templates, and similar non-prose elements are
 *   removed together with their subtree
 * - decorative subtrees (`aria-hidden="true"`, `hidden`) are removed so an
 *   accessible-only copy of a phrase is not published twice
 * - GFM footnote backlink anchors are removed, keeping the note definition
 *   without the repeated "return to reference" markers
 * - an `img` with non-empty alt text contributes that alt text; an image with
 *   empty alt text is decorative and is dropped
 * - code blocks keep their line structure because the text conversion preserves
 *   `white-space: pre`
 *
 * The result may be the empty string: a published post whose body carries no
 * readable text still has a document record, and an empty `textContent` is a
 * string the Standard.site lexicon accepts.
 */
export function htmlToTextContent(html: string): string {
  if (typeof html !== "string") {
    throw new TypeError("htmlToTextContent requires an HTML string");
  }

  const tree = fromHtml(html, { fragment: true });
  pruneTree(tree);

  return toText(tree).trim();
}

function pruneTree(parent: Parents): void {
  const children = parent.children;
  let index = 0;

  while (index < children.length) {
    const child = children[index];

    if (child.type === "comment") {
      children.splice(index, 1);
      continue;
    }

    if (child.type !== "element") {
      index += 1;
      continue;
    }

    if (isRemovedElement(child)) {
      children.splice(index, 1);
      continue;
    }

    if (child.tagName === "img") {
      const alt = readAltText(child);

      if (alt) {
        const text: Text = { type: "text", value: alt };
        children[index] = text;
        index += 1;
      } else {
        children.splice(index, 1);
      }
      continue;
    }

    pruneTree(child);
    index += 1;
  }

  mergeAdjacentText(children);
}

/**
 * Join neighbouring text nodes. Removing an element between two text nodes
 * otherwise leaves two whitespace runs that only collapse once they are a
 * single node, so `Edge <img alt=""> case.` would keep a double space.
 */
function mergeAdjacentText(children: Parents["children"]): void {
  let index = 0;

  while (index < children.length - 1) {
    const current = children[index];
    const next = children[index + 1];

    if (current.type === "text" && next.type === "text") {
      current.value += next.value;
      children.splice(index + 1, 1);
      continue;
    }

    index += 1;
  }
}

function readAltText(element: Element): string {
  const alt = element.properties?.alt;

  return typeof alt === "string" ? alt.trim() : "";
}

function isRemovedElement(element: Element): boolean {
  if (REMOVED_TAG_NAMES.has(element.tagName)) {
    return true;
  }

  if (!element.properties) {
    return false;
  }

  if (isTruthyProperty(element.properties.hidden)) {
    return true;
  }

  if (readProperty(element.properties, "aria-hidden") === "true") {
    return true;
  }

  // GFM footnote definitions end with an anchor that only returns the reader to
  // the reference marker; the marker itself is already in the article text.
  return element.tagName === "a" && readProperty(element.properties, "data-footnote-backref") !== undefined;
}

/**
 * Read a property by its HTML attribute name. Parse trees expose dash-cased
 * attributes under a camel-cased key, so both spellings are accepted.
 */
function readProperty(
  properties: Element["properties"],
  attribute: string,
): string | number | boolean | null | undefined {
  const camelCased = attribute.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const value = properties[attribute] ?? properties[camelCased];

  return Array.isArray(value) ? value.join(" ") : value;
}

function isTruthyProperty(value: unknown): boolean {
  return value === true || value === "" || value === "hidden";
}
