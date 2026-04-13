import { json, error, type RequestHandler } from "@sveltejs/kit";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { auditFromEvent, auditLog } from "$lib/audit/index.server";
import { enhancedAIProvider } from "$lib/ai/providers/enhanced-abstraction";
import type { Content } from "$lib/ai/types.d";
import { generateId } from "$lib/utils/id";
import { chatConfigManager } from "$lib/config/chat-config";
import { chatAgentConfigManager } from "$lib/config/chat-agent-config";
import { serverChatContextService } from "$lib/context/integration/server/chat-context-server";
import type { ChatContextResult } from "$lib/context/integration/shared/chat-context-base";
import { sanitizeInput } from "$lib/chat/input-sanitizer";
import { guardOutput } from "$lib/chat/output-guard";
import { detectEmergency } from "$lib/chat/emergency-detector";
import { checkOutputSafety } from "$lib/chat/safety/llm-output-guard";
import { safetyText } from "$lib/chat/safety/i18n-server";
import { logger } from "$lib/logging/logger";

const log = logger.namespace("ChatConversation");

export const POST: RequestHandler = async (event) => {
  const {
    request,
    locals: { safeGetSession },
  } = event;
  // Check authentication
  const { session } = await safeGetSession();
  if (!session) {
    error(401, { message: "Unauthorized" });
  }

  // Rate limit: 30 requests/min per user
  const rl = checkRateLimit("chat-conversation", session.user.id, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  try {
    const {
      message,
      mode,
      profileId,
      conversationHistory,
      language = "en",
      pageContext,
      provider, // Optional provider override
      assembledContext, // Context from ChatManager
      availableTools, // MCP tools from ChatManager
      agentType, // Sub-agent type (classified in Call 1, used in Call 2)
    } = await request.json();

    auditFromEvent(event, { action: "create", resource_type: "chat", metadata: { profile_id: profileId, mode } });

    // Validate required fields
    if (!message || !mode || !profileId) {
      error(400, {
        message: "Missing required fields: message, mode, profileId",
      });
    }

    // H3: Validate mode and provider
    const VALID_MODES = new Set(["patient", "caregiver", "clinical"]);
    if (!VALID_MODES.has(mode)) {
      error(400, { message: "Invalid mode" });
    }
    if (provider && !chatConfigManager.getAvailableProviders().includes(provider)) {
      error(400, { message: "Invalid provider" });
    }

    // H1B: Sanitize input (with multilingual patterns)
    const sanitized = sanitizeInput(message, language);
    if (sanitized.flagged) {
      log.warn("Prompt injection pattern detected", { mode, profileId, originalLength: sanitized.originalLength });
    }

    // M2: Emergency detection (with multilingual patterns)
    const emergency = detectEmergency(message, language);

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Process AI request with context
        processAIRequest(
          sanitized.message,
          mode,
          profileId,
          conversationHistory || [],
          language,
          pageContext,
          provider,
          controller,
          encoder,
          assembledContext,
          availableTools,
          emergency.banner,
          agentType,
        ).catch((err) => {
          log.error("AI processing error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Failed to process message",
              })}\n\n`,
            ),
          );
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    log.error("Chat conversation error:", err);
    error(500, { message: "Internal server error" });
  }
};

async function processAIRequest(
  userMessage: string,
  mode: "patient" | "caregiver" | "clinical",
  profileId: string,
  conversationHistory: any[],
  language: string,
  pageContext: any,
  provider: string | undefined,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  assembledContext?: any,
  availableTools?: string[],
  emergencyBanner?: string | null,
  agentType?: string,
) {
  const tokenUsage = { total: 0 };

  try {
    // Prepare context if not provided by ChatManager
    let contextResult: ChatContextResult | null = null;
    if (!assembledContext && profileId) {
      try {
        // Get conversation context from recent history
        const conversationContext =
          conversationHistory
            .slice(-3) // Last 3 messages for context
            .map((msg: any) => `${msg.role}: ${msg.content}`)
            .join("\n\n") + `\n\nuser: ${userMessage}`;

        contextResult = await serverChatContextService.prepareContextForChat(
          conversationContext,
          {
            profileId,
            maxTokens: 2000, // Smaller limit for API route
            includeDocuments: true,
            contextThreshold: 0.7,
          },
        );

        log.info("API context prepared", { documents: contextResult?.documentCount, confidence: contextResult?.confidence });
      } catch (error) {
        log.warn("Failed to prepare context in API route:", error);
        contextResult = null;
      }
    }

    // Use provided context or fallback to prepared context
    const finalContext = assembledContext || contextResult?.assembledContext;
    const finalTools = availableTools || contextResult?.availableTools || [];

    log.debug("MCP context", { tools: finalTools, hasContext: !!finalContext });

    // Build system prompt — use sub-agent config for Call 2, full config for Call 1
    const useSubAgent = agentType && agentType !== 'general' && chatAgentConfigManager.hasAgent(agentType);
    const systemPrompt = useSubAgent
      ? chatAgentConfigManager.buildSubAgentPrompt(agentType!, mode, language, pageContext, finalContext)
      : chatConfigManager.buildSystemPrompt(mode, language, pageContext, finalContext);

    if (useSubAgent) {
      log.info("Using sub-agent", { agentType, mode });
    }

    // Get conversation configuration
    const conversationConfig = chatConfigManager.getConversationConfig();

    // Single LLM call: AI decides atomically whether to answer with text or request tools
    const content: Content[] = [{ type: "text", text: systemPrompt }];

    // Add assembled context if available
    if (finalContext) {
      content.push({
        type: "text",
        text: formatAssembledContext(finalContext),
      });
    }

    // Add available tools information
    if (finalTools && finalTools.length > 0) {
      const documentsInContext: string[] = pageContext?.documentsContent
        ? pageContext.documentsContent.map(([docId]: [string, any]) => docId)
        : [];

      content.push({
        type: "text",
        text: formatAvailableTools(finalTools, documentsInContext),
      });
      log.debug("Tool instructions added", { documentsInContext });
    }

    // Add conversation history
    content.push(
      ...conversationHistory
        .slice(-conversationConfig.maxMessages)
        .map((msg) => ({
          type: "text" as const,
          text: `${msg.role}: ${msg.content}`,
        })),
    );

    // Add current user message
    content.push({ type: "text", text: `user: ${userMessage}` });

    const schema = useSubAgent
      ? chatAgentConfigManager.createSubAgentSchema(agentType!, mode)
      : chatConfigManager.createResponseSchema(mode);

    // Single LLM call — returns text response + toolCalls + metadata atomically
    const structuredData = await enhancedAIProvider.analyzeDocument(
      content,
      schema,
      tokenUsage,
      {
        language: chatConfigManager.getLanguageName(language),
        temperature: 0,
        flowType: mode === "patient" ? "medical_analysis" : "medical_analysis",
      },
    );

    const fullResponse = structuredData.response || "";
    const hasToolCalls =
      structuredData.toolCalls && structuredData.toolCalls.length > 0;

    log.debug("Structured data from AI", {
      toolCalls: structuredData.toolCalls?.length || 0,
      anatomyRefs: structuredData.anatomyReferences?.length || 0,
      documentRefs: structuredData.documentReferences?.length || 0,
      hasResponse: !!fullResponse,
      hasToolCalls,
    });

    // M5: Audit data-sent metadata (not content)
    auditLog({
      action: "create",
      resource_type: "chat",
      resource_id: profileId,
      metadata: {
        token_count: tokenUsage.total,
        mode,
        provider: provider || chatConfigManager.getConfig().defaultProvider,
        has_context: !!finalContext,
        tool_count: finalTools.length,
      },
    });

    // Only send text response if no tool calls — tools are handled by the client
    if (!hasToolCalls && fullResponse) {
      // Send response as a single chunk
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "chunk", content: fullResponse })}\n\n`,
        ),
      );

      // M2: Emergency banner
      if (emergencyBanner) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "emergency_banner", content: emergencyBanner })}\n\n`,
          ),
        );
      }

      // H1C: Two-layer output safety guard
      // Layer 1: Regex pre-filter (fast, flags only)
      const regexResult = guardOutput(fullResponse, mode);

      // Layer 2: LLM validation (all languages, non-clinical)
      if (mode !== "clinical") {
        const llmGuard = await Promise.race([
          checkOutputSafety(fullResponse, mode, language, regexResult).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);

        // Add disclaimer if LLM confirms unsafe, or if LLM timed out and regex had flags (fail-safe)
        const needsDisclaimer = llmGuard
          ? !llmGuard.safe
          : regexResult.flags.length > 0;

        if (needsDisclaimer) {
          const source = llmGuard ? "llm" : "regex-fallback";
          log.info("Output guard triggered", {
            source,
            regexFlags: regexResult.flags,
            llmFlags: llmGuard?.flags,
            severity: llmGuard?.severity,
            mode,
            language,
          });
          const disclaimer = safetyText("chat.safety.disclaimer", language);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", content: `\n\n---\n*${disclaimer}*` })}\n\n`,
            ),
          );
        }
      }
    }

    // Filter sources to only approved domains
    const APPROVED_DOMAINS = new Set([
      "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "cochranelibrary.com",
      "europepmc.org", "semanticscholar.org", "scholar.google.com",
      "bestpractice.bmj.com", "merckmanuals.com", "msdmanuals.com",
      "mayoclinic.org", "my.clevelandclinic.org", "who.int",
      "cdc.gov", "nih.gov", "nice.org.uk", "ecdc.europa.eu",
    ]);
    const validatedSources = (structuredData.sources || []).filter(
      (s: any) => s.url && s.domain && APPROVED_DOMAINS.has(s.domain),
    );

    // Send the structured data as metadata with context information
    const metadata = {
      type: "metadata",
      data: {
        anatomyReferences: structuredData.anatomyReferences || [],
        documentReferences: structuredData.documentReferences || [],
        consentRequests: structuredData.consentRequests || [],
        toolCalls: structuredData.toolCalls || [],
        clarifyingQuestions: structuredData.clarifyingQuestions || [],
        widgets: structuredData.widgets || [],
        sources: validatedSources,
        tokenUsage: tokenUsage.total,
        mode,
        // Include context metadata
        contextAvailable: !!(finalContext || contextResult),
        documentCount: contextResult?.documentCount || 0,
        contextConfidence: contextResult?.confidence || 0,
        availableTools: finalTools,
        // Sub-agent classification for Call 2 routing
        agentType: structuredData.agentType || 'general',
        // Debug info
        debugInfo: {
          hasToolCalls,
          hasAvailableTools: finalTools && finalTools.length > 0,
        },
      },
    };

    controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));

    // Send completion signal
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: "complete" })}\n\n`),
    );

    // Close the stream
    controller.close();
  } catch (err) {
    log.error("AI processing error:", err);
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "error",
          message: "Failed to process AI request",
        })}\n\n`,
      ),
    );
    controller.close();
  }
}

