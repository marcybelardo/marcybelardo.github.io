// pattern: Functional Core

import { SITE_ORIGIN } from "../site-config.ts";

export const SITE_NAME = "Marceline Belardo";
export { SITE_ORIGIN } from "../site-config.ts";
export const INDEXABLE_ROBOTS = "index, follow";
export const NOINDEX_ROBOTS = "noindex, nofollow";

export type SiteOrigin = string | URL;

export type JsonLdObject = Readonly<Record<string, unknown>>;

export function composeSiteTitle(pageTitle: string): string {
  const normalizedTitle = pageTitle.trim();

  if (normalizedTitle.length === 0 || normalizedTitle === SITE_NAME) {
    return SITE_NAME;
  }

  return `${normalizedTitle} | ${SITE_NAME}`;
}

export function createCanonicalUrl(
  pathname: string,
  siteOrigin: SiteOrigin = SITE_ORIGIN,
): string {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\")
  ) {
    throw new Error("canonical path must be an internal absolute path");
  }

  const canonicalUrl = new URL(pathname, siteOrigin);
  const configuredOrigin = new URL(siteOrigin);

  if (canonicalUrl.origin !== configuredOrigin.origin) {
    throw new Error("canonical path must resolve to the configured site origin");
  }

  return canonicalUrl.toString();
}

export function createSocialImageUrl(
  imagePath: string,
  siteOrigin: SiteOrigin = SITE_ORIGIN,
): string {
  return new URL(imagePath, siteOrigin).toString();
}

export function getRobotsValue(isIndexable: boolean): string {
  return isIndexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS;
}

export function serializeJsonLd(data: JsonLdObject): string {
  const serialized = JSON.stringify(data);

  if (serialized === undefined) {
    throw new Error("failed to serialize JSON-LD data");
  }

  return serialized.replace(/[<>&]/g, (character) => {
    const escapedCharacters: Readonly<Record<string, string>> = {
      "<": "\\u003C",
      ">": "\\u003E",
      "&": "\\u0026",
    };

    return escapedCharacters[character] ?? character;
  });
}
