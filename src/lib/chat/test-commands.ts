/**
 * Chat Test Command Handler
 *
 * Provides `test:*` commands in the chat sidebar that bypass AI and directly
 * exercise the chat system's tool execution, widget rendering, and context features.
 */

import { ClientToolExecutor } from "./client-tool-executor";
import type { WidgetSpec } from "./widgets/types";
import type { ChatContext } from "./types";
import { generateId } from "$lib/utils/id";
import { byUser } from "$lib/documents";
import { get } from "svelte/store";

export interface TestCommandResult {
  content: string;
  widgets?: WidgetSpec[];
  toolsUsed?: string[];
  /** If set, chat-manager should trigger the real tool approval flow */
  pendingToolCall?: {
    toolName: string;
    parameters: any;
  };
  /** If set, chat-manager re-sends this message through the real AI pipeline */
  redirectMessage?: string;
}

type CommandHandler = (args: string) => Promise<TestCommandResult>;

export class TestCommandHandler {
  private profileId: string;
  private chatContext?: ChatContext;
  private executor: ClientToolExecutor;
  private commands: Map<string, CommandHandler>;

  constructor(profileId: string, chatContext?: ChatContext) {
    this.profileId = profileId;
    this.chatContext = chatContext;
    this.executor = new ClientToolExecutor({ profileId });
    this.commands = new Map<string, CommandHandler>([
      ["list", () => this.handleList()],
      ["health", () => this.handleHealth()],
      ["document", () => this.handleDocument()],
      ["signal", () => this.handleSignal()],
      ["diagnosis", () => this.handleDiagnosis()],
      ["symptoms", () => this.handleSymptoms()],
      ["treatment", () => this.handleTreatment()],
      ["anatomy", () => this.handleAnatomy()],
      ["progress", () => this.handleProgress()],
      ["context", () => this.handleContext()],
      ["timeline", () => this.handleTimeline()],
      ["search", (args) => this.handleSearch(args)],
      ["approve", (args) => this.handleApprove(args)],
      ["docs", () => this.handleDocs()],
      ["all", () => this.handleAll()],
      ["agent", (args) => this.handleAgent(args)],
    ]);
  }

  async execute(input: string): Promise<TestCommandResult> {
    const parts = input.replace(/^test:/, "").trim().split(/\s+/);
    const commandName = parts[0]?.toLowerCase() ?? "";
    const args = parts.slice(1).join(" ");

    const handler = this.commands.get(commandName);
    if (!handler) {
      return {
        content: `Unknown test command: \`${commandName}\`. Type \`test:list\` for available commands.`,
      };
    }

    return handler(args);
  }

  private async handleList(): Promise<TestCommandResult> {
    const lines = [
      "**Available test commands:**",
      "",
      "| Command | Description |",
      "|---------|-------------|",
      "| `test:list` | This list |",
      "| `test:health` | Profile data via getProfileData |",
      "| `test:document` | Document search via searchDocuments |",
      "| `test:signal` | Signal trend chart |",
      "| `test:diagnosis` | Diagnosis card widget |",
      "| `test:symptoms` | Symptom summary widget |",
      "| `test:treatment` | Treatment plan widget |",
      "| `test:anatomy` | Anatomy highlight + 3D focus |",
      "| `test:progress` | Progress indicator |",
      "| `test:context` | Client-side context overview |",
      "| `test:timeline` | Patient timeline |",
      "| `test:search [term]` | Parameterized document search |",
      "| `test:approve [term]` | Search → approval → document context → AI |",
      "| `test:docs` | Raw document metadata dump |",
      "| `test:all` | Gallery of all widget types |",
      "| `test:agent [type]` | Send a real prompt through the AI pipeline to test sub-agent routing (default: lab_results) |",
    ];

    return { content: lines.join("\n") };
  }

  private async handleHealth(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("getProfileData", {});
    const toolsUsed = ["getProfileData"];

    if (!result.success || !result.data) {
      return {
        content: "**Profile Data** (sample - no real data found)",
        toolsUsed,
        widgets: [this.makeSampleHealthTable()],
      };
    }

    // Extract profile info from MCP result
    const data = this.extractMCPText(result.data);
    const rows: any[][] = [];

    if (typeof data === "object" && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (value != null && typeof value !== "object") {
          rows.push([key, String(value)]);
        }
      }
    }

