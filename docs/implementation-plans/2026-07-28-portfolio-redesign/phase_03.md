# Portfolio redesign implementation plan — Phase 3

**Goal:** Replace the hardcoded discipline silo with a unified content-backed project index and static case-study routes.

**Architecture:** Published project entries are queried once through shared filtering/sorting functions. The index uses an editorial entry component; detail routes render Markdown through a common project layout whose optional regions disappear as complete units.

**Tech stack:** Astro 6.4, TypeScript, content collections, `astro:assets`

**Scope:** 6 phases from the original design (phase 3 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.4 Failure:** Draft projects or posts generate no production detail pages.

### portfolio-redesign.AC3: Unified project portfolio

- **portfolio-redesign.AC3.1 Success:** Every published project has a stable slug, detail page, description, date, and discipline metadata.
- **portfolio-redesign.AC3.2 Success:** Project pages support optional imagery, repositories, live sites, collaborators, and external references.
- **portfolio-redesign.AC3.3 Success:** Every displayed image occupies a square frame while preserving the complete uncropped source image.
- **portfolio-redesign.AC3.4 Failure:** Missing optional project fields produce no empty controls, broken links, or placeholder metadata.
- **portfolio-redesign.AC3.5 Failure:** Missing alt text for a required content-bearing image fails content validation.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->
<!-- START_TASK_1 -->
### Task 1: Create the editorial project index

**Verifies:** portfolio-redesign.AC3.1, portfolio-redesign.AC3.3, portfolio-redesign.AC3.4

**Files:**

- Create: `src/components/ProjectIndexEntry.astro`
- Modify: `src/pages/projects/index.astro`
- Delete: `src/components/ProjectCard.astro`
- Create: `tests/generated-projects.test.ts`

**Implementation:**

1. Create a typed `ProjectIndexEntry` that renders an ordinal, linked title, description, year, discipline list, optional tags, and optional `SquareImage`.
2. Use semantic list/article markup and editorial rules; do not reproduce the bordered card grid.
3. Query `project`, apply the shared production predicate, then sort date descending with stable ID tie-breaker.
4. Render one integrated list regardless of discipline. Omit image/tag/status wrappers when their source values are absent.
5. Give the page distinct metadata and a factual description.
6. Remove `ProjectCard.astro` after all imports are gone.

**Testing:**

Tests must verify:

- portfolio-redesign.AC3.1: all four published records appear and link to their stable IDs.
- portfolio-redesign.AC3.3: every rendered project image uses `SquareImage`.
- portfolio-redesign.AC3.4: records without optional image/status fields emit no empty wrappers or placeholder strings.

**Verification:**

Run: `pnpm test`

Expected: `/projects/` builds as one ordered editorial list.

**Commit:** `feat: add unified project index`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Build static project case-study routes and layout

**Verifies:** portfolio-redesign.AC1.4, portfolio-redesign.AC3.1, portfolio-redesign.AC3.2, portfolio-redesign.AC3.3, portfolio-redesign.AC3.4

**Files:**

- Create: `src/layouts/ProjectLayout.astro`
- Create: `src/pages/projects/[...slug]/index.astro`
- Modify: `src/content/projects/lilyhttpd.md`
- Modify: `src/content/projects/osborne.md`
- Modify: `src/content/projects/cmprsr-rs.md`
- Modify: `src/content/projects/portfolio-site.md`
- Modify: `tests/generated-projects.test.ts`
- Create: `tests/project-fixture-build.mjs`
- Modify: `package.json`

**Implementation:**

1. In `getStaticPaths()`, query projects, apply the production predicate before mapping, and pass each `entry.id` as the catch-all slug.
2. Render each Markdown entry with `render(entry)`.
3. Create a typed `ProjectLayout` that renders title, date/year, description, disciplines, optional status/role/collaborators, optional cover image, repository/live/external links, body content, and optional related writing/projects.
4. Treat every optional group atomically: render its label and controls only when it has usable values. Reject `"#"` and empty URLs at schema validation rather than rendering them.
5. Emit `CreativeWork` JSON-LD from visible fields, using the canonical project URL. Do not claim a narrower schema type.
6. Keep the four Markdown bodies factual and limited to information already present in the original Code page and public repository descriptions. The author will expand them later.
7. Render the validated frontmatter `gallery` through `SquareImage`, including optional captions. Project Markdown bodies are prose-only; authoring directions in phase 6 prohibit raw Markdown images so every case-study image passes through the square, intrinsic-dimension contract.
8. Add a serial fixture-build script that refuses to overwrite, then writes two exact temporary entries: one draft and one published entry exercising every optional field plus a gallery image. Run a nested production build, inspect its output for draft absence and optional-field behavior, then remove both entries in `finally`.
9. Insert this script into `test` after the phase 1 negative-schema script and before the clean production build. The clean build then recreates `dist/` without fixtures before the Node test suite starts.

**Testing:**

Tests must verify:

- portfolio-redesign.AC1.4: the serial nested fixture build emits no draft detail file.
- portfolio-redesign.AC3.1: one detail route exists for each published stable ID.
- portfolio-redesign.AC3.2: the serial published fixture proves every optional group can render when supplied.
- portfolio-redesign.AC3.3: cover and gallery images use square, uncropped output; raw body-image syntax is rejected by authoring/output checks.
- portfolio-redesign.AC3.4: the four initial records render no empty controls or placeholder metadata.

**Verification:**

Run: `pnpm test`

Expected: Four published case studies build and the draft fixture does not.

**Commit:** `feat: add project case studies`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add project relationship and ordering behavior

**Verifies:** portfolio-redesign.AC3.1, portfolio-redesign.AC3.2, portfolio-redesign.AC3.4

**Files:**

- Modify: `src/content/content-queries.ts`
- Modify: `src/layouts/ProjectLayout.astro`
- Modify: `src/pages/projects/[...slug]/index.astro`
- Modify: `tests/content-queries.test.ts`
- Modify: `tests/generated-projects.test.ts`

**Implementation:**

1. Use the definitively typed/defaulted `relatedProjects` and `relatedWriting` arrays created in phase 1; no schema change is needed in this task.
2. Add pure helpers that resolve related project/blog IDs against published entry sets while preserving author order.
3. Drop missing, draft, or self-referential project IDs instead of producing broken links.
4. Keep the initial records' relationship fields empty unless the repository already proves a relation.
5. Render related sections only when at least one valid entry remains.

**Testing:**

Tests must verify:

- author order is stable;
- drafts and missing IDs never produce links;
- self-relations are removed;
- an empty resolved result removes the complete heading/section.

**Verification:**

Run: `pnpm test`

Expected: Relationship tests and generated route assertions pass.

**Commit:** `feat: resolve related project content`
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->
### Task 4: Verify the unified portfolio phase

**Verifies:** portfolio-redesign.AC1.4, portfolio-redesign.AC3.1, portfolio-redesign.AC3.2, portfolio-redesign.AC3.3, portfolio-redesign.AC3.4, portfolio-redesign.AC3.5

**Files:**

- Modify: `tests/generated-projects.test.ts`

**Implementation:**

1. Add a table-driven assertion for each project slug, description, date, disciplines, canonical, and JSON-LD.
2. Assert no `/projects/` output contains empty hrefs, `href="#"`, placeholder text, or card classes.
3. Assert no draft content appears in index, details, relations, or sitemap output.
4. Re-run the negative cover-alt fixture and confirm content validation fails before output generation.

**Verification:**

Run: `pnpm verify`

Expected: All phase 1–3 tests and the production build pass.

Manual check: Inspect each project route at narrow/wide widths and verify link focus and complete image composition.

**Commit:** `test: verify unified project portfolio`
<!-- END_TASK_4 -->
