// @ts-check
import { defineConfig } from "astro/config";

import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import { SITE_ORIGIN } from "./src/site-config.ts";
import rehypeMarginNotes from "./src/markdown/rehype-margin-notes.mjs";

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  integrations: [
    sitemap(),
  ],
  markdown: {
    processor: unified({
      gfm: true,
      smartypants: true,
      rehypePlugins: [rehypeMarginNotes],
    }),
  },
});
