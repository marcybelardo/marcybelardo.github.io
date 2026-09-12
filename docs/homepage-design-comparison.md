# Photo-wide — About consolidation

Branch: `codex/photo-wide`.

The homepage is now a single-screen photographic landing: name at the top, a smaller right-aligned photograph in the central space, and Projects, Blog, and About links along the bottom. Project and writing previews have been removed. A blank dark-ink square opens the accessible menu. The composition may scroll on short viewports or with enlarged text so content remains reachable.

Fine pointers reveal a textured, multicolor glow behind the homepage title and links. The foreground text stays fully opaque black; an `aria-hidden` decorative text span sits beneath it, with a pointer-following radial mask and 8px blur that bleeds roughly 6–12px around letter edges. The black foreground span remains the only semantic text copy. The menu keeps its black square above an oversized, blurred textured field without a surface mask. Its homepage header follows the landing page's `clamp(1rem, 2vw, 2.5rem)` edge gutter, pins the square at far right, and opens the panel below/right of the title area. Touch, coarse-pointer, and no-JavaScript states retain plain black ink and the existing visible menu baseline.

Prominent Home, About, Projects, and Blog titles use the shared `--font-display` compressed sans stack. Long-form blog copy remains serif; utility metadata remains regular sans.

About brings the verified software, open-source, practice, education, and skills copy together with the CV link and supplied mirror photograph. The native 2:3 grayscale triptych keeps the full portrait visible; the first panel has descriptive alt text and the repeated panels are decorative. A full-width contact line follows the composition, and the shared social icon footer remains visible. `/bio/` and `/contact/` redirect here and are excluded from the sitemap.

The same compact menu now anchors Home, About, Projects, Blog, project details, blog details, and tag archives. Interior routes show a small home link beside the menu; Home hides the duplicate brand beside its large title. Every route keeps the visible server-rendered links when JavaScript is disabled. `GlowText.astro` provides the paired glow and semantic text spans, and the shared layout loads the ink-hover styles and runtime once. `interior-page.css` adds neutral width, heading, and section tokens for future destination-page work.

## Preview

From the repository root, run `nix develop --command pnpm --dir .worktrees/photo-wide dev --host 127.0.0.1 --port 4321`.

Open `http://127.0.0.1:4321/` or `http://127.0.0.1:4321/about/`.

## Images and styles

The homepage photo is `src/assets/marcy_sensouji.jpg`, showing Marceline Belardo in profile wearing glasses with a temple pagoda behind her at Sensōji in Tokyo. Its description is the `alt` constant in `src/components/PhotoStudy.astro`. Add both when changing the image. Cropping uses a centered horizontal position with a 30% vertical focal point; change `object-position` in `src/styles/home-design.css` to adjust it.

About uses `src/assets/marcy_mirror.jpg` in three native 2:3 portrait frames, with verified copy and alt text in `src/pages/about/index.astro`. Its grayscale triptych and contact line layout is in `src/styles/about-design.css`. The shared square menu is in `src/styles/compact-navigation.css`; shared interior starter styles are in `src/styles/interior-page.css`.

The alternative `codex/photo-index` branch remains as the original comparison. Nothing has been published to the live site. Run `pnpm verify` before publishing.

## Validation

The final `pnpm verify` passed on 2026-09-12: 15 Python tests, content validation and fixture builds, a clean production build, and 139 Node tests. All code changes and revisions were delegated to GPT-5.6 Luna at Extra High and reviewed by the parent agent.

On 2026-09-12, browser review covered the 1440×900 desktop composition, a 326px mobile viewport, and About at desktop width. It confirmed the localized multicolor glow sits behind fully opaque black foreground text, its aria-hidden duplicate does not add accessible text, and the menu square keeps its dark-ink face above the textured aura. Opening and closing with Escape preserves the existing focus-managed behavior. The implementation is a local design study and has not been published to the live site. Run `pnpm verify` after changes; browser review should also cover About at 360px, 768px, and 1280px, its contact line, and no-JavaScript navigation.
