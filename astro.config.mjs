// @ts-check
import { defineConfig } from "astro/config";

import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { SITE_ORIGIN } from "./src/site-config.ts";

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
