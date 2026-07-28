# Portfolio redesign implementation plan — Phase 1

**Goal:** Establish validated project/blog content, shared publication rules, canonical site configuration, and page-specific metadata.

**Architecture:** Astro content loaders remain the source of truth. Pure query and metadata modules hold deterministic rules; Astro layouts and routes act as thin build-time shells. Project URLs use explicit stable slugs, while the existing blog ID algorithm remains as a compatibility fallback.

**Tech stack:** Astro 6.4, TypeScript, Astro content collections, Zod 4, Node 22 built-in test runner, `@astrojs/sitemap`, `@astrojs/markdown-remark`

**Scope:** 6 phases from the original design (phase 1 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC3: Unified project portfolio

- **portfolio-redesign.AC3.5 Failure:** Missing alt text for a required content-bearing image fails content validation.

### portfolio-redesign.AC5: SEO, discovery, and migrations

- **portfolio-redesign.AC5.1 Success:** Every indexable page has a distinct title, description, self-canonical URL, and social metadata.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->
<!-- START_TASK_1 -->
### Task 1: Add approved integrations and dependency-free test infrastructure

**Verifies:** None — infrastructure.

**Files:**

- Modify: `package.json:8-24`
- Modify: `pnpm-lock.yaml`
- Modify: `astro.config.mjs:1-14`
- Create: `tests/smoke.test.ts`

**Implementation:**

1. Add direct dependencies `@astrojs/sitemap@^3.7.3` and `@astrojs/markdown-remark@^7.2.0`. Do not add `remark-gfm`; Astro's unified processor already enables its compatible GFM plugin.
2. Add `"test": "pnpm build && node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts"` and `"verify": "pnpm test"` scripts. Every test file remains directly under `tests/`, so the package shell needs only a portable single-level glob. This uses Node 22's built-in runner and introduces no test framework.
3. Set `site` to `https://www.marcelinebelardo.com`.
4. Register `sitemap()` beside `react()`. Its migration-route filter is added in phase 6.
5. Leave the current Markdown configuration unchanged until the local rehype plugin exists in phase 5.
6. Add one smoke test proving the runner executes.

**Verification:**

Run: `pnpm install`

Expected: The lockfile resolves Astro-compatible sitemap and Markdown packages without changing unrelated dependency ranges.

Run: `pnpm test`

Expected: The existing ten-page static build and smoke test pass.

**Commit:** `chore: add redesign build integrations`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Define stable content contracts and shared publication queries

**Verifies:** portfolio-redesign.AC3.5

**Files:**

- Modify: `src/content.config.ts:1-52`
- Modify: `src/content/blog/the-devil-you-know.md:1-10`
- Create: `src/content/content-identifiers.ts`
- Create: `src/content/content-queries.ts`
- Create: `src/content/projects/lilyhttpd.md`
- Create: `src/content/projects/osborne.md`
- Create: `src/content/projects/cmprsr-rs.md`
- Create: `src/content/projects/portfolio-site.md`
- Create: `tests/content-queries.test.ts`
- Create: `tests/content-identifiers.test.ts`
- Create: `tests/content-validation-negative.mjs`

**Implementation:**

1. Keep the collection key `project` to minimize churn, but replace its nominal schema with a `glob()` loader rooted at `src/content/projects/`.
2. Require a `slug` and make `generateId` call a pure function from `content-identifiers.ts`. Validate `title`, `date`, `description`, non-empty `disciplines`, defaulted `tags`, optional `status`, defaulted `featured`/`draft`, positive integer `featuredOrder`, optional image/link/collaborator/role fields, defaulted `relatedProjects`/`relatedWriting` ID arrays, and URL formats.
3. Define the schema as `schema: ({ image }) => ...` so `coverImage` is `ImageMetadata`. Add an optional `gallery` array of `{ image: image(), imageAlt: nonEmptyString, caption?: string }`. Add a refinement: when `coverImage` is present, trimmed `coverImageAlt` must also be present. Do the same for blog `image`/`imageAlt`.
4. Add optional blog `slug`. Change the existing blog `generateId` to call a pure identifier function that prefers a non-empty explicit slug, then falls back to the exact legacy four-title-word algorithm. Add `slug: the-devil-you-know` to the tracked post so its published URL no longer depends on future title edits.
5. Require a non-empty blog description when `draft` is false; drafts may omit it while being authored. This makes distinct page metadata achievable for every published post.
6. Remove the unused `painting` and `photograph` collections.
7. Add pure, classified query functions in `content-queries.ts`: production publication filtering, date-descending sort with ID tie-breaker, featured-project sort (`featuredOrder`, date descending, ID), and recent-post limiting. Use `ReadonlyArray<T>` inputs and return new arrays.
8. Migrate only verified source material:
   - `lilyhttpd`, date `2025-06-14`, disciplines `[software]`, repository URL `https://github.com/marcybelardo/lilyhttpd`
   - `osborne`, date `2026-06-12`, disciplines `[software]`, repository URL `https://github.com/marcybelardo/osborne`
   - `cmprsr-rs`, date `2026-06-01`, disciplines `[software]`, repository URL `https://github.com/marcybelardo/cmprsr-rs`
   - `portfolio-site`, date `2026-06-04`, disciplines `[software, visual]`, repository URL `https://github.com/marcybelardo/marcybelardo.github.io`
   Preserve the existing descriptions and tags. Use short factual Markdown bodies; do not invent outcomes, collaborators, or images.
9. Mark selected entries featured with explicit, unique orders. Keep all four non-draft.
10. Add a serial negative-validation script that writes one exact temporary invalid entry at `src/content/projects/__invalid-alt.md`. Give it every required valid field and `coverImage: ../../assets/20260425_29.jpg`, but omit only `coverImageAlt`; assert `pnpm astro sync` fails with the paired-alt validation message, then remove the file in `finally`. Run this script before the normal build by changing `"test"` to `"node tests/content-validation-negative.mjs && pnpm build && node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts"`. Refuse to start if that exact temporary path already exists.

**Testing:**

Tests must verify each AC listed above:

- portfolio-redesign.AC3.5: the serial negative Astro sync proves a cover image without alt text fails content validation and always cleans up its exact temporary file.

Also unit-test the pure identifier functions for title-independent project IDs, the legacy blog fallback, and the explicit published blog slug. Assert publication filtering, query tie-breaking, and input immutability without importing `src/content.config.ts` into Node. Full draft route exclusion is verified once the relevant project/blog routes exist in phases 3 and 5.

**Verification:**

Run: `pnpm test`

Expected: Query tests pass, content sync validates all four projects, and `/blog/the-devil-you-know/` still builds.

**Commit:** `feat: define unified content contracts`
<!-- END_TASK_2 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->
<!-- START_TASK_3 -->
### Task 3: Implement the canonical metadata contract

**Verifies:** portfolio-redesign.AC5.1

**Files:**

- Create: `src/metadata/page-metadata.ts`
- Modify: `src/layouts/BaseLayout.astro:1-141`
- Modify: `src/pages/index.astro:1-17`
- Modify: `src/pages/code/index.astro:1-153`
- Modify: `src/pages/paintings/index.astro:1-16`
- Modify: `src/pages/photography/index.astro:1-16`
- Modify: `src/pages/blog/index.astro:1-62`
- Modify: `src/pages/blog/[...slug]/index.astro:1-51`
- Modify: `src/pages/blog/tags/[tag].astro:1-63`
- Modify: `src/pages/404.astro:1-16`
- Create: `tests/page-metadata.test.ts`
- Create: `tests/generated-metadata.test.ts`

**Implementation:**

1. Create a classified Functional Core module with readonly types and pure helpers for site-title composition, canonical URLs, social image URLs, robots values, and JSON-LD serialization. Canonicals must use the configured site origin, never the preview request origin.
2. Give `BaseLayout` required `title` and `description` props plus optional `canonicalPath`, `canonicalUrl`, `robots`, `socialImage`, `socialImageAlt`, `socialType`, and `structuredData`.
3. Build the default self-canonical with `new URL(canonicalPath ?? Astro.url.pathname, Astro.site)`. Allow `canonicalUrl` only for migration documents whose canonical destination differs from their own path.
4. Emit title, description, canonical, Open Graph, Twitter card, optional robots, and optional JSON-LD. Escape JSON-LD safely before placing it in a script element.
5. Update every current `BaseLayout` call with distinct, factual metadata so the intermediate site continues to build. Use `noindex` for the current 404 only; migration noindex metadata is completed in phase 6.

**Testing:**

Tests must verify portfolio-redesign.AC5.1:

- distinct titles/descriptions and self-canonicals for current indexable output;
- canonical construction from the configured origin;
- correct omission of optional robots/JSON-LD;
- safe JSON-LD serialization;
- Open Graph and Twitter values mirror visible page metadata.

**Verification:**

Run: `pnpm test`

Expected: Unit and generated-HTML metadata assertions pass with no canonical or social URL using `marcybelardo.github.io`.

**Commit:** `feat: add canonical page metadata`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Verify phase 1 content and metadata foundations

**Verifies:** portfolio-redesign.AC3.5, portfolio-redesign.AC5.1

**Files:**

- Modify: `tests/generated-metadata.test.ts`
- Modify: `tests/content-queries.test.ts`

**Implementation:**

1. Assert all four published project IDs are stable and no title-derived project IDs appear.
2. Assert the tracked blog route remains `/blog/the-devil-you-know/`.
3. Assert every currently indexable HTML document has one title, description, canonical, `og:url`, and social title/description.

**Verification:**

Run: `pnpm verify`

Expected: Production build and all phase 1 assertions pass.

**Commit:** `test: verify content and metadata foundations`
<!-- END_TASK_4 -->
<!-- END_SUBCOMPONENT_B -->
