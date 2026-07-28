# Portfolio redesign implementation plan — Phase 5

**Goal:** Integrate the blog with shared publication rules, responsive semantic footnotes, structured data, and canonical RSS output.

**Architecture:** Blog routes consume one published-post query and one tag-slug contract. Astro's unified Markdown processor keeps its built-in GFM footnotes; a local rehype plugin only annotates the generated reference/definition nodes. Browser enhancement moves the same note nodes into a margin rail only after successful measurement.

**Tech stack:** Astro 6.4, TypeScript, `@astrojs/markdown-remark` 7.2, `@astrojs/rss` 4.0, framework-free browser DOM

**Scope:** 6 phases from the original design (phase 5 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.4 Failure:** Draft projects or posts generate no production detail pages.

### portfolio-redesign.AC4: Visual system and footnotes

- **portfolio-redesign.AC4.3 Success:** Footnotes align in the right margin on sufficiently wide screens without overlapping.
- **portfolio-redesign.AC4.4 Success:** The same notes render as linked endnotes on narrow screens, in print, or without JavaScript.
- **portfolio-redesign.AC4.5 Failure:** A margin-positioning failure leaves readable endnotes rather than hidden or overlapping content.

### portfolio-redesign.AC5: SEO, discovery, and migrations

- **portfolio-redesign.AC5.2 Success:** Homepage, blog, and project structured data matches their visible content.
- **portfolio-redesign.AC5.3 Success:** Sitemap and RSS contain canonical custom-domain URLs and exclude drafts.
- **portfolio-redesign.AC5.5 Success:** Existing published blog URLs remain unchanged.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->
<!-- START_TASK_1 -->
### Task 1: Centralize blog publication, ordering, and tag slugs

**Verifies:** portfolio-redesign.AC1.4, portfolio-redesign.AC5.5

**Files:**

- Modify: `src/content/content-queries.ts`
- Modify: `src/pages/blog/index.astro:1-62`
- Modify: `src/pages/blog/[...slug]/index.astro:1-51`
- Modify: `src/pages/blog/tags/[tag].astro:1-63`
- Modify: `tests/content-queries.test.ts`
- Create: `tests/generated-blog.test.ts`

**Implementation:**

1. Add a pure `toTagSlug()` that trims, lowercases, converts internal whitespace to hyphens, removes unsafe URL punctuation, and returns `null` when normalization is empty.
2. Validate every authored tag has a non-empty normalized slug. Build tag archives as a map keyed by normalized slug so distinct labels that collide intentionally merge into one archive and one static path; keep the first published spelling as the display label and combine/deduplicate posts deterministically.
3. Add published-post and unique-tag query helpers using the same production predicate and deterministic date/ID order.
4. Replace all page-local `any` filtering/sorting with typed helpers.
5. Apply the published filter inside blog `getStaticPaths()` before mapping detail routes.
6. Derive tag static paths only from published posts; use the same slug helper for path generation and every tag link.
7. Preserve `ai`, `technology`, `politics`, and `/blog/the-devil-you-know/`.
8. Give blog index/detail/tag routes distinct metadata; detail routes emit `BlogPosting` JSON-LD from visible title, required published description, date, tags, image, and canonical URL only.

**Testing:**

Tests must verify:

- portfolio-redesign.AC1.4: a draft-only post/tag produces no detail or tag route.
- portfolio-redesign.AC5.5: `/blog/the-devil-you-know/` and the three existing tag URLs remain unchanged.

Also test case-insensitive tag deduplication, empty normalization rejection, normalized-slug collisions producing exactly one path, special-character slugging, deterministic ordering, and removal of all `any` annotations in these routes.

**Verification:**

Run: `pnpm test`

Expected: Blog routes and regression URLs pass with no draft leakage.

**Commit:** `refactor: centralize published blog queries`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Annotate semantic GFM footnotes without duplicating content

**Verifies:** portfolio-redesign.AC4.4, portfolio-redesign.AC4.5

**Files:**

- Create: `src/markdown/rehype-margin-notes.mjs`
- Modify: `astro.config.mjs`
- Create: `tests/fixtures/footnotes.md`
- Create: `tests/footnotes.test.ts`

**Implementation:**

1. Configure Astro 6.4's processor API:

   ```js
   import { unified } from "@astrojs/markdown-remark";
   import rehypeMarginNotes from "./src/markdown/rehype-margin-notes.mjs";

   markdown: {
     processor: unified({ rehypePlugins: [rehypeMarginNotes] }),
   }
   ```

2. Do not register `remark-gfm` separately; GFM is already enabled before user plugins.
3. Implement a small rehype plugin that walks generated HAST after remark-to-rehype conversion. Associate each `data-footnote-ref` anchor with its definition `<li>` by the existing fragment IDs.
4. Preserve all generated `id`, `href`, `data-footnote-ref`, and backlink attributes. Add only stable data attributes needed by the browser enhancer.
5. When a definition has multiple references, annotate it once with the first reference as its margin anchor while preserving every reference and every generated backlink.
6. If a reference or definition cannot be paired, leave the original tree untouched. Do not remove or clone note content.
7. Use a fixture with one note, multiple references to one note, multiple notes, inline formatting, and surrounding links.

**Testing:**

Tests must verify:

- portfolio-redesign.AC4.4: generated HTML retains reference links, definition IDs, and backlinks.
- portfolio-redesign.AC4.5: malformed/unpaired input remains readable and is not marked as enhanced.
- exactly one copy of each definition's text exists.

**Verification:**

Run: `pnpm test`

Expected: Footnote fixture parsing and unchanged-link semantics pass.

**Commit:** `feat: annotate semantic footnotes`
<!-- END_TASK_2 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->
<!-- START_TASK_3 -->
### Task 3: Add progressive margin-note positioning

**Verifies:** portfolio-redesign.AC4.3, portfolio-redesign.AC4.4, portfolio-redesign.AC4.5

**Files:**

- Create: `src/scripts/margin-note-layout.ts`
- Create: `src/scripts/margin-note-controller.ts`
- Create: `src/scripts/margin-notes.ts`
- Modify: `src/pages/blog/[...slug]/index.astro`
- Modify: `src/styles/global.css`
- Create: `tests/margin-note-layout.test.ts`
- Create: `tests/margin-notes.test.ts`
- Modify: `tests/generated-blog.test.ts`

**Implementation:**

1. Put collision calculation in a classified Functional Core module. Input is ordered reference/definition measurements; output is non-overlapping top offsets using a fixed gap and stable document order.
2. Put restoration/enhancement state transitions in `margin-note-controller.ts` behind small injected ports (`measure`, `moveToRail`, `restoreToList`, and enhanced-state setter). Node tests use fake ports; no DOM package is added.
3. Put browser DOM measurement/movement in a classified Imperative Shell. Activate only above the wide-layout media query, after fonts/layout settle, and only when every unique definition, its first-reference anchor, and rail measurement succeeds.
4. Keep the semantic endnote section visible by default. Move the existing `<li>` nodes—never clones—into the margin rail only after all offsets are computed.
5. Add an enhanced state only after successful placement. On any exception, restore moved nodes to their original ordered-list positions, remove enhancement state, and leave endnotes readable.
6. Recompute on a condition-based `ResizeObserver`/media-query change; do not use arbitrary timers for correctness.
7. Before printing (`beforeprint`), call the controller to restore every note node to its original ordered-list position and remove enhanced state. After printing (`afterprint`), re-run enhancement only when the wide-screen conditions still hold. CSS alone is not treated as capable of restoring moved DOM.
8. CSS must show endnotes on narrow screens, print, JavaScript-disabled pages, and failure. Wide enhanced CSS may hide only the now-empty baseline container.

**Testing:**

Tests must verify:

- portfolio-redesign.AC4.3: pure layout output is ordered, gap-preserving, and non-overlapping for colliding inputs.
- portfolio-redesign.AC4.4: baseline generated HTML contains complete linked endnotes without executing JavaScript; print-event tests restore moved nodes before print and preserve all backlinks for multiple references.
- portfolio-redesign.AC4.5: invalid measurements return failure and do not produce enhancement state.

**Verification:**

Run: `pnpm test`

Expected: Pure collision and baseline markup tests pass.

Manual check: In `pnpm dev`, test wide collisions, narrow fallback, JavaScript disabled, print preview, resize across the breakpoint, and a forced initialization failure.

**Commit:** `feat: progressively enhance margin notes`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Correct canonical RSS and blog discovery output

**Verifies:** portfolio-redesign.AC1.4, portfolio-redesign.AC5.2, portfolio-redesign.AC5.3, portfolio-redesign.AC5.5

**Files:**

- Modify: `src/pages/rss.xml.js:1-17`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/[...slug]/index.astro`
- Modify: `tests/generated-blog.test.ts`

**Implementation:**

1. Query published posts only and sort them with the shared deterministic helper before mapping feed items.
2. Keep `site: context.site` and relative trailing-slash item links so `@astrojs/rss` resolves against the configured canonical origin.
3. Use the visible blog title/description and include categories only from present tags.
4. Render optional blog preview/detail images through `SquareImage`; omit the complete image region when absent.
5. Assert blog structured data mirrors visible content, requires the published description, and omits an absent image rather than inventing one.

**Testing:**

Tests must verify:

- portfolio-redesign.AC1.4: draft posts are absent from detail routes, tags, homepage queries, and RSS.
- portfolio-redesign.AC5.2: `BlogPosting` JSON-LD matches visible fields.
- portfolio-redesign.AC5.3: RSS links use `https://www.marcelinebelardo.com` and no draft.
- portfolio-redesign.AC5.5: the existing post URL is unchanged in HTML and RSS.

**Verification:**

Run: `pnpm verify`

Expected: Phase 1–5 tests, RSS assertions, and production build pass.

**Commit:** `feat: integrate blog feeds and metadata`
<!-- END_TASK_4 -->
<!-- END_SUBCOMPONENT_B -->
