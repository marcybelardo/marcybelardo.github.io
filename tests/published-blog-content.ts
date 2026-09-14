import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverBlogSources } from "../src/standard-site/converter.ts";
import { generateBlogId } from "../src/content/content-identifiers.ts";
import { getPublishedBlogPosts, getBlogTagArchives } from "../src/content/content-queries.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = await discoverBlogSources(resolve(repositoryRoot, "src/content/blog"));
export const publishedPosts = getPublishedBlogPosts(sources.map((source) => ({
  id: generateBlogId(source.frontmatter),
  data: { ...source.frontmatter, date: new Date(source.frontmatter.date) },
})), true);
export const publishedTags = getBlogTagArchives(publishedPosts, true);
export const publishedBlogRoutes = [
  ...publishedPosts.map((post) => `/blog/${post.id}/`),
  ...publishedTags.map((tag) => `/blog/tags/${tag.slug}/`),
].sort();
