// pattern: Functional Core

import { SITE_ORIGIN } from "../site-config.ts";

const QUOTE = /["']/;

/**
 * Resolve root-relative links and images in rendered HTML without changing
 * URLs that are already absolute, protocol-relative, or non-attribute text.
 */
export function normalizeRootRelativeUrls(
  html: string,
  site: string | URL = SITE_ORIGIN,
): string {
  let normalized = "";
  let cursor = 0;

  while (cursor < html.length) {
    const openingTag = html.indexOf("<", cursor);

    if (openingTag === -1) {
      return `${normalized}${html.slice(cursor)}`;
    }

    normalized += html.slice(cursor, openingTag);

    if (html.startsWith("<!--", openingTag)) {
      const commentEnd = html.indexOf("-->", openingTag + 4);

      if (commentEnd === -1) {
        return `${normalized}${html.slice(openingTag)}`;
      }

      normalized += html.slice(openingTag, commentEnd + 3);
      cursor = commentEnd + 3;
      continue;
    }

    if (html.startsWith("<!", openingTag) || html.startsWith("<?", openingTag)) {
      const declarationEnd = findTagEnd(html, openingTag);

      if (declarationEnd === -1) {
        return `${normalized}${html.slice(openingTag)}`;
      }

      normalized += html.slice(openingTag, declarationEnd + 1);
      cursor = declarationEnd + 1;
      continue;
    }

    if (!isHtmlTagStart(html, openingTag)) {
      normalized += "<";
      cursor = openingTag + 1;
      continue;
    }

    const closingTag = findTagEnd(html, openingTag);

    if (closingTag === -1) {
      return `${normalized}${html.slice(openingTag)}`;
    }

    normalized += normalizeTag(html.slice(openingTag, closingTag + 1), site);
    cursor = closingTag + 1;
  }

  return normalized;
}

function isHtmlTagStart(html: string, openingTag: number): boolean {
  const firstCharacter = html[openingTag + 1] ?? "";

  if (/^[A-Za-z]$/.test(firstCharacter)) {
    return true;
  }

  return firstCharacter === "/" && /^[A-Za-z]$/.test(html[openingTag + 2] ?? "");
}

function findTagEnd(html: string, openingTag: number): number {
  let quote = "";

  for (let cursor = openingTag + 1; cursor < html.length; cursor += 1) {
    const character = html[cursor];

    if (quote) {
      if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return cursor;
    }
  }

  return -1;
}

function normalizeTag(tag: string, site: string | URL): string {
  let normalized = "";
  let cursor = 0;

  while (cursor < tag.length) {
    const character = tag[cursor];

    if (QUOTE.test(character)) {
      const closingQuote = tag.indexOf(character, cursor + 1);

      if (closingQuote === -1) {
        return `${normalized}${tag.slice(cursor)}`;
      }

      normalized += tag.slice(cursor, closingQuote + 1);
      cursor = closingQuote + 1;
      continue;
    }

    if (/\s/.test(character)) {
      const attribute = tag.slice(cursor).match(
        /^(\s+(?:href|src)\s*=\s*)(["'])(\/(?!\/)[^"']*)\2/i,
      );

      if (attribute) {
        const [, prefix, quote, path] = attribute;
        const absoluteUrl = new URL(path, site).toString();

        normalized += `${prefix}${quote}${absoluteUrl}${quote}`;
        cursor += attribute[0].length;
        continue;
      }
    }

    normalized += character;
    cursor += 1;
  }

  return normalized;
}
