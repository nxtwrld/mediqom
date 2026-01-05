import { sveltekit } from '@sveltejs/kit/vite';
import { type Plugin, defineConfig, normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { qomConfigPlugin } from './vite-plugin-qom-config';
import { promptsPlugin } from './vite-plugin-prompts';
import { configsPlugin } from './vite-plugin-configs';

// Combined plugin for mobile build initialization
// Injects all required polyfills and setup in a single script to avoid ordering issues
function mobileInitPlugin(): Plugin {
  return {
    name: 'mobile-init',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: `
// Global polyfill for Node.js compatibility
if (typeof global === 'undefined') {
  window.global = window;
}

// Capacitor build flag
window.__CAPACITOR_BUILD__ = true;

// SvelteKit data fetch polyfill for static builds
// In static builds, there's no server to handle /__data.json requests
// This intercepts those requests and returns empty data to prevent 500 errors
(function() {
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

    // Intercept SvelteKit data requests that would fail in static builds
    if (url.indexOf('__data.json') !== -1) {
      console.log('[Capacitor] Intercepting data request:', url);
      // Return empty data response that SvelteKit can handle
      var emptyResponse = JSON.stringify({
        type: 'data',
        nodes: [null, null, null, null, null, null, null, null]
      }) + '\\n';
      return Promise.resolve(new Response(emptyResponse, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return originalFetch.apply(this, arguments);
  };
})();
          `.trim(),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [
    mobileInitPlugin(),
    qomConfigPlugin(),
    promptsPlugin(),
    configsPlugin(),
    viteStaticCopy({
      targets: [
        // VAD WASM files
        {
          src: normalizePath(
            path.join(
              __dirname,
              'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js'
            )
          ),
          dest: '',
        },
        {
          src: normalizePath(
            path.join(__dirname, 'node_modules/@ricky0123/vad-web/dist/silero_vad.onnx')
          ),
          dest: '',
        },
        {
          src: normalizePath(
            path.join(__dirname, 'node_modules/onnxruntime-web/dist/*.wasm')
          ),
          dest: '',
        },
        // PDF.js files
        {
          src: normalizePath(
            path.join(__dirname, 'node_modules/pdfjs-dist/build/*.*')
          ),
          dest: 'pdfjs',
        },
      ],
    }),
    sveltekit(),
  ],

  build: {
    outDir: 'mobile/dist',
    // Don't inline WASM files
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Code splitting for heavy dependencies
        manualChunks: (id) => {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('@ricky0123/vad-web') || id.includes('onnxruntime-web'))
            return 'vad';
          if (id.includes('three')) return 'three';
          if (id.includes('d3')) return 'd3';
        },
      },
    },
  },

  server: {
    port: 5174,
    host: true, // Allow access from local network for mobile testing
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis',
      },
    },
    exclude: [
      'onnx-runtime-web',
      'cornerstone-core',
      'cornerstone-wado-image-loader',
      'dicom-parser',
    ],
    include: ['buffer', 'util', 'process', 'events', 'stream-browserify', 'crypto-browserify'],
  },

  resolve: {
    alias: {
      crypto: 'crypto-browserify',
      buffer: 'buffer',
      stream: 'stream-browserify',
      events: 'events',
      util: 'util/util.js',
      process: 'process/browser',
    },
  },

  define: {
    global: 'globalThis',
    Buffer: ['buffer', 'Buffer'],
    'process.env': {},
    // Mobile build flag - use JSON.stringify to ensure proper boolean replacement
    __CAPACITOR_BUILD__: 'true',
    // Also set on window for runtime access
    'window.__CAPACITOR_BUILD__': 'true',
    // API base URL for mobile - points to production backend
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'https://mediqom.com'),
  },

  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
