# Portfolio redesign implementation plan — Phase 2

**Goal:** Replace the current sidebar/parallax presentation with an accessible editorial shell and a reusable uncropped square-image contract.

**Architecture:** `BaseLayout` owns semantic navigation and document framing. Site-wide CSS defines the LaTeX-influenced visual tokens and responsive behavior. `SquareImage` wraps Astro's optimized image pipeline while keeping content images complete inside a square.

**Tech stack:** Astro 6.4, TypeScript, Tailwind CSS v4, `astro:assets`, CSS media queries

**Scope:** 6 phases from the original design (phase 2 of 6)

**Codebase verified:** 2026-07-28 22:02 PST

---

## Acceptance criteria coverage

This phase implements and tests:

### portfolio-redesign.AC1: Static information architecture

- **portfolio-redesign.AC1.2 Success:** Every page exposes Projects, Blog, Bio, and Contact through the primary header; narrow screens require no more than one interaction.
- **portfolio-redesign.AC1.3 Success:** Code, Paintings, and Photography no longer appear as primary sections.

### portfolio-redesign.AC3: Unified project portfolio

- **portfolio-redesign.AC3.3 Success:** Every displayed image occupies a square frame while preserving the complete uncropped source image.

### portfolio-redesign.AC4: Visual system and footnotes

- **portfolio-redesign.AC4.1 Success:** The site uses serif reading typography, restrained utility typography, a Prussian Blue accent, editorial rules, and no card-heavy or parallax treatment.
- **portfolio-redesign.AC4.2 Success:** Square images reserve dimensions and use appropriately sized generated assets.
- **portfolio-redesign.AC4.6 Success:** Navigation, project links, footnote links, and contact links are keyboard accessible with visible focus.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->
<!-- START_TASK_1 -->
### Task 1: Build the editorial visual system

**Verifies:** portfolio-redesign.AC4.1, portfolio-redesign.AC4.6

**Files:**

- Modify: `src/styles/global.css:1-35`
- Modify: `src/pages/code/index.astro:47-153`
- Modify: `tests/generated-metadata.test.ts`

**Implementation:**

1. Keep `@import "tailwindcss"` and replace the current Google sans/mono-led styling with CSS custom properties for paper, ink, muted ink, rule, and Prussian Blue (`#003153`).
2. Use a system/Georgia serif reading stack and a restrained system sans utility stack; do not add font dependencies.
3. Define editorial measure, vertical rhythm, heading scale, rules, metadata typography, explicit article element styles, and `:focus-visible` outlines for links, buttons, and controls.
4. Add reduced-motion and print rules. Remove all parallax markup/script and card-heavy styling from the temporary Code page.
5. Keep Tailwind v4 configuration in CSS/Vite only; do not create a Tailwind config or add Typography.

**Testing:**

Tests must verify:

- portfolio-redesign.AC4.1: output contains the editorial stylesheet tokens and contains no `data-parallax-speed`.
- portfolio-redesign.AC4.6: global focus-visible rules cover links and buttons.

**Verification:**

Run: `pnpm test`

Expected: Production output builds without parallax hooks or card-heavy project markup.

**Commit:** `feat: establish editorial visual system`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Replace the header with accessible primary navigation

**Verifies:** portfolio-redesign.AC1.2, portfolio-redesign.AC1.3, portfolio-redesign.AC4.6

**Files:**

- Modify: `src/layouts/BaseLayout.astro:31-139`
- Create: `src/pages/projects/index.astro`
- Create: `src/pages/bio/index.astro`
- Create: `src/pages/contact/index.astro`
- Modify: `tests/generated-metadata.test.ts`

**Implementation:**

