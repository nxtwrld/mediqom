import { enhancedAIProvider } from "$lib/ai/providers/enhanced-abstraction";
import { getLanguageEnglishName } from "$lib/languages";
import type {
  ChatMessage,
  ChatContext,
  ChatResponse,
  ChatMode,
} from "./types.d";
import type { Content } from "$lib/ai/types.d";
import AnatomyIntegration from "./anatomy-integration";
import { generateId } from "$lib/utils/id";
import { chatContextService } from "$lib/context/integration/chat-service";
import { chatConfigManager } from "$lib/config/chat-config";

export class ChatAIService {
  private tokenUsage = { total: 0 };

  /**
   * Process user message and generate AI response
   */
  async processMessage(
    userMessage: string,
    context: ChatContext,
    conversationHistory: ChatMessage[],
  ): Promise<ChatResponse> {
    try {
      // Detect body part references
      const bodyPartReferences =
        AnatomyIntegration.detectBodyParts(userMessage);

      // Create content for AI processing
      const content = this.buildContent(
        userMessage,
        context,
        conversationHistory,
      );

      // Create schema based on mode using ChatConfigManager
      const schema = chatConfigManager.createResponseSchema(context.mode === 'clinical' ? 'clinical' : 'patient');

      // Choose flow type based on mode
      const flowType =
        context.mode === "patient" ? "medical_analysis" : "medical_analysis";

      // Get AI response using enhanced provider
      const aiResponse = await enhancedAIProvider.analyzeDocument(
        content,
        schema,
        this.tokenUsage,
        {
          language: getLanguageEnglishName(context.language),
          temperature: 0.7,
          flowType,
        },
      );

      // Generate anatomy suggestions if body parts detected
      const anatomySuggestion =
        AnatomyIntegration.suggestAnatomyView(bodyPartReferences);

      return {
        message:
          aiResponse.response ||
          aiResponse.message ||
          "I apologize, but I encountered an issue processing your message.",
        anatomyReferences: bodyPartReferences.map((ref) => ref.bodyPartId),
        suggestions: anatomySuggestion ? [anatomySuggestion] : [],
        documentReferences: aiResponse.documentReferences || [],
        toolCalls: aiResponse.toolCalls || [],
        consentRequests: aiResponse.consentRequests || [],
      };
    } catch (error) {
      console.error("Chat AI Service Error:", error);
      return {
        message:
          "I apologize, but I encountered an error processing your message. Please try again.",
        anatomyReferences: [],
        suggestions: [],
      };
    }
  }