    if (rows.length === 0) {
      // Try parsing text content
      const text =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return {
        content: `**Profile Data**\n\n\`\`\`\n${text.slice(0, 500)}\n\`\`\``,
        toolsUsed,
        widgets: [this.makeSampleHealthTable()],
      };
    }

    return {
      content: "**Profile Data**",
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "data_table",
          title: "Health Profile",
          data: {
            headers: ["Property", "Value"],
            rows,
            caption: "Profile health data",
          },
        },
      ],
    };
  }

  private async handleDocument(): Promise<TestCommandResult> {
    return this.handleSearch("health");
  }

  private async handleSearch(term: string): Promise<TestCommandResult> {
    const searchTerm = term.trim() || "health";
    const result = await this.executor.executeTool("searchDocuments", {
      terms: [searchTerm],
      limit: 5,
    });
    const toolsUsed = ["searchDocuments"];

    if (!result.success || !result.data) {
      return {
        content: `**Document Search: "${searchTerm}"** (sample - no results found)`,
        toolsUsed,
        widgets: [this.makeSampleDocumentTable()],
      };
    }

    const docs = this.extractDocuments(result.data);

    if (docs.length === 0) {
      return {
        content: `**Document Search: "${searchTerm}"** (sample - no results found)`,
        toolsUsed,
        widgets: [this.makeSampleDocumentTable()],
      };
    }

    return {
      content: `**Document Search: "${searchTerm}"** - ${docs.length} result(s)`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "data_table",
          title: "Search Results",
          interactive: true,
          data: {
            headers: ["Title", "Type", "Date"],
            rows: docs.map((d) => [
              d.title || "Untitled",
              d.type || "-",
              d.date || "-",
            ]),
            caption: `Search: "${searchTerm}"`,
          },
        },
      ],
    };
  }

  private async handleSignal(): Promise<TestCommandResult> {
    // Try to find signal data from documents
    const result = await this.executor.executeTool("searchDocuments", {
      terms: ["lab", "blood", "test"],
      limit: 10,
      includeContent: true,
    });
    const toolsUsed = ["searchDocuments"];

    const signals = this.extractSignals(result.data);

    if (signals.series.length < 2) {
      // Use sample data
      return {
        content: "**Lab Trend Chart** (sample data - not enough real data points)",
        toolsUsed,
        widgets: [this.makeSampleLabTrend()],
      };
    }

    return {
      content: `**Lab Trend Chart** - ${signals.code}`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "lab_trend_chart",
          title: signals.code,
          data: {
            code: signals.code,
            unit: signals.unit,
            status: signals.status,
            date: signals.date,
            series: signals.series,
            ranges: signals.ranges,
          },
        },
      ],
    };
  }

  private async handleDiagnosis(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("queryMedicalHistory", {
      queryType: "conditions",
    });
    const toolsUsed = ["queryMedicalHistory"];

    const condition = this.extractFirstCondition(result.data);

    const diagnosisData = condition ?? {
      name: "Type 2 Diabetes Mellitus",
      probability: 0.85,
      priority: 3,
      confidence: 0.85,
      reasoning: "Sample data - based on elevated HbA1c and fasting glucose levels.",
      icd10: "E11",
      redFlags: ["Polyuria", "Unexplained weight loss"],
      requiresInvestigation: true,
    };

    const isSample = !condition;

    return {
      content: `**Diagnosis Card**${isSample ? " (sample data)" : ""}`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "diagnosis_card",
          title: diagnosisData.name,
          data: diagnosisData,
        },
      ],
    };
  }

  private async handleSymptoms(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("queryMedicalHistory", {
      queryType: "conditions",
    });
    const toolsUsed = ["queryMedicalHistory"];

    const symptom = this.extractFirstSymptom(result.data);

    const symptomData = symptom ?? {
      text: "Persistent headache",
      severity: 6,
      confidence: 0.8,
      source: "transcript",
      duration: "2 weeks",
      characteristics: "Bilateral, throbbing, worse in the morning",
    };

    const isSample = !symptom;

    return {
      content: `**Symptom Summary**${isSample ? " (sample data)" : ""}`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "symptom_summary",
          title: symptomData.text,
          data: symptomData,
        },
      ],
    };
  }

  private async handleTreatment(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("queryMedicalHistory", {
      queryType: "medications",
    });
    const toolsUsed = ["queryMedicalHistory"];

    const treatment = this.extractFirstTreatment(result.data);

    const treatmentData = treatment ?? {
      type: "medication",
      name: "Metformin",
      priority: 2,
      confidence: 0.9,
      dosage: "500mg twice daily",
      description: "First-line treatment for type 2 diabetes",
      urgency: "routine",
      duration: "ongoing",
    };

    const isSample = !treatment;

    return {
      content: `**Treatment Plan**${isSample ? " (sample data)" : ""}`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "treatment_plan",
          title: treatmentData.name,
          data: treatmentData,
        },
      ],
    };
  }

  private async handleAnatomy(): Promise<TestCommandResult> {
    return {
      content: "**Anatomy Highlight** - Click a body part to focus the 3D model.",
      widgets: [
        {
          id: generateId(),
          type: "anatomy_highlight",
          title: "Affected Areas",
          interactive: true,
          data: {
            bodyParts: [
              "heart",
              "lungs",
              "liver",
              "kidneys",
              "brain",
              "stomach",
            ],
            description:
              "Areas of interest based on current health profile. Click to focus the 3D model.",
          },
        },
      ],
    };
  }

  private async handleProgress(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("getProfileData", {});
    const toolsUsed = ["getProfileData"];

    // Try to compute a profile completeness score
    const data = this.extractMCPText(result.data);
    let value = 72; // default sample
    let label = "Profile Completeness";

    if (typeof data === "object" && data !== null) {
      const fields = Object.keys(data);
      const filled = fields.filter(
        (k) => data[k] != null && data[k] !== "" && data[k] !== "Unknown",
      );
      if (fields.length > 0) {
        value = Math.round((filled.length / fields.length) * 100);
      }
    }

    return {
      content: "**Progress Indicator**",
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "progress_indicator",
          title: label,
          data: { value, label, unit: "%" },
        },
      ],
    };
  }

  private async handleContext(): Promise<TestCommandResult> {
    const toolsUsed: string[] = [];

    // Extract client-side context
    const mode = this.chatContext?.mode ?? "patient";
    const language = this.chatContext?.language ?? "en";
    const pageContext = this.chatContext?.pageContext ?? null;
    const availableTools = this.chatContext?.availableTools ?? [];

    // Build output sections
    const sections: string[] = [];
    sections.push(`**AI Context Debug** — ${mode} mode, ${language}`);
    sections.push("");
    sections.push("---");

    // 1. Chat State
    sections.push("");
    sections.push("### Chat State");
    sections.push(`- **Mode:** ${mode}`);
    sections.push(`- **Language:** ${language}`);
    sections.push(`- **Profile:** \`${this.profileId}\``);
    sections.push(`- **Is Own Profile:** ${this.chatContext?.isOwnProfile ?? "unknown"}`);
    sections.push(`- **Thread ID:** \`${this.chatContext?.conversationThreadId ?? "none"}\``);
    sections.push(`- **Available Tools:** ${availableTools.length > 0 ? availableTools.join(", ") : "none listed"}`);

    // 2. Page Context
    sections.push("");
    sections.push("### Page Context");
    if (pageContext) {
      sections.push(`- **Route:** ${pageContext.route || "-"}`);
      sections.push(`- **Profile Name:** ${pageContext.profileName || "-"}`);

      const conditions = pageContext.availableData?.conditions || [];
      if (conditions.length > 0) sections.push(`- **Conditions:** ${conditions.join(", ")}`);
      const medications = pageContext.availableData?.medications || [];
      if (medications.length > 0) sections.push(`- **Medications:** ${medications.join(", ")}`);
      const vitals = pageContext.availableData?.vitals || [];
      if (vitals.length > 0) sections.push(`- **Vitals:** ${vitals.join(", ")}`);

      // Documents (catalog with metadata)
      const docCount = pageContext.availableData?.documents?.length ?? 0;
      if (pageContext.documentCatalog && pageContext.documentCatalog.length > 0) {
        sections.push("");
        sections.push(`**Documents** (${docCount} available):`);
        for (const entry of pageContext.documentCatalog.slice(0, 10)) {
          const terms = entry.medicalTerms?.length ? ` — ${entry.medicalTerms.slice(0, 5).join(", ")}` : "";
          sections.push(`- **${entry.title}** (${entry.category || "?"}, ${entry.date || "no date"}) \`${entry.id}\`${terms}`);
        }
        if (pageContext.documentCatalog.length > 10) {
          sections.push(`- ... and ${pageContext.documentCatalog.length - 10} more`);
        }
      } else {
        sections.push(`- **Documents:** ${docCount > 0 ? docCount + " (no catalog metadata)" : "none"}`);
      }

      // Document signals (documentsContent)
      if (pageContext.documentsContent) {
        const contentEntries = pageContext.documentsContent instanceof Map
          ? Array.from(pageContext.documentsContent.entries())
          : Object.entries(pageContext.documentsContent);

        sections.push("");
        sections.push(`**Document Signals** (${contentEntries.length} entries):`);
        for (const entry of contentEntries.slice(0, 5)) {
          const [docId, content] = Array.isArray(entry) ? entry : [entry, null];
          if (content) {
            const title = content.title || "Untitled";
            const signalCount = Array.isArray(content.signals) ? content.signals.length : 0;
            const hasContent = !!(content.content || content.localizedContent || content.text);
            sections.push(`- **${title}** (\`${String(docId).slice(0, 8)}...\`)`);
            if (signalCount > 0) {
              sections.push(`  - Signals: ${signalCount} values`);
              for (const sig of content.signals.slice(0, 3)) {
                const unit = sig.unit ? ` ${sig.unit}` : "";
                sections.push(`    - ${sig.signal}: ${sig.value}${unit}`);
              }
              if (content.signals.length > 3) sections.push(`    - ... and ${content.signals.length - 3} more`);
            }
            if (hasContent) sections.push(`  - Text content: included`);
            if (content.tags?.length) sections.push(`  - Tags: ${content.tags.join(", ")}`);
          }
        }
        if (contentEntries.length > 5) sections.push(`- ... and ${contentEntries.length - 5} more documents`);
      }
    } else {
      sections.push("*Page context not available*");
    }

    // 3. Assembled Context — only show what's currently loaded (no auto-fetch)
    sections.push("");
    sections.push("### Assembled Context");
    sections.push("*Not fetched — use `test:search <term>` or ask a question to trigger context assembly.*");

    // Build metrics widget
    const metricRows: any[][] = [];
    metricRows.push(["Mode", mode]);
    metricRows.push(["Language", language]);
    metricRows.push(["Profile ID", this.profileId]);
    metricRows.push(["Tools", availableTools.length.toString()]);

    if (pageContext) {
      metricRows.push(["Route", pageContext.route || "-"]);
      metricRows.push(["Page Documents", String(pageContext.availableData?.documents?.length ?? 0)]);
      const contentCount = pageContext.documentsContent
        ? pageContext.documentsContent instanceof Map
            ? pageContext.documentsContent.size
            : Object.keys(pageContext.documentsContent).length
        : 0;
      metricRows.push(["Document Signals", String(contentCount)]);
    }

    return {
      content: sections.join("\n"),
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "data_table",
          title: "Context Metrics",
          data: {
            headers: ["Metric", "Value"],
            rows: metricRows,
            caption: "Client-side context inputs for AI processing",
          },
        },
      ],
    };
  }

  private async handleTimeline(): Promise<TestCommandResult> {
    const result = await this.executor.executeTool("queryMedicalHistory", {
      queryType: "conditions",
    });
    const toolsUsed = ["queryMedicalHistory"];

    const entries = this.extractTimelineEntries(result.data);

    if (entries.length === 0) {
      return {
        content: "**Patient Timeline** (sample data)",
        toolsUsed,
        widgets: [
          {
            id: generateId(),
            type: "data_table",
            title: "Patient Timeline",
            data: {
              headers: ["Date", "Event", "Type"],
              rows: [
                ["2025-01-15", "Annual checkup", "Visit"],
                ["2025-03-01", "Blood panel", "Lab"],
                ["2025-06-10", "Follow-up visit", "Visit"],
              ],
              caption: "Sample timeline - no real data found",
            },
          },
        ],
      };
    }

    return {
      content: `**Patient Timeline** - ${entries.length} event(s)`,
      toolsUsed,
      widgets: [
        {
          id: generateId(),
          type: "data_table",
          title: "Patient Timeline",
          data: {
            headers: ["Date", "Event", "Type"],
            rows: entries,
            caption: "Medical history timeline",
          },
        },
      ],
    };
  }

  private async handleAll(): Promise<TestCommandResult> {
    const results = await Promise.all([
      this.handleHealth(),
      this.handleSignal(),
      this.handleDiagnosis(),
      this.handleSymptoms(),
      this.handleTreatment(),
      this.handleAnatomy(),
      this.handleProgress(),
    ]);

    const allWidgets: WidgetSpec[] = [];
    const allTools: string[] = [];

    for (const r of results) {
      if (r.widgets) allWidgets.push(...r.widgets);
      if (r.toolsUsed) allTools.push(...r.toolsUsed);
    }

    return {
      content:
        "**Widget Gallery** - All 7 widget types rendered below.\n\n" +
        "data_table, lab_trend_chart, diagnosis_card, symptom_summary, treatment_plan, anatomy_highlight, progress_indicator",
      toolsUsed: [...new Set(allTools)],
      widgets: allWidgets,
    };
  }

  private async handleApprove(args: string): Promise<TestCommandResult> {
    const searchTerm = args.trim() || "health";
    const result = await this.executor.executeTool("searchDocuments", {
      terms: [searchTerm],
      limit: 5,
      includeContent: true,
    });
    const toolsUsed = ["searchDocuments"];

    const docs = this.extractDocumentsWithIds(result.data);

    if (docs.length === 0) {
      return {
        content: `**Document Approval Test: "${searchTerm}"**\n\nNo documents found. Upload some documents first, or try a different search term.`,
        toolsUsed,
      };
    }

    const targetDoc = docs[0];
    return {
      content: `**Document Approval Test: "${searchTerm}"**\n\nFound ${docs.length} document(s). Requesting access to: **${targetDoc.title}**`,
      toolsUsed,
      pendingToolCall: {
        toolName: "getDocumentById",
        parameters: { documentId: targetDoc.id },
      },
    };
  }

  private extractDocumentsWithIds(
    data: any,
  ): { id: string; title: string; type: string }[] {
    if (!data) return [];

    // MCP results have content: [{ type: 'text', text }, { type: 'resource', resource }]
    if (data.content && Array.isArray(data.content)) {
      // First try the resource item (has structured data with IDs)
      const resourceItem = data.content.find((c: any) => c.type === "resource");
      if (resourceItem?.resource) {
        const resource = resourceItem.resource;
        const docs = resource.documents || resource.results || [];
        if (Array.isArray(docs)) {
          const mapped = docs
            .filter((d: any) => d.id || d.documentId)
            .map((d: any) => ({
              id: d.id || d.documentId,
              title: d.title || d.name || "Untitled",
              type: d.type || d.documentType || "-",
            }));
          if (mapped.length > 0) return mapped;
        }
      }

      // Fallback: try parsing text item as JSON
      const textItem = data.content.find((c: any) => c.type === "text");
      if (textItem?.text) {
        try {
          const parsed = JSON.parse(textItem.text);
          const items = Array.isArray(parsed)
            ? parsed
            : parsed.documents || parsed.results || [];
          if (Array.isArray(items)) {
            return items
              .filter((d: any) => d.id || d.documentId)
              .map((d: any) => ({
                id: d.id || d.documentId,
                title: d.title || d.name || "Untitled",
                type: d.type || d.documentType || "-",
              }));
          }
        } catch {
          /* not JSON, skip */
        }
      }
    }

    return [];
  }

  private async handleDocs(): Promise<TestCommandResult> {
    try {
      const documentsStore = byUser(this.profileId);
      const allDocuments = get(documentsStore);

      if (!allDocuments || allDocuments.length === 0) {
        return {
          content: `**Document Dump** — Profile: \`${this.profileId}\`\n\nNo documents found for this profile.`,
        };
      }

      const rows = allDocuments.map((doc: any) => [
        doc.id || "-",
        doc.content?.title || doc.metadata?.summary?.substring(0, 40) || "Untitled",
        doc.metadata?.documentType || doc.metadata?.category || "-",
        (doc.medicalTerms || []).slice(0, 5).join(", ") || "-",
        doc.created_at?.substring(0, 10) || "-",
      ]);

      return {
        content: `**Document Dump** — Profile: \`${this.profileId}\` — ${allDocuments.length} document(s)`,
        widgets: [
          {
            id: generateId(),
            type: "data_table",
            title: "All Documents (raw)",
            data: {
              headers: ["ID", "Title", "Type", "Medical Terms", "Created"],
              rows,
              caption: `Raw document metadata for profile ${this.profileId}`,
            },
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: `**Document Dump** — Error: ${msg}`,
      };
    }
  }

  // --- Data extraction helpers ---

  private extractMCPText(data: any): any {
    if (!data) return null;
    // MCP results have content: [{ type: 'text', text }]
    if (data.content && Array.isArray(data.content)) {
      const textItem = data.content.find((c: any) => c.type === "text");
      if (textItem?.text) {
        try {
          return JSON.parse(textItem.text);
        } catch {
          return textItem.text;
        }
      }
    }
    return data;
  }

  private extractDocuments(
    data: any,
  ): { title: string; type: string; date: string }[] {
    const parsed = this.extractMCPText(data);
    if (!parsed) return [];

    // Handle array of documents
    if (Array.isArray(parsed)) {
      return parsed.map((d: any) => ({
        title: d.title || d.name || "Untitled",
        type: d.type || d.documentType || "-",
        date: d.date || d.created_at || "-",
      }));
    }

    // Handle object with documents/results array
    const nested = parsed.documents || parsed.results;
    if (Array.isArray(nested)) {
      return this.extractDocuments({ content: [{ type: "text", text: JSON.stringify(nested) }] });
    }

    return [];
  }

  private extractSignals(data: any): {
    code: string;
    unit: string;
    status: string;
    date: string;
    series: any[];
    ranges: any[];
  } {
    const fallback = {
      code: "HbA1c",
      unit: "%",
      status: "high",
      date: new Date().toISOString().slice(0, 10),
      series: [
        { time: "2025-01-15", value: 6.1, unit: "%" },
        { time: "2025-04-20", value: 5.8, unit: "%" },
        { time: "2025-07-10", value: 5.5, unit: "%" },
      ],
      ranges: [{ name: "Normal", min: 4.0, max: 5.7 }],
    };

    const parsed = this.extractMCPText(data);
    if (!parsed) return fallback;

    // Try to find signal arrays in document content
    const docs = Array.isArray(parsed) ? parsed : parsed.documents || parsed.results || [];
    if (!Array.isArray(docs)) return fallback;

    for (const doc of docs) {
      const signals = doc.signals || doc.content?.signals;
      if (Array.isArray(signals) && signals.length >= 2) {
        const first = signals[0];
        return {
          code: first.signal || first.code || "Lab Value",
          unit: first.unit || "",
          status: first.status || "ok",
          date: first.date || new Date().toISOString().slice(0, 10),
          series: signals.map((s: any) => ({
            time: s.date || s.time,
            value: s.value,
            unit: s.unit,
            referenceRange: s.reference
              ? { high: { value: s.reference.max }, low: { value: s.reference.min } }
              : undefined,
          })),
          ranges: first.reference
            ? [{ name: "Normal", min: first.reference.min, max: first.reference.max }]
            : [],
        };
      }
    }

    return fallback;
  }

  private extractFirstCondition(data: any): any {
    const parsed = this.extractMCPText(data);
    if (!parsed) return null;

    const conditions = Array.isArray(parsed)
      ? parsed
      : parsed.conditions || parsed.data || [];
    if (!Array.isArray(conditions) || conditions.length === 0) return null;

    const c = conditions[0];
    return {
      name: c.name || c.condition || c.text || "Unknown",
      probability: c.probability ?? 0.7,
      priority: c.priority ?? 5,
      confidence: c.confidence ?? c.probability ?? 0.7,
      reasoning: c.reasoning || c.description || c.notes || "",
      icd10: c.icd10 || c.code,
      redFlags: c.redFlags,
      requiresInvestigation: c.requiresInvestigation ?? false,
    };
  }

  private extractFirstSymptom(data: any): any {
    const parsed = this.extractMCPText(data);
    if (!parsed) return null;

    const items = Array.isArray(parsed)
      ? parsed
      : parsed.symptoms || parsed.conditions || parsed.data || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    const s = items[0];
    return {
      text: s.text || s.name || s.symptom || "Unknown",
      severity: s.severity ?? 5,
      confidence: s.confidence ?? 0.7,
      source: s.source || "document",
      duration: s.duration,
      characteristics: s.characteristics || s.description,
    };
  }

  private extractFirstTreatment(data: any): any {
    const parsed = this.extractMCPText(data);
    if (!parsed) return null;

    const items = Array.isArray(parsed)
      ? parsed
      : parsed.medications || parsed.treatments || parsed.data || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    const m = items[0];
    return {
      type: m.type || "medication",
      name: m.name || m.medication || "Unknown",
      priority: m.priority ?? 5,
      confidence: m.confidence ?? 0.7,
      dosage: m.dosage || m.dose,
      description: m.description || m.notes,
      urgency: m.urgency || "routine",
      duration: m.duration,
    };
  }

  private extractTimelineEntries(data: any): any[][] {
    const parsed = this.extractMCPText(data);
    if (!parsed) return [];

    const items = Array.isArray(parsed)
      ? parsed
      : parsed.timeline || parsed.events || parsed.conditions || parsed.data || [];
    if (!Array.isArray(items)) return [];

    return items
      .filter((item: any) => item && (item.date || item.time || item.name || item.text))
      .map((item: any) => [
        item.date || item.time || "-",
        item.name || item.text || item.event || item.description || "-",
        item.type || item.category || "-",
      ]);
  }

  // --- Sample data fallbacks ---

  private makeSampleHealthTable(): WidgetSpec {
    return {
      id: generateId(),
      type: "data_table",
      title: "Health Profile",
      data: {
        headers: ["Property", "Value"],
        rows: [
          ["Blood Type", "A+"],
          ["Height", "175 cm"],
          ["Weight", "72 kg"],
          ["Allergies", "Penicillin"],
          ["Chronic Conditions", "None"],
        ],
        caption: "Sample data - no real profile data found",
      },
    };
  }

  private makeSampleDocumentTable(): WidgetSpec {
    return {
      id: generateId(),
      type: "data_table",
      title: "Search Results",
      data: {
        headers: ["Title", "Type", "Date"],
        rows: [
          ["Annual Health Checkup", "report", "2025-06-15"],
          ["Blood Panel Results", "lab", "2025-03-10"],
        ],
        caption: "Sample data - no real documents found",
      },
    };
  }

  private makeSampleLabTrend(): WidgetSpec {
    return {
      id: generateId(),
      type: "lab_trend_chart",
      title: "HbA1c Trend",
      data: {
        code: "HbA1c",
        unit: "%",
        status: "ok",
        date: new Date().toISOString().slice(0, 10),
        series: [
          { time: "2025-01-15", value: 6.1, unit: "%" },
          { time: "2025-04-20", value: 5.8, unit: "%" },
          { time: "2025-07-10", value: 5.5, unit: "%" },
          { time: "2025-10-05", value: 5.3, unit: "%" },
        ],
        ranges: [{ name: "Normal", min: 4.0, max: 5.7 }],
      },
    };
  }

  // ── Sub-agent test prompts ──────────────────────────────────────────
  private static readonly AGENT_PROMPTS: Record<string, { prompt: string; description: string }> = {
    lab_results: {
      prompt: "Jaké jsou moje poslední laboratorní výsledky cholesterolu? Uveď přesné hodnoty, jednotky a referenční rozmezí. Porovnej s předchozími výsledky a ukaž trend.",
      description: "Lab results sub-agent (cholesterol trend)",
    },
  };

  private async handleAgent(args: string): Promise<TestCommandResult> {
    const agentKey = args.trim() || "lab_results";
    const agentPrompt = TestCommandHandler.AGENT_PROMPTS[agentKey];

    if (!agentPrompt) {
      const available = Object.keys(TestCommandHandler.AGENT_PROMPTS).join(", ");
      return { content: `Unknown agent type: \`${agentKey}\`. Available: ${available}` };
    }

    return {
      content: `Sending real prompt through AI pipeline to test **${agentKey}** sub-agent.\nCheck browser console for \`agentType\` in metadata log.`,
      redirectMessage: agentPrompt.prompt,
    };
  }
}