1. Render Marceline Belardo as the homepage link and render Projects, Blog, Bio, and Contact as the only primary destinations.
2. Show all primary links directly at wide widths. At narrow widths, keep one labelled menu button and one panel; the links become available with one activation.
3. Add `aria-label`, `aria-controls`, and synchronized `aria-expanded`; hide the closed panel from keyboard/screen-reader navigation.
4. Support Escape, outside-click dismissal, first-link focus on open, and focus restoration on close. Classify the browser script as an Imperative Shell and clean up any listeners that can be registered more than once during Astro navigation.
5. Correct the swapped Instagram/GitHub SVG imports and give all social links explicit accessible names. Keep social links outside the primary navigation landmark.
6. Mark the active primary route with `aria-current="page"` using strict path matching.
7. Before switching the header, create functional destination pages so no phase ends with broken navigation:
   - Projects queries the phase 1 collection and renders a simple semantic title/description list without detail links; phase 3 adds links in the same commit that creates their destinations.
   - Bio renders the existing “Software Developer” and “Building maintainable, friendly, and performant programs” copy.
   - Contact renders the verified email, GitHub, Bluesky, and Instagram links.
   Phase 3 and 4 replace these minimal working versions with their full editorial presentations.

**Testing:**

Generated-output tests must verify:

- portfolio-redesign.AC1.2: the four destinations appear on every built HTML page.
- portfolio-redesign.AC1.3: Code, Paintings, and Photography do not appear in the primary navigation.
- portfolio-redesign.AC4.6: semantic nav, labelled button, ARIA state, and focus hooks are present.

**Verification:**

Run: `pnpm test`

Expected: Header assertions pass for every generated HTML page.

Manual check: Run `pnpm dev`; test wide and narrow navigation entirely by keyboard, including Escape and restored focus.

**Commit:** `feat: add accessible editorial navigation`
<!-- END_TASK_2 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->
<!-- START_TASK_3 -->
### Task 3: Create and adopt the square-image component

**Verifies:** portfolio-redesign.AC3.3, portfolio-redesign.AC4.2

**Files:**

- Create: `src/components/SquareImage.astro`
- Modify: `src/pages/code/index.astro:1-153`
- Create: `tests/generated-images.test.ts`

**Implementation:**

1. Accept `ImageMetadata`, required `alt`, optional `class`, and `priority?: boolean` defaulting to `false`. Use an Astro `type Props`, not `any`.
2. Render a neutral square wrapper with `aspect-ratio: 1`, then `<Image>` from `astro:assets` with constrained responsive output, inferred intrinsic dimensions, `priority={priority}`, and `fit="contain"`/`object-fit: contain`.
3. Pass the full imported image metadata, not `.src`. Allow `alt=""` only when the caller explicitly classifies an image as decorative.
4. Replace the two raw images on the temporary Code page so both existing source shapes exercise the contract. Preserve the verified portrait alt text and keep the contact image decorative.

**Testing:**

Tests must verify:

- portfolio-redesign.AC3.3: square wrapper and contain behavior for both portrait and landscape sources.
- portfolio-redesign.AC4.2: emitted images have width/height plus responsive `srcset`/`sizes`, and no original 2048px asset is used as the only source.

**Verification:**

Run: `pnpm test`

Expected: Generated-image assertions pass.

Manual check: Confirm neither source is cropped at 360px, 768px, and 1280px viewport widths.

**Commit:** `feat: add optimized square images`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Verify the shared shell across representative pages

**Verifies:** portfolio-redesign.AC1.2, portfolio-redesign.AC1.3, portfolio-redesign.AC3.3, portfolio-redesign.AC4.1, portfolio-redesign.AC4.2, portfolio-redesign.AC4.6

**Files:**

- Modify: `tests/generated-metadata.test.ts`
- Modify: `tests/generated-images.test.ts`

**Implementation:**

1. Cover homepage, blog index/detail, tag archive, Code, placeholder migration candidates, and 404 output.
2. Assert one primary navigation landmark, no duplicate IDs, corrected social identities, focus CSS, no parallax hooks, and valid square-image markup.
3. Record the manual narrow/wide/print checklist in the test file comments and phase commit body; do not claim generated HTML proves visual layout.

**Verification:**

Run: `pnpm verify`

Expected: Phase 1 and 2 tests plus the production build pass.

**Commit:** `test: verify editorial shell and images`
<!-- END_TASK_4 -->
<!-- END_SUBCOMPONENT_B -->
