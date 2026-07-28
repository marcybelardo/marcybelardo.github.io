# Portfolio redesign implementation plan — Phase 6

**Goal:** Finish discovery output and migration documents, document content authoring, and verify the complete static artifact and deployed domain.

**Architecture:** Sitemap and robots discovery share the configured canonical origin. Obsolete routes remain static noindex migration documents because GitHub Pages cannot express repository-controlled per-path HTTP redirects. Node tests inspect the built artifact; DNS/TLS checks remain an explicit post-deploy gate.

**Tech stack:** Astro 6.4, `@astrojs/sitemap` 3.7, Node 22 built-in tests, GitHub Pages

**Scope:** 6 phases from the original design (phase 6 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.1 Success:** Production builds Home, Projects, Blog, Bio, Contact, project details, blog details, tag archives, RSS, sitemap, and 404 output.
- **portfolio-redesign.AC1.3 Success:** Code, Paintings, and Photography no longer appear as primary sections.
- **portfolio-redesign.AC1.4 Failure:** Draft projects or posts generate no production detail pages.

### portfolio-redesign.AC5: SEO, discovery, and migrations

- **portfolio-redesign.AC5.1 Success:** Every indexable page has a distinct title, description, self-canonical URL, and social metadata.
- **portfolio-redesign.AC5.2 Success:** Homepage, blog, and project structured data matches their visible content.
- **portfolio-redesign.AC5.3 Success:** Sitemap and RSS contain canonical custom-domain URLs and exclude drafts.
- **portfolio-redesign.AC5.4 Success:** `robots.txt` is available and references the sitemap.
- **portfolio-redesign.AC5.5 Success:** Existing published blog URLs remain unchanged.
- **portfolio-redesign.AC5.6 Success:** `/code/`, `/paintings/`, and `/photography/` provide noindex migration documents with canonical destinations, immediate refresh, and visible fallback links.
- **portfolio-redesign.AC5.7 Success:** The GitHub hostname and HTTPS apex domain resolve or redirect to `https://www.marcelinebelardo.com` without certificate errors.
- **portfolio-redesign.AC5.8 Failure:** Generated output contains no canonical, RSS, sitemap, or structured-data URLs using `marcybelardo.github.io`.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->
<!-- START_TASK_1 -->
### Task 1: Complete sitemap, robots, and 404 discovery behavior

**Verifies:** portfolio-redesign.AC1.1, portfolio-redesign.AC1.4, portfolio-redesign.AC5.1, portfolio-redesign.AC5.3, portfolio-redesign.AC5.4, portfolio-redesign.AC5.8

**Files:**

- Modify: `astro.config.mjs`
- Create: `public/robots.txt`
- Modify: `src/pages/404.astro:1-16`
- Create: `tests/generated-discovery.test.ts`

**Implementation:**

1. Configure sitemap filtering with full absolute URLs. Exclude `/code/`, `/paintings/`, and `/photography/`; rely on the integration's built-in exclusion of 404 and endpoints.
2. Do not attempt to filter draft HTML in sitemap logic. Draft detail routes must already be absent because their `getStaticPaths()` filters them.
3. Add:

   ```text
   User-agent: *
   Allow: /
   Sitemap: https://www.marcelinebelardo.com/sitemap-index.xml
   ```

4. Restyle 404 with distinct title/description, `noindex`, primary navigation, and a visible homepage link.
5. Do not add `public/CNAME`: this repository deploys through a custom GitHub Actions artifact, and the domain is configured in GitHub Pages/DNS rather than by a branch-published CNAME file.

**Testing:**

Tests must verify required route membership, excluded migrations/404, draft absence, canonical-only sitemap URLs, robots sitemap discovery, and 404 metadata.

**Verification:**

Run: `pnpm test`

Expected: `sitemap-index.xml`, `sitemap-0.xml`, `robots.txt`, and 404 assertions pass.

**Commit:** `feat: complete static discovery output`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Replace obsolete sections with migration documents

**Verifies:** portfolio-redesign.AC1.3, portfolio-redesign.AC5.6

**Files:**

- Modify: `src/pages/code/index.astro:1-153`
- Modify: `src/pages/paintings/index.astro:1-16`
- Modify: `src/pages/photography/index.astro:1-16`
- Create: `tests/generated-migrations.test.ts`

**Implementation:**

1. Replace each page body with the same small migration pattern targeting `/projects/`.
2. Pass `robots="noindex,follow"` and canonical destination `https://www.marcelinebelardo.com/projects/` to `BaseLayout`.
3. Add a typed `metaRefreshPath?: string` prop to `BaseLayout`; when present, validate that it is an internal absolute path and emit `<meta http-equiv="refresh" content="0; url=/projects/" />`. Pass `/projects/` from each migration page instead of duplicating document markup.
4. Render a concise explanation and visible “Continue to Projects” link. Keep the primary header present.
5. Remove old Code page hardcoded data, skills, image imports, contact content, and parallax script; their verified material now lives in content/Home/Bio/Contact.

**Testing:**

Tests must verify all three documents have `noindex,follow`, canonical `/projects/`, zero-delay refresh, visible fallback link, and no old silo content. Assert they are excluded from sitemap.

**Verification:**

Run: `pnpm test`

Expected: All migration contracts pass.

**Commit:** `feat: add static section migrations`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add complete content-authoring directions

**Verifies:** None — documentation.

**Files:**

- Modify: `README.md:1-79`
- Modify: `AGENTS.md:1-42`

**Implementation:**

1. Correct the route tree and the existing incorrect `/code/blog/<filename>/` statement.
2. Add “Adding a project” with a complete copyable frontmatter example covering:
   - immutable explicit `slug` and resulting `/projects/<slug>/` URL;
   - required `title`, ISO `date`, `description`, and non-empty `disciplines`;
   - optional `tags`, `status`, `role`, `collaborators`, repository/live/external URLs;
   - `featured`, unique positive `featuredOrder`, and `draft`;
   - `coverImage` path relative to the Markdown file and mandatory meaningful `coverImageAlt`;
   - optional `gallery` entries with required `imageAlt` and optional captions;
   - Markdown body guidance and `pnpm verify`.
3. State that project Markdown bodies are prose-only: place case-study images in `coverImage`/`gallery` so the site can enforce square framing, responsive generation, dimensions, and alt text. State that a published slug must never be changed without a migration document. Recommend `draft: true` while authoring.
4. Add “Adding a blog post” with a complete example covering:
   - explicit stable `slug` and resulting `/blog/<slug>/` URL;
   - required title/date; a non-empty description required before publishing; optional tags/image/imageAlt/draft;
   - paired image-alt validation;
   - standard Markdown footnote syntax (`[^id]` and `[^id]: definition`);
   - tag archive generation, draft exclusion surfaces, and `pnpm verify`.
5. Explain that the legacy title-derived blog ID remains only as compatibility fallback; all new posts should set `slug`.
6. Add “Editing Bio and Contact” directions naming `src/pages/bio/index.astro` and `src/pages/contact/index.astro`, identifying the small copy/profile data blocks, and requiring factual copy plus `pnpm verify`.
7. Warn not to overwrite the original workspace's untracked `src/content/blog/blog02.md`; preserve it during integration.
8. Update AGENTS.md for the two active collections, canonical origin, new route tree/migrations, authoring rules, `pnpm test`/`pnpm verify`, and the Node built-in test convention.

**Verification:**

Run: `rg -n "Adding a project|Adding a blog post|Editing Bio and Contact|coverImageAlt|featuredOrder|non-empty description|\\[\\^" README.md`

Expected: Project, blog, Bio, and Contact authoring workflows plus published-description, alt, ordering, and footnote requirements are documented.

Run: `pnpm verify`

Expected: Documentation changes do not affect the build.

**Commit:** `docs: explain portfolio content authoring`
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->
<!-- START_TASK_4 -->
### Task 4: Consolidate production-artifact verification and CI

**Verifies:** portfolio-redesign.AC1.1, portfolio-redesign.AC1.3, portfolio-redesign.AC1.4, portfolio-redesign.AC5.1, portfolio-redesign.AC5.2, portfolio-redesign.AC5.3, portfolio-redesign.AC5.4, portfolio-redesign.AC5.5, portfolio-redesign.AC5.6, portfolio-redesign.AC5.8

**Files:**

- Create: `tests/production-artifact.test.ts`
- Modify: `.github/workflows/deploy.yml:13-23`
- Modify: `package.json`

**Implementation:**

1. Consolidate cross-page output checks without duplicating focused phase tests.
2. Enumerate indexable HTML files and assert one distinct title, description, self-canonical, Open Graph set, Twitter metadata set, and no `noindex`.
3. Assert required route files, four project details, `/blog/the-devil-you-know/`, three current tags, RSS, both sitemap files, robots, migrations, and 404.
4. Assert no draft fixture IDs/content in routes, tags, RSS, sitemap, homepage, or relations.
5. Assert structured-data types and canonical visible values, square image dimensions/srcsets, footnote baseline links/backlinks, and migration contracts.
6. Search canonical, RSS, sitemap, and JSON-LD output for `marcybelardo.github.io` and fail if present.
7. Change the deploy workflow build command to `pnpm verify` so deployment cannot proceed after a failed artifact assertion.

**Testing:**

Each listed AC must have a named assertion matching `test-requirements.md`.

**Verification:**

Run: `pnpm verify`

Expected: The complete production artifact passes every repository-verifiable acceptance criterion.

**Commit:** `test: verify production portfolio artifact`
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Verify deployed domain, responsive behavior, and print fallback

**Verifies:** portfolio-redesign.AC4.3, portfolio-redesign.AC4.4, portfolio-redesign.AC4.5, portfolio-redesign.AC4.6, portfolio-redesign.AC5.7

**Files:**

- Create: `docs/release-checks/portfolio-redesign.md`

**Implementation:**

1. After deployment, verify GitHub Pages settings use `www.marcelinebelardo.com`, Enforce HTTPS is enabled, `www` DNS points to `marcybelardo.github.io`, and apex A/AAAA records are configured per GitHub's current documentation.
2. Run:

   ```bash
   curl -IL https://marcybelardo.github.io
   curl -IL http://marcelinebelardo.com
   curl -IL https://marcelinebelardo.com
   curl -IL https://www.marcelinebelardo.com
   ```

   Expected: each chain ends at `https://www.marcelinebelardo.com/` without TLS errors.
3. Check Home, Projects, one project, Blog, one footnoted post, Bio, Contact, one migration, and 404 at 360px, 768px, and 1280px.
4. Use keyboard only to verify navigation, menu dismissal, all project/contact/footnote links, and visible focus.
5. Verify wide footnotes do not overlap; narrow, print, JavaScript-disabled, and forced-failure modes retain linked endnotes.
6. Verify portrait and landscape images remain completely visible inside squares.
7. Record the verification date/operator, GitHub Pages custom-domain and HTTPS settings, relevant DNS answers, each curl command's final URL/status, certificate result, and the responsive/keyboard/footnote/image checklist outcomes in `docs/release-checks/portfolio-redesign.md`. Do not mark AC5.7 complete without this durable evidence.

**Verification:**

Run: `pnpm verify`

Expected: Repository checks still pass after any fixes.

Expected operational result: DNS/TLS redirect checks and the manual responsive/accessibility/print matrix pass.

**Commit:** `docs: record portfolio release verification`
<!-- END_TASK_5 -->
<!-- END_SUBCOMPONENT_B -->
