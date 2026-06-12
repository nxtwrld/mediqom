/**
 * Create Care Plan Task — the first MUTATING MCP tool (Care Plan build row 7j).
 *
 * Proposed by the AI during a chat thread and run only after explicit user
 * acceptance (the ContextPrompt consent flow). Appends a FollowUpTask to a Care
 * Plan item with chat-message provenance (`sourceMessageId`). Profile ownership
 * is enforced by the security layer (mutating: true → direct ownership only).
 */
import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import { logger } from "$lib/logging/logger";
import { addUserTask } from "$lib/careplan/store";
import type { FollowUpTask } from "$lib/careplan/types";

export class CreateCarePlanTaskTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "createCarePlanTask",
      description:
        "Add a follow-up task to a Care Plan item. Use ONLY when the user explicitly asks to add a reminder/task, or accepts a suggested action. Requires the id of an existing Care Plan item.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "Care Plan item id this task belongs to" },
          text: { type: "string", description: "What the user should do" },
          category: {
            type: "string",
            enum: [
              "follow_up",
              "referral",
              "diagnostic_test",
              "monitoring",
              "lifestyle",
              "medication",
              "treatment",
              "prevention",
              "education",
            ],
            description: "Task category",
          },
          priority: {
            type: "string",
            enum: ["immediate", "urgent", "routine", "as_needed"],
            description: "Task priority",
          },
          timeframeNormalized: {
            type: "object",
            description: "Optional due-date offset from today",
            properties: {
              unit: { type: "string", enum: ["days", "weeks", "months", "years"] },
              value: { type: "number" },
            },
          },
          sourceMessageId: {
            type: "string",
            description: "Id of the chat message that produced this task (provenance)",
          },
        },
        required: ["itemId", "text", "category", "priority"],
      },
    };
  }

  async execute(params: any, profileId: string): Promise<MCPToolResult> {
    try {
      const { itemId, text, category, priority, timeframeNormalized, sourceMessageId } = params ?? {};
      if (!itemId || !text || !category || !priority) {
        return {
          content: [{ type: "text", text: "Error: itemId, text, category and priority are required." }],
          isError: true,
        };
      }

      const task: FollowUpTask | null = await addUserTask(
        profileId,
        itemId,
        { text, category, priority, timeframeNormalized },
        { sourceMessageId },
      );

      if (!task) {
        return {
          content: [{ type: "text", text: `Error: Care Plan item ${itemId} not found.` }],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text", text: `Added task "${task.text}" to your Care Plan.` },
          { type: "resource", resource: { id: task.id, itemId, status: task.status } },
        ],
      };
    } catch (error) {
      logger.namespace("Context")?.error("createCarePlanTask failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: could not add task: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
}
