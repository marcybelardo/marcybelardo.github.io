import assert from "node:assert/strict";
import test from "node:test";

import {
  composeSiteTitle,
  createCanonicalUrl,
  getRobotsValue,
  NOINDEX_ROBOTS,
  serializeJsonLd,
  SITE_ORIGIN,
  validateCanonicalUrl,
} from "../src/metadata/page-metadata.ts";

test("site titles compose page labels with the site name", () => {
  assert.equal(composeSiteTitle("Marceline Belardo"), "Marceline Belardo");
  assert.equal(composeSiteTitle("Code"), "Code | Marceline Belardo");
  assert.equal(composeSiteTitle("  Blog  "), "Blog | Marceline Belardo");
});

test("canonical URLs use the configured site origin", () => {
  assert.equal(
    createCanonicalUrl("/retired-example/", SITE_ORIGIN),
    "https://www.marcelinebelardo.com/retired-example/",
  );
  assert.equal(
    createCanonicalUrl("/blog/the-devil-you-know/", SITE_ORIGIN),
    "https://www.marcelinebelardo.com/blog/the-devil-you-know/",
  );
});

test("canonical paths reject external URLs", () => {
  assert.throws(
    () => createCanonicalUrl("https://example.com/elsewhere/", SITE_ORIGIN),
    /canonical path must be an internal absolute path/,
  );
  assert.throws(
    () => createCanonicalUrl("//example.com/elsewhere/", SITE_ORIGIN),
    /canonical path must be an internal absolute path/,
  );
});

test("canonical URL overrides remain limited to the configured origin", () => {
  assert.equal(
    validateCanonicalUrl("https://www.marcelinebelardo.com/projects/", SITE_ORIGIN),
    "https://www.marcelinebelardo.com/projects/",
  );
  assert.throws(
    () => validateCanonicalUrl("https://malicious.example/projects/", SITE_ORIGIN),
    /canonical URL must use the configured site origin/,
  );
  assert.throws(
    () => validateCanonicalUrl("/projects/", SITE_ORIGIN),
    /canonical URL must be an absolute URL/,
  );
});

test("robots values distinguish indexable and noindex pages", () => {
  assert.equal(getRobotsValue(true), "index, follow");
  assert.equal(getRobotsValue(false), NOINDEX_ROBOTS);
});

test("JSON-LD serialization preserves data while escaping HTML-sensitive characters", () => {
  const unsafeDescription = "</script><script>alert('&')</script>";
  const serialized = serializeJsonLd({
    "@context": "https://schema.org",
    description: unsafeDescription,
  });

  assert.doesNotMatch(serialized, /[<>&]/);
  assert.equal(JSON.parse(serialized).description, unsafeDescription);
});
