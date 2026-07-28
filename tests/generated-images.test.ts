import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const codePath = resolve(distDirectory, "code", "index.html");
const representativePaths: ReadonlyArray<string> = [
  resolve(distDirectory, "index.html"),
  resolve(distDirectory, "blog", "index.html"),
  resolve(distDirectory, "blog", "the-devil-you-know", "index.html"),
  resolve(distDirectory, "blog", "tags", "ai", "index.html"),
  codePath,
  resolve(distDirectory, "paintings", "index.html"),
  resolve(distDirectory, "photography", "index.html"),
  resolve(distDirectory, "404.html"),
];

function getSquareImageWrappers(html: string): Array<string> {
  return [
    ...html.matchAll(
      /<div class="square-image(?:\s[^>]*)?"[^>]*>[\s\S]*?<\/div>/g,
    ),
  ].map((match) => match[0] ?? "");
}

function getImages(html: string): Array<string> {
  return [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0] ?? "");
}

function getImagesInsideSquareWrappers(html: string): Array<string> {
  return getSquareImageWrappers(html).flatMap((wrapper) => getImages(wrapper));
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
  assert.equal(
    getImagesInsideSquareWrappers(codeHtml).length,
    getImages(codeHtml).length,
    "every Code image must be contained by a square-image frame",
  );
});

test("SquareImage output reserves intrinsic dimensions and responsive sources", () => {
  assert.ok(existsSync(codePath), "Code output must exist before image assertions");

  const codeHtml = readFileSync(codePath, "utf8");
  const images = getImages(codeHtml);

  assert.equal(images.length, 2);
  images.forEach((image) => {
    assert.match(image, /\bwidth="\d+"/);
    assert.match(image, /\bheight="\d+"/);
    assert.match(image, /\bsrcset="[^"]+"/);
    assert.match(image, /\bsizes="[^"]+"/);
    assert.match(image, /\bloading="lazy"/);
    assert.doesNotMatch(image, /20260425_29[^"?]*\.jpg(?:["?]|$)/);
    assert.doesNotMatch(image, /IMG_6936_EDIT[^"?]*\.jpg(?:["?]|$)/);
  });

  assert.match(codeHtml, /\s320w/);
  assert.match(codeHtml, /\s1280w/);
  assert.match(
    codeHtml,
    /sizes="auto"/,
    "Code images must let the browser use their scrollbar-excluding rendered width",
  );
  assert.doesNotMatch(
    codeHtml,
    /sizes="[^"]*100vw/,
    "Code image sizing must not overstate the layout width with 100vw",
  );
});

test("representative pages contain only valid generated image markup", () => {
  representativePaths.forEach((htmlPath) => {
    assert.ok(existsSync(htmlPath), `${htmlPath} must exist before image assertions`);
    const html = readFileSync(htmlPath, "utf8");
    const images = getImages(html);

    images.forEach((image) => {
      assert.match(image, /\bwidth="\d+"/);
      assert.match(image, /\bheight="\d+"/);
      assert.match(image, /\bsrcset="[^"]+"/);
      assert.match(image, /\bsizes="[^"]+"/);
      assert.match(image, /data-astro-image-fit="contain"/);
    });

    assert.equal(
      getImagesInsideSquareWrappers(html).length,
      images.length,
      `${htmlPath} must contain every emitted image inside a square-image frame`,
    );
  });
});
