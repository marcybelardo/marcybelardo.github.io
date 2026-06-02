# Marceline Portfolio

Personal portfolio website for Marceline — a static site built with Astro, React, TypeScript, and TailwindCSS.

## Project Structure

```text
/
├── public/                 # Static assets (favicons, images, etc.)
├── src/
│   ├── components/         # Reusable Astro/React components
│   ├── content/            # Content collections (blog, projects, etc.)
│   │   ├── blog/           # Blog posts (markdown)
│   ├── layouts/            # Shared page layouts
│   ├── pages/              # Route pages
│   └── styles/             # Global styles
├── package.json
└── README.md
```

## Commands

All commands are run from the project root with `pnpm`:

| Command        | Action                                       |
| :------------- | :------------------------------------------- |
| `pnpm dev`     | Starts local dev server at `localhost:4321`  |
| `pnpm build`   | Build your production site to `./dist/`      |
| `pnpm preview` | Preview your build locally, before deploying |
| `pnpm astro`   | Run Astro CLI commands                       |

## Creating a Blog Post

Blog posts live in `src/content/blog/`. Each file becomes a page at `/code/blog/<filename>/`.

Create a new `.md` file inside that directory. Only `title` and `date` are required; all other fields are optional.

### Full example

```markdown
---
title: My First Post
date: 2026-06-02
description: A short preview for the blog listing page.
image: ../../assets/my-photo.jpg
imageAlt: Description of the image
tags:
  - Astro
  - Web Design
draft: false
---

## Post body

Write your markdown here.
```

### Minimal example (text only)

```markdown
---
title: Just Thoughts
date: 2026-06-02
---

No images, no tags — just writing.
```

### Available frontmatter fields

| Field         | Required | Description                             |
| ------------- | -------- | --------------------------------------- |
| `title`       | yes      | Post title                              |
| `date`        | yes      | Publish date                            |
| `description` | no       | Short excerpt shown on the blog listing |
| `image`       | no       | Path to an image (relative to the file) |
| `imageAlt`    | no       | Alt text for the image                  |
| `tags`        | no       | List of tags for filtering              |
| `draft`       | no       | Set `true` to exclude from the build    |
