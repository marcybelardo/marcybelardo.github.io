# Projects catalogue and case studies

The Projects index presents published work as an image-led editorial catalogue. At desktop widths each row has one substantial square preview and one text column: ordinal/year, linked title, existing description, and available disciplines, status, and tags. Below 56rem, the square preview sits above the entry text and keeps a readable width. The `GlowText` treatment is used for the page title and project links. A verified cover uses `SquareImage` with meaningful alt text and responsive image sources. When no cover exists, the same slot contains the quiet, non-interactive text `Project preview forthcoming`; adding a real `coverImage` and `coverImageAlt` automatically replaces it. The placeholder is an index-only state, not an image or case-study content.

The index title, project entry titles, project detail title, and its gallery/related section headings use the shared `--font-display` compressed sans stack. Ordinals, metadata, and captions remain regular utility sans.

Project detail routes use a large `GlowText` title, a short description, and a marginal column for the published metadata and available links. The body stays in a readable text measure. Optional covers and galleries remain `SquareImage` instances so their complete image is preserved within a square frame. Related projects and writing continue to use the published-entry relationship resolver.

These compositions are styled in `src/styles/projects-design.css`. They use existing content fields and intentionally do not fill sparse entries with inferred copy, imagery, or metadata. When authoring a project, add a cover only with verified alt text and add gallery captions only when supplied by the source material.
