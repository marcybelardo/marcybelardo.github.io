# Portfolio redesign test requirements

## Validation strategy

The repository currently has no test runner. Phase 1 introduces Node 22's built-in `node:test` runner with TypeScript stripping, so no test-framework dependency is added.

`pnpm test` must build the static site before running focused unit and generated-artifact tests. `pnpm verify` is the local and CI quality gate. Generated HTML/XML assertions prove static contracts; a documented manual matrix covers responsive layout, keyboard interactions, margin positioning, print, DNS, and TLS behavior that static string inspection cannot prove.

Test behavior, not implementation details. Pure query/layout tests may import Functional Core modules. Artifact tests must inspect `dist/` as a visitor or crawler receives it.

## Acceptance-criteria mapping

| Acceptance criterion | Required evidence |
| --- | --- |
| `portfolio-redesign.AC1.1` | `tests/production-artifact.test.ts` asserts Home, Projects, Blog, Bio, Contact, every published project, the preserved blog detail, published tags, RSS, sitemap, and 404 artifacts exist. |
| `portfolio-redesign.AC1.2` | Generated shell tests inspect every HTML document for the Projects, Blog, Bio, and Contact header links. Manual narrow-width keyboard check proves one-interaction access. |
| `portfolio-redesign.AC1.3` | Generated shell/migration tests assert Code, Paintings, and Photography are absent from primary navigation and exist only as migration documents. |
| `portfolio-redesign.AC1.4` | Query unit tests reject drafts. Temporary draft fixtures prove no detail, tag, homepage, relation, RSS, or sitemap output is generated. |
| `portfolio-redesign.AC2.1` | `tests/generated-home.test.ts` asserts the practice statement, Selected Projects, Recent Writing, and contact prompt. |
| `portfolio-redesign.AC2.2` | Query tests prove selected entries come from the project collection and accept multiple disciplines. Generated output renders one integrated list. |
| `portfolio-redesign.AC2.3` | Homepage output contains no Art or Code project headings/regions. |
| `portfolio-redesign.AC2.4` | Empty featured/recent fixtures omit the complete heading and container; no empty layout markers remain. |
| `portfolio-redesign.AC3.1` | Content/build tests require stable explicit slugs, descriptions, dates, and disciplines; generated-project tests assert one detail route per published entry. |
| `portfolio-redesign.AC3.2` | Fixture variants render optional image, repository, live URL, collaborators, and external reference groups. |
| `portfolio-redesign.AC3.3` | Generated-image/project tests assert cover/gallery square wrappers and contain behavior, and reject raw Markdown body-image output. Manual checks prove portrait/landscape sources are not visually cropped. |
| `portfolio-redesign.AC3.4` | Initial records and empty optional fixtures produce no empty controls, `href="#"`, broken relation links, or placeholder metadata. |
| `portfolio-redesign.AC3.5` | A temporary invalid image-without-alt fixture must make content validation/build fail; cleanup runs even when the assertion fails. |
| `portfolio-redesign.AC4.1` | Generated CSS/HTML assertions cover serif reading stack, restrained utility stack, Prussian Blue token, rules, and absence of parallax/card hooks. Manual review confirms the visual result. |
| `portfolio-redesign.AC4.2` | Generated image markup contains intrinsic width/height plus responsive candidates; tests reject sole use of the 2048px originals. |
| `portfolio-redesign.AC4.3` | Pure collision tests prove ordered, gap-preserving offsets. Manual wide-screen fixture check proves reference alignment and no overlap. |
| `portfolio-redesign.AC4.4` | Footnote fixture HTML retains reference IDs, definition IDs, and all backlinks without JavaScript. Print-event tests restore moved nodes before printing; manual narrow/print/JS-disabled checks confirm presentation. |
| `portfolio-redesign.AC4.5` | Malformed pair/measurement tests never add enhanced state. A forced runtime failure leaves the original endnotes readable. |
| `portfolio-redesign.AC4.6` | Output/CSS tests verify semantic links and focus-visible rules. Manual keyboard-only navigation covers header, menu, project, footnote, and contact links. |
| `portfolio-redesign.AC5.1` | Artifact tests enumerate indexable pages and require unique titles/descriptions, self-canonicals, Open Graph, and Twitter metadata. |
| `portfolio-redesign.AC5.2` | JSON-LD assertions compare `WebSite`/`Person`, `BlogPosting`, and `CreativeWork` values with visible page values and reject absent invented fields. |
| `portfolio-redesign.AC5.3` | RSS and both sitemap files use the custom domain, include published URLs, and exclude drafts. |
| `portfolio-redesign.AC5.4` | `dist/robots.txt` exists and references `https://www.marcelinebelardo.com/sitemap-index.xml`. |
| `portfolio-redesign.AC5.5` | Regression assertions require `dist/blog/the-devil-you-know/index.html` and the matching canonical/RSS URL. |
| `portfolio-redesign.AC5.6` | Migration tests require `noindex,follow`, canonical Projects destination, zero-delay refresh, visible fallback link, and sitemap exclusion for all three obsolete routes. |
| `portfolio-redesign.AC5.7` | Post-deploy `curl -IL`, DNS, GitHub Pages setting, and certificate checks must end at the HTTPS `www` origin without TLS errors. Record results in `docs/release-checks/portfolio-redesign.md`; this cannot be satisfied by repository tests alone. |
| `portfolio-redesign.AC5.8` | Search canonical link values, RSS, sitemap, and JSON-LD output; fail on any `marcybelardo.github.io` occurrence. |

## Required test files

- `tests/smoke.test.ts` — runner setup.
- `tests/content-queries.test.ts` — draft filtering, ordering, limits, tags, stable IDs, relations, immutability.
- `tests/page-metadata.test.ts` — pure canonical/metadata/JSON-LD rules.
- `tests/generated-metadata.test.ts` — page metadata and header contracts.
- `tests/generated-images.test.ts` — dimensions, responsive sources, square/contain hooks.
- `tests/generated-projects.test.ts` — project index/details, optional regions, drafts, relations.
- `tests/generated-home.test.ts` — homepage, Bio, Contact, empty sections.
- `tests/generated-blog.test.ts` — blog routes, tags, structured data, drafts, RSS.
- `tests/footnotes.test.ts` — semantic reference/definition/backlink preservation.
- `tests/margin-note-layout.test.ts` — pure collision layout and failure results.
- `tests/margin-notes.test.ts` — injectable enhancement/restoration controller, including print events.
- `tests/generated-discovery.test.ts` — sitemap, robots, 404.
- `tests/generated-migrations.test.ts` — obsolete route migration contract.
- `tests/production-artifact.test.ts` — final cross-artifact acceptance gate.

Serial pre-build fixture scripts:

- `tests/content-validation-negative.mjs` — proves missing image alt text fails Astro content validation, then cleans up.
- `tests/project-fixture-build.mjs` — builds exact draft/optional project fixtures, inspects output, then cleans up before the final clean build.

## Manual release matrix

Before declaring the redesign complete:

1. Run `pnpm verify` from the worktree.
2. Inspect representative pages at 360px, 768px, and 1280px.
3. Complete the keyboard-only header/menu/project/contact/footnote path.
4. Check wide margin notes, narrow endnotes, print preview, JavaScript disabled, and forced enhancement failure.
5. Check square portrait and landscape composition.
6. After deployment, verify GitHub Pages settings, DNS records, redirect chains, and TLS certificates for GitHub, apex, and `www` hostnames; record the evidence in `docs/release-checks/portfolio-redesign.md`.
