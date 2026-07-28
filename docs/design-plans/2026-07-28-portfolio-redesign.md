# Portfolio redesign

## Summary

The redesign is implemented in dependency-ordered phases, beginning with
validated content schemas and a single canonical metadata contract. Once those
foundations are stable, the shared editorial shell and square-image component
establish the site-wide presentation; content-backed project routes then
replace hardcoded, discipline-specific sections, followed by the homepage,
Bio, and Contact pages built from the same project and blog queries.

The existing blog route structure is preserved while its presentation, feeds,
and footnotes are integrated into the new system. Footnotes remain semantic
endnotes by default and are moved into a collision-aware margin rail only when
the browser can support it. The final phase adds sitemap, crawl controls,
static migration documents, and build-output checks so URL preservation, draft
exclusion, accessibility, metadata, images, and canonical-domain usage are
verified across the generated site.

## Definition of done

- Astro remains a static GitHub Pages site, reorganized around **Home, Projects, Blog, Bio, and Contact**.
- The homepage presents one integrated practice statement, a mixed selection of projects, and recent writing.
- One unified project collection supports multidisciplinary case studies; painting, photography, software, research, and writing are metadata—not separate identities or route trees.
- The redesign adopts the restrained LaTeX-like visual system, responsive margin footnotes, and the technical SEO improvements identified in the audit.
- Existing published blog URLs remain stable, while `/code/`, `/paintings/`, and `/photography/` receive appropriate migration pages pointing into Projects.

## Acceptance criteria

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.1 Success:** Production builds Home, Projects, Blog,
  Bio, Contact, project details, blog details, tag archives, RSS, sitemap, and
  404 output.
- **portfolio-redesign.AC1.2 Success:** Every page exposes Projects, Blog, Bio,
  and Contact through the primary header; narrow screens require no more than
  one interaction.
- **portfolio-redesign.AC1.3 Success:** Code, Paintings, and Photography no
  longer appear as primary sections.
- **portfolio-redesign.AC1.4 Failure:** Draft projects or posts generate no
  production detail pages.

### portfolio-redesign.AC2: Editorial homepage

- **portfolio-redesign.AC2.1 Success:** The homepage includes a practice
  statement, mixed Selected Projects, Recent Writing, and a contact prompt.
- **portfolio-redesign.AC2.2 Success:** Selected projects come from one
  collection and may carry multiple disciplines.
- **portfolio-redesign.AC2.3 Failure:** The homepage does not divide projects
  into Art and Code sections.
- **portfolio-redesign.AC2.4 Edge:** Empty optional sections are omitted without
  leaving empty headings or broken layouts.

### portfolio-redesign.AC3: Unified project portfolio

- **portfolio-redesign.AC3.1 Success:** Every published project has a stable
  slug, detail page, description, date, and discipline metadata.
- **portfolio-redesign.AC3.2 Success:** Project pages support optional imagery,
  repositories, live sites, collaborators, and external references.
- **portfolio-redesign.AC3.3 Success:** Every displayed image occupies a square
  frame while preserving the complete uncropped source image.
- **portfolio-redesign.AC3.4 Failure:** Missing optional project fields produce
  no empty controls, broken links, or placeholder metadata.
- **portfolio-redesign.AC3.5 Failure:** Missing alt text for a required
  content-bearing image fails content validation.

### portfolio-redesign.AC4: Visual system and footnotes

- **portfolio-redesign.AC4.1 Success:** The site uses serif reading typography,
  restrained utility typography, a Prussian Blue accent, editorial rules, and
  no card-heavy or parallax treatment.
- **portfolio-redesign.AC4.2 Success:** Square images reserve dimensions and use
  appropriately sized generated assets.
- **portfolio-redesign.AC4.3 Success:** Footnotes align in the right margin on
  sufficiently wide screens without overlapping.
- **portfolio-redesign.AC4.4 Success:** The same notes render as linked endnotes
  on narrow screens, in print, or without JavaScript.
- **portfolio-redesign.AC4.5 Failure:** A margin-positioning failure leaves
  readable endnotes rather than hidden or overlapping content.
- **portfolio-redesign.AC4.6 Success:** Navigation, project links, footnote
  links, and contact links are keyboard accessible with visible focus.

### portfolio-redesign.AC5: SEO, discovery, and migrations

- **portfolio-redesign.AC5.1 Success:** Every indexable page has a distinct
  title, description, self-canonical URL, and social metadata.
- **portfolio-redesign.AC5.2 Success:** Homepage, blog, and project structured
  data matches their visible content.
- **portfolio-redesign.AC5.3 Success:** Sitemap and RSS contain canonical
  custom-domain URLs and exclude drafts.
