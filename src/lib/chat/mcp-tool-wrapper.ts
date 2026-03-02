/**
 * Chat MCP Tool Wrapper
 *
 * Wraps MCP tool calls with user confirmation prompts for the chat interface.
 * This allows the chat to request user permission before accessing medical data.
 */

import type { ContextPrompt, ToolCallResult } from "./types.d";
import { generateId } from "$lib/utils/id";
import { logger } from "$lib/logging/logger";
import { getDocument } from "$lib/documents";
import { ClientToolExecutor } from "./client-tool-executor";

const log = logger.namespace("ChatMCPToolWrapper");

interface PendingToolCall {
  toolName: string;
  parameters: any;
  profileId: string;
  timestamp: Date;
}

export class ChatMCPToolWrapper {
  private pendingToolCalls = new Map<string, PendingToolCall>();
  private toolExecutors = new Map<string, ClientToolExecutor>();
  private approvedDocuments = new Map<string, Set<string>>(); // profileId -> Set<documentId>

  /**
   * Create a tool confirmation prompt for the chat UI
   */
  async createToolPrompt(
    toolName: string,
    parameters: any,
    profileId: string,
    onAccept: (result: ToolCallResult) => void,
    onDecline: () => void,
  ): Promise<ContextPrompt | null> {
    const toolId = generateId();

    // Ensure we have a tool executor for this profile
    if (!this.toolExecutors.has(profileId)) {
      this.toolExecutors.set(profileId, new ClientToolExecutor({ profileId }));
    }

    // Check if this is a low-risk tool that doesn't need confirmation
    const securityLevel = this.getToolSecurityLevel(toolName);

    if (securityLevel === "low") {
      // Execute immediately for low-risk tools
      log.info("Executing low-risk tool without confirmation", {
        toolName,
        profileId,
        securityLevel,
      });

      try {
        const executor = this.toolExecutors.get(profileId)!;
        const result = await executor.executeTool(toolName, parameters);
        onAccept(result);
      } catch (error) {
        log.error("Low-risk tool execution failed", {
          toolName,
          profileId,
          error,
        });
        onAccept({
          toolName,
          success: false,
          error:
            error instanceof Error ? error.message : "Tool execution failed",
          timestamp: new Date(),
        });
      }

      return null; // No prompt needed for low-risk tools
    }

    // Special handling for getDocumentById - check if already approved
    if (toolName === "getDocumentById" && parameters?.documentId) {
      const approvedDocs = this.approvedDocuments.get(profileId);
      if (approvedDocs?.has(parameters.documentId)) {
        log.info(
          "Document already approved in this session, executing without prompt",
          {
            toolName,
            profileId,
            documentId: parameters.documentId,
          },
        );

        try {
          const executor = this.toolExecutors.get(profileId)!;
          const result = await executor.executeTool(toolName, parameters);
          onAccept(result);
        } catch (error) {
          log.error("Pre-approved document access failed", {
            toolName,
            profileId,
            error,
          });
          onAccept({
            toolName,
            success: false,
            error:
              error instanceof Error ? error.message : "Tool execution failed",
            timestamp: new Date(),
          });
        }

        return null; // No prompt needed for already approved documents
      }
    }

    // For medium and high risk tools, store pending call info
    this.pendingToolCalls.set(toolId, {
      toolName,
      parameters,
      profileId,
      timestamp: new Date(),
    });

    // Clean up old pending calls (older than 5 minutes)
    this.cleanupOldPendingCalls();

    const messageParams = await this.getToolMessageParams(toolName, parameters);

    return {
      type: "tool",
      id: toolId,
      title: this.getToolTitle(toolName),
      messageKey: `app.chat.tool.${toolName}.prompt`,
      messageParams,
      acceptLabelKey: "app.chat.tool.approve",
      declineLabelKey: "app.chat.tool.deny",
      data: { toolName, parameters },
      timestamp: new Date(),
      toolName,
      toolParameters: parameters,
      securityLevel: this.getToolSecurityLevel(toolName),
      dataAccessDescription: this.getDataAccessDescription(
        toolName,
        parameters,
      ),
      onAccept: async () => {
        try {
          const result = await this.executeTool(toolId);
          onAccept(result);
        } catch (error) {
          log.error("Tool execution failed", { toolId, toolName, error });
          onAccept({
            toolName,
            success: false,
            error:
              error instanceof Error ? error.message : "Tool execution failed",
            timestamp: new Date(),
          });
        }
      },
      onDecline: () => {
        this.pendingToolCalls.delete(toolId);
        log.info("Tool call declined by user", { toolId, toolName });
        onDecline();
      },
    };
  }

