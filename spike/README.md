# Slice Zero — ChatGPT sandbox probes

**Throwaway.** Delete `spike/`, `static/spike/`, `vite.config.spike.ts` and
`src/routes/v1/mcp-spike/` once the results are recorded in `AI_PLUGIN.md` §3.

`scripts/anatomy-pipeline/` is **not** throwaway — it is the real P3 deliverable and
already passes its gates.

## What this answers

| probe | question | status |
|---|---|---|
| 0a | can the assets be made small enough, with names intact? | ✅ **passed** — see `AI_PLUGIN.md` §3 |
| 0b-A | does WebGL render in the sandboxed iframe? | ⏳ needs ChatGPT |
| 0b-B | does a cross-origin GLB fetch survive the CSP? | ⏳ needs ChatGPT |
| 0b-C | at what size is an inlined HTML resource truncated? | ⏳ needs ChatGPT |
| 0b-D | can a 2 KB bootstrap execute an external `<script src>`? | ⏳ needs ChatGPT |
| 0c | will the model call the tool in the right situations? | ⏳ needs ChatGPT |

0b-D is the one to watch. **If it passes, the downstream architecture gets simpler**: no
inline-size ceiling, no `prebuild` build-ordering dependency, no `?raw` import — which
deletes risks R1 and R2 from the plan outright.

## Build

```bash
npm run spike:build          # all four widget variants -> static/spike/
```

| file | size | purpose |
|---|---:|---|
| `widget-small.html` | 946 B | bare WebGL canvas, no three — 0b-A / 0b-C floor |
| `widget-real.html` | 582 KB | the actual renderer, fully inlined — 0b-A / 0b-B |
| `widget-padded.html` | 2.50 MB | same, padded — 0b-C ceiling |
| `widget-bootstrap.html` | 722 B | loads `app.js` over the network — 0b-D |

## Local check (no ChatGPT needed)

```bash
npm run dev
open 'http://localhost:5174/spike/widget-real.html?structure=R_knee&sex=male&assetBase=http://localhost:5174'
```

The widget runs standalone — every host API is feature-detected — so the renderer can be
debugged without a round trip through ChatGPT.

Exercise the MCP endpoint directly:

```bash
curl -s -X POST http://localhost:5174/v1/mcp-spike \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploying for the real probes — human steps

`static/spike/` is deliberately **not** gitignored. Vercel builds from git and nothing in
the normal build produces these files, so if they are not committed the preview serves
404s and every probe fails for the wrong reason. ~3.6 MB, most of it the padded variant's
literal `ppppp…`, and it all goes away when the spike is deleted.

1. `npm run spike:build`, commit, and deploy a Vercel preview.
2. **Disable Deployment Protection on the preview**, or mint a protection-bypass token.
   Skipping this is the classic time sink: ChatGPT gets a 401 and it looks exactly like a
   CSP failure. Do it *before* the first connection attempt.
3. ChatGPT → **Settings → Connectors → Advanced → Developer mode**, then add the connector
   at `https://<preview>.vercel.app/v1/mcp-spike`.
4. Run the prompts below and screenshot each.
5. Right-click the widget → Inspect, and read the sandbox console. Every diagnostic line is
   prefixed `[mediqom-spike]`; the small and bootstrap variants print their own verdict
   (`0b-A PASS: …`, `0b-D FAIL: …`) directly on the page.

`ALLOWED_ORIGINS` probably needs no change — `getCorsOrigin()` (`src/hooks.server.ts:59`)
already allows any `*.vercel.app` origin.

### 0c prompts — gate is ≥ 4/5 positive, 0/1 negative

1. "Show me where the medial meniscus is."
2. "What structures surround the L4-L5 disc?"
3. "Where is the rotator cuff?"
4. "Show the right ACL and nearby structures."
5. "My doctor says I have a fractured left patella — where is that?"
6. **Negative:** "What is my blood pressure?" — must **not** fire.

Prompts 3 and 4 also exercise the clinical alias table and the `L_`/`R_` case-sensitivity
fix, which silently no-ops in the app today.

### 0b-C / 0b-D

Ask for the same structure four times, naming each tool explicitly, and record which
variants render:

> "Use show_anatomy_small to show the right knee." — then `_real`, `_padded`, `_bootstrap`.

## Privacy note

The spike **never logs tool arguments**. `structure: "l4-l5"` is benign in isolation and
PHI when logged against a session. Only the tool name and the resulting mesh count are
logged. Keep it that way in `/v1/mcp` — see `AI_PLUGIN.md` §9.
