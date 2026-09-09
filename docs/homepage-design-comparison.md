# Photo-wide — current direction

Branch: `codex/photo-wide`.

The homepage is now a single-screen photographic landing: name at the top, the photograph filling the central space, and Projects, Blog, Bio, and Contact links along the bottom. Project and writing previews have been removed. A blank Prussian-blue square opens the accessible menu. The composition may scroll on short viewports or with enlarged text so content remains reachable.

The homepage comparison has three dev-only motif previews. The default is `brackets`, with an asymmetric pair of blue crop brackets tying the title to the photograph. `spine` replaces those with a single blue rail aligned to the menu mark, and `disc` uses a blue disc intersecting the photograph's right paper edge. Use `?motif=brackets`, `?motif=spine`, or `?motif=disc` in development; production always renders the default brackets treatment.

Bio uses the supplied mirror photograph as a native 2:3 grayscale triptych, with compact marginal text and readable desktop geometry. The portrait remains uncropped; the first panel has descriptive alt text and the repeated panels are decorative. It shares the blue menu square; the layout stacks on narrow screens.

## Preview

From the repository root, run `nix develop --command pnpm --dir .worktrees/photo-wide dev --host 127.0.0.1 --port 4321`.

Open `http://127.0.0.1:4321/`, `http://127.0.0.1:4321/?motif=spine`, `http://127.0.0.1:4321/?motif=disc`, or `http://127.0.0.1:4321/bio/`.

## Images and styles

The homepage photo is `src/assets/marcy_sensouji.jpg`, showing Marceline Belardo in profile wearing glasses with a temple pagoda behind her at Sensōji in Tokyo. Its description is the `alt` constant in `src/components/PhotoStudy.astro`. Add both when changing the image. Cropping uses a centered horizontal position with a 30% vertical focal point; change `object-position` in `src/styles/home-design.css` to adjust it.

Bio uses `src/assets/marcy_mirror.jpg` in three native 2:3 portrait frames, with copy and alt text in `src/pages/bio/index.astro`. Its grayscale triptych layout is in `src/styles/bio-design.css`. The shared square menu is in `src/styles/photo-navigation.css`.

The alternative `codex/photo-index` branch remains as the original comparison. Nothing has been published to the live site. Run `pnpm verify` before publishing.

## Validation

On 2026-09-10, the full `pnpm verify` passed: 15 Python tests, validation and fixture builds, a production build, and 135 Node tests. A final production build also passed after the crop-position adjustment. All three local motif URLs and Bio returned HTTP 200. Source and generated output were reviewed; browser visual inspection was not performed. The implementation and revisions were delegated to GPT-5.6 Luna at Extra High.
