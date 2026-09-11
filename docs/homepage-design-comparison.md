# Photo-wide — current direction

Branch: `codex/photo-wide`.

The homepage is now a single-screen photographic landing: name at the top, a smaller right-aligned photograph in the central space, and Projects, Blog, Bio, and Contact links along the bottom. Project and writing previews have been removed. A blank dark-ink square opens the accessible menu. The composition may scroll on short viewports or with enlarged text so content remains reachable.

Fine pointers reveal a textured, multicolor radial field that follows the pointer inside the homepage title, page links, and photo-page menu square. The field uses a fixed radius and fades back to the normal ink color outside that radius; touch and coarse-pointer devices retain the plain ink treatment.

Bio uses the supplied mirror photograph as a native 2:3 grayscale triptych, with compact marginal text and readable desktop geometry. The portrait remains uncropped; the first panel has descriptive alt text and the repeated panels are decorative. It shares the dark-ink menu square; the layout stacks on narrow screens.

## Preview

From the repository root, run `nix develop --command pnpm --dir .worktrees/photo-wide dev --host 127.0.0.1 --port 4321`.

Open `http://127.0.0.1:4321/` or `http://127.0.0.1:4321/bio/`.

## Images and styles

The homepage photo is `src/assets/marcy_sensouji.jpg`, showing Marceline Belardo in profile wearing glasses with a temple pagoda behind her at Sensōji in Tokyo. Its description is the `alt` constant in `src/components/PhotoStudy.astro`. Add both when changing the image. Cropping uses a centered horizontal position with a 30% vertical focal point; change `object-position` in `src/styles/home-design.css` to adjust it.

Bio uses `src/assets/marcy_mirror.jpg` in three native 2:3 portrait frames, with copy and alt text in `src/pages/bio/index.astro`. Its grayscale triptych layout is in `src/styles/bio-design.css`. The shared square menu is in `src/styles/photo-navigation.css`.

The alternative `codex/photo-index` branch remains as the original comparison. Nothing has been published to the live site. Run `pnpm verify` before publishing.

## Validation

The final `pnpm verify` passed on 2026-09-12: 15 Python tests, content validation and fixture builds, a clean production build, and 138 Node tests. All code changes and revisions were delegated to GPT-5.6 Luna at Extra High and reviewed by the parent agent.

On 2026-09-12, browser review covered the 1440×900 desktop composition, a 326px mobile viewport, and Bio at desktop width. The title responds at the top edge, the menu square keeps its dark-ink base while showing the textured color field, and opening then closing with Escape preserves the existing focus-managed behavior. The implementation is a local design study and has not been published to the live site. Run `pnpm verify` after changes; browser review should also cover no-JavaScript navigation and the 360px, 768px, and 1280px compositions.
