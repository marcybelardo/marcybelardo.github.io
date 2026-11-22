# Marceline Portfolio

Personal portfolio website for Marceline Belardo — a static site built with Astro and TypeScript.

The canonical origin is `https://www.marcelinebelardo.com`. The site is deployed as a static GitHub Pages artifact; there is no SSR or on-demand routing.

## Project structure and routes

```text
/
├── public/                    # Static assets, favicons, and robots.txt
├── src/
│   ├── assets/                # Imported image and social assets
│   ├── components/            # Reusable Astro components
│   ├── content/
│   │   ├── projects/          # Project case studies (.md/.mdx)
│   │   └── blog/              # Blog posts (.md/.mdx)
│   ├── layouts/              # Shared Astro layouts
│   ├── pages/                 # Static route entrypoints
│   └── styles/                # Global styles
├── tests/                     # Node 22 built-in tests and build fixtures
├── astro.config.mjs
├── AGENTS.md
├── package.json
└── README.md
```

The generated route tree is:

```text
/
├── projects/
│   └── <project-slug>/
├── blog/
│   ├── <post-slug>/
│   └── tags/<tag-slug>/
├── about/
├── bio/        # static compatibility redirect to /about/
├── contact/    # static compatibility redirect to /about/
├── rss.xml
├── sitemap-index.xml
├── sitemap-0.xml
├── robots.txt
└── 404.html
```

`/code/`, `/paintings/`, and `/photography/` are retired. The build does not generate those routes or include them in the sitemap.

## Commands

Run commands from the project root with `pnpm`. For a reproducible Node, pnpm, and Python toolchain, enter the Nix development shell first with `nix develop`:

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the local Astro server at `localhost:4321` |
| `pnpm build` | Build the static production site to `./dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm astro` | Run Astro CLI commands |
| `pnpm standard-site:publish` | Convert published blog posts, authenticate with loopback OAuth, and show a Standard.site dry-run plan |
| `pnpm standard-site:publish --write` | Apply the planned Standard.site publication/document creates and updates with compare-and-swap writes |
| `pnpm test` | Run validation fixtures, build the site, and run Node tests |
| `pnpm verify` | Alias for `pnpm test`; use this as the quality gate |

Tests use Node 22's built-in `node:test` runner with TypeScript stripping. No test framework, lint script, or typecheck script is configured.

## Adding a project

Create `src/content/projects/<filename>.md` or `.mdx`. The filename is not the public identifier: set an immutable explicit lowercase `slug`; the resulting URL is `/projects/<slug>/`. The build and tests discover published projects from the collection, so adding or removing a project does not require updating a fixed route list.

Use this complete frontmatter shape as a starting point. Image paths are relative to this Markdown file, so replace the example files with real assets before building.

```markdown
---
slug: example-project
title: Example Project
date: 2026-07-29
description: A concise, non-empty summary of what this project does.
disciplines:
  - software
tags:
  - Astro
  - TypeScript
status: Published
role: Designer and developer
collaborators:
  - Collaborator Name
repositoryUrl: https://github.com/example/example-project
liveUrl: https://example.com/example-project/
externalUrl: https://example.org/project-reference
featured: true
featuredOrder: 5
draft: true
coverImage: ../../assets/example-project-cover.jpg
coverImageAlt: A meaningful description of the example project interface
gallery:
  - image: ../../assets/example-project-detail.jpg
    imageAlt: A meaningful description of the example project detail view
    caption: Optional caption for the detail view.
---

## Summary

Write the case study as prose-only Markdown. Explain the context, decisions, and
result in a way that matches the visible project metadata.
```

Project frontmatter rules:

- `title`, ISO `date`, non-empty `description`, and a non-empty `disciplines` list are required.
- `tags`, `status`, `role`, `collaborators`, `repositoryUrl`, `liveUrl`, and `externalUrl` are optional. URLs must be valid absolute URLs.
- `featured` defaults to `false`. A featured project needs a unique positive `featuredOrder`; do not reuse an order among featured projects.
- Use `draft: true` while authoring. Draft projects are excluded from production detail routes, homepage sections, relationships, RSS, and sitemap output.
- `coverImage` is relative to the project Markdown file. If it is present, `coverImageAlt` is mandatory and must meaningfully describe the image.
- Each optional `gallery` entry requires an image and meaningful `imageAlt`; `caption` is optional.
- Project Markdown bodies are prose-only. Put case-study images in `coverImage` or `gallery` so the site can enforce square framing, responsive image generation, intrinsic dimensions, and alt text. Do not add Markdown, HTML, or JSX images to the body.
- Published slugs are permanent. If a published URL must change, keep the old route as a migration document rather than silently changing the slug.

Run `pnpm verify` after adding or editing a project.

