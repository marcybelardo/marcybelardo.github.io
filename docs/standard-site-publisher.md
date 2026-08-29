# Standard.site publisher implementation plan

This is the ordered implementation contract for publishing the Markdown blog
collection to the Standard.site lexicons on the author's PDS.

## Implementation order

1. **Define the record boundary.** Use atcute's `site.standard.publication` and
   `site.standard.document` schemas, with deterministic TID record keys. Keep
  the canonical publication URI in every document's `site` field and map an
   immutable blog `slug` to one document TID. These deterministic TIDs are
   identity keys only; article chronology comes from `publishedAt`.
2. **Convert source content.** Discover `.md` and `.mdx` files under
   `src/content/blog/`, parse the existing frontmatter contract, exclude
   drafts, normalize dates, preserve tags/descriptions, and safely render
   Markdown/MDX into plaintext `textContent` without evaluating MDX.
3. **Expose site discovery.** Publish the exact publication AT-URI from
   `/.well-known/site.standard.publication` and add a
   `rel="site.standard.document"` link to each published blog detail page.
4. **Authenticate locally.** Run atcute's Node OAuth loopback client on
   `127.0.0.1`, request `site.standard.authFull`, and verify that the returned
   session DID is the configured publication owner.
5. **Plan before writing.** Read the publication and every document by its
   deterministic collection/rkey pair. Classify each as `create`, `update`, or
   `unchanged`; show changed fields and draft exclusions in the dry-run output.
6. **Apply safely.** With explicit `--write`, write the publication before
   documents, pass the observed CID as `swapRecord`, refuse conflicts, and read
   every changed record back for exact verification. Keep PDS lexicon
   validation optimistic because the records are validated locally against the
   pinned Standard.site schemas. Never delete records.
7. **Verify and document.** Run `pnpm verify`, keep pure planner/converter tests
   PDS-free, and document the command, scope, identity migration rule, and
   non-goals.

## Acceptance criteria

- Every published post with an explicit stable slug produces one valid `site.standard.document` record with
  title, publication URI, normalized `publishedAt`, canonical `/blog/<slug>/`
  path, description, tags, and plaintext content.
- Draft posts, invalid metadata, duplicate slugs, symlinked inputs, and
  malformed record identities fail closed; no draft appears in records, links,
  discovery output, or the dry-run plan.
- Re-running conversion yields byte-stable record values and keys. Published
  slug changes are visible as new identities rather than silent overwrites.
- The dry run performs no PDS writes. `--write` performs only creates/updates,
  uses compare-and-swap CIDs, distinguishes `InvalidSwap` conflicts from other
  PDS rejections, and verifies read-back values.
- OAuth uses a loopback redirect and the narrow Standard.site permission set;
  the publisher refuses a session belonging to a different DID. Discovery GETs
  have bounded timeout/retry behavior, while POST requests are never retried.
- The well-known endpoint and per-article head links contain the same exact
  publication/document AT-URIs used by the records.
- Tests cover conversion, TID identity, planning/diffing, CAS writes,
  post-write verification, and production Astro artifacts; `pnpm verify` passes.

## Non-goals

- No deletion or garbage collection of records that are no longer in the local
  blog collection.
- No image/blob upload, cover-image synchronization, or media processing.
- No comments, likes, feeds, subscriptions, graph records, or other Standard.site
  lexicons beyond publication and document records.
- No hosted OAuth callback, server-side session store, or long-running service;
  authorization is a local loopback CLI flow.
- No source Markdown rewrites, slug migrations, Astro SSR, or runtime publishing
  from the deployed static site.
- No claim that the Python metadata converter can authenticate, contact a PDS,
  or synchronize records; it remains a separate offline compatibility tool.
