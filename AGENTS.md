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
The Projects index is a single editorial list backed by `ProjectIndexEntry`; published project IDs generate static case-study routes under `/projects/<slug>/` through `ProjectLayout`. Project covers and galleries use `SquareImage`, and related project/writing links are resolved against published entries while preserving frontmatter order.
The homepage uses deterministic featured-project and recent-writing queries, keeps the practice statement and contact prompt required, and omits empty optional sections together with their headings. Bio and Contact reuse the verified Code-page copy, portrait, email, and profile destinations without fabricating résumé or availability details.
Blog indexes, detail routes, and tag archives use the shared published-post/date-order query and normalized tag-slug/archive contract. Production static paths exclude draft posts while preserving the existing post and tag URLs.
Astro Markdown keeps built-in GFM footnotes and applies the local rehype margin-note annotation plugin atomically only when every generated reference and definition is covered, preserving semantic links, backlinks, and one definition copy.
Blog detail pages keep the generated footnote section as the baseline and progressively enhance it with the injected margin-note controller only after wide-layout measurements succeed; notes move under a semantic rail list, print generations suppress stale callbacks, and restoration failures keep a visible cleanup state with original-position anchors.
The site-wide stylesheet defines the editorial visual tokens, typography, rules, focus-visible states, reduced-motion behavior, and print behavior. It intentionally has no external font imports.
`SquareImage` owns the shared square, uncropped, responsive image contract; the Code migration page exercises it with the verified portrait and landscape assets and uses lazy `sizes="auto"` so the browser selects against the scrollbar-excluding rendered width.

`pnpm test` runs serial missing-image-alt and invalid-project-URL validation, verifies temporary draft routes stay out of production, builds full optional-field and no-optionals project fixtures while excluding the draft fixture, runs the clean production build, and executes the dependency-free Node test suite. The generated-output tests cover project index/detail routes, tag-free visible JSON-LD, no-cover index measure variants, prose-only `.md`/`.mdx` bodies across Markdown/HTML/JSX image forms, intrinsic responsive square-image contracts for cover and gallery images, no-optionals section omission, no-JavaScript navigation, and relationship filtering; `tests/margin-note-layout.test.ts` covers ordered collision-free offsets, `tests/margin-notes.test.ts` covers injected-port restoration and cleanup failures, and `tests/margin-notes-browser.test.ts` exercises `initializeMarginNotes()` against before/after-print events, media-query changes, resize scheduling, incomplete coverage, and restoration failures; `tests/navigation-runtime.test.ts` executes the built navigation script against a browser-event-order DOM harness for open/close, deferred outside-click focus restoration, breakpoint ARIA synchronization, and complete swap listener cleanup. `pnpm verify` aliases `pnpm test`.

`BaseLayout` owns the canonical metadata contract: every page supplies a title and description, while canonical paths resolve through the configured `Astro.site`; the shared origin is defined in `src/site-config.ts`. Current indexable output is checked for distinct self-canonicals and matching Open Graph/Twitter title and description values; the current 404 is the only `noindex` page.

## Coding principles

1. **Simplicity** — Prefer built-in Astro/React features. No new deps without asking.
2. **Ask before acting** — Get approval for structural changes, new dependencies, non-trivial refactors.
3. **Stay consistent** — Match existing naming, organization, and style.
4. **Static only** — No SSR, no on-demand routes.

## Instructions for agents

1. When significant changes are made, update the AGENTS.md file
