# Projects catalogue and case studies

The Projects index presents published work as a spacious typographic catalogue. Each entry places its ordinal and year at the left, its linked title and existing description in the main column, and available disciplines, status, and tags in a metadata rail. The `GlowText` treatment is used for the page title and project links. A cover adds a dedicated square-image column; entries without covers collapse that column so the catalogue does not reserve blank space.

The index title, project entry titles, project detail title, and its gallery/related section headings use the shared `--font-display` compressed sans stack. Ordinals, metadata, and captions remain regular utility sans.

Project detail routes use a large `GlowText` title, a short description, and a marginal column for the published metadata and available links. The body stays in a readable text measure. Optional covers and galleries remain `SquareImage` instances so their complete image is preserved within a square frame. Related projects and writing continue to use the published-entry relationship resolver.

These compositions are styled in `src/styles/projects-design.css`. They use existing content fields and intentionally do not fill sparse entries with inferred copy, imagery, or metadata. When authoring a project, add a cover only with verified alt text and add gallery captions only when supplied by the source material.