  /**
   * Execute an approved tool call
   */
  private async executeTool(toolId: string): Promise<ToolCallResult> {
    const pending = this.pendingToolCalls.get(toolId);
    if (!pending) {
      throw new Error("Tool call not found or expired");
    }

    const { toolName, parameters, profileId } = pending;

    try {
      log.info("Executing approved tool", { toolId, toolName, profileId });

      // Get tool executor for this profile
      const executor = this.toolExecutors.get(profileId);
      if (!executor) {
        throw new Error(`Tool executor not found for profile ${profileId}`);
      }

      // Execute through client-side tool executor
      const result = await executor.executeTool(toolName, parameters);

      // Track approved document for future requests in this session
      if (
        toolName === "getDocumentById" &&
        parameters?.documentId &&
        result.success
      ) {
        if (!this.approvedDocuments.has(profileId)) {
          this.approvedDocuments.set(profileId, new Set());
        }
        this.approvedDocuments.get(profileId)!.add(parameters.documentId);

        log.info("Document approved and tracked for session", {
          profileId,
          documentId: parameters.documentId,
          totalApproved: this.approvedDocuments.get(profileId)!.size,
        });
      }

      // Clean up
      this.pendingToolCalls.delete(toolId);

      return result;
    } catch (error) {
      // Clean up even on error
      this.pendingToolCalls.delete(toolId);
      throw error;
    }
  }

  /**
   * Get human-readable tool title
   */
  private getToolTitle(toolName: string): string {
    const titles: Record<string, string> = {
      searchDocuments: "Search Medical Documents",
      getAssembledContext: "Gather Medical Context",
      getProfileData: "Access Health Profile",
      queryMedicalHistory: "Query Medical History",
      getDocumentById: "Access Specific Document",
    };
    return titles[toolName] || toolName;
  }

  /**
   * Get tool-specific message parameters for translation
   */
  private async getToolMessageParams(
    toolName: string,
    parameters: any,
  ): Promise<any> {
    // Handle case where parameters is undefined or null
    const safeParams = parameters || {};

    switch (toolName) {
      case "searchDocuments":
        const terms = safeParams.terms || [];
        return {
          terms:
            Array.isArray(terms) && terms.length > 0
              ? terms
              : ["medical information"],
          termCount: Array.isArray(terms) ? terms.length : 0,
        };

      case "queryMedicalHistory":
        return { category: safeParams.category || "medical history" };

      case "getAssembledContext":
        return { query: safeParams.query || "your health information" };

      case "getDocumentById":
        return await this.resolveDocumentParams(safeParams);

      case "getProfileData":
      default:
        return {};
    }
  }

  /**
   * Get security level for tool
   */
  private getToolSecurityLevel(toolName: string): "low" | "medium" | "high" {
    const levels: Record<string, "low" | "medium" | "high"> = {
      searchDocuments: "low", // Only searches metadata/summaries
      getProfileData: "low", // Basic profile info
      queryMedicalHistory: "low", // Query/search operation
      getAssembledContext: "low", // Context assembly from existing data
      getDocumentById: "high", // Full document content access
    };
    return levels[toolName] || "medium";
  }