  /**
   * Build content array for AI processing with context assembly
   */
  private buildContent(
    userMessage: string,
    context: ChatContext,
    conversationHistory: ChatMessage[],
  ): Content[] {
    const content: Content[] = [];

    // Add enhanced system context with assembled medical context
    content.push({
      type: "text",
      text: this.buildEnhancedSystemPrompt(context),
    });

    // Add assembled medical context if available
    if (context.assembledContext) {
      content.push({
        type: "text",
        text: this.formatAssembledContext(context.assembledContext),
      });
    }

    // Add available MCP tools information
    if (context.availableTools && context.availableTools.length > 0) {
      content.push({
        type: "text",
        text: this.formatAvailableTools(context.availableTools),
      });
    }

    // Add conversation history (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    recentHistory.forEach((msg) => {
      content.push({
        type: "text",
        text: `${msg.role}: ${msg.content}`,
      });
    });

    // Add current user message
    content.push({
      type: "text",
      text: `user: ${userMessage}`,
    });

    return content;
  }

  /**
   * Build enhanced system prompt with context assembly integration
   */
  private buildEnhancedSystemPrompt(context: ChatContext): string {
    const basePrompt = chatContextService.createContextAwareSystemPrompt(
      this.buildSystemPrompt(context),
      {
        assembledContext: context.assembledContext,
        availableTools: context.availableTools || [],
        contextSummary: context.assembledContext
          ? "Medical context available"
          : "No medical context available",
        documentCount: context.assembledContext?.relevantDocuments?.length || 0,
        confidence: context.assembledContext?.confidence || 0,
        tokenUsage: context.assembledContext?.tokenCount || 0,
      },
      context.mode === "patient" ? "patient" : "clinical",
    );

    return basePrompt;
  }

  /**
   * Build system prompt based on mode
   */
  private buildSystemPrompt(context: ChatContext): string {
    const basePrompt = `You are an AI medical assistant integrated with a 3D anatomy model. You can suggest anatomy visualizations when discussing body parts.`;

    if (context.mode === "patient") {
      return `${basePrompt}

PATIENT SUPPORT MODE:
- Use empathetic, supportive language
- Focus on education and understanding
- Provide emotional support and coping strategies
- Never provide medical advice or diagnosis
- Always recommend consulting healthcare providers
- Use language appropriate for: ${context.language}
- Patient name: ${context.pageContext.profileName}

When discussing body parts, suggest using the 3D anatomy model for better understanding.
Available anatomy systems: skeletal, muscular, vascular, nervous, respiratory, digestive, urogenital.

IMPORTANT BOUNDARIES:
- No medical advice or diagnosis
- No treatment recommendations
- Always defer to healthcare providers
- Focus on understanding and support`;
    } else if (context.mode === "caregiver") {
      return `${basePrompt}

CARE SUPPORT MODE for ${context.pageContext.profileName}:
- NEVER use 'you', 'your', 'you are' when referring to ${context.pageContext.profileName}'s health data
- Always refer to the patient as '${context.pageContext.profileName}', 'they', or 'their'
- Use clear, accessible language — avoid overly technical medical jargon
- Explain medical terms and conditions in plain language
- NEVER provide specific medical advice, diagnosis recommendations, or treatment plans
- Always emphasize the importance of consulting ${context.pageContext.profileName}'s doctor for medical decisions
- Be empathetic to the caregiver's concern
- Use language appropriate for: ${context.language}

When discussing body parts, suggest using the 3D anatomy model for better understanding.
Available anatomy systems: skeletal, muscular, vascular, nervous, respiratory, digestive, urogenital.

IMPORTANT BOUNDARIES:
- No medical advice or treatment recommendations
- Always defer to healthcare providers for medical decisions
- Focus on helping the caregiver understand, not prescribe`;
    } else {
      return `${basePrompt}

CLINICAL CONSULTATION MODE:
- Use professional, analytical language
- Provide clinical insights and perspectives
- Suggest diagnostic considerations
- Analyze patterns and correlations
- Reference medical literature when appropriate
- Use language appropriate for: ${context.language}
- Patient profile: ${context.pageContext.profileName}

When discussing anatomical structures, suggest using the 3D model for visualization.
Available anatomy systems: skeletal, muscular, vascular, nervous, respiratory, digestive, urogenital.

CLINICAL FOCUS:
- Pattern analysis across patient history
- Differential diagnostic considerations
- Evidence-based insights
- Professional medical terminology`;
    }
  }

  /**
   * Format assembled context for AI prompt
   */
  private formatAssembledContext(assembledContext: any): string {
    if (!assembledContext) {
      return "No medical context available for this conversation.";
    }

    const sections = [];

    // Summary
    if (assembledContext.summary) {
      sections.push(
        `**Medical Context Summary:**\n${assembledContext.summary}`,
      );
    }

    // Key points
    if (assembledContext.keyPoints && assembledContext.keyPoints.length > 0) {
      const keyPointsList = assembledContext.keyPoints
        .slice(0, 5) // Limit to top 5 points
        .map(
          (point: any) =>
            `- ${point.text} (${point.type}, ${point.date || "unknown date"})`,
        )
        .join("\n");
      sections.push(`**Key Medical Points:**\n${keyPointsList}`);
    }

    // Recent changes
    if (assembledContext.medicalContext?.recentChanges?.length) {
      const recentList = assembledContext.medicalContext.recentChanges
        .slice(0, 3)
        .map((change: any) => `- ${change.date}: ${change.description}`)
        .join("\n");
      sections.push(`**Recent Medical Changes:**\n${recentList}`);
    }

    // Metadata
    const metadata = `**Context Statistics:**\n- Documents: ${assembledContext.relevantDocuments?.length || 0}\n- Key Points: ${assembledContext.keyPoints?.length || 0}\n- Confidence: ${((assembledContext.confidence || 0) * 100).toFixed(1)}%\n- Token Usage: ${assembledContext.tokenCount || 0}`;
    sections.push(metadata);

    return sections.join("\n\n");
  }

  /**
   * Format available MCP tools for AI prompt
   */
  private formatAvailableTools(availableTools: string[]): string {
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

    return `**Available Medical Data Tools:**\n\n${toolsList}\n\n**How to use tools:**
When you need medical information to answer a question, request to use these tools by including a toolCalls array in your response. Each tool request must include:
- name: The exact tool name from the list above
- parameters: Required parameters for the tool (see examples below)
- reason: Clear explanation of why you need this information

**Tool parameter examples:**
- searchDocuments: { "terms": ["diabetes", "medications"], "limit": 5 }
- getAssembledContext: { "conversationContext": "recent lab results", "maxTokens": 1000 }
- getProfileData: {} (no parameters needed)
- queryMedicalHistory: { "queryType": "medications" } (queryType: medications, conditions, procedures, allergies)
- getDocumentById: { "documentId": "doc_123" }

**Important:** The user will be asked to approve each tool use before execution. Only request tools when necessary to answer the user's question accurately.`;
  }

  /**
   * Format response for display
   */
  formatResponse(response: ChatResponse): string {
    let formatted = response.message;

    // Add anatomy suggestions
    if (response.suggestions && response.suggestions.length > 0) {
      formatted +=
        "\n\n" +
        response.suggestions.map((s) => `🔍 ${s.suggestion}`).join("\n");
    }

    // Add consent requests
    if (response.consentRequests && response.consentRequests.length > 0) {
      formatted +=
        "\n\n" +
        response.consentRequests.map((cr) => `📋 ${cr.message}`).join("\n");
    }

    return formatted;
  }
}

export default ChatAIService;
