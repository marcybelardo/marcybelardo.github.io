import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertReviewOutputDestination } from "./production-fixture-output-guard.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function withTemporaryDirectory(callback) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "fixture-output-guard-"));
  const outsideTemporaryTarget = resolve(tmpdir(), "..", `fixture-output-outside-${process.pid}-${Date.now()}`);

  try {
    callback(temporaryRoot, outsideTemporaryTarget);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(outsideTemporaryTarget, { recursive: true, force: true });
  }
}

test("accepts a fresh destination physically under the temporary directory", () => {
  withTemporaryDirectory((temporaryRoot) => {
    const destination = join(temporaryRoot, "review-output", "build");
    const validated = assertReviewOutputDestination(destination, {
      repositoryRoot,
      temporaryDirectory: temporaryRoot,
    });

    assert.equal(validated, destination);
  });
});

test("refuses an existing destination", () => {
  withTemporaryDirectory((temporaryRoot) => {
    const destination = join(temporaryRoot, "existing-output");
    mkdirSync(destination);

    assert.throws(
      () => assertReviewOutputDestination(destination, {
        repositoryRoot,
        temporaryDirectory: temporaryRoot,
      }),
      /must not already exist/,
    );
  });
});

test("refuses a symlinked parent resolving into repository content", () => {
  withTemporaryDirectory((temporaryRoot) => {
    const linkedParent = join(temporaryRoot, "repository-link");
    symlinkSync(resolve(repositoryRoot, "src/content/public/dist"), linkedParent, "dir");

    assert.throws(
      () => assertReviewOutputDestination(join(linkedParent, "new-output"), {
        repositoryRoot,
        temporaryDirectory: temporaryRoot,
      }),
      /under the system temporary directory|outside the repository/,
    );
  });
});

test("refuses a symlinked parent resolving outside the temporary directory", () => {
  withTemporaryDirectory((temporaryRoot, outsideTemporaryTarget) => {
    const linkedParent = join(temporaryRoot, "outside-link");
    symlinkSync(outsideTemporaryTarget, linkedParent, "dir");

    assert.throws(
      () => assertReviewOutputDestination(join(linkedParent, "new-output"), {
        repositoryRoot,
        temporaryDirectory: temporaryRoot,
      }),
      /under the system temporary directory/,
    );
  });
});
