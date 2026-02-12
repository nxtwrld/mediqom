/**
 * Medical Expert MCP Tools - Orchestrator
 *
 * Provides AI with tools to access patient medical context, documents,
 * and health data following the Model Context Protocol (MCP) specification.
 *
 * This file acts as a thin orchestrator that delegates to individual tool classes.
 *
 * MCP Specification: 2024-11-05
 * https://modelcontextprotocol.io/specification
 */

import { getToolDefinitions, executeTool, getAvailableTools } from "./tools";
import type { MCPSecurityContext } from "./security-audit";
import { mcpSecurityService } from "./security-audit";
import { logger } from "$lib/logging/logger";

// Re-export types for backward compatibility
export type { MCPTool, MCPToolResult, MCPToolHandler } from "./base/base-tool";

/**
 * Main MedicalExpertTools class - now acts as orchestrator
 */
export class MedicalExpertTools {
  /**
   * Get all tool definitions for MCP
   */
  static getToolDefinitions() {
    return getToolDefinitions();
  }

  /**
   * Get list of available tool names
   */
  static getAvailableTools(): string[] {
    return getAvailableTools();
  }

  /**
   * Execute a tool with security context
   */
  static async executeToolSecurely(
    toolName: string,
    params: any,
    context: MCPSecurityContext,
  ) {
    try {
      const result = await executeTool(toolName, params, context);

      logger.namespace("MCPTools")?.info("Tool executed successfully", {
        toolName,
        profileId: context.profileId,
        success: true,
      });

      return result;
    } catch (error) {
      logger.namespace("MCPTools")?.error("Tool execution failed", {
        toolName,
        error: error instanceof Error ? error.message : "Unknown error",
        profileId: context.profileId,
      });
      throw error;
    }
  }

  // Individual tool methods for backward compatibility
  async searchDocuments(params: any, profileId: string) {
    const context: MCPSecurityContext = {
      profileId,
      user: profileId as any,
    };
    return executeTool("searchDocuments", params, context);
  }

  async getAssembledContext(params: any, profileId: string) {
    const context: MCPSecurityContext = {
      profileId,
      user: profileId as any,
    };
    return executeTool("getAssembledContext", params, context);
  }

  async getProfileData(params: any, profileId: string) {
    const context: MCPSecurityContext = {
      profileId,
      user: profileId as any,
    };
    return executeTool("getProfileData", params, context);
  }

  async queryMedicalHistory(params: any, profileId: string) {
    const context: MCPSecurityContext = {
      profileId,
      user: profileId as any,
    };
    return executeTool("queryMedicalHistory", params, context);
  }

  async getDocumentById(params: any, profileId?: string) {
    const context: MCPSecurityContext = {
      profileId: profileId || "",
      user: (profileId || "") as any,
    };
    return executeTool("getDocumentById", params, context);
  }

  async getPatientTimeline(params: any, profileId?: string) {
    const context: MCPSecurityContext = {
      profileId: profileId || "",
      user: (profileId || "") as any,
    };
    return executeTool("getPatientTimeline", params, context);
  }
}

// Create singleton instance
const medicalExpertTools = new MedicalExpertTools();

/**
 * Tool handler registry for MCP integration
 */
export const toolHandlers = {
  searchDocuments: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "searchDocuments",
      params,
      context,
    );
  },

  getAssembledContext: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "getAssembledContext",
      params,
      context,
    );
  },

  getProfileData: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "getProfileData",
      params,
      context,
    );
  },

  queryMedicalHistory: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "queryMedicalHistory",
      params,
      context,
    );
  },

  getDocumentById: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "getDocumentById",
      params,
      context,
    );
  },

  getPatientTimeline: async (context: MCPSecurityContext, params: any) => {
    return await MedicalExpertTools.executeToolSecurely(
      "getPatientTimeline",
      params,
      context,
    );
  },
};

// Export singleton instance
export { medicalExpertTools };

// Export for backward compatibility
export default MedicalExpertTools;
