# Wide photograph

This is `codex/photo-wide`, one of two independent homepage compositions based on the same starting commit. Both use the same introduction, published projects, recent writing, contact link, and neutral photograph placeholder. No changes are published to the live website.

- `codex/photo-wide`: large nameplate, edge-to-edge cropped landscape photograph, wide project rows, and a compact menu at every viewport width.
- `codex/photo-index`: two-line nameplate, tall photograph alongside the work index.

## Preview

From this checkout, run `nix develop --command pnpm dev --host 127.0.0.1 --port 4321` and open `http://127.0.0.1:4321/`. The isolated checkouts are under `.worktrees/photo-wide` and `.worktrees/photo-index` in the original repository, so both can run at once. When using these branches elsewhere, run `pnpm install --frozen-lockfile` first.

## Add your photograph

1. Add your photo as `src/assets/homepage-photo.jpg` in this checkout. Add the same file to the other checkout for a direct comparison. The source file must actually be JPEG.
2. Set the `alt` constant in `src/components/PhotoStudy.astro` to a meaningful description. With an image present and empty alt text, the build deliberately reports an error.
3. The image automatically replaces the placeholder and Astro generates responsive versions. The wide layout crops to fill the browser width and a frame around 65% of the viewport height (60% on mobile), with minimum/maximum heights. Cropping is centered for now; adjust `object-position` in `src/styles/home-design.css` when choosing a focal point. The separate index branch retains its original contain framing.
4. Run `nix develop --command pnpm verify` before publishing.

The homepage style is in `src/styles/home-design.css`; the introduction is in `src/pages/index.astro`. Shared navigation and metadata use readable sentence case. The homepage hides the repeated brand label and uses the Menu button at all widths. Without JavaScript its navigation links remain visible above the title. Other pages retain their usual responsive navigation. Blog layout and functionality, publication filtering, existing project slugs, and navigation behavior are preserved. The portfolio project's outdated React/Tailwind description is corrected in both branches. Existing case-study content is otherwise retained so this comparison isolates the design choice.

## Validation

Both studies passed `pnpm verify` on 2026-09-06: 15 Python tests, negative validation and production/empty-content fixture builds, a clean production build, and 134 Node tests. Both local homepage previews compiled and returned HTTP 200. Browser visual inspection was not performed.

The edge-to-edge photo and desktop menu refinement passed `pnpm verify` on 2026-09-07 with the supplied photograph: 15 Python tests, fixture builds, final production build, and 135 Node tests. The image checks allow cover fitting only for the single homepage photograph; SquareImage checks remain intact.
