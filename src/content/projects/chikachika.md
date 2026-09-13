---
slug: chikachika
title: chikachika
date: 2026-09-13
description: Overlay engine for live streamers, written in Rust
disciplines:
  - ai
  - agentic-development
  - software
  - media
tags:
  - ai
  - rust
  - skills
  - desktop
featured: true
featuredOrder: 6
draft: false
repositoryUrl: https://github.com/marcybelardo/chikachika
---

Chikachika is a local-first desktop application for creating and serving HTML overlays to use in live streaming applications like OBS. Written in Rust using eframe/egui, includes local persistence, an embedded browser renderer, and in-memory per-overlay HTTP/SSE hosting.

## Rationale

I was a streamer for a number of years, and there are few options for truly dynamic overlays for your stream. You can use a SaaS service but they tend to be bulky to use and offer a more limited or complicated way to work with widgets. You can locally host HTML files but lose out on easy Twitch or YouTube integration. My hope for the future is an application that can save overlays locally on your computer, make it easy to integrate chat and notification events, and not require a subscription or sign-up to do all that.

## Development Process

Apart from the above reasons, I've also used this project as a practice workspace for developing my personal agentic development practice. It's gone quite smoothly. Handing over more responsibility to agents means you need to set them up for success so to speak, and so it's best to take note of where they trip up and where they don't need hand-holding.

A lot of my workflows were adapted from Hendrik Mans and his work on [Chatto](https://chatto.run/), a self-hostable chat app. He documented his agentic processes in a [blog post](https://www.hmans.dev/blog/chatto-is-robots) which I found quite enlightening. Here's a general overview:

- General agent instructions via `AGENTS.md`, with repository-local skills.
- Documentation ownership, with scoped milestone TODOs, rationale and decision tracking, a glossary.
- Architecture Decision Records (ADRs) and Feature Decision Records (FDRs) to provide append-only records of decisions made and how they evolved over time.
- Clear process of issue creation -> work delegation in isolated worktrees -> pull request submission.
- Tests for everything, including the workflows themselves.

So far, we've made it to a very functional piece of software running `v0.0.1` as of September 14, 2026. Hopefully I can get more stuff working and have something I can release to the public before November rolls in. What's nice is that the process itself is totally adaptable and not at all tied to just Chikachika. I can pull out all the skills and most of the `AGENTS.md` files and make them work for anything.

## Workflow Skills

Skills mainly fall under documentation/decision-making and GitHub operations:

### Documentation

- ADR and FDR creation/review
- Architecture inventory
- Glossary operations

### GitHub

- Milestone triage
- Issue orchestration
- PR checklists

## Scope and Limitations

Back to the project itself, it's in a very early state. Unless you want to just put up a Times New Roman caption under your stream, it's best to wait until at least `v0.1.0`. I can guarantee that it will at least function with OBS as a browser source, and that you can manipulate your text widget however you like position, size, and color-wise. I'm having a lot of fun working on this project, and hopefully it'll be a help to anybody wanting more control over their streams.
