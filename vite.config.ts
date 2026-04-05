import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import { type ViteDevServer, normalizePath, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
// Removed topLevelAwait plugin - was causing 'Server is not a constructor' error on Vercel
// import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { qomConfigPlugin } from "./vite-plugin-qom-config";
import { promptsPlugin } from "./vite-plugin-prompts";
import { configsPlugin } from "./vite-plugin-configs";

// Plugin to inject Node.js polyfills
function nodePolyfillsPlugin(): Plugin {
  return {
    name: "node-polyfills",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: `
            if (typeof global === 'undefined') {
              window.global = window;
            }
          `,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [
    // Removed topLevelAwait plugin - was causing SSR issues on Vercel production
    // If async imports are needed, handle them manually in components with dynamic imports
    viteCommonjs(),
    nodePolyfillsPlugin(),
    qomConfigPlugin(),
    promptsPlugin(),
    configsPlugin(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
            ),
          ),
          dest: normalizePath(path.join(__dirname, "static")),
        },
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@ricky0123/vad-web/dist/silero_vad.onnx",
            ),
          ),
          dest: normalizePath(path.join(__dirname, "static")),
        },
        {
          src: normalizePath(
            path.join(__dirname, "node_modules/onnxruntime-web/dist/*.wasm"),
          ),
          dest: normalizePath(path.join(__dirname, "static/onnx")),
        },
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs",
            ),
          ),
          dest: normalizePath(path.join(__dirname, "static/onnx")),
        },
        {
          src: normalizePath(
            path.join(__dirname, "node_modules/pdfjs-dist/build/*.*"),
          ),
          dest: normalizePath(path.join(__dirname, "static/pdfjs")),
        },
        // Cornerstone3D codec WASM files
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@cornerstonejs/codec-openjpeg/dist/*.wasm",
            ),
          ),
          dest: normalizePath(
            path.join(__dirname, "static/cornerstone"),
          ),
        },
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@cornerstonejs/codec-libjpeg-turbo-8bit/dist/*.wasm",
            ),
          ),
          dest: normalizePath(
            path.join(__dirname, "static/cornerstone"),
          ),
        },
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@cornerstonejs/codec-charls/dist/*.wasm",
            ),
          ),
          dest: normalizePath(
            path.join(__dirname, "static/cornerstone"),
          ),
        },
        {
          src: normalizePath(
            path.join(
              __dirname,
              "node_modules/@cornerstonejs/codec-openjph/dist/*.wasm",
            ),
          ),
          dest: normalizePath(
            path.join(__dirname, "static/cornerstone"),
          ),
        },
      ],
    }),
    sveltekit(),
  ],
  server: {
    port: 5174,
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: [
        "**/.DS_Store",
        "**/.git/**",
        "**/node_modules/**",
        "**/.cursor/**",
        "**/.cursor-tutor/**",
        "**/.vercel/**",
        "**/.svelte-kit/**",
        "**/build/**",
        "**/dist/**",
        "**/.vscode/**",
        "**/.idea/**",
        "**/*.log",
        "**/*.tmp",
        "**/*.temp",
      ],
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
      define: {
        global: "globalThis",
      },
    },
    exclude: [
      "onnx-runtime-web",
      "@cornerstonejs/dicom-image-loader",
    ],
    include: [
      "buffer",
      "util",
      "process",
      "events",
      "stream-browserify",
      "crypto-browserify",
      "dicom-parser",
    ],
  },
  resolve: {
    alias: {
      globalthis: path.resolve(__dirname, "src/lib/files/globalthis-shim.js"),
      crypto: "crypto-browserify",
      buffer: "buffer",
      stream: "stream-browserify",
      events: "events",
      util: "util/util.js",
      process: "process/browser",
    },
  },
  define: {
    global: "globalThis",
    // Only polyfill Buffer for browser builds — Node.js (vitest) has native Buffer
    ...(process.env.VITEST ? {} : { Buffer: ["buffer", "Buffer"] }),
    "process.env": {},
  },
  ssr: {
    noExternal: [
      // These packages should be bundled for SSR
    ],
    external: [
      // Force these browser-only packages to be external in SSR
      "@cornerstonejs/core",
      "@cornerstonejs/tools",
      "@cornerstonejs/dicom-image-loader",
      "dicom-parser",
    ],
  },
  build: {
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
});