// All prompt building, schema creation, and utility functions are now handled by chatConfigManager
// Configuration is loaded from config/chat.json and managed by src/lib/config/chat-config.ts

/**
 * Format assembled context for AI consumption
 */
function formatAssembledContext(assembledContext: any): string {
  if (!assembledContext) {
    return "No medical context available for this conversation.";
  }

  const sections = [];

  // Summary
  if (assembledContext.summary) {
    sections.push(`**Medical Context Summary:**\n${assembledContext.summary}`);
  }

  // Key points with source document IDs
  if (assembledContext.keyPoints && assembledContext.keyPoints.length > 0) {
    const keyPointsList = assembledContext.keyPoints
      .slice(0, 5) // Limit to top 5 points
      .map(
        (point: any) =>
          `- ${point.text} (${point.type}, ${point.date || "unknown date"}, from document: ${point.sourceDocumentId})`,
      )
      .join("\n");
    sections.push(`**Key Medical Points:**\n${keyPointsList}`);
  }

  // Relevant documents with IDs
  if (
    assembledContext.relevantDocuments &&
    assembledContext.relevantDocuments.length > 0
  ) {
    const documentsList = assembledContext.relevantDocuments
      .slice(0, 5) // Limit to top 5 documents
      .map(
        (doc: any) =>
          `- Document ID: ${doc.documentId} (${doc.type}, ${doc.date}) - ${doc.excerpt}`,
      )
      .join("\n");
    sections.push(`**Available Documents:**\n${documentsList}`);
  }

  // Recent changes
  if (assembledContext.medicalContext?.recentChanges?.length) {
    const recentList = assembledContext.medicalContext.recentChanges
      .slice(0, 3)
      .map((change: any) => `- ${change.date}: ${change.description}`)
      .join("\n");
    sections.push(`**Recent Medical Changes:**\n${recentList}`);
  }

  return sections.join("\n\n");
}

