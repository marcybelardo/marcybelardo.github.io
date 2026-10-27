# Standard.site publishing

## Operation

1. Author blog Markdown with an explicit, immutable lowercase `slug` and published metadata. Use `draft: true` while writing.
2. Run `pnpm verify`, then deploy the website through the normal workflow.
3. Run `pnpm standard-site:publish` locally. It performs source safety checks, builds the website afresh, validates the local export, starts loopback OAuth, and prints a dry-run plan.
4. Review the changes. Run `pnpm standard-site:publish --write` only when ready to create/update records. It repeats the fresh-build and authorization workflow.

`--help` has no build, authentication, or network side effects. No publishing is part of website deployment or ordinary builds. This is manual publishing after deployment, not automatic synchronization: removed or newly drafted posts do not delete remote records. There are no media uploads or automatic PDS write retries.

The CLI authorizes on `127.0.0.1` using ephemeral local OAuth, without app passwords or persisted sessions. Its exact scope is:

```text
atproto repo:site.standard.publication?action=create&action=update repo:site.standard.document?action=create&action=update
```

No delete, wildcard, blob, graph, or identity permission is requested. `STANDARD_SITE_ACCOUNT` can select the login handle; the authenticated DID must match the configured publication owner. Real authorization consent and PDS permission enforcement are not exercised by local tests.

## One static export

`src/pages/standard-site/records.json.ts` uses Astro's validated blog collection, production publication filtering, `render()`, and a reused Astro container. Only article `Content` is rendered, not the page layout or author signature. The static public URL is `/standard-site/records.json`; it is not a navigation or sitemap destination. Its deterministic version-1 envelope contains a planned publication, sorted planned documents, an aggregate excluded-draft count, and published legacy route IDs missing explicit slugs. It contains no draft metadata, bodies, IDs, credentials, source dumps, or filesystem paths.

Full plaintext is retained, including accessible image alt text, visible footnote references, and each definition once. Script/style/template/comment and decorative/backlink noise are removed before library text serialization. Block boundaries, tables, and code whitespace are handled by the serializer rather than a custom Markdown parser. Formatting improvements may cause first-run document updates without changing record identities. Rendering errors block export/publishing; raw Markdown is not a fallback. The existing Astro configuration has no MDX integration, and this workflow adds none.

`src/standard-site/records.ts` is the shared construction and validation boundary. Record types and schemas come from the pinned atcute lexicons, with application checks for stable identities, canonical paths, required full-text strings (including valid empty strings), and envelope consistency. The approved direct dependencies are `hast-util-from-html` **2.0.3** and `hast-util-to-text` **4.0.2**; no extra Markdown plugins or export integrations are needed.

## Fresh input and fail-closed behavior

The CLI sequence is argument/help handling → source preflight → awaited production Astro build → local `dist/standard-site/records.json` read and validation → source/export comparison → OAuth → remote planning → optional writes.

`scripts/standard-site/source-preflight.ts` rejects input-root and descendant symlinks before following them and reads Markdown/MDX with fatal UTF-8 decoding. It uses Astro's public `parseFrontmatter` only for duplicate/membership/count checks, not record conversion or a second content schema. This catches duplicate published identities before Astro's loader can overwrite IDs. Collisions involving drafts are caught by the subsequent exact source/export membership and draft-count comparison before OAuth. Preflight errors prevent even the build; failed builds never read an older export. The programmatic Astro build API is isolated because it is experimental. Output is fixed to repository-relative `dist` with no stale/skip-build option, and the CLI never fetches the deployed feed.

Missing/malformed/unsupported exports, disabled or mismatched owners, incomplete legacy membership, invalid schemas, absent/non-string `textContent`, duplicate identities/paths, and inconsistent keys/URIs/sites fail before authentication. A published legacy post without a slug still builds its existing title-derived website route but is omitted from documents and blocks publishing. Drafts without slugs remain excluded drafts.

## Identity and write safeguards

`src/site-config.ts` supplies the canonical `SITE_ORIGIN` and owner configuration. `src/standard-site/identity.ts` owns unchanged deterministic TID derivation: publication key `5jpjlmfobo2uz`, and document keys derived from immutable explicit slugs. The default owner DID is the currently resolved owner of `marcelinebelardo.com`. Never change a published slug or `PUBLIC_STANDARD_SITE_DID` without an explicit identity migration; doing so creates different AT-URIs rather than renaming existing records.

An explicitly empty `PUBLIC_STANDARD_SITE_DID` disables publication: discovery and document links are absent, the export is disabled, and the CLI refuses it without authentication. It never falls back to the default DID. Enabled discovery remains at `/.well-known/site.standard.publication`; published article heads advertise matching `rel="site.standard.document"` AT-URIs.

The planner reads remote state and produces stable field diffs. Dry runs send no writes. Apply writes the publication before documents in slug order, skips unchanged records, uses `swapRecord: null` for creates and observed CIDs for updates, reports `InvalidSwap` explicitly, and verifies each returned URI and exact value by reading it back. It checks DID ownership and preserves structured PDS errors. Validation is local against pinned schemas; remote Lexicon validation remains optimistic for PDS compatibility. Discovery GETs retain bounded timeouts/retries; writes are never automatically retried.

## Maintenance and verification

Run `pnpm verify` for source validation, controlled production fixtures, website/RSS/navigation/footnote compatibility, and Node tests. Controlled fixtures cover deterministic exports, privacy, legacy and disabled builds, rendered-text fidelity, and discovery consistency. Unit/scenario tests cover schemas, immutable identity vectors, preflight failures, fresh-build ordering, least-privilege scope, dry runs, CAS conflicts, and read-back failures with a fake PDS. Website source expectations are independently read using Astro's public frontmatter parser, not the export under test.

Implementation verification needs no live OAuth approval, PDS writes, deployment, or deletion. A later operator-authorized live dry run can check account/PDS compatibility without writes. The former custom source converter and Python metadata exporter are not supported paths.
