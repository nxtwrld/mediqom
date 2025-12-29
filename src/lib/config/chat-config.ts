import chatConfig from "../../../config/chat.json";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { modelConfig } from "./model-config";
import anatomyObjects from "$components/anatomy/objects.json";
import { classificationConfig } from "./classification";

export interface ChatProvider {
  name: string;
  enabled: boolean;
  models: {
    streaming: ModelConfig;
    structured: ModelConfig;
  };
}

export interface ModelConfig {
  name: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatConfig {
  providers: Record<string, ChatProvider>;
  defaultProvider: string;
  fallbackProvider: string;
  conversationHistory: {
    maxMessages: number;
    includeSystemMessages: boolean;
  };
  prompts: {
    base: {
      instruction: string;
    };
    patient: PromptConfig;
    clinical: PromptConfig;
  };
  documentContext: {
    enabled: boolean;
    includeFields: string[];
    includeAdditionalContent: boolean;
    maxDocuments: number;
  };
  responseSchema: {
    base: any;
  };
  languages: Record<string, string>;
}

export interface PromptConfig {
  systemPrompt: {
    title: string;
    guidelines: string[];
    anatomyInstructions: string[];
    boundaries?: string[];
    focus?: string[];
    toolInstructions?: string[];
  };
  responseSchema: {
    additionalProperties: Record<string, any>;
  };
}

class ChatConfigManager {
  private config: ChatConfig = chatConfig as ChatConfig;

  /**
   * Get the current chat configuration
   */
  getConfig(): ChatConfig {
    return this.config;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Object.keys(this.config.providers).filter(
      (provider) => this.config.providers[provider].enabled,
    );
  }

  /**
   * Get a provider configuration
   */
  getProviderConfig(provider: string): ChatProvider {
    if (!this.config.providers[provider]) {
      throw new Error(`Provider '${provider}' not found in configuration`);
    }
    return this.config.providers[provider];
  }