  /**
   * Get data access description for tool
   */
  private getDataAccessDescription(
    toolName: string,
    parameters: any,
  ): string[] {
    switch (toolName) {
      case "searchDocuments":
        const searchTerms = parameters.terms || [];
        const termsDisplay =
          Array.isArray(searchTerms) && searchTerms.length > 0
            ? searchTerms.map((term: string) => `"${term}"`).join(", ")
            : "not specified";
        return [
          "Search through your medical documents",
          "Access document titles and snippets",
          `Search terms: ${termsDisplay}`,
          `Individual terms will be matched against document metadata`,
        ];

      case "getAssembledContext":
        return [
          "Gather comprehensive medical context",
          "Access multiple documents and health records",
          "Compile relevant medical information",
        ];

      case "getProfileData":
        return [
          "Access basic health profile",
          "View demographic information",
          "Read general health metrics",
        ];

      case "queryMedicalHistory":
        const category = parameters.category || "all";
        return [
          `Access ${category} history`,
          "View historical medical records",
          "Read treatment and diagnosis information",
        ];

      case "getDocumentById":
        return [
          "Access a specific medical document",
          "View full document content",
          `Document ID: ${parameters.documentId || "not specified"}`,
        ];

      default:
        return ["Access medical data"];
    }
  }

  /**
   * Clean up old pending calls to prevent memory leaks
   */
  private cleanupOldPendingCalls(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const [toolId, pending] of this.pendingToolCalls.entries()) {
      if (pending.timestamp < fiveMinutesAgo) {
        this.pendingToolCalls.delete(toolId);
        log.info("Cleaned up expired tool call", {
          toolId,
          toolName: pending.toolName,
        });
      }
    }
  }

  /**
   * Execute a tool directly without approval flow (for pre-fetching in AskButton flow)
   */
  async executeToolDirectly(
    toolName: string,
    parameters: any,
    profileId: string,
  ): Promise<ToolCallResult> {
    if (!this.toolExecutors.has(profileId)) {
      this.toolExecutors.set(profileId, new ClientToolExecutor({ profileId }));
    }
    const executor = this.toolExecutors.get(profileId)!;
    return executor.executeTool(toolName, parameters);
  }

  /**
   * Get number of pending tool calls
   */
  getPendingCount(): number {
    return this.pendingToolCalls.size;
  }

  /**
   * Clear all pending tool calls
   */
  clearPending(): void {
    this.pendingToolCalls.clear();
  }

  /**
   * Clear approved documents for a specific profile or all profiles
   */
  clearApprovedDocuments(profileId?: string): void {
    if (profileId) {
      this.approvedDocuments.delete(profileId);
      log.info("Cleared approved documents for profile", { profileId });
    } else {
      this.approvedDocuments.clear();
      log.info("Cleared all approved documents");
    }
  }

  /**
   * Get count of approved documents for a profile
   */
  getApprovedDocumentCount(profileId: string): number {
    return this.approvedDocuments.get(profileId)?.size || 0;
  }

  /**
   * Resolve document ID to user-friendly title for display
   */
  private async resolveDocumentParams(parameters: any): Promise<any> {
    const documentId = parameters.documentId;
    if (!documentId) {
      return { documentTitle: "requested document" };
    }

    try {
      // Attempt to get document metadata to resolve title
      const document = await getDocument(documentId);
      const title =
        document?.metadata?.title ||
        document?.content?.title ||
        `Document ${documentId.slice(0, 8)}...`;

      log.debug("Resolved document title for prompt", { documentId, title });

      return {
        documentId,
        documentTitle: title,
      };
    } catch (error) {
      log.warn("Failed to resolve document title, using fallback", {
        documentId,
        error,
      });
      return {
        documentId,
        documentTitle: `Document ${documentId.slice(0, 8)}...`,
      };
    }
  }
}

// Export singleton instance
export const chatMCPToolWrapper = new ChatMCPToolWrapper();
