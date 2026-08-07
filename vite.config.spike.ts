/**
 * SLICE ZERO — throwaway build for the ChatGPT sandbox probes.
 *
 * Produces four widget variants, each answering a different question:
 *
 *   widget-real.html       ~750 KB  three + loaders inlined        (0b-A, 0b-B)
 *   widget-small.html        ~2 KB  bare WebGL canvas, no three    (0b-C floor)
 *   widget-padded.html      ~2.5 MB real + padding                 (0b-C ceiling)
 *   widget-bootstrap.html    ~2 KB  external <script src>          (0b-D)
 *
 * Deliberately has NO svelte plugin and no sveltekit() — the spike renderer is
 * plain TypeScript, so none of the P4 stub-alias machinery is needed yet. Only
 * the aliases the one production import (`$data/anatomy-regions`) requires.
 *
 * Usage — `npm run spike:build` runs all four.
 */
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VARIANT = process.env.SPIKE_VARIANT ?? "real";

/**
 * Absolute origin the widget fetches GLBs from. The iframe renders inline HTML,
 * so its origin is null and EVERY asset fetch is cross-origin — this must be a
 * full URL, and it must be declared in the resource's `_meta.ui.csp`.
 */
const ASSET_BASE = process.env.SPIKE_ASSET_BASE ?? "https://mediqom.com";

const OUT_NAME = `widget-${VARIANT}.html`;

/** Rename the emitted index.html so the four variants can coexist. */
function renameHtml(): Plugin {
  return {
    name: "spike-rename",
    enforce: "post",
    generateBundle(_opts, bundle) {
      for (const [key, file] of Object.entries(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".html")) {
          file.fileName = OUT_NAME;
          bundle[OUT_NAME] = file;
          if (key !== OUT_NAME) delete bundle[key];
        }
      }
    },
  };
}

/** Pads the output so probe 0b-C can bracket the host's inline-size limit. */
function padTo(targetBytes: number): Plugin {
  return {
    name: "spike-pad",
    enforce: "post",
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".html")) continue;
        const html = String(file.source);
        const short = targetBytes - Buffer.byteLength(html);
        if (short <= 0) continue;
        file.source = html.replace(
          "</body>",
          `<!--${"p".repeat(short - 12)}--></body>`,
        );
      }
    },
  };
}

/**
 * Replaces the emitted HTML with a hand-written document.
 *
 * `keepChunks` matters for the bootstrap variant: its whole point is that
 * `app.js` stays on disk as a separately-fetchable file, so the tiny inline
 * HTML has something real to pull over the network.
 */
function replaceWith(html: string, keepChunks = false): Plugin {
  return {
    name: "spike-replace",
    enforce: "post",
    generateBundle(_opts, bundle) {
      for (const [key, file] of Object.entries(bundle)) {
        if (keepChunks && file.type === "chunk") continue;
        delete bundle[key];
      }
      this.emitFile({ type: "asset", fileName: OUT_NAME, source: html });
    },
  };
}

/**
 * 0b-C floor: does a *tiny* inline resource render WebGL at all? Answers 0b-A
 * without the confound of a 750 KB payload. No three, no network.
 */
const SMALL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Anatomy</title>
<style>html,body{margin:0;height:100%}#c{width:100%;height:100%;min-height:420px;display:block}
#m{position:absolute;top:8px;left:10px;font:12px system-ui;color:#9fb3c8}</style></head>
<body><canvas id="c"></canvas><div id="m">probing…</div><script>
(function(){
  var c=document.getElementById('c'),m=document.getElementById('m');
  var gl=c.getContext('webgl2')||c.getContext('webgl');
  if(!gl){m.textContent='0b-A FAIL: no WebGL context in the sandboxed iframe';return;}
  m.textContent='0b-A PASS: '+(gl.getParameter(gl.VERSION)||'webgl')+
    ' | renderer='+(gl.getParameter(gl.RENDERER)||'?');
  var t=0;
  (function draw(){
    t+=0.01;
    gl.viewport(0,0,c.width=c.clientWidth,c.height=c.clientHeight);
    gl.clearColor(0.06+0.06*Math.sin(t),0.09,0.13,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    requestAnimationFrame(draw);
  })();
})();
</script></body></html>`;

/** 0b-D: can a near-empty inline resource pull its real payload over the network? */
const BOOTSTRAP_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Anatomy</title>
<style>html,body{margin:0;height:100%}#root{width:100%;height:100%;min-height:420px}
#boot{position:absolute;top:8px;left:10px;font:12px system-ui;color:#9fb3c8}</style></head>
<body><div id="root"></div><div id="boot">loading external bundle…</div><script>
var s=document.createElement('script');
s.type='module';
s.src=${JSON.stringify(`${ASSET_BASE}/spike/app.js`)};
s.onerror=function(){document.getElementById('boot').textContent=
  '0b-D FAIL: external script fetch refused (CSP)';};
s.onload=function(){var b=document.getElementById('boot');if(b)b.textContent='0b-D PASS: external bundle executed';};
document.head.appendChild(s);
</script></body></html>`;

const variantPlugins: Plugin[] =
  VARIANT === "padded"
    ? [viteSingleFile(), renameHtml(), padTo(2_500_000)]
    : VARIANT === "bootstrap"
      ? [replaceWith(BOOTSTRAP_HTML, true)]
      : VARIANT === "small"
        ? [replaceWith(SMALL_HTML)]
        : [viteSingleFile(), renameHtml()];

export default defineConfig({
  root: path.join(HERE, "spike/widget"),
  plugins: variantPlugins,
  resolve: {
    alias: {
      $data: path.join(HERE, "src/data"),
      $lib: path.join(HERE, "src/lib"),
    },
  },
  define: {
    // vite.config.ts declares these globally; a standalone config must repeat them.
    global: "globalThis",
    "process.env": {},
    __ASSET_BASE__: JSON.stringify(ASSET_BASE),
    __VARIANT__: JSON.stringify(VARIANT),
  },
  build: {
    outDir: path.join(HERE, "static/spike"),
    emptyOutDir: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        // The bootstrap variant fetches this from the same directory.
        entryFileNames: "app.js",
      },
    },
  },
});