  /**
   * Create a chat model instance for streaming
   */
  createStreamingModel(provider?: string): any {
    const providerName = provider || this.config.defaultProvider;
    const providerConfig = this.getProviderConfig(providerName);

    if (!providerConfig.enabled) {
      throw new Error(`Provider '${providerName}' is not enabled`);
    }

    const modelConfig = providerConfig.models.streaming;

    switch (providerName) {
      case "openai":
        return new ChatOpenAI({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("openai"),
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          streaming: true,
        });

      case "gemini":
        return new ChatGoogleGenerativeAI({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("gemini"),
          temperature: modelConfig.temperature,
          maxOutputTokens: modelConfig.maxTokens,
          streaming: true,
        });

      case "anthropic":
        return new ChatAnthropic({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("anthropic"),
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          streaming: true,
        });

      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  /**
   * Create a chat model instance for structured output
   */
  createStructuredModel(provider?: string): any {
    const providerName = provider || this.config.defaultProvider;
    const providerConfig = this.getProviderConfig(providerName);

    if (!providerConfig.enabled) {
      throw new Error(`Provider '${providerName}' is not enabled`);
    }

    const modelConfig = providerConfig.models.structured;

    switch (providerName) {
      case "openai":
        return new ChatOpenAI({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("openai"),
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
        });

      case "gemini":
        return new ChatGoogleGenerativeAI({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("gemini"),
          temperature: modelConfig.temperature,
          maxOutputTokens: modelConfig.maxTokens,
        });

      case "anthropic":
        return new ChatAnthropic({
          model: modelConfig.name,
          apiKey: this.getProviderApiKey("anthropic"),
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
        });

      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  /**
   * Build system prompt from configuration
   */
  buildSystemPrompt(
    mode: "patient" | "clinical",
    language: string,
    pageContext: any,
    assembledContext?: any,
  ): string {
    const basePrompt = this.config.prompts.base.instruction;
    const modeConfig = this.config.prompts[mode];

    // Add current date for temporal awareness (healing times, procedure dates, etc.)
    const today = new Date();
    const dateContext = `**Current Date:** ${today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}
Use this date to calculate time since procedures, estimate healing progress, and provide accurate time-relative assessments.

`;

    let systemPrompt = `${dateContext}${basePrompt}\n\n${modeConfig.systemPrompt.title}:\n`;

    // Add guidelines
    modeConfig.systemPrompt.guidelines.forEach((guideline) => {
      systemPrompt += `- ${this.interpolateString(guideline, { language, profileName: pageContext?.profileName || "Patient" })}\n`;
    });

    systemPrompt += "\n";

    // Add anatomy instructions
    modeConfig.systemPrompt.anatomyInstructions.forEach((instruction) => {
      systemPrompt += `${instruction}\n`;
    });

    // Add document context if enabled (includes formatted signals data)
    if (this.config.documentContext.enabled) {
      const documentContext = this.buildDocumentContext(pageContext);
      if (documentContext) {
        systemPrompt += `\n${documentContext}`;
      }
    }

    // Add assembled context from embedding search if available
    if (assembledContext) {
      systemPrompt += "\n\n## Additional Medical Context\n";

      // Add summary if available
      if (assembledContext.summary) {
        systemPrompt += `**Patient Summary:**\n${assembledContext.summary}\n\n`;
      }

      // Add key points by type
      if (assembledContext.keyPoints && assembledContext.keyPoints.length > 0) {
        const pointsByType = assembledContext.keyPoints.reduce(
          (acc: any, point: any) => {
            if (!acc[point.type]) acc[point.type] = [];
            acc[point.type].push(point);
            return acc;
          },
          {},
        );

        Object.entries(pointsByType).forEach(
          ([type, points]: [string, any]) => {
            const pointsList = points
              .slice(0, 3) // Limit to top 3 per type
              .map((p: any) => `- ${p.text} (${p.date || "unknown date"})`)
              .join("\n");
            systemPrompt += `**${type.charAt(0).toUpperCase() + type.slice(1)}s:**\n${pointsList}\n\n`;
          },
        );
      }

      // Add recent changes
      if (assembledContext.medicalContext?.recentChanges?.length) {
        const recentList = assembledContext.medicalContext.recentChanges
          .slice(0, 3)
          .map((change: any) => `- ${change.date}: ${change.description}`)
          .join("\n");
        systemPrompt += `**Recent Changes:**\n${recentList}\n\n`;
      }
    }

    systemPrompt += "\n";

    // Add mode-specific sections
    if (modeConfig.systemPrompt.boundaries) {
      systemPrompt += "\nIMPORTANT BOUNDARIES:\n";
      modeConfig.systemPrompt.boundaries.forEach((boundary) => {
        systemPrompt += `- ${boundary}\n`;
      });
    }

    if (modeConfig.systemPrompt.focus) {
      systemPrompt += "\nCLINICAL FOCUS:\n";
      modeConfig.systemPrompt.focus.forEach((focus) => {
        systemPrompt += `- ${focus}\n`;
      });
    }

    // Add tool instructions if available
    if (modeConfig.systemPrompt.toolInstructions) {
      systemPrompt += "\nMEDICAL DATA TOOLS:\n";
      modeConfig.systemPrompt.toolInstructions.forEach(
        (instruction: string) => {
          systemPrompt += `- ${instruction}\n`;
        },
      );
    }

    return systemPrompt;
  }

  /**
   * Create response schema from configuration
   */
  createResponseSchema(mode: "patient" | "clinical"): any {
    const schema = JSON.parse(JSON.stringify(this.config.responseSchema.base));

    // Add anatomy objects to enum
    const allAnatomyObjects: string[] = [];
    Object.values(anatomyObjects).forEach((system: any) => {
      allAnatomyObjects.push(...system.objects);
    });
    schema.parameters.properties.anatomyReferences.items.enum =
      allAnatomyObjects;

    // Add mode-specific properties
    const modeConfig = this.config.prompts[mode];
    Object.entries(modeConfig.responseSchema.additionalProperties).forEach(
      ([key, value]) => {
        schema.parameters.properties[key] = value;
      },
    );

    // Enhance tool calls with dynamic categories from classification config
    if (
      schema.parameters.properties.toolCalls?.items?.properties?.parameters
        ?.properties
    ) {
      const toolParams =
        schema.parameters.properties.toolCalls.items.properties.parameters
          .properties;

      // Update documentTypes description with actual categories
      if (toolParams.documentTypes) {
        const categoryList = Object.values(classificationConfig.categories)
          .map((cat) => `'${cat.id}'`)
          .join(", ");
        toolParams.documentTypes.description = `Filter by document categories. Use exact category IDs: ${categoryList}. These map to the metadata.category field in documents.`;
      }

      // Update terms description with temporal terms
      if (toolParams.terms) {
        const temporalTerms = Object.keys(classificationConfig.temporalTerms)
          .map((term) => `"${term}"`)
          .join(", ");
        const currentDescription = toolParams.terms.description;
        // Replace the temporal terms section
        toolParams.terms.description = currentDescription.replace(
          /TEMPORAL: "[^"]*"(?:, "[^"]*")*/,
          `TEMPORAL: ${temporalTerms}`,
        );
      }
    }

    return schema;
  }

  /**
   * Get language name from code
   */
  getLanguageName(languageCode: string): string {
    return this.config.languages[languageCode] || this.config.languages["en"];
  }

  /**
   * Get conversation history configuration
   */
  getConversationConfig() {
    return this.config.conversationHistory;
  }

  /**
   * Private helper methods
   */
  private getProviderApiKey(provider: string): string {
    return modelConfig.getProviderApiKey(provider);
  }

  private interpolateString(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  /**
   * Extract the best available text content from document, avoiding duplication
   */
  private extractBestTextContent(documentContent: any): string {
    let content = "";

    // Priority 1: Use localized text if available (user's language)
    if (
      documentContent.localizedContent &&
      typeof documentContent.localizedContent === "string"
    ) {
      content = documentContent.localizedContent;
    }
    // Priority 2: Fall back to original content
    else if (
      documentContent.content &&
      typeof documentContent.content === "string"
    ) {
      content = documentContent.content;
    }
    // Priority 3: Legacy fields for backward compatibility
    else if (documentContent.text && typeof documentContent.text === "string") {
      content = documentContent.text;
    } else if (
      documentContent.original &&
      typeof documentContent.original === "string"
    ) {
      content = documentContent.original;
    }

    // Always prepend title if available and not already included
    if (documentContent.title && !content.includes(documentContent.title)) {
      content = documentContent.title + "\n\n" + content;
    }

    // Always append tags for structured metadata
    if (
      documentContent.tags &&
      Array.isArray(documentContent.tags) &&
      documentContent.tags.length > 0
    ) {
      content += "\n\nTags: " + documentContent.tags.join(", ");
    }

    return content.trim();
  }

  private buildDocumentContext(pageContext: any): string {
    if (
      !pageContext?.documentsContent ||
      !Array.isArray(pageContext.documentsContent)
    ) {
      return "";
    }

    const documents = pageContext.documentsContent.slice(
      0,
      this.config.documentContext.maxDocuments,
    );
    if (documents.length === 0) {
      return "";
    }

    let documentContext = "\n\nAVAILABLE MEDICAL DOCUMENTS:\n";

    documents.forEach(([_docId, doc]: [string, any]) => {
      if (doc) {
        documentContext += `\nDocument: ${doc.title || "Untitled"}\n`;

        // Include configured fields - doc IS the content object
        this.config.documentContext.includeFields.forEach((field) => {
          if (doc[field]) {
            if (field === "content") {
              // Special handling for content field - use smart text extraction
              const smartText = this.extractBestTextContent(doc);
              if (smartText) {
                documentContext += `- Content: ${smartText}\n`;
              }
            } else if (field === "signals") {
              // Special handling for signals data - format for better readability
              const signals = doc[field];
              if (signals && Array.isArray(signals)) {
                documentContext += `- Lab/Vital Signs:\n`;
                signals.forEach((signal: any) => {
                  if (signal.signal && signal.value !== undefined) {
                    const unit = signal.unit ? ` ${signal.unit}` : "";
                    const reference = signal.reference
                      ? ` (ref: ${signal.reference})`
                      : "";
                    documentContext += `  • ${signal.signal}: ${signal.value}${unit}${reference}\n`;
                  }
                });
              }
            } else {
              // Use JSON.stringify for other structured fields
              documentContext += `- ${field.charAt(0).toUpperCase() + field.slice(1)}: ${JSON.stringify(doc[field])}\n`;
            }
          }
        });

        // Include additional content if enabled
        if (this.config.documentContext.includeAdditionalContent) {
          const excludeFields = [
            "title",
            ...this.config.documentContext.includeFields,
          ];
          const otherContent = Object.keys(doc)
            .filter((key) => !excludeFields.includes(key))
            .reduce((obj, key) => {
              obj[key] = doc[key];
              return obj;
            }, {} as any);

          if (Object.keys(otherContent).length > 0) {
            documentContext += `- Additional Information: ${JSON.stringify(otherContent)}\n`;
          }
        }
      }
    });

    return documentContext;
  }
}

export const chatConfigManager = new ChatConfigManager();
