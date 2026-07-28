// @ts-check
import { defineConfig } from "astro/config";

import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { SITE_ORIGIN } from "./src/site-config.ts";
import rehypeMarginNotes from "./src/markdown/rehype-margin-notes.mjs";

const excludedSitemapUrls = new Set(
  ["/code/", "/paintings/", "/photography/"].map((path) =>
    new URL(path, SITE_ORIGIN).toString(),
  ),
);

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  integrations: [
    react(),
    sitemap({
      filter: (page) => !excludedSitemapUrls.has(page),
    }),
  ],
  markdown: {
    processor: unified({ rehypePlugins: [rehypeMarginNotes] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
