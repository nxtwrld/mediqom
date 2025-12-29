import { json, error, type RequestHandler } from "@sveltejs/kit";
import { enhancedAIProvider } from "$lib/ai/providers/enhanced-abstraction";
import type { Content } from "$lib/ai/types.d";
import { generateId } from "$lib/utils/id";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { chatConfigManager } from "$lib/config/chat-config";
import { serverChatContextService } from "$lib/context/integration/server/chat-context-server";
import type { ChatContextResult } from "$lib/context/integration/shared/chat-context-base";

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession },
}) => {
  // Check authentication
  const { session } = await safeGetSession();
  if (!session) {
    error(401, { message: "Unauthorized" });
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
    } = await request.json();

    // Validate required fields
    if (!message || !mode || !profileId) {
      error(400, {
        message: "Missing required fields: message, mode, profileId",
      });
    }

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Process AI request with context
        processAIRequest(
          message,
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
        ).catch((err) => {
          console.error("AI processing error:", err);
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (err) {
    console.error("Chat conversation error:", err);
    error(500, { message: "Internal server error" });
  }
};

async function processAIRequest(
  userMessage: string,
  mode: "patient" | "clinical",
  profileId: string,
  conversationHistory: any[],
  language: string,
  pageContext: any,
  provider: string | undefined,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  assembledContext?: any,
  availableTools?: string[],
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

        console.log(
          `API context prepared: ${contextResult?.documentCount} documents, confidence: ${contextResult?.confidence}`,
        );
      } catch (error) {
        console.warn("Failed to prepare context in API route:", error);
        contextResult = null;
      }
    }

    // Use provided context or fallback to prepared context
    const finalContext = assembledContext || contextResult?.assembledContext;
    const finalTools = availableTools || contextResult?.availableTools || [];

    // Debug logging
    console.log("[MCP Debug] Available tools:", finalTools);
    console.log("[MCP Debug] Has assembled context:", !!finalContext);

    // Build system prompt with both document context (signals) and assembled context
    const systemPrompt = chatConfigManager.buildSystemPrompt(
      mode,
      language,
      pageContext,
      finalContext,
    );

    // Phase 1: Stream the text response using configured model
    const streamingModel = chatConfigManager.createStreamingModel(provider);

    // Get conversation configuration
    const conversationConfig = chatConfigManager.getConversationConfig();

    const messages = [
      new SystemMessage(systemPrompt),
      // Add conversation history based on configuration
      ...conversationHistory
        .slice(-conversationConfig.maxMessages)
        .flatMap((msg) => {
          if (msg.role === "user") return [new HumanMessage(msg.content)];
          if (
            msg.role === "assistant" &&
            conversationConfig.includeSystemMessages
          ) {
            return [new SystemMessage(msg.content)];
          }
          return [];
        }),
      new HumanMessage(userMessage),
    ];

    // Start streaming the response
    let fullResponse = "";
    const stream = await streamingModel.stream(messages);

    for await (const chunk of stream) {
      const text = chunk.content.toString();
      fullResponse += text;

      // Send chunk to client
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "chunk",
            content: text,
          })}\n\n`,
        ),
      );
    }

    // Phase 2: Get structured data using the full response
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
      // Get document IDs already in context to avoid duplicate tool requests
      const documentsInContext: string[] = pageContext?.documentsContent
        ? pageContext.documentsContent.map(
            ([docId]: [string, any]) => docId,
          )
        : [];

      content.push({
        type: "text",
        text: formatAvailableTools(finalTools, documentsInContext),
      });
      console.log("[MCP Debug] Tool instructions added to content");
      console.log("[MCP Debug] Documents already in context:", documentsInContext);
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

    // Add current exchange
    content.push(
      { type: "text", text: `user: ${userMessage}` },
      { type: "text", text: `assistant: ${fullResponse}` },
    );

    const schema = chatConfigManager.createResponseSchema(mode);

    // Get structured data (anatomy references, etc.)
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

    // Debug: Log what we got back from the AI
    console.log("🔍 [Tool Debug] Structured data from AI:", {
      hasToolCalls: !!structuredData.toolCalls,
      toolCallsLength: structuredData.toolCalls?.length || 0,
      toolCalls: structuredData.toolCalls,
      anatomyReferences: structuredData.anatomyReferences?.length || 0,
      documentReferences: structuredData.documentReferences?.length || 0,
      response: structuredData.response?.substring(0, 100) + "...",
    });

    // Validate that AI is using tools when it should
    const toolMentionKeywords = [
      "check your",
      "look at your",
      "access your",
      "review your",
      "examine your",
      "search for",
      "find information",
      "retrieve data",
      "get your medical",
      "medication",
      "condition",
      "test result",
      "lab result",
      "medical history",
    ];

    const mentionsTools = toolMentionKeywords.some((keyword) =>
      fullResponse.toLowerCase().includes(keyword.toLowerCase()),
    );

    const hasToolCalls =
      structuredData.toolCalls && structuredData.toolCalls.length > 0;
    const hasAvailableTools = finalTools && finalTools.length > 0;

    // Log validation results
    console.log("🔍 [Tool Validation] Analysis:", {
      mentionsTools,
      hasToolCalls,
      hasAvailableTools,
      responseLength: fullResponse.length,
      responseStart: fullResponse.substring(0, 150) + "...",
    });

    if (mentionsTools && !hasToolCalls && hasAvailableTools) {
      console.warn(
        "⚠️ [Tool Validation] AI mentioned accessing medical data but did not generate toolCalls",
        {
          responseExcerpt: fullResponse.substring(0, 200),
          availableTools: finalTools,
          mentionedKeywords: toolMentionKeywords.filter((k) =>
            fullResponse.toLowerCase().includes(k.toLowerCase()),
          ),
        },
      );
    }

    // Send the structured data as metadata with context information
    const metadata = {
      type: "metadata",
      data: {
        anatomyReferences: structuredData.anatomyReferences || [],
        documentReferences: structuredData.documentReferences || [],
        consentRequests: structuredData.consentRequests || [],
        toolCalls: structuredData.toolCalls || [],
        clarifyingQuestions: structuredData.clarifyingQuestions || [],
        tokenUsage: tokenUsage.total,
        mode,
        // Include context metadata
        contextAvailable: !!(finalContext || contextResult),
        documentCount: contextResult?.documentCount || 0,
        contextConfidence: contextResult?.confidence || 0,
        availableTools: finalTools,
        // Debug info
        debugInfo: {
          mentionsTools,
          hasToolCalls,
          hasAvailableTools,
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
    console.error("AI processing error:", err);
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
    getProfileData: "Access patient profile and basic health information",
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