- **portfolio-redesign.AC5.4 Success:** `robots.txt` is available and references
  the sitemap.
- **portfolio-redesign.AC5.5 Success:** Existing published blog URLs remain
  unchanged.
- **portfolio-redesign.AC5.6 Success:** `/code/`, `/paintings/`, and
  `/photography/` provide noindex migration documents with canonical
  destinations, immediate refresh, and visible fallback links.
- **portfolio-redesign.AC5.7 Success:** The GitHub hostname and HTTPS apex
  domain resolve or redirect to `https://www.marcelinebelardo.com` without
  certificate errors.
- **portfolio-redesign.AC5.8 Failure:** Generated output contains no canonical,
  RSS, sitemap, or structured-data URLs using `marcybelardo.github.io`.

## Glossary

- **Canonical origin**: The preferred base domain used to construct canonical
  links, feeds, sitemap entries, structured data, and internal URLs.
- **Canonical URL**: A page-level declaration identifying the preferred URL for
  that content, helping search engines avoid treating alternate addresses as
  duplicates.
- **Content collection**: Astro's schema-validated system for loading related
  content entries, such as projects or blog posts, at build time.
- **Draft filtering**: The shared rule that prevents unpublished entries from
  appearing in production pages, static paths, tags, related content, feeds, or
  the sitemap.
- **Fragment link**: A URL link targeting a specific element within the same
  document, used here to connect footnote references and definitions.
- **Intrinsic dimensions**: An image's known width and height, reserved before
  it loads to prevent surrounding content from shifting.
- **Layout shift**: Unexpected movement of page content as assets load or
  dimensions change.
- **Loader-backed project collection**: A project collection whose entries are
  discovered and loaded through Astro's content loader rather than being
  hardcoded into page templates.
- **Margin-note rail**: Reserved space beside the main reading column where
  footnotes are positioned on sufficiently wide screens.
- **Migration document**: A static page retained at an obsolete route that
  directs visitors and crawlers to the replacement destination.
- **`noindex`**: A robots directive asking search engines not to include a page
  in search results.
- **Progressive enhancement**: An approach in which the complete, accessible
  baseline works without JavaScript and optional browser behavior improves its
  presentation.
- **Self-canonical URL**: A canonical link that points to the page's own
  preferred production URL.
- **Static path**: A route generated as an HTML page during the production
  build rather than created in response to a request.
- **Structured data**: Machine-readable metadata, such as `Person`,
  `BlogPosting`, or `CreativeWork`, describing visible page content to search
  engines.
- **Meta refresh**: An HTML instruction that immediately sends visitors from a
  static migration page to its replacement when an HTTP redirect is
  unavailable.

## Architecture

The site remains a statically generated Astro application deployed to GitHub
Pages. The redesign replaces discipline-specific routes with a single project
system and uses page composition, content collections, and static build-time
queries throughout.

### Route structure

```text
/
├── projects/
│   └── [slug]/
├── blog/
│   ├── [slug]/
│   └── tags/[tag]/
├── bio/
├── contact/
├── code/          # migration document
├── paintings/     # migration document
├── photography/   # migration document
└── rss.xml
```

The shared header presents Marceline Belardo, Projects, Blog, Bio, and Contact.
The name links to the homepage. All destinations remain visible on wide
screens and discoverable in one interaction on narrow screens.

### Homepage

The homepage functions as an editorial index:

1. A concise statement describing one practice across technology, visual
   culture, research, and writing.
2. A mixed Selected Projects section sourced from the project collection.
3. A Recent Writing section sourced from published blog entries.
4. A restrained contact or availability statement.

Selected Projects does not split work into art and code. Project disciplines
appear as descriptive metadata and may overlap.

### Project system

`src/content.config.ts` defines one loader-backed project collection under
`src/content/projects/`. Each project has a stable slug and Markdown body.
The collection contract contains:

- `title`: Project title.
- `date`: Primary publication or completion date.
- `description`: Short premise for index and metadata use.
- `disciplines`: Multi-valued descriptors such as software, visual, research,
  installation, or writing.
- `tags`: Technologies, subjects, or other supporting terms.
- `status`: Project state when the distinction is meaningful.
- `featured`: Whether the homepage may select the project.
- `featuredOrder`: Optional editorial ordering among featured projects.
- `draft`: Whether the project is excluded from production output.
- `coverImage` and `coverImageAlt`: Square-framed index image and its text
  alternative.
- Optional `repositoryUrl`, `liveUrl`, `externalUrl`, `collaborators`, and
  `role` fields.

`src/pages/projects/index.astro` renders the unified project index.
`src/pages/projects/[...slug]/index.astro` renders project case studies.
Project pages can contain a premise, process, tools or media, images,
collaborators, outcomes, external evidence, related writing, and related
projects without imposing different templates for art and software.

