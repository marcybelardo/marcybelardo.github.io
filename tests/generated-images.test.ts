import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertGeneratedImageContract,
  getImages,
  getImagesInsideSquareWrappers,
  getSquareImageWrappers,
} from "./generated-artifact-helpers.ts";
import { getGeneratedProjectSlugs } from "./generated-project-artifacts.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(repositoryRoot, "dist");
const squareImageSource = readFileSync(
  resolve(repositoryRoot, "src/components/SquareImage.astro"),
  "utf8",
);
const bioDesignSource = readFileSync(
  resolve(repositoryRoot, "src/styles/bio-design.css"),
  "utf8",
);
const bioPath = resolve(distDirectory, "bio", "index.html");
const representativePaths: ReadonlyArray<string> = [
  resolve(distDirectory, "index.html"),
  resolve(distDirectory, "blog", "index.html"),
  resolve(distDirectory, "blog", "the-devil-you-know", "index.html"),
  resolve(distDirectory, "blog", "tags", "ai", "index.html"),
  bioPath,
  ...getGeneratedProjectSlugs(distDirectory).map((slug) =>
    resolve(distDirectory, "projects", slug, "index.html")
  ),
  resolve(distDirectory, "404.html"),
];

function getBioPortraitFrames(html: string): Array<string> {
  return [...html.matchAll(/<figure class="bio-portrait-frame">([\s\S]*?)<\/figure>/g)].map(
    (match) => match[0] ?? "",
  );
}

function getImagesInsideBioPortraitFrames(html: string): Array<string> {
  return getBioPortraitFrames(html).flatMap((frame) => getImages(frame));
}

test("Bio uses a full-image grayscale portrait triptych", () => {
  assert.ok(existsSync(bioPath), "Bio output must exist before image assertions");

  const bioHtml = readFileSync(bioPath, "utf8");
  const frames = getBioPortraitFrames(bioHtml);

  assert.equal(frames.length, 3);
  frames.forEach((frame) => {
    assert.match(frame, /data-astro-image-fit="contain"/);
    assert.match(frame, /style="object-fit:\s*contain;"/);
  });

  assert.match(bioHtml, /alt="Marceline Belardo taking a mirror photograph with a camera"/);
  assert.equal(getImagesInsideBioPortraitFrames(bioHtml).length, 3);
  assert.match(bioDesignSource, /\.bio-portrait-frame\s*\{[\s\S]*aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(bioDesignSource, /\.bio-portrait-frame__image\s*\{[\s\S]*filter:\s*grayscale\(100%\)/);
  assert.equal(
    getImagesInsideBioPortraitFrames(bioHtml).length,
    getImages(bioHtml).length,
    "every Bio image must be contained by a portrait frame",
  );
});

test("Bio images reserve intrinsic dimensions and responsive sources", () => {
  assert.ok(existsSync(bioPath), "Bio output must exist before image assertions");

  const bioHtml = readFileSync(bioPath, "utf8");
  const images = getImages(bioHtml);

  assert.equal(images.length, 3);
  images.forEach((image) => {
    assertGeneratedImageContract(image, "Bio image");
    assert.match(image, /\bloading="(?:lazy|eager)"/);
    assert.doesNotMatch(image, /20260425_29[^"?]*\.jpg(?:["?]|$)/);
    assert.doesNotMatch(image, /IMG_6936_EDIT[^"?]*\.jpg(?:["?]|$)/);
  });

  assert.match(bioHtml, /\s320w/);
  assert.match(bioHtml, /\s1280w/);
  assert.match(
    bioHtml,
    /sizes="\(min-width: 55rem\) 15vw, \(min-width: 35rem\) 18vw, 30vw"/,
    "Bio images must use responsive panel widths",
  );
  assert.doesNotMatch(
    bioHtml,
    /sizes="[^"]*100vw/,
    "Bio image sizing must not overstate the layout width with 100vw",
  );
});

test("SquareImage requires an explicit decorative classification for empty alt text", () => {
  assert.match(squareImageSource, /decorative\?: false/);
  assert.match(squareImageSource, /alt:\s*""[\s\S]*decorative:\s*true/);
  assert.match(squareImageSource, /alt === "" && decorative !== true/);
});

test("representative pages contain only valid generated image markup", () => {
  representativePaths.forEach((htmlPath) => {
    assert.ok(existsSync(htmlPath), `${htmlPath} must exist before image assertions`);
    const html = readFileSync(htmlPath, "utf8");
    const images = getImages(html);
    const isHomepage = htmlPath === resolve(distDirectory, "index.html");
    const heroImages = isHomepage ? images.filter((image) => image.includes('class="home-photograph__image"')) : [];
    assert.ok(heroImages.length <= 1, "only one homepage photograph may use cover framing");
    heroImages.forEach((image) => {
      assert.match(image, /alt="[^"\s][^"]+"/);
      assert.match(
        image,
        /sizes="\(max-width: 35rem\) 100vw, min\(72vw, 64rem\)"/,
        "homepage photo sizes must match its constrained frame",
      );
      assert.match(image, /fetchpriority="high"/);
      assert.ok(html.includes('<figure class="home-photograph">'));
    });

    images.forEach((image) => {
      assertGeneratedImageContract(image, `${htmlPath} image`, heroImages.includes(image) ? "cover" : "contain");
    });

    assert.equal(
      getImagesInsideSquareWrappers(html).length +
        (htmlPath === bioPath ? getImagesInsideBioPortraitFrames(html).length : 0),
      images.length - heroImages.length,
      `${htmlPath} must contain every emitted image inside an appropriate contained-image frame`,
    );
  });
});
