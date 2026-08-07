/**
 * SLICE ZERO — throwaway. Host bridge for the ChatGPT plugin sandbox.
 *
 * Every host-specific API is feature-detected so the same bundle also runs from
 * `file://` and from a plain URL during local development. That property is the
 * point: it lets us debug the renderer without a round trip through ChatGPT.
 *
 * Nothing here may leak into the production widget's renderer — see
 * AI_PLUGIN.md §10: the anatomy engine must never depend on `window.openai`.
 */

export interface AnatomyToolOutput {
  structure?: string;
  meshes?: string[];
  layers?: string[];
  sex?: "male" | "female";
  cameraPreset?: string;
  assetBase?: string;
  /** Probe bookkeeping: which widget variant the host loaded. */
  variant?: string;
}

type Listener = (output: AnatomyToolOutput) => void;

const listeners: Listener[] = [];
let latest: AnatomyToolOutput | null = null;

export const diagnostics: string[] = [];

export function note(msg: string) {
  diagnostics.push(msg);
  // Kept: reading the sandbox console is how probe 0b-A/0b-B are answered.
  console.log(`[mediqom-spike] ${msg}`);
}

function emit(output: AnatomyToolOutput | null | undefined) {
  if (!output || typeof output !== "object") return;
  latest = output;
  note(`tool output: ${JSON.stringify(output).slice(0, 300)}`);
  for (const fn of listeners) fn(output);
}

export function onToolOutput(fn: Listener) {
  listeners.push(fn);
  if (latest) fn(latest);
}

/** Ask the host to open an external URL, falling back to a plain anchor. */
export function openExternal(href: string) {
  const api = (window as any).openai;
  if (api?.openExternal) {
    api.openExternal({ href });
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

export function hostSummary(): string {
  const api = (window as any).openai;
  if (!api) return "no window.openai (standalone)";
  return `window.openai: ${Object.keys(api).join(", ") || "(empty)"}`;
}

export function initBridge() {
  note(hostSummary());
  note(`origin=${window.location.origin} href=${window.location.href}`);

  const api = (window as any).openai;

  // 1. Value already present at mount.
  if (api?.toolOutput) emit(api.toolOutput);

  // 2. ChatGPT re-broadcasts globals as a DOM CustomEvent.
  window.addEventListener("openai:set_globals", (ev: Event) => {
    const globals = (ev as CustomEvent).detail?.globals;
    if (globals?.toolOutput) emit(globals.toolOutput);
  });

  // 3. Raw MCP-UI JSON-RPC notifications over postMessage.
  window.addEventListener("message", (ev: MessageEvent) => {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (
      data.method === "ui/notifications/tool-result" ||
      data.method === "ui/notifications/tool-input"
    ) {
      emit(data.params?.result ?? data.params?.input ?? data.params);
    }
  });

  // 4. Standalone dev: ?structure=R_knee&sex=male
  const q = new URLSearchParams(window.location.search);
  if (q.get("structure")) {
    emit({
      structure: q.get("structure")!,
      sex: (q.get("sex") as "male" | "female") ?? "male",
      assetBase: q.get("assetBase") ?? undefined,
    });
  }
}
