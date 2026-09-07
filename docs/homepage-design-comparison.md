# Photo-wide — current direction

Branch: `codex/photo-wide`.

The homepage is now a single-screen photographic landing: name at the top, the photograph filling the central space, and Projects, Blog, Bio, and Contact links along the bottom. Project and writing previews have been removed. A blank Prussian-blue square opens the accessible menu. The composition may scroll on short viewports or with enlarged text so content remains reachable.

Bio uses the existing portrait, compact marginal text and generous gaps. The portrait remains uncropped. It shares the blue menu square; the layout stacks on narrow screens.

## Preview

From the repository root, run `nix develop --command pnpm --dir .worktrees/photo-wide dev --host 127.0.0.1 --port 4321`.

Open `http://127.0.0.1:4321/` or `http://127.0.0.1:4321/bio/`.

## Images and styles

The homepage photo is `src/assets/homepage-photo.jpg`. Its description is the `alt` constant in `src/components/PhotoStudy.astro`. Add both when changing the image. Cropping is centered; change `object-position` in `src/styles/home-design.css` to adjust its focal point.

Bio uses `src/assets/20260425_29.jpg` via SquareImage, with copy and alt text in `src/pages/bio/index.astro`. Its layout is in `src/styles/bio-design.css`. The shared square menu is in `src/styles/photo-navigation.css`.

The alternative `codex/photo-index` branch remains as the original comparison. Nothing has been published to the live site. Run `pnpm verify` before publishing.

## Validation

The landing and Bio refinement passed `pnpm verify` on 2026-09-07: 15 Python tests, content validation and fixture builds, final production build, and 135 Node tests. Browser visual inspection was not performed.
