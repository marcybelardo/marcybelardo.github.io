# Blog and About page composition

The Blog index and tag archives present the same published writing entries through `BlogIndexEntry`. Each entry keeps its publication date at the left, a glowing linked title and description in the main column, optional square cover art beside the summary, and tag links at the right. The RSS link sits across from the page heading. Both routes use `src/styles/blog-design.css` so the entry structure stays identical.

Blog details open with the title in `GlowText`, followed by the date and tag links. An optional image receives generous separation from the title and article body. The body keeps the readable serif measure. The shared author signature, full RSS content, semantic footnote baseline, and margin-note enhancement with its narrow and print fallbacks remain in place.

About combines the verified software work and practice copy with the grayscale mirror-photo triptych, quiet skills text, and CV link. A full-width line below the composition links the verified `mailto:marcy@marcelinebelardo.com` address with the accessible name “Email Marceline at marcy@marcelinebelardo.com” and a localized `GlowText` effect. The shared Bluesky, Instagram, and GitHub icon footer remains visible. `/bio/` and `/contact/` are noindex static compatibility redirects to `/about/` and do not appear in the sitemap.

Generated checks in `tests/generated-blog.test.ts` cover the shared entry and its visible glow; `tests/generated-home.test.ts` covers About content, the triptych, contact line, shared footer, and compatibility redirects. Existing margin-note tests continue to cover restoration, narrow layouts, and print behavior.
