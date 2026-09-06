import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

export type JsonLdEntry = Readonly<Record<string, unknown>>;

/** Returns every generated HTML file below an artifact directory. */
export function getHtmlFiles(directory: string): Array<string> {
  return getFiles(directory, ".html");
}

/** Returns every generated stylesheet below an artifact directory. */
export function getCssFiles(directory: string): Array<string> {
  return getFiles(directory, ".css");
}

function getFiles(directory: string, extension: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return getFiles(entryPath, extension);
    }

    return entry.name.endsWith(extension) ? [entryPath] : [];
  });
}

/** Converts a generated `index.html` path to its canonical trailing-slash route. */
export function getRouteFromHtmlPath(
  htmlPath: string,
  distDirectory: string,
): string {
  const relativePath = relative(distDirectory, htmlPath);

  if (relativePath === "index.html") {
    return "/";
  }

  return `/${relativePath.replace(/\/index\.html$/, "")}/`;
}

/** Decodes the HTML entities emitted in generated attribute and text values. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|quot|#39|#x27|lt|gt);/g,
    (entity, name: string) => {
      const entities: Readonly<Record<string, string>> = {
        amp: "&",
        quot: '"',
        "#39": "'",
        "#x27": "'",
        lt: "<",
        gt: ">",
      };

      return entities[name] ?? entity;
    },
  );
}

/** Extracts exactly one captured HTML value and decodes common entities. */
export function getSingleMatch(
  html: string,
  pattern: RegExp,
  label: string,
): string {
  const matches = [...html.matchAll(pattern)];

  assert.equal(matches.length, 1, `${label} must appear exactly once`);
  return decodeHtmlEntities(matches[0]?.[1] ?? "");
}

/** Extracts the one JSON-LD object emitted in a generated document. */
export function getStructuredData(html: string, label: string): JsonLdEntry {
  return JSON.parse(
    getSingleMatch(
      html,
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      `${label} JSON-LD`,
    ),
  ) as JsonLdEntry;
}

/** Returns object entries from a JSON-LD graph. */
export function getGraphEntries(
  structuredData: JsonLdEntry,
  label: string,
): Array<JsonLdEntry> {
  const graph = structuredData["@graph"];

  assert.ok(Array.isArray(graph), `${label} JSON-LD must expose a graph`);
  return graph.filter(
    (entry): entry is JsonLdEntry =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

/** Extracts the accessible primary navigation from a generated document. */
export function getPrimaryNavigation(html: string): string {
  const matches = [
    ...html.matchAll(/<nav\b[^>]*aria-label="Primary"[^>]*>[\s\S]*?<\/nav>/gi),
  ];

  assert.equal(matches.length, 1, "each document must contain one primary navigation");
  return matches[0]?.[0] ?? "";
}

/** Extracts destination links from the primary navigation panel. */
export function getPrimaryDestinationHrefs(
  navigation: string,
): Array<string> {
  const panelMatch = navigation.match(
    /<div class="primary-navigation__panel"[^>]*>([\s\S]*?)<\/div>/,
  );

  assert.ok(panelMatch?.[1], "primary navigation must contain its destination panel");
  return [...panelMatch[1].matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Returns whether a generated document contains a `noindex` robots directive. */
export function isNoindexDocument(html: string): boolean {
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

/** Extracts generated image tags. */
export function getImages(html: string): Array<string> {
  return [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0] ?? "");
}

/** Asserts the intrinsic and responsive image fields emitted by `SquareImage`. */
export function assertGeneratedImageContract(
  image: string,
  label: string,
  fit: "contain" | "cover" = "contain",
): void {
  assert.match(image, /\bwidth="\d+"/, `${label} must emit intrinsic width`);
  assert.match(image, /\bheight="\d+"/, `${label} must emit intrinsic height`);
  assert.match(image, /\bsrcset="[^"]+"/, `${label} must emit responsive sources`);
  assert.match(image, /\bsizes="[^"]+"/, `${label} must emit responsive sizing`);
  assert.match(
    image,
    new RegExp(`data-astro-image-fit="${fit}"`),
    `${label} must use ${fit} fitting`,
  );
}

/** Extracts square-image wrappers emitted by `SquareImage`. */
export function getSquareImageWrappers(html: string): Array<string> {
  return [
    ...html.matchAll(
      /<div class="square-image(?:\s[^>]*)?"[^>]*>[\s\S]*?<\/div>/g,
    ),
  ].map((match) => match[0] ?? "");
}

/** Returns all generated images nested in square-image wrappers. */
export function getImagesInsideSquareWrappers(html: string): Array<string> {
  return getSquareImageWrappers(html).flatMap((wrapper) => getImages(wrapper));
}
