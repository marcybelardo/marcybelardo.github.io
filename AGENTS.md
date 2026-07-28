# Marceline Portfolio — Agent Guide

Static portfolio site for Marceline covering coding, photography, and painting. Built with **Astro + React + TypeScript + TailwindCSS v4**.

## Commands

```sh
pnpm dev       # localhost:4321
pnpm build     # production to ./dist/
pnpm preview   # preview production build
pnpm astro     # Astro CLI
pnpm test      # negative content validation, build, and Node tests
pnpm verify    # alias for pnpm test
```

No lint or typecheck scripts exist. `pnpm verify` is the validation step.

## Repo details an agent might miss

- **TailwindCSS** is v4, configured via `@tailwindcss/vite` plugin in `astro.config.mjs`. No `tailwind.config.*` or PostCSS config.
- **Path alias**: `@/*` → `./src/*` (set in `tsconfig.json`).
- **Node**: `>=22.12.0` required.
- **Deploy**: auto-deploy to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`).
- **RSS**: at `/rss.xml`, powered by `@astrojs/rss`.
- **`pnpm-workspace.yaml`** is single-package with restrictive build permissions (allows only `esbuild`/`sharp` install scripts).

## Content collections (`src/content/`)

Two collections are defined in `src/content.config.ts`: the loader-backed `project` collection under `src/content/projects/` and the `blog` collection under `src/content/blog/`.

Projects use explicit stable slugs, validated publication metadata, and optional image/link/relationship fields. Shared publication filtering and ordering rules live in `src/content/content-queries.ts`.

**Blog ID scheme** — IDs use a non-empty explicit frontmatter `slug` when present; otherwise they fall back to the first 4 alphanumeric words of `title`, lowercased and joined with `-` (not from the filename). Drafts (`draft: true`) are excluded in production builds.

Paintings and photography pages are currently placeholder ("Coming soon") — those sections are not yet implemented.

`pnpm test` runs the serial missing-image-alt validation fixture, the production build, and the dependency-free Node test suite. `pnpm verify` aliases `pnpm test`.

## Coding principles

1. **Simplicity** — Prefer built-in Astro/React features. No new deps without asking.
2. **Ask before acting** — Get approval for structural changes, new dependencies, non-trivial refactors.
3. **Stay consistent** — Match existing naming, organization, and style.
4. **Static only** — No SSR, no on-demand routes.

## Instructions for agents

1. When significant changes are made, update the AGENTS.md file
