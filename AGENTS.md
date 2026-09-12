# Marceline Portfolio — Agent Guide

Static portfolio site for Marceline covering projects, photography, painting, and writing. Built with **Astro + TypeScript**.

## Commands

```sh
pnpm dev       # localhost:4321
pnpm build     # production to ./dist/
pnpm preview   # preview production build
pnpm astro     # Astro CLI
pnpm test      # negative content validation, build, and Node tests
pnpm verify    # alias for pnpm test
nix develop    # reproducible Node, pnpm, and Python development shell
```

No lint or typecheck scripts exist. `pnpm verify` is the validation step. The repository also provides a pinned Nix flake for development; use `nix develop` to enter its shell.

## Repo details an agent might miss

- **CSS** is authored in `src/styles/global.css` with a small explicit reset; there is no utility CSS runtime or PostCSS configuration.
- **Path alias**: `@/*` → `./src/*` (set in `tsconfig.json`).
- **Node**: `>=22.12.0` required.
- **Deploy**: auto-deploy to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`).
- **RSS**: at `/rss.xml`, powered by `@astrojs/rss`.
- **`pnpm-workspace.yaml`** is single-package with restrictive build permissions (allows only `esbuild`/`sharp` install scripts).

## Content collections (`src/content/`)

Two collections are defined in `src/content.config.ts`: the loader-backed `project` collection under `src/content/projects/` and the `blog` collection under `src/content/blog/`.

Projects use explicit stable slugs, validated publication metadata, and optional image/link/relationship fields. Shared publication filtering and ordering rules live in `src/content/content-queries.ts`; production blog detail and tag routes use those filters before generating static paths.

**Blog ID scheme** — IDs use a non-empty explicit frontmatter `slug` when present; otherwise they fall back to the first 4 alphanumeric words of `title`, lowercased and joined with `-` (not from the filename). Drafts (`draft: true`) are excluded in production builds.

The shared `BaseLayout` owns the compact dark-square, focus-managed primary navigation and the site-wide GA4 (`G-4EKN42R6PS`) and Google Tag Manager (`GTM-N4JNKN2H`) integrations. Its only primary destinations are Projects, Blog, Bio, and Contact. Code, Paintings, and Photography are retired and must not be generated or added to the sitemap. The panel is server-rendered open for a JavaScript-disabled baseline; the browser script adds `data-js-ready` and progressively enhances it into a closed, focus-managed menu on every route. A small home link appears on every page except the homepage. `GlowText.astro` owns the paired decorative and semantic text copies, while `BaseLayout` loads and initializes ink-hover once.
Projects, Bio, and Contact are working static destinations. Projects reads published entries from the project collection, while Bio and Contact contain the verified profile copy and destinations. Bio presents a native 2:3 grayscale triptych of the supplied mirror photograph, with one descriptive alt and two decorative repetitions.
The Projects index is a single editorial list backed by `ProjectIndexEntry`; published project IDs generate static case-study routes under `/projects/<slug>/` through `ProjectLayout`. Project covers and galleries use `SquareImage`, and related project/writing links are resolved against published entries while preserving frontmatter order.
On the photo-wide branch, the homepage is a viewport-height photographic landing with one title, a smaller right-aligned photograph, and direct Projects, Blog, Bio, and Contact links. It intentionally has no practice statement, project/writing previews, or contact prompt; these belong on the destination pages. Shared featured/recent queries remain available to other consumers. Bio and Contact reuse the verified profile copy, portrait, email, and profile destinations without fabricating résumé or availability details.
Blog indexes, detail routes, and tag archives use the shared published-post/date-order query and normalized tag-slug/archive contract. Production static paths exclude draft posts while preserving the existing post and tag URLs.

The canonical origin is `https://www.marcelinebelardo.com`; use it for canonical, RSS, and sitemap URLs. The static route tree is `/`, `/projects/`, `/projects/<slug>/`, `/blog/`, `/blog/<slug>/`, `/blog/tags/<tag>/`, `/bio/`, `/contact/`, `/rss.xml`, `/sitemap-index.xml`, `/sitemap-0.xml`, `/robots.txt`, and `/404.html`. `/code/`, `/paintings/`, and `/photography/` are intentionally absent.

### Content authoring rules

