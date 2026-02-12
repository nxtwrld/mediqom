/**
 * Get Patient Timeline Tool
 *
 * Generates chronological timeline of medical events from patient documents
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import type { TimelineEvent } from "../base/types";
import { logger } from "$lib/logging/logger";
import user from "$lib/user";
import { byUser } from "$lib/documents";
import { get } from "svelte/store";
import type { Document } from "$lib/documents/types.d";

export class GetPatientTimelineTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "getPatientTimeline",
      description:
        "Generate chronological timeline of medical events from patient documents. Useful for understanding disease progression, treatment history, and key medical milestones.",
      inputSchema: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            format: "date",
            description: "Start date for timeline (ISO format, optional)",
          },
          endDate: {
            type: "string",
            format: "date",
            description: "End date for timeline (ISO format, optional)",
          },
          eventTypes: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by event types (e.g., ['diagnosis', 'treatment', 'lab-result'])",
          },
          includeDetails: {
            type: "boolean",
            description: "Include detailed event descriptions (default: true)",
          },
        },
        required: [],
      },
    };
  }

  async execute(params: any, profileId?: string): Promise<MCPToolResult> {
    try {
      const currentUserId = user.getId();
      const targetProfileId = profileId || currentUserId;

      if (!targetProfileId) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No user profile available",
            },
          ],
          isError: true,
        };
      }

      // Get documents from memory for timeline analysis
      const documentsStore = await byUser(targetProfileId);
      const documents = get(documentsStore);

      // Build timeline events from documents
      const timelineEvents: TimelineEvent[] = [];

      for (const doc of documents) {
        if (!doc.content) continue;

        // Extract date from document
        const eventDate = this.extractDocumentDate(doc);
        if (!eventDate) continue;

        // Filter by date range if specified
        if (params.startDate && eventDate < new Date(params.startDate)) {
          continue;
        }
        if (params.endDate && eventDate > new Date(params.endDate)) {
          continue;
        }

        // Extract events from document content
        const extractedEvents = this.extractTimelineEvents(
          doc as Document,
          params.eventTypes,
        );
        timelineEvents.push(...extractedEvents);
      }

      // Sort events chronologically
      timelineEvents.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // Format timeline for output
      const timelineText = this.formatTimeline(
        timelineEvents,
        params.includeDetails !== false,
      );

      const timelineData = {
        timeline: timelineEvents,
        totalEvents: timelineEvents.length,
        dateRange: {
          start: timelineEvents[0]?.date,
          end: timelineEvents[timelineEvents.length - 1]?.date,
        },
        filters: {
          startDate: params.startDate,
          endDate: params.endDate,
          eventTypes: params.eventTypes,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: timelineText,
          },
          {
            type: "resource",
            resource: timelineData,
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to get patient timeline", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving patient timeline: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Extract timeline events from a document
   */
  private extractTimelineEvents(
    doc: Document,
    eventTypes?: string[],
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const docDate = this.extractDocumentDate(doc);

    if (!docDate) return events;

    const dateStr = docDate.toISOString().split("T")[0];
    const docType = doc.metadata?.category || doc.type || "medical-record";

    // Check if this document type should be included
    if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(docType)) {
      return events;
    }

    // Extract basic event from document
    const event: TimelineEvent = {
      date: dateStr,
      type: docType,
      title: doc.metadata?.title || `${docType} document`,
      description: this.extractEventDescription(doc),
      documentId: doc.id,
      confidence: 0.8,
    };

    events.push(event);

    // Extract specific events from content if it's structured
    if (typeof doc.content === "object" && doc.content !== null) {
      const additionalEvents = this.extractStructuredEvents(
        doc.content,
        dateStr,
        doc.id,
      );
      events.push(...additionalEvents);
    }

    return events;
  }

  /**
   * Extract event description from document
   */
  private extractEventDescription(doc: Document): string {
    const content = doc.content;

    if (typeof content === "object" && content !== null) {
      // Try common medical document fields
      const fields = [
        "summary",
        "findings",
        "diagnosis",
        "description",
        "notes",
      ];

      for (const field of fields) {
        if (doc.content[field] && typeof doc.content[field] === "string") {
          const text = doc.content[field];
          return text.substring(0, 200) + (text.length > 200 ? "..." : "");
        }
      }

      // Fallback to JSON representation
      const jsonStr = JSON.stringify(doc.content);
      return jsonStr.substring(0, 200) + (jsonStr.length > 200 ? "..." : "");
    }

    return doc.metadata?.summary || "Medical document";
  }

  /**
   * Extract structured events from document content
   */
  private extractStructuredEvents(
    content: any,
    dateStr: string,
    documentId: string,
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Extract diagnoses
    if (content.diagnoses && Array.isArray(content.diagnoses)) {
      content.diagnoses.forEach((diagnosis: any, index: number) => {
        events.push({
          date: dateStr,
          type: "diagnosis",
          title: `Diagnosis: ${diagnosis.name || diagnosis}`,
          description:
            typeof diagnosis === "object"
              ? diagnosis.description || `Diagnosed with ${diagnosis.name}`
              : `Diagnosed with ${diagnosis}`,
          documentId,
          confidence: 0.9,
        });
      });
    }

    // Extract procedures
    if (content.procedures && Array.isArray(content.procedures)) {
      content.procedures.forEach((procedure: any, index: number) => {
        events.push({
          date: dateStr,
          type: "procedure",
          title: `Procedure: ${procedure.name || procedure}`,
          description:
            typeof procedure === "object"
              ? procedure.description || `Performed ${procedure.name}`
              : `Performed ${procedure}`,
          documentId,
          confidence: 0.9,
        });
      });
    }

    // Extract medications
    if (content.medications && Array.isArray(content.medications)) {
      content.medications.forEach((medication: any, index: number) => {
        events.push({
          date: dateStr,
          type: "medication",
          title: `Medication: ${medication.name || medication}`,
          description:
            typeof medication === "object"
              ? `${medication.name} - ${medication.dosage || "prescribed"}`
              : `Prescribed ${medication}`,
          documentId,
          confidence: 0.8,
        });
      });
    }

    return events;
  }

  /**
   * Format timeline events for readable output
   */
  private formatTimeline(
    events: TimelineEvent[],
    includeDetails: boolean,
  ): string {
    if (events.length === 0) {
      return "No timeline events found for the specified criteria.";
    }

    let timelineText = `**Patient Medical Timeline**\n\n`;
    timelineText += `Found ${events.length} events:\n\n`;

    // Group events by date
    const eventsByDate = new Map<string, TimelineEvent[]>();
    events.forEach((event) => {
      const date = event.date;
      if (!eventsByDate.has(date)) {
        eventsByDate.set(date, []);
      }
      eventsByDate.get(date)!.push(event);
    });

    // Sort dates and format
    const sortedDates = Array.from(eventsByDate.keys()).sort();

    sortedDates.forEach((date) => {
      const dateEvents = eventsByDate.get(date)!;
      timelineText += `**${this.formatDate(date)}**\n`;

      dateEvents.forEach((event) => {
        timelineText += `  • ${event.title}`;
        if (includeDetails && event.description) {
          timelineText += `\n    ${event.description}`;
        }
        timelineText += "\n";
      });

      timelineText += "\n";
    });

    return timelineText;
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
