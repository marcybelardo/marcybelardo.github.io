// pattern: Functional Core

type ProjectIdentifierInput = {
  readonly slug: unknown;
  readonly title?: unknown;
};

type BlogIdentifierInput = {
  readonly title: unknown;
  readonly slug?: unknown;
};

export function generateProjectId(input: ProjectIdentifierInput): string {
  if (typeof input.slug !== "string" || input.slug.trim().length === 0) {
    throw new Error("project slug must be a non-empty string");
  }

  return input.slug.trim();
}

export function generateBlogId(input: BlogIdentifierInput): string {
  if (typeof input.slug === "string" && input.slug.trim().length > 0) {
    return input.slug.trim();
  }

  return generateLegacyBlogId(input.title);
}

export function generateLegacyBlogId(title: unknown): string {
  const normalizedTitle = typeof title === "string" ? title : "";

  return normalizedTitle
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .toLowerCase();
}
