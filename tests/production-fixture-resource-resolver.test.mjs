import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { resolveRetainedResource } from "./production-fixture-resource-resolver.mjs";

const outputDirectory = resolve("/tmp/retained-resource-output");

test("resolves root-relative retained resources from the output root", () => {
  const result = resolveRetainedResource(
    outputDirectory,
    "/assets/image.webp?width=640",
    resolve(outputDirectory, "blog/tags/design/index.html"),
  );

  assert.equal(result.path, resolve(outputDirectory, "assets/image.webp"));
  assert.equal(result.isDirectory, false);
});

test("resolves same-directory relative resources from the referring file", () => {
  const result = resolveRetainedResource(
    outputDirectory,
    "./font.woff2",
    resolve(outputDirectory, "assets/css/site.css"),
  );

  assert.equal(result.path, resolve(outputDirectory, "assets/css/font.woff2"));
  assert.equal(result.isDirectory, false);
});

test("resolves parent-relative resources from the referring file", () => {
  const result = resolveRetainedResource(
    outputDirectory,
    "../images/cover.webp",
    resolve(outputDirectory, "assets/css/site.css"),
  );

  assert.equal(result.path, resolve(outputDirectory, "assets/images/cover.webp"));
  assert.equal(result.isDirectory, false);
});

test("rejects relative resources that escape retained output", () => {
  assert.throws(
    () => resolveRetainedResource(
      outputDirectory,
      "../../../../outside.woff2",
      resolve(outputDirectory, "assets/css/site.css"),
    ),
    /must remain inside retained output/,
  );
});
