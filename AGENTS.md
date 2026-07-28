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

Projects use explicit stable slugs, validated publication metadata, and optional image/link/relationship fields. Shared publication filtering and ordering rules live in `src/content/content-queries.ts`; production blog detail and tag routes use those filters before generating static paths.

**Blog ID scheme** — IDs use a non-empty explicit frontmatter `slug` when present; otherwise they fall back to the first 4 alphanumeric words of `title`, lowercased and joined with `-` (not from the filename). Drafts (`draft: true`) are excluded in production builds.

The shared `BaseLayout` owns the accessible editorial header. Its only primary destinations are Projects, Blog, Bio, and Contact; Code, Paintings, and Photography remain migration/placeholder documents outside the primary navigation. The mobile panel is server-rendered open for a JavaScript-disabled baseline; the browser script adds `data-js-ready` and progressively enhances it into a closed, focus-managed menu.
Projects, Bio, and Contact are working static destinations. Projects reads published entries from the phase 1 collection, while Bio and Contact contain the verified profile copy and destinations until later phases expand their presentations.
The site-wide stylesheet defines the editorial visual tokens, typography, rules, focus-visible states, reduced-motion behavior, and print behavior. It intentionally has no external font imports.
`SquareImage` owns the shared square, uncropped, responsive image contract; the Code migration page exercises it with the verified portrait and landscape assets and passes a two-column-aware `sizes` value.

`pnpm test` runs serial missing-image-alt validation for project and blog images, verifies temporary draft routes stay out of production, runs the production build, and executes the dependency-free Node test suite. The generated-output tests cover no-JavaScript navigation and square-wrapper ancestry; `tests/navigation-runtime.test.ts` executes the built navigation script against a DOM harness for open/close, ARIA synchronization, focus, dismissal, and swap cleanup. `pnpm verify` aliases `pnpm test`.

`BaseLayout` owns the canonical metadata contract: every page supplies a title and description, while canonical paths resolve through the configured `Astro.site`; the shared origin is defined in `src/site-config.ts`. Current indexable output is checked for distinct self-canonicals and matching Open Graph/Twitter title and description values; the current 404 is the only `noindex` page.

## Coding principles

1. **Simplicity** — Prefer built-in Astro/React features. No new deps without asking.
2. **Ask before acting** — Get approval for structural changes, new dependencies, non-trivial refactors.
3. **Stay consistent** — Match existing naming, organization, and style.
4. **Static only** — No SSR, no on-demand routes.

## Instructions for agents

1. When significant changes are made, update the AGENTS.md file
