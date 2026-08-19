// pattern: Imperative Shell
import rss from "@astrojs/rss";
import { experimental_AstroContainer } from "astro/container";
import { getCollection, render } from "astro:content";

import BlogAuthorSignature from "../components/BlogAuthorSignature.astro";
import { getPublishedBlogPosts } from "../content/content-queries.ts";
import { normalizeRootRelativeUrls } from "../content/rss-content.ts";
import { SITE_ORIGIN } from "../site-config.ts";

async function renderRssComponent(container, component, request) {
  return container.renderToString(component, {
    partial: true,
    request,
  });
}

async function renderPostContent(post, container, site) {
  const { Content } = await render(post);
  const request = new Request(new URL(`/blog/${post.id}/`, site));
  const body = await renderRssComponent(container, Content, request);
  const signature = await renderRssComponent(
    container,
    BlogAuthorSignature,
    request,
  );

  return normalizeRootRelativeUrls(`${body}${signature}`, site);
}

async function renderRssItems(posts, container, site) {
  const items = [];

  for (const post of posts) {
    items.push({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      content: await renderPostContent(post, container, site),
      ...(post.data.tags.length > 0 ? { categories: post.data.tags } : {}),
    });
  }

  return items;
}

export async function GET(context) {
  const site = context.site ?? SITE_ORIGIN;
  const posts = getPublishedBlogPosts(await getCollection("blog"), true);
  const container = await experimental_AstroContainer.create();

  return rss({
    title: "Art Computer Insanity Posting",
    description: "Marceline Belardo's thoughts on tech, politics, and art",
    site,
    items: await renderRssItems(posts, container, site),
  });
}
