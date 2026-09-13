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
