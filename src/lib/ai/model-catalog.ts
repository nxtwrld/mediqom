// Selectable chat models — shared between client (UI switcher) and server (validation).
// Unlike models.yaml (server-only, build-time inlined), this module is safe to import
// on the client. IDs are Vercel AI Gateway "provider/model" slugs; switching a model is
// just changing this string. Keep slugs in sync with the live gateway model list
// (curl https://ai-gateway.vercel.sh/v1/models).

export interface ChatModelOption {
  /** Gateway "provider/model" slug passed straight to the AI SDK. */
  id: string;
  /** Human-facing model name shown in the switcher. */
  label: string;
  /** Provider label shown alongside the model name. */
  provider: string;
}

export const CHAT_MODELS: readonly ChatModelOption[] = [
  { id: "openai/gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "OpenAI" },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    provider: "Anthropic",
  },
  {
    id: "google/gemini-3-pro-preview",
    label: "Gemini 3 Pro",
    provider: "Google",
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "Google",
  },
] as const;

export const DEFAULT_CHAT_MODEL = "openai/gpt-5.4";

const MODEL_IDS = new Set(CHAT_MODELS.map((m) => m.id));

/** Whether a model id is one the user is allowed to select. */
export function isValidChatModel(id: unknown): id is string {
  return typeof id === "string" && MODEL_IDS.has(id);
}

/** Look up a model option by id (for labels / provider name). */
export function getChatModel(id: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}
