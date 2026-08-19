# Portfolio redesign release checks

This checklist records the repository checks and the operational checks required before declaring the redesign deployed. The static artifact can be verified in this worktree; GitHub Pages, DNS, TLS, browser, and print behavior require a deployed site and must not be marked complete from repository inspection alone.

## Current handoff status

- Verification date: 2026-07-29
- Operator: Codex (repository checks only)
- Deployment: production deployment completed successfully before the current content cleanup
- Repository artifact gate: **passed — `CI=true pnpm verify`, 103 tests passed, exit status 0**
- AC5.7 (GitHub Pages, DNS, HTTPS redirects, and TLS): **not verified; post-deploy evidence required**

## Repository-verifiable checks

- [x] Run `CI=true pnpm verify` after the project and retired-route contract updates: 103 tests passed, exit status 0.
- [x] Run `git diff --check` and confirm it exits successfully before commit.
- [x] Confirm the build emits the current route tree, every discovered published project/blog route, tags, RSS, sitemap, robots, and 404 through `tests/production-artifact.test.ts`.
- [x] Confirm indexable-page metadata, structured data, draft exclusion, canonical-origin restrictions, image markup, and retired-route absence through the production artifact test.
- [x] Confirm the deploy workflow invokes `pnpm verify` before the Pages deployment job can proceed.

## Post-deploy GitHub Pages and DNS gate

Complete these checks after the GitHub Pages artifact has been deployed. Do not replace “not verified” with an assumption based on local output.

| Check | Expected result | Status/evidence |
| --- | --- | --- |
| GitHub Pages custom domain | Repository Pages settings use `www.marcelinebelardo.com`. | **Not verified — deployment/settings access not performed.** |
| GitHub Pages HTTPS | “Enforce HTTPS” is enabled. | **Not verified — deployment/settings access not performed.** |
| `www` DNS | CNAME points to `marcybelardo.github.io`. | **Not verified — DNS lookup not performed.** |
| Apex DNS | A/AAAA records match GitHub’s current Pages custom-domain documentation at verification time. | **Not verified — DNS lookup not performed.** |
| Certificate | The certificate is valid for the hostname being visited and no TLS error occurs. | **Not verified — deployed endpoint not checked.** |

Record the DNS answers observed at verification time, including record type, hostname, value, and resolver/date:

```text
DNS answers: NOT RECORDED — post-deploy lookup required.
Resolver/date: NOT RECORDED.
```

Run each command after deployment and record the final URL, status, redirect chain, and TLS result. The expected final URL for every command is `https://www.marcelinebelardo.com/`.

| Command | Expected final URL/status | Actual result |
| --- | --- | --- |
| `curl -IL https://marcybelardo.github.io` | `https://www.marcelinebelardo.com/`; successful HTTPS response; no TLS errors | **Not run — deployment gate.** |
| `curl -IL http://marcelinebelardo.com` | `https://www.marcelinebelardo.com/`; successful HTTPS response; no TLS errors | **Not run — deployment gate.** |
| `curl -IL https://marcelinebelardo.com` | `https://www.marcelinebelardo.com/`; successful HTTPS response; no TLS errors | **Not run — deployment gate.** |
| `curl -IL https://www.marcelinebelardo.com` | `https://www.marcelinebelardo.com/`; successful HTTPS response; no TLS errors | **Not run — deployment gate.** |

Certificate result: **not verified — no deployed TLS handshake was performed.**

## Browser and responsive matrix

After deployment, inspect each page at 360px, 768px, and 1280px viewport widths. Mark a row only after checking the page at all three widths.

Pages: Home, Projects, one project detail, Blog, one footnoted post, Bio, Contact, and 404.

The current published blog post is not footnoted, so the footnoted-post row and the footnote-specific checks below remain pending until a deployed footnoted post is available.

| Page | 360px | 768px | 1280px | Notes |
| --- | --- | --- | --- | --- |
| Home | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Projects | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Project detail | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Blog | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Footnoted post | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Bio | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| Contact | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |
| 404 | [ ] | [ ] | [ ] | Not verified — post-deploy browser check required. |

Confirm that no page has horizontal overflow, clipped copy, empty controls, broken links, or inaccessible content at any width.

## Keyboard and interaction checks

Use keyboard only, with no pointer input:

- [ ] Reach and activate every primary navigation destination.
- [ ] Open and dismiss the compact navigation with the menu control and Escape.
- [ ] Confirm focus remains visible and returns to the menu control after dismissal.
- [ ] Activate every project, contact, repository/live/external, tag, and footnote link.
- [ ] Confirm keyboard focus remains visible across the header, page content, and footer.

Status: **Not verified — post-deploy browser/keyboard check required.**

## Footnotes, print, JavaScript-disabled, and forced-failure checks

- [ ] Wide viewport: margin notes align with their references and never overlap.
- [ ] Narrow viewport: linked endnotes remain readable in document order.
- [ ] Print preview: linked endnotes and backlinks remain present and readable; moved notes are restored before printing.
- [ ] JavaScript disabled: the semantic endnote list remains available with working reference and backlink links.
- [ ] Forced enhancement failure: the baseline endnote list remains visible and linked; no note content disappears.

Status: **Not verified — post-deploy browser/print/JavaScript-mode checks required.**

## Image checks

- [ ] Inspect at least one portrait and one landscape image.
- [ ] Confirm each image remains completely visible inside its square frame without cropping.
- [ ] Confirm responsive image candidates load correctly at narrow and wide widths.

Status: **Repository markup is covered by the production artifact test; visual image behavior is not verified until the deployed browser check.**

## Standard.site manual publication gate

The Standard.site records are manually maintained outside this repository. Do not mark a row complete from local registry edits alone; record the remote URI, live verification response, validator result, and timestamp after the first manual import or any subsequent update.

| Check | Expected result | Status/evidence |
| --- | --- | --- |
| Publication URI | `at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/<tid>` recorded in the public registry. | **Not verified — manual PDS creation pending.** |
| Document URIs | Each mapped explicit blog slug has its returned `site.standard.document` AT-URI; unmapped posts are noted. | **Not verified — manual document creation pending.** |
| Standard.site validator | Publication and each document pass validation, with any `validationStatus: unknown` limitation recorded. | **Not run — manual first-import check required.** |
| Live publication verification | `curl -fsS https://www.marcelinebelardo.com/.well-known/site.standard.publication` returns exactly the publication AT-URI plus one newline. | **Not run — post-deploy check required.** |
| Publication discovery link | Homepage head contains exactly one `rel="site.standard.publication"` link when registered. | **Not run — post-deploy check required.** |
| Document verification links | Each mapped blog detail head contains only its own `rel="site.standard.document"` link; unmapped and unrelated pages contain none. | **Not run — post-deploy check required.** |
| Deployment timestamp | Registry and `.well-known` change deployed at a recorded UTC timestamp. | **Not recorded.** |
| Discovery/indexing | Any Standard.site reader/index result and indexing delay are recorded without treating absence as a protocol failure. | **Not checked.** |

## Release decision

The redesign is not ready for an AC5.7-complete declaration until the GitHub Pages settings, DNS answers, redirect chains, certificate result, responsive matrix, keyboard path, footnote/print fallbacks, and image checks above have durable post-deploy evidence. Before that point, this document records the release gate as **pending**, not passed.
