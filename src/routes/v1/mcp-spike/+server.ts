/**
 * SLICE ZERO — throwaway MCP endpoint for the ChatGPT sandbox probes.
 *
 * Registers four `show_anatomy_*` tools, one per widget size variant, so probes
 * 0b-A/B/C/D and 0c can all be answered in a single ChatGPT conversation
 * instead of four deploys. Delete this route (and `spike/`, `static/spike/`,
 * `vite.config.spike.ts`) once the results are recorded in AI_PLUGIN.md §3.
 *
 * The real endpoint is `/v1/mcp` (P5). This one exists to make the decisions
 * that endpoint's architecture depends on — above all the CSP tier.
 *
 * Notes that carry over to the real thing:
 *  - `WebStandardStreamableHTTPServerTransport` — NOT `StreamableHTTPServerTransport`,
 *    which takes Node `IncomingMessage`/`ServerResponse`. This one takes a Web
 *    `Request` and returns a `Response`, which is what SvelteKit hands us.
 *  - Stateless (`sessionIdGenerator: undefined`): Vercel functions are ephemeral
 *    and a stateful session would not survive between calls.
 *  - `/v1/*` is session-free at the hook layer (`hooks.server.ts:218` protects
 *    only `/private` and `/med`), so no auth wiring is needed for a public tool.
 *  - TOOL ARGUMENTS ARE NEVER LOGGED. `structure: "l4-l5"` is benign alone and
 *    PHI against a session id. Log the tool name and outcome only.
 */
import type { RequestHandler } from "@sveltejs/kit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { regionIds, regionMeshes } from "$data/anatomy-regions";
import { resolveAnatomy } from "$lib/anatomy/resolve";
import { layersFor } from "$lib/anatomy/layers";

const VARIANTS = ["real", "small", "padded", "bootstrap"] as const;
type Variant = (typeof VARIANTS)[number];

const MIME = "text/html;profile=mcp-app";

const htmlCache = new Map<Variant, string>();

/**
 * Fetch the built widget over HTTP from this deployment's own origin.
 *
 * NOT `readFile('static/…')`: on Vercel, `static/` is served by the CDN and is
 * not part of the serverless function bundle, so a filesystem read works in dev
 * (cwd is the repo root) and fails on the preview deploy — precisely where the
 * probes run. NOT a `?raw` import either, because that would make every build
 * depend on the widget build having run first.
 */
async function widgetHtml(
  variant: Variant,
  origin: string,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const cached = htmlCache.get(variant);
  if (cached) return cached;

  const missing =
    `<!doctype html><body style="font:13px system-ui;padding:12px">` +
    `widget-${variant}.html not built — run <code>npm run spike:build</code></body>`;

  let html = missing;
  try {
    const res = await fetchFn(`${origin}/spike/widget-${variant}.html`);
    if (res.ok) html = await res.text();
  } catch {
    // Fall through to the placeholder; the probe will show it in the widget.
  }

  if (html !== missing) htmlCache.set(variant, html);
  return html;
}

function buildServer(origin: string, fetchFn: typeof globalThis.fetch) {
  const server = new McpServer({ name: "mediqom-spike", version: "0.0.1" });

  for (const variant of VARIANTS) {
    const uri = `ui://mediqom/anatomy-${variant}.html`;

    server.registerResource(
      `anatomy-widget-${variant}`,
      uri,
      {
        title: `Anatomy viewer (${variant})`,
        mimeType: MIME,
        _meta: {
          "ui/csp": {
            connectDomains: [origin],
            resourceDomains: [origin],
            frameDomains: [],
          },
          // Ship both spellings — the naming is in flux between the "Apps SDK"
          // and "Plugins" docs, and we do not yet know which the host reads.
          "openai/widgetCSP": {
            connect_domains: [origin],
            resource_domains: [origin],
          },
        },
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: MIME,
            text: await widgetHtml(variant, origin, fetchFn),
          },
        ],
      }),
    );

    server.registerTool(
      `show_anatomy_${variant}`,
      {
        title: `Show anatomy (${variant})`,
        // Describes the situation, not the brand. No promotional language —
        // model-readable fields are policed separately (AI_PLUGIN.md §9b).
        description:
          "Show an interactive 3D anatomical visualization when seeing the " +
          "location, surrounding structures or anatomical layers would " +
          "materially help the user understand a health or anatomy discussion. " +
          "Skeletal structures only. Does not show blood vessels, nerves or " +
          "lymphatics at individual-structure level.",
        inputSchema: {
          structure: z
            .enum(regionIds() as [string, ...string[]])
            .describe("The anatomical region to display."),
          highlight: z
            .array(z.string())
            .optional()
            .describe(
              "Optional finer structures to emphasise within the region, " +
                "in plain English (for example 'medial meniscus').",
            ),
          sex: z.enum(["male", "female"]).optional(),
        },
        _meta: {
          "ui/resourceUri": uri,
          "openai/outputTemplate": uri,
        },
      },
      async ({ structure, highlight, sex }) => {
        const base = regionMeshes(structure);
        const refined = (highlight ?? [])
          .flatMap((term) => resolveAnatomy(term, { within: structure }).meshes)
          .filter((m) => m);
        const meshes = [...new Set(refined.length ? refined : base)];

        // Argument values are deliberately absent from this log line.
        console.log(`[mcp-spike] show_anatomy_${variant} -> ${meshes.length} meshes`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Showing ${meshes.length} structure(s) in the ${structure.replace(/_/g, " ")}.`,
            },
          ],
          structuredContent: {
            structure,
            meshes,
            layers: layersFor(meshes),
            sex: sex ?? "male",
            assetBase: origin,
            variant,
          },
          _meta: { "ui/resourceUri": uri, "openai/outputTemplate": uri },
        };
      },
    );
  }

  server.registerTool(
    "list_anatomy_regions",
    {
      title: "List anatomical regions",
      description:
        "List the anatomical regions that can be displayed, for when the user " +
        "asks what can be shown.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text" as const, text: regionIds().join(", ") }],
    }),
  );

  return server;
}

const handle: RequestHandler = async ({ request, url, fetch }) => {
  try {
    // Default to this deployment's own origin so a Vercel preview needs no env
    // configuration — the whole point of the spike is a fast deploy loop.
    const origin = process.env.SPIKE_ASSET_BASE ?? url.origin;
    const server = buildServer(origin, fetch);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    // Message only — never the request body, which carries tool arguments.
    console.error("[API] /v1/mcp-spike - Error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "MCP request failed" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