### Image contract

`src/components/SquareImage.astro` provides the shared image presentation
contract. Every project cover, index thumbnail, blog preview, and relevant
profile image occupies a square frame. Images retain their full composition
with `object-fit: contain`; landscape and portrait originals receive neutral
space inside the square. The component reserves intrinsic dimensions and uses
Astro image generation to avoid layout shift and oversized downloads.

### Blog and margin notes

The blog retains its current collection and published routes. Draft filtering
applies consistently to indexes, static paths, tags, RSS, and the sitemap.

Authors use standard Markdown footnotes. A local Markdown transform associates
each reference with its generated definition while preserving fragment links
and backlinks. On wide screens, progressive enhancement positions the same
note nodes in a right margin rail and resolves collisions. On narrow screens,
in print, or without JavaScript, notes remain conventional endnotes. The design
does not duplicate note content.

### Metadata and discovery

`src/layouts/BaseLayout.astro` accepts page-specific metadata and emits distinct
titles, descriptions, canonical URLs, social-sharing tags, and optional
structured data. The canonical origin is
`https://www.marcelinebelardo.com`.

The homepage emits `WebSite` and `Person` structured data. Blog posts emit
`BlogPosting`. Project pages emit `CreativeWork`, using a narrower type only
when the project accurately meets it. The sitemap, RSS feed, canonical links,
and internal links use the same custom-domain origin.

## Existing patterns

The redesign retains these existing patterns:

- Astro file-based static routes under `src/pages/`.
- Shared page composition through
  `src/layouts/BaseLayout.astro`.
- Markdown content loaded through collections defined in
  `src/content.config.ts`.
- Site-wide styling in `src/styles/global.css` with Tailwind CSS v4 utilities.
- Static deployment through `.github/workflows/deploy.yml`.
- Blog listing, detail, tag, and RSS routes under `src/pages/blog/` and
  `src/pages/rss.xml.js`.

The current project pattern is only nominal: `project`, `painting`, and
`photograph` collections are defined but have no content or consuming routes.
Software projects are hardcoded in `src/pages/code/index.astro`. This design
replaces those incomplete patterns with one content-backed project system.

The current `prose` class does not receive Tailwind Typography styles because
that plugin is not installed. Article typography will therefore be explicitly
defined rather than relying on that class.

The redesign introduces these patterns:

- One project collection with overlapping discipline metadata.
- A reusable square-image component.
- Page-specific SEO metadata and structured-data contracts.
- Progressive enhancement for desktop margin notes with semantic endnotes as
  the baseline.
- Static migration documents for obsolete GitHub Pages routes.

## Implementation phases

<!-- START_PHASE_1 -->
### Phase 1: Content and metadata foundations

**Goal:** Establish stable content contracts and a canonical metadata system
before changing the visible information architecture.

**Components:**

- `src/content.config.ts` — unified project schema, stable IDs, and consistent
  draft fields.
- `src/content/projects/` — Markdown entries migrated from the hardcoded
  software project data and initial visual or mixed-media project records.
- `src/layouts/BaseLayout.astro` — page metadata contract for titles,
  descriptions, canonical URLs, social metadata, robots directives, and
  structured data.
- `astro.config.mjs` — canonical custom-domain origin and Markdown processor
  configuration.
- `package.json` — direct Markdown processor and sitemap dependencies approved
  for this design.

**Dependencies:** None.

**Done when:** Project and blog content load through validated schemas, drafts
can be excluded consistently, every existing route builds with page-specific
metadata, and targeted metadata/content tests plus `pnpm build` pass.
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Editorial shell and visual system

**Goal:** Create the shared LaTeX-influenced presentation and responsive page
frame used by every route.

**Components:**

- `src/layouts/BaseLayout.astro` — document-style header with Home/name,
  Projects, Blog, Bio, and Contact.
- `src/styles/global.css` — serif reading typography, restrained utility face,
  Prussian Blue accent, editorial spacing, rules, focus states, responsive
  article widths, and print behavior.
- `src/components/SquareImage.astro` — uncropped square-frame image contract.
- Existing social assets and header links — corrected identity, accessible
  names, and focus behavior.

**Dependencies:** Phase 1 metadata contract.

**Done when:** The shared shell works at narrow and wide widths, all primary
destinations remain discoverable, square frames preserve complete source
images, keyboard focus is visible, and component/layout tests plus
`pnpm build` pass.
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Unified project portfolio

**Goal:** Replace the Code, Paintings, and Photography silos with one
content-backed project portfolio.

**Components:**

- `src/pages/projects/index.astro` — unified editorial project index.
- `src/pages/projects/[...slug]/index.astro` — static project case-study
  routes.
