// pattern: Imperative Shell

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Returns every generated project detail slug without assuming a fixed collection size.
 */
export function getGeneratedProjectSlugs(distDirectory: string): Array<string> {
  const projectsDirectory = resolve(distDirectory, "projects");

  if (!existsSync(projectsDirectory)) {
    throw new Error("generated projects directory must exist");
  }

  return readdirSync(projectsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(projectsDirectory, entry.name, "index.html")),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Returns the canonical route for each generated project detail.
 */
export function getGeneratedProjectRoutes(
  distDirectory: string,
): Array<string> {
  return getGeneratedProjectSlugs(distDirectory).map(
    (slug) => `/projects/${slug}/`,
  );
}
