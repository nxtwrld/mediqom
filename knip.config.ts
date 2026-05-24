import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/routes/**/*.{ts,svelte}",
    "src/hooks.server.ts",
    "src/hooks.client.ts",
    "src/app.ts",
    "vite.config.ts",
    "vite.config.mobile.ts",
    "svelte.config.js",
    "svelte.config.mobile.js",
    "capacitor.config.ts",
    "svgToSprite.js",
    "vite-plugin-configs.ts",
  ],
  project: ["src/**/*.{ts,svelte}", "*.{ts,js}"],
  ignore: [
    "android/**",
    "ios/**",
    ".svelte-kit/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
  ],
  ignoreDependencies: [
    // Capacitor plugins are loaded at runtime by the native layer
    "@capacitor/*",
    "@revenuecat/purchases-capacitor",
    "cordova-plugin-health",
    // Node.js polyfills — explicitly aliased in vite.config.ts + vite.config.mobile.ts
    "buffer",
    "crypto-browserify",
    "events",
    "process",
    "stream-browserify",
    // Config-driven devDeps (eslint, prettier, typescript)
    "@typescript-eslint/eslint-plugin",
    "@typescript-eslint/parser",
    "eslint-config-prettier",
    "eslint-plugin-svelte",
    "prettier-plugin-svelte",
    "tslib",
    "@sveltejs/adapter-auto",
    // MCP server — used via CLI, not imported
    "@supabase/mcp-server-supabase",
    // Type definitions
    "@types/mixpanel-browser",
    "@types/meyda",
    // Audio/VAD loaded in web workers
    "@ricky0123/vad-web",
    "@google-cloud/speech",
  ],
};

export default config;