- Projects live in `src/content/projects/` and require an explicit immutable lowercase `slug`, title, ISO date, non-empty description, and non-empty `disciplines`. Optional metadata includes tags, status, role, collaborators, repository/live/external URLs, featured state, and a unique positive `featuredOrder` for featured projects; the featured-project query rejects duplicate orders with both conflicting IDs.
- Project `coverImage` paths are relative to the Markdown file and require meaningful `coverImageAlt`; gallery entries require `imageAlt` and may include captions. Project bodies are prose-only: put images in cover/gallery fields so `SquareImage` can enforce square contain framing, responsive generation, dimensions, and alt text. Never change a published slug without a migration document. Use `draft: true` while authoring.
- Blog posts live in `src/content/blog/` and should set an explicit stable lowercase `slug`, which produces `/blog/<slug>/`. Title and ISO date are required; published posts require a non-empty description. Optional image fields are paired: `image` requires meaningful `imageAlt`. Standard GFM footnotes use `[^id]` and `[^id]: definition`. Blog index, detail, and tag routes use the editorial classes in `src/styles/global.css`; do not add utility-class styling or a `.prose` dependency. The title-derived ID is compatibility fallback only.
- `BaseLayout` validates explicit canonical overrides against `SITE_ORIGIN`. `SquareImage` requires meaningful alt text by default; an empty alt is valid only with an explicit `decorative={true}` prop.
- Drafts are excluded from production detail routes, tag archives, homepage sections, relationships, RSS, and sitemap output. Run `pnpm verify` after content, Bio, or Contact edits.
- Bio authoring edits the `bioContent` block in `src/pages/bio/index.astro`; Contact authoring edits `contactDestinations` in `src/pages/contact/index.astro`. Keep profile copy, alt text, email, and external URLs factual and verified.
- Preserve the original workspace's untracked `src/content/blog/blog02.md` during integration; do not overwrite it.
- Standard.site publishing is implemented by `scripts/standard-site/publisher.ts`; run `pnpm standard-site:publish` for a dry run and add `--write` to apply atcute OAuth-authenticated publication/document creates and updates. It uses deterministic TID record keys, compare-and-swap writes, optimistic remote validation after local pinned-schema validation, bounded retries for discovery GETs, structured PDS errors, and read-back verification; it never deletes records or uploads media. The publisher reads published blog Markdown/MDX through `src/standard-site/converter.ts`, while the optional Python converter (`python3 scripts/generate_standard_site.py`) remains an offline metadata compatibility tool with no authentication, PDS access, synchronization, or verification.
- Standard.site TID, record-key, AT-URI, and collection primitives live in the pure `src/standard-site/identity.ts` module; site configuration imports this module directly rather than the filesystem-backed converter, and publisher structural types re-export its collection constants.
- Standard.site discovery is emitted at `/.well-known/site.standard.publication`; published blog detail pages advertise their deterministic document AT-URI with `rel="site.standard.document"`. The default owner DID is the one currently resolved from `marcelinebelardo.com`; set `PUBLIC_STANDARD_SITE_DID` only for an intentional identity migration. See `docs/standard-site-publisher.md` for the ordered implementation contract, acceptance criteria, and non-goals.
Astro Markdown keeps built-in GFM footnotes and applies the local rehype margin-note annotation plugin atomically only when every generated reference and definition is covered, preserving semantic links, backlinks, and one definition copy.
Blog detail pages keep the generated footnote section as the baseline and progressively enhance it with the injected margin-note controller only after wide-layout measurements succeed; notes move under a semantic rail list, print generations suppress stale callbacks, measurement cleanup attempts every note, and any remaining restoration failure keeps a visible cleanup state with original-position anchors.
Margin-note measurement temporarily uses the 16rem rail width so wrapped heights are collision-safe; cleanup retains each note's original parent/index and neighboring nodes independently of its placeholder, falls back to the visible endnote list when needed, and has stylesheet-backed narrow/print visibility regression coverage.
The site-wide stylesheet defines the editorial visual tokens, typography, rules, focus-visible states, reduced-motion behavior, and print behavior. `interior-page.css` adds a small shared set of destination-page tokens and starter classes for future page compositions. The styles intentionally have no external font imports.
`SquareImage` owns the shared square, uncropped, responsive image contract for project covers and galleries and uses lazy `sizes="auto"` where appropriate so the browser selects against the scrollbar-excluding rendered width. Bio uses three native Astro Image portrait frames with explicit 2:3 sizing, contain fitting, grayscale treatment, and one descriptive plus two decorative alt classifications.

