import assert from "node:assert/strict";
import {
  lstatSync,
  realpathSync,
  readlinkSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..");
}

function pathsOverlap(first, second) {
  return isWithin(first, second) || isWithin(second, first);
}

function resolvePhysicalPath(path, seenSymlinks = new Set()) {
  const absolutePath = resolve(path);
  let candidate = absolutePath;
  const missingSuffix = [];

  while (true) {
    try {
      return resolve(realpathSync(candidate), ...missingSuffix);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        throw error;
      }

      try {
        const metadata = lstatSync(candidate);
        if (metadata.isSymbolicLink()) {
          const key = resolve(candidate);
          assert.equal(seenSymlinks.has(key), false, "review output path contains a symbolic-link loop");
          seenSymlinks.add(key);
          const target = readlinkSync(candidate);
          const targetPath = resolve(dirname(candidate), target, ...missingSuffix);
          return resolvePhysicalPath(targetPath, seenSymlinks);
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT" && statError?.code !== "ENOTDIR") {
          throw statError;
        }
      }

      const parent = dirname(candidate);
      assert.notEqual(parent, candidate, `could not resolve an existing ancestor for ${absolutePath}`);
      missingSuffix.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

function existsIncludingSymlinks(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

export function assertReviewOutputDestination(
  directory,
  {
    repositoryRoot,
    liveDist = resolve(repositoryRoot, "dist"),
    temporaryDirectory = tmpdir(),
  },
) {
  const normalizedDirectory = resolve(directory);
  assert.equal(
    existsIncludingSymlinks(normalizedDirectory),
    false,
    "review output destination must not already exist",
  );

  const physicalDirectory = resolvePhysicalPath(normalizedDirectory);
  const physicalRepository = resolvePhysicalPath(repositoryRoot);
  const physicalDist = resolvePhysicalPath(liveDist);
  const physicalTemporaryDirectory = resolvePhysicalPath(temporaryDirectory);

  assert.ok(
    isWithin(physicalTemporaryDirectory, physicalDirectory),
    "review output destination must be under the system temporary directory",
  );
  assert.equal(
    pathsOverlap(physicalRepository, physicalDirectory),
    false,
    "review output must be outside the repository",
  );
  assert.equal(
    pathsOverlap(physicalDist, physicalDirectory),
    false,
    "review output must not overlap live dist",
  );

  return normalizedDirectory;
}
