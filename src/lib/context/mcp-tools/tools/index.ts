/**
 * Medical Expert Tools Registry
 *
 * Central registry for all medical expert MCP tools
 */

import { SearchDocumentsTool } from "./search-documents";
import { GetAssembledContextTool } from "./get-assembled-context";
import { GetProfileDataTool } from "./get-profile-data";
import { QueryMedicalHistoryTool } from "./query-medical-history";
import { GetDocumentByIdTool } from "./get-document-by-id";
import { GetPatientTimelineTool } from "./get-patient-timeline";
import { CreateCarePlanTaskTool } from "./create-care-plan-task";
import { CARE_PLAN } from "$lib/config/feature-flags";
import type { BaseMedicalTool, MCPTool } from "../base/base-tool";
import type { MCPSecurityContext } from "../security-audit";

// Registry of all available tools
const toolRegistry = new Map<string, BaseMedicalTool>();

// Register tools (read-only)
toolRegistry.set("searchDocuments", new SearchDocumentsTool());
toolRegistry.set("getAssembledContext", new GetAssembledContextTool());
toolRegistry.set("getProfileData", new GetProfileDataTool());
toolRegistry.set("queryMedicalHistory", new QueryMedicalHistoryTool());
toolRegistry.set("getDocumentById", new GetDocumentByIdTool());
toolRegistry.set("getPatientTimeline", new GetPatientTimelineTool());
// Mutating tool — appends a Care Plan task (build row 7j). Gated: only
// registered when the Care Plan feature is enabled.
if (CARE_PLAN) {
  toolRegistry.set("createCarePlanTask", new CreateCarePlanTaskTool());
}

/**
 * Get all tool definitions for MCP
 */
export function getToolDefinitions(): MCPTool[] {
  return Array.from(toolRegistry.values()).map((tool) =>
    tool.getToolDefinition(),
  );
}

/**
 * Execute a tool by name
 */
/** Tools that mutate user data — audited as "write" operations. */
const MUTATING_TOOLS = new Set<string>(["createCarePlanTask"]);

export async function executeTool(
  toolName: string,
  params: any,
  context: MCPSecurityContext,
): Promise<any> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const operation = MUTATING_TOOLS.has(toolName) ? "write" : "execute";

  return await (tool as any).secureToolCall(
    toolName,
    operation,
    context,
    params,
    () => tool.execute(params, context.profileId),
  );
}

/**
 * Get tool by name
 */
export function getTool(toolName: string): BaseMedicalTool | undefined {
  return toolRegistry.get(toolName);
}

/**
 * List all available tool names
 */
export function getAvailableTools(): string[] {
  return Array.from(toolRegistry.keys());
}

// Export individual tools for direct access if needed
export {
  SearchDocumentsTool,
  GetAssembledContextTool,
  GetProfileDataTool,
  QueryMedicalHistoryTool,
  GetDocumentByIdTool,
  GetPatientTimelineTool,
};
