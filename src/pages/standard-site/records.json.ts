// pattern: Imperative Shell
//
// Build-time Standard.site records export.
//
// Publishing stays out of the site build: this endpoint only writes the records
// the site already owns. Drafts are counted but never rendered, and when no
// publication DID is configured the export is emitted in its disabled form so a
// preview deployment publishes no article data.

import { experimental_AstroContainer } from "astro/container";
import { getCollection, render, type CollectionEntry } from "astro:content";
import type { APIRoute } from "astro";

import {
  buildRecordExport,
  type RecordExportSource,
} from "../../standard-site/records.ts";
import { SITE_ORIGIN, getStandardSiteDid } from "../../site-config.ts";
import { getPublishedBlogPosts } from "../../content/content-queries.ts";

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL(SITE_ORIGIN);
  const container = await experimental_AstroContainer.create();
  const entries = await getCollection("blog");
  // Use the same publication query as production routes, even in dev.
  const publishedIds = new Set(getPublishedBlogPosts(entries, true).map((entry) => entry.id));
  const sources: RecordExportSource[] = [];

  for (const entry of entries) {
    const draft = !publishedIds.has(entry.id);

    sources.push({
      id: entry.id,
      slug: entry.data.slug,
      title: entry.data.title,
      date: entry.data.date,
      description: entry.data.description,
      tags: entry.data.tags,
      draft,
      // A draft body is never rendered, so it cannot reach the export.
      html: draft ? "" : await renderArticleHtml(entry, container, origin),
    });
  }

  const records = buildRecordExport({
    did: getStandardSiteDid(),
    siteOrigin: SITE_ORIGIN,
    sources,
  });

  return new Response(`${JSON.stringify(records, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
};

/**
 * Render the article body alone. The shared layout and the author signature are
 * site chrome, not document content, so neither is included.
 */
async function renderArticleHtml(
  entry: CollectionEntry<"blog">,
  container: Awaited<ReturnType<typeof experimental_AstroContainer.create>>,
  origin: URL,
): Promise<string> {
  const { Content } = await render(entry);

  return container.renderToString(Content, {
    partial: true,
    request: new Request(new URL(`/blog/${entry.id}/`, origin)),
  });
}
