# Blog and Contact page composition

The Blog index and tag archives present the same published writing entries through `BlogIndexEntry`. Each entry keeps its publication date at the left, a glowing linked title and description in the main column, optional square cover art beside the summary, and tag links at the right. The RSS link sits across from the page heading. Both routes use `src/styles/blog-design.css` so the entry structure stays identical.

Blog details open with the title in `GlowText`, followed by the date and tag links. An optional image receives generous separation from the title and article body. The body keeps the readable serif measure. The shared author signature, full RSS content, semantic footnote baseline, and margin-note enhancement with its narrow and print fallbacks remain in place.

Contact removes the introductory paragraph and centers the verified `mailto:marcy@marcelinebelardo.com` address in a sparse, near-viewport composition. Its accessible name remains “Email Marceline at marcy@marcelinebelardo.com”; GitHub, Bluesky, and Instagram appear as labeled text links along the lower edge. The page has no photo and omits the shared icon footer to avoid duplicate profile links. Its layout uses a minimum viewport height rather than a fixed height so short displays and enlarged text can extend and scroll.

Generated checks in `tests/generated-blog.test.ts` cover the shared entry and its visible glow; `tests/generated-home.test.ts` covers Contact labels, content, and scroll-safe sizing. Existing margin-note tests continue to cover restoration, narrow layouts, and print behavior.