## Adding a blog post

Create `src/content/blog/<filename>.md` or `.mdx`. Set an explicit stable lowercase `slug`; the resulting URL is `/blog/<slug>/`.

```markdown
---
slug: example-post
title: Example Post
date: 2026-07-29
description: A non-empty description used when this post is published.
tags:
  - Research
  - Writing
image: ../../assets/example-post.jpg
imageAlt: A meaningful description of the post image
draft: true
---

Write the post in standard Markdown. A footnote uses the normal paired syntax:

This sentence has a note.[^source]

[^source]: The footnote definition appears at the end of the document.
```

Blog rules:

- `title` and ISO `date` are required. A published post must have a non-empty `description`; use `draft: true` while writing without one.
- `tags`, `image`, `imageAlt`, and `draft` are optional. `imageAlt` is required whenever `image` is present, and an image must not be paired with an empty alt value.
- Use standard Markdown footnotes with `[^id]` references and `[^id]: definition` definitions. The generated post keeps linked references, definitions, and backlinks.
- Tags generate `/blog/tags/<tag-slug>/` archives. Draft posts are omitted from production detail routes, tag archives, homepage writing, RSS, and sitemap output.
- The legacy title-derived blog ID remains only as a compatibility fallback for posts without a slug: it uses the first four alphanumeric title words. All new posts should set `slug`.

Run `pnpm verify` after adding or editing a post.

## Standard.site publishing

Write blog Markdown, deploy the website, then publish manually with the local OAuth CLI:

```sh
pnpm standard-site:publish          # fresh build, authorize, preview changes; no writes
pnpm standard-site:publish --write  # fresh build, authorize, explicitly apply changes
pnpm standard-site:publish --help   # no build, authentication, or network access
```

Astro exports validated published entries and their rendered article HTML to `/standard-site/records.json`. This static, public feed retains full plaintext article content, including image alt text and footnote definitions, but excludes layouts and the author signature. It contains no credentials, source paths, or draft content/identifiers; only an aggregate draft count is public. Ordinary builds never authenticate or contact a PDS. Only content the existing Astro configuration can render is supported; no MDX integration is added.

The publisher rejects symlinks, invalid UTF-8, and duplicate published slugs before building, awaits a fresh production build, then validates the local JSON and checks source membership before OAuth. It never fetches the deployed feed or falls back to stale output. A legacy post without an explicit slug retains its website route but blocks publishing until given an intentional stable slug. Publication and document TID record keys are unchanged; changing a published slug or owner DID requires an explicit migration. First-run plaintext formatting differences can produce updates without changing identities.

Authorization uses atcute's loopback flow on `127.0.0.1` with `atproto` and create/update-only scopes for `site.standard.publication` and `site.standard.document`. Publishing is a dry run by default. Writes apply the publication before documents, suppress no-ops, require compare-and-swap CIDs, and verify each exact value by reading it back. Local pinned-schema validation, optimistic remote validation, bounded discovery GET retries, and no write retries are retained. There are no deletions or media uploads, and publishing is not automatic deployment synchronization.

The website advertises the publication at `/.well-known/site.standard.publication` and published documents through `rel="site.standard.document"` links. The default owner is the DID currently resolved from `marcelinebelardo.com`; `STANDARD_SITE_ACCOUNT` selects the login account, and `PUBLIC_STANDARD_SITE_DID` is reserved for deliberate owner migrations. An explicitly empty public DID disables discovery/document links and publishing; it does not restore the default. See [publisher operations and architecture](docs/standard-site-publisher.md).

## RSS, author signature, and CV asset

The production RSS feed includes the full rendered article content for every published post, including formatted Markdown, footnotes, and the shared author signature from `src/components/BlogAuthorSignature.astro`. Relative root `href` and `src` values in rendered article HTML are normalized to absolute URLs at `https://www.marcelinebelardo.com`; external, mail, fragment, and protocol-relative targets remain unchanged.

The real CV upload path is `public/marceline-belardo-cv.pdf`, which is served at `/marceline-belardo-cv.pdf`. Preserve that filename when uploading the binary; this documentation describes the intended asset path and does not imply that the binary currently exists in the repository.

## Editing About

About copy and its contact line live in the `aboutContent` block in [`src/pages/about/index.astro`](src/pages/about/index.astro). Keep the label, experience, education, skills, email address, and portrait alt text factual and verified. The page keeps its full-image grayscale triptych and shared social icon footer. `/bio/` and `/contact/` remain noindex static redirects to `/about/` and are excluded from the sitemap. Run `pnpm verify` after edits.

## Integration note

When integrating this redesign, do not overwrite the original workspace's untracked `src/content/blog/blog02.md`. Preserve that file and resolve its contents deliberately if it is present outside this worktree.