- `src/components/ProjectIndexEntry.astro` — numbered title, premise, year,
  disciplines, and optional square image.
- `src/layouts/ProjectLayout.astro` — project narrative, metadata, imagery,
  links, and related work.
- `src/content/projects/` — complete initial project records with stable slugs
  and accessible image descriptions.

**Dependencies:** Phases 1 and 2.

**Done when:** Published projects generate stable detail pages, projects can
carry multiple disciplines, draft projects appear nowhere in production,
project links and optional external destinations behave correctly, and route
and content tests plus `pnpm build` pass.
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Homepage, Bio, and Contact

**Goal:** Present the integrated practice through the editorial homepage and
dedicated supporting pages.

**Components:**

- `src/pages/index.astro` — practice statement, mixed Selected Projects,
  Recent Writing, and contact prompt.
- `src/pages/bio/index.astro` — integrated biography and optional compact
  résumé information.
- `src/pages/contact/index.astro` — direct contact methods and relevant
  profiles.
- Current portrait and contact assets in `src/assets/` — reassigned to the
  appropriate pages through the square-image contract.

**Dependencies:** Phase 3 project queries and Phase 2 visual system.

**Done when:** The homepage mixes projects without discipline sections,
featured ordering and recent-writing queries are deterministic, empty optional
content is handled cleanly, Bio and Contact are reachable from the header, and
page-query tests plus `pnpm build` pass.
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: Blog, footnotes, and feeds

**Goal:** Bring the blog into the editorial system while adding accessible
responsive margin notes and correct discovery output.

**Components:**

- `src/pages/blog/index.astro` — editorial listing, page metadata, and square
  preview images where supplied.
- `src/pages/blog/[...slug]/index.astro` — article metadata, structured data,
  readable column, and margin-note rail.
- `src/pages/blog/tags/[tag].astro` — stable tag archives with production draft
  filtering.
- `src/pages/rss.xml.js` — published entries only and canonical custom-domain
  URLs.
- `src/markdown/` — local footnote transform preserving reference and backlink
  semantics.
- `src/scripts/margin-notes.ts` — wide-screen positioning and collision
  handling activated only after successful initialization.

**Dependencies:** Phases 1 and 2.

**Done when:** Existing published blog URLs remain unchanged, drafts cannot
leak through any blog surface, footnotes work in the margin and as baseline
endnotes, RSS uses canonical URLs, and footnote/feed tests plus
`pnpm build` pass.
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: Discovery, migrations, and integration verification

**Goal:** Complete technical SEO output, preserve obsolete entry points, and
verify the redesigned site as one production artifact.

**Components:**

- Sitemap output generated from canonical, indexable production routes.
- `public/robots.txt` — crawl policy and sitemap reference.
- `src/pages/code/index.astro`,
  `src/pages/paintings/index.astro`, and
  `src/pages/photography/index.astro` — noindex migration documents with
  canonical destinations, immediate refresh, and visible fallback links.
- `src/pages/404.astro` — restyled document with correct metadata.
- `AGENTS.md` and `README.md` — updated route, collection, authoring, and
  validation documentation.
- Build-output verification covering canonical origins, unique metadata,
  structured data, sitemap membership, draft exclusion, RSS URLs, image
  dimensions, migration documents, and retained blog URLs.

**Dependencies:** Phases 1 through 5.

**Done when:** `pnpm build` succeeds; generated output contains only canonical
production content; obsolete routes guide users and crawlers to Projects;
metadata, sitemap, RSS, footnotes, keyboard navigation, square image behavior,
responsive layouts, and print output satisfy the validated acceptance
criteria.
<!-- END_PHASE_6 -->

## Additional considerations

**URL stability:** Project slugs must not be derived from mutable display
titles. Published blog slugs remain unchanged. Any future slug change requires
an explicit migration document.

**Draft safety:** Draft filtering is a shared production invariant, not a
listing-page concern. Static paths, tags, related content, RSS, homepage
queries, and sitemap generation must all apply it.

**Square images:** The square frame is a presentation constraint, not an image
editing operation. Source images remain intact. Decorative images use empty
alt text; content-bearing images require meaningful alternatives.

**Margin-note fallback:** The baseline document must remain usable before the
positioning script runs. If measurement fails, notes stay in endnote form
rather than becoming hidden or overlapping.

**GitHub Pages migrations:** GitHub Pages cannot provide repository-controlled
HTTP 301 responses for these static routes. Immediate meta refresh, canonical
destination, `noindex`, and a visible link form the migration behavior until
hosting changes.

**Existing user work:** `src/content/blog/blog02.md` is currently untracked and
must be preserved. Migration and build work must not overwrite or discard it.
