// pattern: Imperative Shell
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

import { getPublishedBlogPosts } from "../content/content-queries.ts";

export async function GET(context) {
  const posts = getPublishedBlogPosts(await getCollection("blog"), true);

  return rss({
    title: "Art Computer Insanity Posting",
    description: "Marceline Belardo's thoughts on tech, politics, and art",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      ...(post.data.tags.length > 0 ? { categories: post.data.tags } : {}),
    })),
  });
}
