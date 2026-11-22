// pattern: Imperative Shell

import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { parseFrontmatter } from "@astrojs/markdown-remark";

import { generateBlogId } from "../../src/content/content-identifiers.ts";
import { PublisherError } from "./types.ts";

/** Blog source directory, relative to the repository root. */
export const BLOG_SOURCE_DIRECTORY = "src/content/blog";

/**
 * What the source tree promises about the upcoming build.
 *
 * Only identities are retained: paths and rendered bodies are deliberately not
 * carried forward, so the authoritative record data must come from the fresh
 * Astro build rather than from this preflight pass.
 */
export interface BlogSourcePreflight {
  /** Published posts with an explicit slug, which the export documents, sorted. */
  readonly publishedSlugs: readonly string[];
  /** Number of draft sources the build is expected to exclude. */
  readonly draftsExcluded: number;
  /**
   * Published posts without an explicit slug, listed by their title-derived
   * route ID. These keep their website route but are not exported, so a
   * non-empty list blocks publishing.
   */
  readonly missingSlugIds: readonly string[];
}

interface SourceFrontmatter {
  readonly slug?: unknown;
  readonly title?: unknown;
  readonly draft?: unknown;
}

async function assertNoSymlinkComponents(path: string, label: string): Promise<void> {
  let current: string = sep;
  for (const component of path.split(sep).filter(Boolean)) {
    current = join(current, component);
    let entry;
    try {
      entry = await lstat(current);
    } catch {
      // A missing final directory is reported by assertDirectory with a
      // clearer message.
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new PublisherError(`${label} may not contain symlink component: ${current}`);
    }
  }
}

async function assertDirectory(path: string, label: string): Promise<void> {
  let entry;
  try {
    entry = await lstat(path);
  } catch {
    throw new PublisherError(`${label} is missing: ${path}`);
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new PublisherError(`${label} is missing or unsafe: ${path}`);
  }
}

/**
 * Collect Markdown/MDX sources without following any symlink.
 *
 * `readdir` reports link entries from the directory itself, so rejection
 * happens before a descendant link could be traversed.
 */
async function collectMarkdownFiles(root: string): Promise<readonly string[]> {
  const results: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new PublisherError(`blog source directory may not contain symlink: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
      ) {
        results.push(path);
      }
    }
  }

  await visit(root);
  return results.sort((left, right) =>
    relative(root, left).localeCompare(relative(root, right)),
  );
}

async function readSource(path: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new PublisherError(`could not read blog source ${path}`, { cause: error });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PublisherError(`${path}: invalid UTF-8`, { cause: error });
    }
    throw error;
  }
}

function explicitSlugOf(frontmatter: SourceFrontmatter): string | undefined {
  const slug = frontmatter.slug;
  if (typeof slug !== "string" || slug.trim().length === 0) return undefined;
  return slug.trim();
}

/**
 * Inspect the blog sources before the build, without rendering or network
 * access.
 *
 * Astro's public frontmatter parser is used only to count drafts, detect
 * duplicate published identities, build the expected document membership, and
 * derive legacy route IDs. Any rejection here must stop the workflow before a
 * build or authentication begins.
 */
export async function preflightBlogSources(
  repositoryRoot: string,
  blogDirectory: string = BLOG_SOURCE_DIRECTORY,
): Promise<BlogSourcePreflight> {
  const root = resolve(repositoryRoot, blogDirectory);
  await assertNoSymlinkComponents(root, "blog source directory");
  await assertDirectory(root, "blog source directory");

  const files = await collectMarkdownFiles(root);
  const explicitSlugs = new Map<string, string>();
  const legacyIds = new Map<string, string>();
  const missingSlugIds: string[] = [];
  let draftsExcluded = 0;

  for (const path of files) {
    const source = await readSource(path);
    let frontmatter: SourceFrontmatter;
    try {
      frontmatter = parseFrontmatter(source).frontmatter as SourceFrontmatter;
    } catch (error) {
      throw new PublisherError(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }

    if (frontmatter.draft === true) {
      draftsExcluded += 1;
      continue;
    }

    const slug = explicitSlugOf(frontmatter);
    if (slug !== undefined) {
      const previous = explicitSlugs.get(slug);
      if (previous !== undefined) {
        throw new PublisherError(
          `${path}: duplicate explicit published slug ${slug}; already used by ${previous}`,
        );
      }
      const legacyOwner = legacyIds.get(slug);
      if (legacyOwner !== undefined) {
        throw new PublisherError(
          `${path}: duplicate published blog ID ${slug}; already used by ${legacyOwner}`,
        );
      }
      explicitSlugs.set(slug, path);
      continue;
    }

    const id = generateBlogId({ title: frontmatter.title });
    if (!id) {
      throw new PublisherError(
        `${path}: published post has an empty legacy blog ID; set an explicit slug`,
      );
    }
    if (legacyIds.has(id)) {
      throw new PublisherError(
        `${path}: duplicate published blog ID ${id}; already used by ${legacyIds.get(id)}`,
      );
    }
    if (explicitSlugs.has(id)) {
      throw new PublisherError(
        `${path}: duplicate published blog ID ${id}; already used by ${explicitSlugs.get(id)}`,
      );
    }
    legacyIds.set(id, path);
    missingSlugIds.push(id);
  }

  return {
    publishedSlugs: [...explicitSlugs.keys()].sort((left, right) =>
      left.localeCompare(right),
    ),
    draftsExcluded,
    missingSlugIds: missingSlugIds.sort((left, right) => left.localeCompare(right)),
  };
}
