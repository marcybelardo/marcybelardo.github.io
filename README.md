# Marceline Portfolio

Personal portfolio website for Marceline Belardo — a static site built with Astro, React, TypeScript, and TailwindCSS.

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
├── bio/
├── contact/
├── rss.xml
├── sitemap-index.xml
├── sitemap-0.xml
├── robots.txt
└── 404.html
```

`/code/`, `/paintings/`, and `/photography/` are retired. The build does not generate those routes or include them in the sitemap.

## Commands

Run commands from the project root with `pnpm`:

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the local Astro server at `localhost:4321` |
| `pnpm build` | Build the static production site to `./dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm astro` | Run Astro CLI commands |
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

## Standard.site metadata converter

The optional Standard.site metadata converter requires Python 3.11+ and runs with `python3 scripts/generate_standard_site.py`. It writes ignored outputs to `generated/standard-site/publication.json` and `generated/standard-site/documents/<slug>.json`, mapping published-only blog metadata. After manual publication, pass the returned URI with `--publication-uri` when regenerating. The converter has no authentication, PDS access, network, synchronization, verification, or Astro-link behavior; it never performs auth, PDS, network, sync, verification, or Astro publication-link work.

## RSS, author signature, and CV asset

The production RSS feed includes the full rendered article content for every published post, including formatted Markdown, footnotes, and the shared author signature from `src/components/BlogAuthorSignature.astro`. Relative root `href` and `src` values in rendered article HTML are normalized to absolute URLs at `https://www.marcelinebelardo.com`; external, mail, fragment, and protocol-relative targets remain unchanged.

The real CV upload path is `public/marceline-belardo-cv.pdf`, which is served at `/marceline-belardo-cv.pdf`. Preserve that filename when uploading the binary; this documentation describes the intended asset path and does not imply that the binary currently exists in the repository.

## Editing Bio and Contact

Bio copy lives in the small `bioContent` block in [`src/pages/bio/index.astro`](src/pages/bio/index.astro). Edit the factual `label`, `statement`, `skills`, and `portraitAlt` values; keep the portrait alt text meaningful.

Contact copy and destinations live in the `contactDestinations` block in [`src/pages/contact/index.astro`](src/pages/contact/index.astro). Edit the email label/address and the verified profile labels/URLs. Keep all copy factual; do not invent résumé details, availability, or contact destinations. Run `pnpm verify` after changes.

## Integration note

When integrating this redesign, do not overwrite the original workspace's untracked `src/content/blog/blog02.md`. Preserve that file and resolve its contents deliberately if it is present outside this worktree.
