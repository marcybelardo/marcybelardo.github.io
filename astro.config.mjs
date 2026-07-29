// @ts-check
import { defineConfig } from "astro/config";

import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { SITE_ORIGIN } from "./src/site-config.ts";
import rehypeMarginNotes from "./src/markdown/rehype-margin-notes.mjs";

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  integrations: [
    react(),
    sitemap(),
  ],
  markdown: {
    processor: unified({ rehypePlugins: [rehypeMarginNotes] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
