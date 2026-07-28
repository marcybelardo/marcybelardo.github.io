# Portfolio redesign implementation plan — Phase 4

**Goal:** Present the existing material as one practice through the homepage, Bio, and Contact pages.

**Architecture:** The homepage composes deterministic project and blog queries. Bio and Contact reuse only verified copy, assets, and profile destinations. Optional sections include their headings inside the same conditional boundary as their contents.

**Tech stack:** Astro 6.4, TypeScript, content collections, `SquareImage`

**Scope:** 6 phases from the original design (phase 4 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.1 Success:** Production builds Home, Projects, Blog, Bio, Contact, project details, blog details, tag archives, RSS, sitemap, and 404 output.
- **portfolio-redesign.AC1.2 Success:** Every page exposes Projects, Blog, Bio, and Contact through the primary header; narrow screens require no more than one interaction.

### portfolio-redesign.AC2: Editorial homepage

- **portfolio-redesign.AC2.1 Success:** The homepage includes a practice statement, mixed Selected Projects, Recent Writing, and a contact prompt.
- **portfolio-redesign.AC2.2 Success:** Selected projects come from one collection and may carry multiple disciplines.
- **portfolio-redesign.AC2.3 Failure:** The homepage does not divide projects into Art and Code sections.
- **portfolio-redesign.AC2.4 Edge:** Empty optional sections are omitted without leaving empty headings or broken layouts.

### portfolio-redesign.AC5: SEO, discovery, and migrations

- **portfolio-redesign.AC5.2 Success:** Homepage, blog, and project structured data matches their visible content.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->
<!-- START_TASK_1 -->
### Task 1: Build the editorial homepage

**Verifies:** portfolio-redesign.AC2.1, portfolio-redesign.AC2.2, portfolio-redesign.AC2.3, portfolio-redesign.AC2.4, portfolio-redesign.AC5.2

**Files:**

- Modify: `src/pages/index.astro:1-17`
- Modify: `src/content/content-queries.ts`
- Modify: `tests/content-queries.test.ts`
- Create: `tests/generated-home.test.ts`

**Implementation:**

1. Query project and blog collections at build time. Filter both through the shared production predicate.
2. Select up to four featured projects ordered by `featuredOrder`, date descending, then stable ID. Select up to three recent posts ordered by date descending, then stable ID.
3. Render this existing-data practice statement: “I work across software, visual culture, research, and writing.” Keep it easy to replace as one plain content block.
4. Render Selected Projects through `ProjectIndexEntry`, Recent Writing through semantic list markup, and the existing email address as the contact prompt.
5. Wrap each optional section's heading and body in the same length check. The practice statement and contact prompt remain required.
6. Emit `WebSite` and `Person` structured data using only visible name, canonical URL, and verified profile URLs.

**Testing:**

Tests must verify:

- portfolio-redesign.AC2.1: all four homepage regions exist with current content.
- portfolio-redesign.AC2.2: selected items are project collection entries and the multi-valued discipline contract is retained.
- portfolio-redesign.AC2.3: no Art or Code project section headings exist.
- portfolio-redesign.AC2.4: empty featured/recent fixtures remove both heading and container.
- portfolio-redesign.AC5.2: homepage JSON-LD matches visible name, URL, and profiles.

**Verification:**

Run: `pnpm test`

Expected: Deterministic query and generated-home assertions pass.

**Commit:** `feat: build editorial homepage`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create the Bio page from verified material

**Verifies:** portfolio-redesign.AC1.1, portfolio-redesign.AC1.2

**Files:**

- Modify: `src/pages/bio/index.astro` (created as a functional route in phase 2, task 2)
- Modify: `tests/generated-home.test.ts`

**Implementation:**

1. Reuse the existing “Software Developer” label, “Building maintainable, friendly, and performant programs” statement, and the verified skills list from the old Code page.
2. Reuse `src/assets/20260425_29.jpg` through `SquareImage` with the existing content-bearing alt text.
3. Do not fabricate résumé dates, employers, education, exhibitions, or biography claims. Make the copy a small, easy-to-edit Astro data block; phase 6 documents where and how to edit it.
4. Add distinct metadata. Keep résumé content absent rather than rendering an empty heading.

**Testing:**

Generated-output tests must verify `/bio/`, its header navigation, distinct metadata, square portrait dimensions, and absence of empty résumé markup.

**Verification:**

Run: `pnpm test`

Expected: `/bio/` builds with verified copy and image metadata.

**Commit:** `feat: add biography page`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create the Contact page from verified destinations

**Verifies:** portfolio-redesign.AC1.1, portfolio-redesign.AC1.2, portfolio-redesign.AC4.6

**Files:**

- Modify: `src/pages/contact/index.astro` (created as a functional route in phase 2, task 2)
- Modify: `tests/generated-home.test.ts`

**Implementation:**

1. Render the verified email, GitHub, Bluesky, and Instagram destinations with descriptive link text.
2. Reuse `src/assets/IMG_6936_EDIT copy.jpg` only if it improves the page composition; if used decoratively, pass `alt=""` explicitly through `SquareImage`.
3. Add distinct page metadata and a short factual invitation based on the existing “Feel free to reach out” copy.
4. Do not add a form, API, server endpoint, availability claim, or new profile.

**Testing:**

Tests must verify all four destinations, no empty links, visible focus coverage, and `/contact/` metadata.

**Verification:**

Run: `pnpm test`

Expected: `/contact/` builds with keyboard-accessible verified destinations.

**Commit:** `feat: add contact page`
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->
### Task 4: Verify primary routes and empty-state behavior

**Verifies:** portfolio-redesign.AC1.1, portfolio-redesign.AC1.2, portfolio-redesign.AC2.1, portfolio-redesign.AC2.2, portfolio-redesign.AC2.3, portfolio-redesign.AC2.4, portfolio-redesign.AC5.2

**Files:**

- Modify: `tests/generated-home.test.ts`
- Modify: `tests/generated-metadata.test.ts`

**Implementation:**

1. Assert Home, Projects, Blog, Bio, Contact, project details, current blog details/tags, RSS, sitemap, and 404 artifacts exist.
2. Assert every HTML document contains the four primary header destinations.
3. Assert homepage ordering and limits are stable across repeated runs.
4. Assert empty optional homepage/Bio sections remove their headings and containers.
5. Assert homepage/project structured data does not claim absent fields.

**Verification:**

Run: `pnpm verify`

Expected: All phase 1–4 tests and production output pass.

Manual check: Review Home, Bio, and Contact at narrow/wide widths with keyboard-only navigation.

**Commit:** `test: verify homepage and supporting routes`
<!-- END_TASK_4 -->
