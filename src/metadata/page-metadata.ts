// pattern: Functional Core

export const SITE_NAME = "Marceline Belardo";
export const SITE_ORIGIN = "https://www.marcelinebelardo.com";
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
  return new URL(pathname, siteOrigin).toString();
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
