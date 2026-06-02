# Marceline Portfolio — Agent Guide

This file contains instructions for AI coding agents working on this project.

## Project Overview

This is a **static personal portfolio website** for Marceline, covering three creative practices — **coding**, **photography**, and **painting** — each presented as a separate page on a unified site. Despite being under one domain, each section should look and feel distinct.

- **Code** — A technical portfolio page showcasing skills and projects, plus a personal blog.
- **Paintings** — Features an image carousel of paintings as the centerpiece, with additional pages for bio and contact info.
- **Photography** — Similar to the paintings section, but photos are laid out and tiled directly on the index page (no carousel).

## Technology Stack

| Tool            | Purpose                      |
| --------------- | ---------------------------- |
| **Astro**       | Static site generation / SSG |
| **React**       | Interactive components       |
| **TypeScript**  | Type-safe JavaScript         |
| **TailwindCSS** | Styling (not yet installed)  |

## Available Commands

```sh
pnpm dev         # Start local dev server at localhost:4321
pnpm build       # Build production site to ./dist/
pnpm preview     # Preview production build locally
pnpm astro       # Run Astro CLI commands
```

## Project Structure

```
marceline-portfolio/
├── public/                # Static assets (favicons, images, etc.)
│   ├── favicon.ico
│   └── favicon.svg
├── src/
│   ├── content/           # Astro content collections (blog posts, etc.)
│   ├── content.config.ts  # Content collection configuration
│   ├── layouts/           # Shared layout components
│   └── pages/             # Route pages
├── astro.config.mjs       # Astro configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Coding Principles

These are the most important rules to follow when working on this project:

1. **Simplicity over everything.**
   - Do not add new packages or write new code unnecessarily.
   - Prefer built-in Astro / React features over third-party libraries.
   - If something can be done with a small component + existing tools, do that.

2. **Prefer components for reused code.**
   - Extract repeated markup or logic into shared components under `src/components/`.
   - Keep components small and focused on a single responsibility.

3. **Always ask for permission.**
   - Before making significant structural changes, adding a new dependency, or refactoring something non-trivial, stop and ask the user.
   - Propose your approach concisely and wait for approval before acting.

4. **Stay consistent with the existing codebase.**
   - Match the naming conventions, file organization, and coding style already in use.
   - Don't change existing patterns unless the user explicitly asks.

## Content Collections

Blog posts and other structured content should live in `src/content/` using Astro's content collections API. Configure them in `src/content.config.ts`.

## Styling

Style with **TailwindCSS**. Keep utility class usage clean and readable. Extract repeated utility patterns into component classes only when they meaningfully reduce duplication.

## Important Constraints

- The site must be **static** — no server-side rendering or on-demand routes.
- Keep the build output in `./dist/` (Astro's default).
- TypeScript strict mode is enabled — write type-safe code.
