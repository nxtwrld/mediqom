import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";
import { createMermaidHighlighter } from "./src/lib/mdsvex-config.js";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [
    vitePreprocess({ script: true }),
    mdsvex({
      extensions: [".md", ".svx"],
      remarkPlugins: [],
      rehypePlugins: [],
      highlight: {
        highlighter: createMermaidHighlighter(),
      },
    }),
  ],

  extensions: [".svelte", ".md", ".svx"],

  kit: {
    adapter: adapter({
      pages: "mobile/dist",
      assets: "mobile/dist",
      fallback: "index.html", // SPA fallback for client-side routing
      precompress: false,
      strict: false,
    }),

    alias: {
      $components: "src/components",
      $data: "src/data",
      $media: "src/media",
      $config: "config",
    },

    // Disable prerendering for mobile - all routes handled client-side
    prerender: {
      entries: [],
      handleHttpError: "ignore",
      handleMissingId: "ignore",
    },

    // Mobile app only includes these routes
    // Marketing pages (/www/*) are excluded
    paths: {
      // Base path for mobile assets
      base: "",
    },
  },
};

export default config;
