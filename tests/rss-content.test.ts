import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRootRelativeUrls } from "../src/content/rss-content.ts";

const SITE = "https://www.marcelinebelardo.com";

test("normalizes quoted href and src root-relative URLs in either quote style", () => {
  const html = `<a href="/about/">About</a><img src='/images/portrait.png' alt="Portrait">`;

  assert.equal(
    normalizeRootRelativeUrls(html, SITE),
    `<a href="${SITE}/about/">About</a><img src='${SITE}/images/portrait.png' alt="Portrait">`,
  );
});

test("keeps canonical absolute, external, protocol-relative, fragment, and mail URLs", () => {
  const html = [
    `<a href="${SITE}/already-absolute/">canonical</a>`,
    `<a href="https://example.com/external/">external</a>`,
    `<img src="//cdn.example.com/image.png" alt="cdn">`,
    `<a href="#notes">fragment</a>`,
    `<a href="mailto:hello@example.com">mail</a>`,
  ].join("");

  assert.equal(normalizeRootRelativeUrls(html, SITE), html);
});

test("does not normalize root-looking text outside an HTML attribute", () => {
  const html = `<p>Use href="/not-an-attribute" in this example.</p>`;

  assert.equal(normalizeRootRelativeUrls(html, SITE), html);
});

test("does not rewrite matching text inside another attribute value", () => {
  const html = `<div data-example="href='/not-a-link'">Example</div>`;

  assert.equal(normalizeRootRelativeUrls(html, SITE), html);
});

test("scans through greater-than signs inside quoted attributes", () => {
  const html = `<a title="a > b" href="/path">Path</a>`;

  assert.equal(
    normalizeRootRelativeUrls(html, SITE),
    `<a title="a > b" href="${SITE}/path">Path</a>`,
  );
});

test("does not rewrite comments or declarations as HTML attributes", () => {
  const html = '<!-- href="/comment" --><!doctype html><a href="/real">Real</a>';

  assert.equal(
    normalizeRootRelativeUrls(html, SITE),
    '<!-- href="/comment" --><!doctype html><a href="' +
      `${SITE}/real">Real</a>`,
  );
});

test("preserves query and fragment components when resolving URLs", () => {
  assert.equal(
    normalizeRootRelativeUrls(
      `<a href="/path?a=1&b=2#part">query</a>`,
      SITE,
    ),
    `<a href="${SITE}/path?a=1&b=2#part">query</a>`,
  );
});

test("does not double-encode an already escaped query separator", () => {
  assert.equal(
    normalizeRootRelativeUrls(
      `<a href='/path?a=1&amp;b=2'>escaped query</a>`,
      SITE,
    ),
    `<a href='${SITE}/path?a=1&amp;b=2'>escaped query</a>`,
  );
});
