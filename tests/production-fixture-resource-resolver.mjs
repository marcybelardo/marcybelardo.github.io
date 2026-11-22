import assert from "node:assert/strict";
import { relative, resolve, sep } from "node:path";

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..");
}

export function resolveRetainedResource(directory, source, referringFile) {
  const retainedDirectory = resolve(directory);
  const retainedReferrer = resolve(referringFile);
  const relativeReferrer = relative(retainedDirectory, retainedReferrer);

  assert.ok(
    isWithin(retainedDirectory, retainedReferrer),
    `referring file must remain inside retained output: ${referringFile}`,
  );

  const referringUrlPath = relativeReferrer
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const isRootRelative = source.startsWith("/");
  const retainedRootMarker = "/__retained_output_root__/";
  const referringUrl = new URL(
    isRootRelative ? "/" : `${retainedRootMarker}${referringUrlPath}`,
    "https://retained-output.invalid/",
  );
  const resolvedUrl = new URL(source, referringUrl);
  let pathname = decodeURIComponent(resolvedUrl.pathname);

  if (!isRootRelative) {
    assert.ok(
      pathname.startsWith(retainedRootMarker),
      `${source} must remain inside retained output`,
    );
    pathname = `/${pathname.slice(retainedRootMarker.length)}`;
  }

  const resourcePath = resolve(retainedDirectory, pathname.replace(/^\//, ""));
  assert.ok(
    isWithin(retainedDirectory, resourcePath),
    `${source} must remain inside retained output`,
  );

  return {
    path: resourcePath,
    isDirectory: pathname.endsWith("/"),
  };
}
