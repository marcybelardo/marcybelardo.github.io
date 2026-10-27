import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { generateBlogId } from "../src/content/content-identifiers.ts";
import { getPublishedBlogPosts, getBlogTagArchives } from "../src/content/content-queries.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Derive website expectations independently from authored content, not the
// Standard.site export whose generated output is checked by other tests.
async function readPosts(directory: string): Promise<Array<{
  id: string;
  data: { title: string; slug?: string; date: Date; description?: string; tags: string[]; draft: boolean };
}>> {
  const posts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      posts.push(...await readPosts(path));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      const { frontmatter } = parseFrontmatter(await readFile(path, "utf8"));
      const data = {
        ...frontmatter,
        title: String(frontmatter.title).trim(),
        ...(typeof frontmatter.slug === "string" ? { slug: frontmatter.slug.trim() } : {}),
        date: new Date(frontmatter.date),
        description: typeof frontmatter.description === "string" ? frontmatter.description.trim() : undefined,
        tags: (frontmatter.tags ?? []).map((tag: string) => tag.trim()),
        draft: frontmatter.draft ?? false,
      };
      posts.push({ id: generateBlogId(data), data });
    }
  }
  return posts;
}

export const publishedPosts = getPublishedBlogPosts(
  await readPosts(resolve(repositoryRoot, "src/content/blog")), true,
);
export const publishedTags = getBlogTagArchives(publishedPosts, true);
export const publishedBlogRoutes = [
  ...publishedPosts.map((post) => `/blog/${post.id}/`),
  ...publishedTags.map((tag) => `/blog/tags/${tag.slug}/`),
].sort();
