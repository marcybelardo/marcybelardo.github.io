import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const codePath = resolve(distDirectory, "code", "index.html");

function getSquareImageWrappers(html: string): Array<string> {
  return [
    ...html.matchAll(
      /<div class="square-image(?:\s[^>]*)?"[^>]*>[\s\S]*?<\/div>/g,
    ),
  ].map((match) => match[0] ?? "");
}

test("Code uses square contain frames for portrait and landscape images", () => {
  assert.ok(existsSync(codePath), "Code output must exist before image assertions");

  const codeHtml = readFileSync(codePath, "utf8");
  const wrappers = getSquareImageWrappers(codeHtml);

  assert.equal(wrappers.length, 2);
  wrappers.forEach((wrapper) => {
    assert.match(wrapper, /style="aspect-ratio:\s*1;"/);
    assert.match(wrapper, /class="square-image__image/);
    assert.match(wrapper, /data-astro-image-fit="contain"/);
    assert.match(wrapper, /style="object-fit:\s*contain;"/);
  });

  assert.match(codeHtml, /alt="Marceline Belardo holding a camera, taking a selfie"/);
  assert.match(codeHtml, /\balt(?:="")?\s+sizes=/);
});

test("SquareImage output reserves intrinsic dimensions and responsive sources", () => {
  assert.ok(existsSync(codePath), "Code output must exist before image assertions");

  const codeHtml = readFileSync(codePath, "utf8");
  const images = [...codeHtml.matchAll(/<img\b[^>]*>/g)].map((match) => match[0] ?? "");

  assert.equal(images.length, 2);
  images.forEach((image) => {
    assert.match(image, /\bwidth="\d+"/);
    assert.match(image, /\bheight="\d+"/);
    assert.match(image, /\bsrcset="[^"]+"/);
    assert.match(image, /\bsizes="[^"]+"/);
    assert.doesNotMatch(image, /20260425_29[^"?]*\.jpg(?:["?]|$)/);
    assert.doesNotMatch(image, /IMG_6936_EDIT[^"?]*\.jpg(?:["?]|$)/);
  });

  assert.match(codeHtml, /\s320w/);
  assert.match(codeHtml, /\s1280w/);
});