/**
 * Format available MCP tools for AI prompt
 */
function formatAvailableTools(
  availableTools: string[],
  documentsInContext: string[] = [],
): string {
  if (!availableTools || availableTools.length === 0) {
    return "No medical data access tools are currently available.";
  }

  const toolDescriptions: Record<string, string> = {
    searchDocuments: "Search patient documents using semantic similarity",
    getAssembledContext: "Get comprehensive assembled medical context",
    getProfileData: "Access patient demographics and health profile (height, weight, age, blood type, allergies, medications, conditions)",
    queryMedicalHistory:
      "Query specific medical history (medications, conditions, procedures, allergies)",
    getDocumentById: "Retrieve specific document by ID",
  };

  const toolsList = availableTools
    .map(
      (tool) =>
        `- **${tool}**: ${toolDescriptions[tool] || "Medical data access tool"}`,
    )
    .join("\n");

  // Indicate which documents are already loaded
  let contextNote = "";
  if (documentsInContext.length > 0) {
    contextNote = `**DOCUMENTS ALREADY IN YOUR CONTEXT:**
The following document(s) are already loaded. You can answer questions about them directly WITHOUT using tools:
${documentsInContext.map((id) => `- ${id}`).join("\n")}

DO NOT use getDocumentById or searchDocuments for documents listed above - their content is already available to you.

`;
  }

  return `${contextNote}**Available Medical Data Tools:**
${toolsList}

**WHEN TO USE TOOLS:**
- Use tools ONLY when you need information that is NOT already in your context above
- If you already have the document content loaded, answer directly from that context
- Use queryMedicalHistory for medications, conditions, procedures, or allergies NOT in current context
- Use searchDocuments to find other documents NOT already loaded
- Use getDocumentById ONLY for documents NOT listed in your context

**Tool parameter examples:**
- searchDocuments: { "terms": ["diabetes", "medications"], "limit": 5 }
- getProfileData: {} (no parameters needed)
- queryMedicalHistory: { "queryType": "medications" } (queryType: medications, conditions, procedures, allergies)
- getDocumentById: { "documentId": "doc_123" } (use EXACT document IDs)

**Remember:** Answer from context when possible. Only use tools for additional information not already available.`;
}
