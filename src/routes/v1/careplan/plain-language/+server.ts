import { json, error, type RequestHandler } from "@sveltejs/kit";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { auditFromEvent } from "$lib/audit/index.server";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import type { Content } from "$lib/ai/types.d";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { logger } from "$lib/logging/logger";

/**
 * Plain-language rewrite of a single clinical string (Care Plan build row 7k).
 * Fixed prompt — preserves all clinical facts, adds no interpretation. The
 * client caches the result on the Care Plan item, so repeat opens never hit
 * this endpoint.
 */
const REWRITE_SCHEMA: FunctionDefinition = {
  name: "plain_language_rewrite",
  description:
    "Rewrite a clinical phrase for a non-medical reader. Preserve ALL clinical facts exactly. Do NOT add warnings, recommendations, interpretation, or new information. Match the requested language.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "The clinical phrase rewritten in plain, everyday language for a layperson, in the requested language. Same facts, simpler words. No added advice.",
      },
    },
    required: ["text"],
  },
};

export const POST: RequestHandler = async (event) => {
  const {
    request,
    locals: { safeGetSession },
  } = event;

  const { session } = await safeGetSession();
  if (!session) error(401, { message: "Unauthorized" });

  const rl = checkRateLimit("careplan-plain-language", session.user.id, 60, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const { text, language = "English" } = await request.json();
  if (typeof text !== "string" || text.trim().length === 0) {
    error(400, { message: "Missing text" });
  }
  if (text.length > 2000) error(400, { message: "Text too long" });

  auditFromEvent(event, {
    action: "create",
    resource_type: "careplan",
    metadata: { operation: "plain_language" },
  });

  try {
    const content: Content[] = [
      {
        type: "text",
        text: `Rewrite this clinical phrase in plain ${language} for a non-medical reader. Preserve every clinical fact; add nothing.\n\n"${text}"`,
      },
    ];
    const tokenUsage = { total: 0 };
    const result = await fetchGptEnhanced(
      content,
      REWRITE_SCHEMA,
      tokenUsage,
      language,
      "medical_analysis",
    );
    const rewritten = typeof result?.text === "string" ? result.text.trim() : "";
    return json({ text: rewritten || text });
  } catch (e) {
    logger.api?.error?.("Plain-language rewrite failed", { error: String(e) });
    // Degrade gracefully — caller falls back to the original clinical string.
    return json({ text });
  }
};