`pnpm test` runs serial missing-image-alt and invalid-project-URL validation, then uses one combined production fixture build to verify draft exclusion, complete and minimal project variants, footnotes, and RSS. A separate empty-content build checks optional homepage-section omission, followed by one final clean production build and the dependency-free Node 22 test suite with TypeScript stripping. Project artifact tests discover the current generated project set and validate every index/detail route without fixed slug lists or counts. Shared artifact helpers centralize generated HTML, metadata, navigation, and image inspection. The generated-output tests also cover tag-free visible JSON-LD, cover and no-cover index variants, prose-only `.md`/`.mdx` bodies across Markdown/HTML/JSX image forms, intrinsic responsive square-image contracts, no-optionals section omission, no-JavaScript navigation, relationship filtering, sitemap/robots/404 discovery, retired-route absence, and the final cross-artifact gate in `tests/production-artifact.test.ts`; `tests/ink-hover.test.ts` covers pointer coordinate coalescing, fine-pointer capability changes, Astro-swap cleanup, the fixed-radius masked glow, opaque black foreground text, aria-hidden decorative text copies, and the black menu-square layer; `tests/margin-note-layout.test.ts` covers ordered collision-free offsets, `tests/margin-notes.test.ts` covers injected-port restoration and cleanup failures, and `tests/margin-notes-browser.test.ts` exercises `initializeMarginNotes()` against before/after-print events, media-query changes, resize scheduling, incomplete coverage, and restoration failures; `tests/navigation-runtime.test.ts` executes the built navigation script against a browser-event-order DOM harness for open/close, deferred outside-click focus restoration, breakpoint ARIA synchronization, and complete swap listener cleanup. `pnpm verify` is the local and deployment artifact gate, and post-deploy evidence is recorded in `docs/release-checks/portfolio-redesign.md`.

`BaseLayout` owns the canonical metadata contract: every page supplies a title and description, while canonical paths resolve through the configured `Astro.site`; the shared origin is defined in `src/site-config.ts`. Current indexable output is checked for distinct self-canonicals and matching Open Graph/Twitter title and description values; 404 is intentionally `noindex`.

The production RSS feed includes the full rendered article content for every published post, including formatted Markdown, footnotes, and the shared author signature from `src/components/BlogAuthorSignature.astro`. Relative root `href` and `src` values in rendered article HTML are normalized to absolute URLs at `https://www.marcelinebelardo.com`; external, mail, fragment, and protocol-relative targets remain unchanged. The RSS fixture build checks feed-layer escaping and decoded article HTML without claiming parser-level XML proof.

The real CV upload path is `public/marceline-belardo-cv.pdf`, served at `/marceline-belardo-cv.pdf`; preserve that filename when uploading the binary. This documents the intended path and does not imply that the binary currently exists in the repository.

## Coding principles

1. **Simplicity** — Prefer built-in Astro features. No new deps without asking.
2. **Ask before acting** — Get approval for structural changes, new dependencies, non-trivial refactors.
3. **Stay consistent** — Match existing naming, organization, and style.
4. **Static only** — No SSR, no on-demand routes.

## Instructions for agents

1. When significant changes are made, update the AGENTS.md file

## Homepage design comparison — Wide photograph

This branch (`codex/photo-wide`) is a local design study for comparison with the other photo-layout branch. The homepage uses `src/styles/home-design.css` and sentence-case shared utility typography. It now consists only of the name, a smaller right-aligned photograph, and page links; the reading widths, routes, and blog behavior remain intact. `PhotoStudy.astro` reserves a constrained photograph frame and accepts `src/assets/marcy_sensouji.jpg` with its meaningful alt. The homepage photo uses a right-aligned width of `min(72vw, 64rem)` on wide screens and full width on mobile, with centered cover cropping; project `SquareImage` behavior remains unchanged while Bio uses its native 2:3 portrait triptych. The shared focus-managed compact menu appears across Home, Bio, Projects, Blog, Contact, project details, blog details, and tag archives through `data-compact="always"`, with visible in-flow links when JavaScript is disabled. The homepage hides the small home brand. Home and Bio text use `GlowText.astro`; `BaseLayout` provides the progressive `ink-hover` pointer field to text targets and the shared menu on fine-pointer devices. See `docs/homepage-design-comparison.md` for preview and photo instructions.

### Photo-wide landing and Bio refinement

`home-design.css` sizes the title/photo/directions composition to 100svh, with minimum height allowing overflow on short screens or enlarged text rather than clipping content. The homepage footer is hidden. `compact-navigation.css` supplies the shared dark-square menu control and small home brand, preserving the accessible name, focus behavior, and visible no-JavaScript baseline. The homepage hides the brand. The shared header lets the page beneath receive pointer events while keeping the menu controls interactive. `ink-hover.css` keeps real text fully opaque black and layers a grainy, multicolor duplicate beneath it in an `aria-hidden` decorative span; a pointer-following radial mask and 8px blur reveal a localized glow that bleeds about 6–12px around letter edges. `GlowText.astro` renders the paired copies and `BaseLayout` initializes the pointer field once. The menu keeps a black foreground square above its matching localized color glow. Fine-pointer setup remains progressive; touch, coarse-pointer, and no-JavaScript states stay black. `interior-page.css` defines starter page-width, heading, and section tokens and classes without changing the current Projects, Blog, or Contact compositions. `bio-design.css` arranges the supplied mirror photograph as a native 2:3 grayscale triptych with compact marginal text and readable desktop geometry; it stacks on small screens. The first image uses the descriptive alt `Marceline Belardo taking a mirror photograph with a camera`; the two repeated images are decorative with empty alt text. Bio copy remains in `bioContent`. The homepage photo alone uses centered cover cropping.
