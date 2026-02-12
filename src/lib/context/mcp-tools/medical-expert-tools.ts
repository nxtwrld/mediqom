/**
 * Medical Expert MCP Tools
 *
 * Provides AI with tools to access patient medical context, documents,
 * and health data following the Model Context Protocol (MCP) specification.
 *
 * MCP Specification: 2024-11-05
 * https://modelcontextprotocol.io/specification
 */

// Removed: import { clientEmbeddingManager } from '../embeddings/client-embedding-manager';
import { profileContextManager } from "../integration/profile-context";
import { contextAssembler } from "../context-assembly/context-composer";
import { byUser, getDocument } from "$lib/documents";
import user from "$lib/user";
import { profiles } from "$lib/profiles";
import { get } from "svelte/store";
import type { Document } from "$lib/documents/types.d";
import type { Profile } from "$lib/types.d";
import { logger } from "$lib/logging/logger";
import { mcpSecurityService, type MCPSecurityContext } from "./security-audit";
import { classificationConfig } from "$lib/config/classification";

// MCP-compliant tool result interface
export interface MCPToolResult {
  content: Array<{
    type: "text" | "resource";
    text?: string;
    resource?: any;
  }>;
  isError?: boolean;
}

// MCP Tool definition interface
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// Tool execution function type
export type MCPToolHandler = (params: any) => Promise<MCPToolResult>;

export class MedicalExpertTools {
  /**
   * Generate category descriptions from classification config
   */
  private static getCategoryDescriptions(): string {
    const categories = Object.values(classificationConfig.categories)
      .map((cat) => `"${cat.id}"`)
      .join(", ");
    return categories;
  }

  /**
   * Generate temporal term descriptions from classification config
   */
  private static getTemporalTerms(): string {
    const terms = Object.keys(classificationConfig.temporalTerms).join('", "');
    return `"${terms}"`;
  }

  /**
   * Extract document date from various possible fields
   */
  private extractDocumentDate(doc: Document | any): Date | null {
    // Try different date fields in order of preference
    const possibleDateFields = [
      doc.metadata?.date,
      doc.metadata?.created_at,
      doc.created_at,
      doc.metadata?.timestamp,
      doc.timestamp,
    ];

    for (const dateField of possibleDateFields) {
      if (dateField) {
        const date = new Date(dateField);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * Classify document temporally based on its date relative to other documents
   */
  private classifyDocumentByDate(
    docDate: Date,
    allDocuments: (Document | any)[],
  ): string {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all document dates for comparison
    const documentDates = allDocuments
      .map((doc) => this.extractDocumentDate(doc))
      .filter((date) => date !== null)
      .sort((a, b) => b!.getTime() - a!.getTime()); // Sort newest first

    if (documentDates.length === 0) {
      return "historical"; // Default if no dates available
    }

    const newestDate = documentDates[0];

    // If this document is the newest (or within top 10%), it's "latest"
    const topTenPercentIndex = Math.max(
      1,
      Math.floor(documentDates.length * 0.1),
    );
    const isInTopTenPercent = documentDates
      .slice(0, topTenPercentIndex)
      .some((date) => date!.getTime() === docDate.getTime());

    if (isInTopTenPercent) {
      return "latest";
    }

    // If within last 30 days, it's "recent"
    if (docDate >= thirtyDaysAgo) {
      return "recent";
    }

    // Otherwise it's "historical"
    return "historical";
  }

  /**
   * Security wrapper for all MCP tool calls
   */
  private async secureToolCall<T>(
    toolName: string,
    operation: string,
    context: MCPSecurityContext,
    parameters: any,
    handler: () => Promise<T>,
  ): Promise<T> {
    const startTime = performance.now();

    try {
      // Validate access
      const accessResult = await mcpSecurityService.validateAccess(
        toolName,
        context,
        parameters,
      );
      if (!accessResult.allowed) {
        // Log access denial
        await mcpSecurityService.logAccess(
          toolName,
          operation,
          context,
          parameters,
          "denied",
          accessResult.reason,
          [],
          performance.now() - startTime,
        );

        throw new Error(`Access denied: ${accessResult.reason}`);
      }

      // Execute the tool
      const result = await handler();

      // Log successful access
      const dataAccessed = this.extractDataAccessInfo(result);
      await mcpSecurityService.logAccess(
        toolName,
        operation,
        context,
        parameters,
        "success",
        undefined,
        dataAccessed,
        performance.now() - startTime,
      );

      return result;
    } catch (error) {
      // Log error
      await mcpSecurityService.logAccess(
        toolName,
        operation,
        context,
        parameters,
        "error",
        error instanceof Error ? error.message : "Unknown error",
        [],
        performance.now() - startTime,
      );

      throw error;
    }
  }

  /**
   * Extract data access information from result for audit trail
   */
  private extractDataAccessInfo(result: any): string[] {
    const dataAccessed: string[] = [];

    if (result && typeof result === "object") {
      if (result.content && Array.isArray(result.content)) {
        dataAccessed.push(`${result.content.length} content items`);
      }

      if (result.documentCount && typeof result.documentCount === "number") {
        dataAccessed.push(`${result.documentCount} documents`);
      }

      if (result.medications && Array.isArray(result.medications)) {
        dataAccessed.push(`${result.medications.length} medications`);
      }

      if (result.testResults && Array.isArray(result.testResults)) {
        dataAccessed.push(`${result.testResults.length} test results`);
      }
    }

    return dataAccessed;
  }

  /**
   * Get MCP-compliant tool definitions
   */
  static getToolDefinitions(): MCPTool[] {
    const categoryList = this.getCategoryDescriptions();
    const temporalTerms = this.getTemporalTerms();

    return [
      {
        name: "searchDocuments",
        description:
          "Search patient medical documents by matching medical terms. Documents contain standardized medical terms arrays for precise matching.",
        inputSchema: {
          type: "object",
          properties: {
            terms: {
              type: "array",
              items: { type: "string" },
              description: `Array of specific medical terms in ENGLISH ONLY that exist in document metadata. IMPORTANT: Always provide medical terms in English, never in other languages. Use exact English terms like: TEMPORAL: ${temporalTerms} | MEDICAL: "blood", "glucose", "cholesterol", "heart", "cardiac", "ecg", "x-ray", "mri", "ct", "ultrasound", "prescription", "medication", "surgery", "procedure" | BODY PARTS: anatomical terms from 473 body parts enum (English names) | ICD-10 CODES: diagnostic codes | LOINC CODES: lab test codes | Use specific, standardized English medical terminology for best matches.`,
            },
            limit: {
              type: "number",
              description:
                "Maximum number of documents to return (default: 10)",
              minimum: 1,
              maximum: 50,
            },
            threshold: {
              type: "number",
              description:
                "Minimum relevance threshold (0.0-1.0, default: 0.6)",
              minimum: 0.0,
              maximum: 1.0,
            },
            includeContent: {
              type: "boolean",
              description:
                "Whether to include full document content for highly relevant results (default: false)",
            },
            documentTypes: {
              type: "array",
              items: { type: "string" },
              description: `Filter by document categories. Use exact category IDs: ${categoryList}. These map to the metadata.category field in documents.`,
            },
          },
          required: ["terms"],
        },
      },
      {
        name: "getAssembledContext",
        description:
          "Get comprehensive assembled medical context for the current conversation. Use when you need a broad overview of relevant medical history and patterns.",
        inputSchema: {
          type: "object",
          properties: {
            conversationContext: {
              type: "string",
              description:
                "Current conversation context to search for relevant medical history",
            },
            maxTokens: {
              type: "number",
              description:
                "Maximum tokens for assembled context (default: 3000)",
              minimum: 500,
              maximum: 8000,
            },
            includeMedicalContext: {
              type: "boolean",
              description:
                "Include structured medical context with timeline (default: true)",
            },
            priorityTypes: {
              type: "array",
              items: { type: "string" },
              description: "Prioritize specific types of medical information",
            },
          },
          required: ["conversationContext"],
        },
      },
      {
        name: "getProfileData",
        description:
          "Access patient profile information including demographics, basic health data, and insurance information.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "queryMedicalHistory",
        description:
          "Query specific types of medical history information such as medications, conditions, procedures, or allergies.",
        inputSchema: {
          type: "object",
          properties: {
            queryType: {
              type: "string",
              enum: [
                "medications",
                "conditions",
                "procedures",
                "allergies",
                "timeline",
              ],
              description: "Type of medical information to query",
            },
            timeframe: {
              type: "object",
              properties: {
                start: {
                  type: "string",
                  format: "date",
                  description:
                    "Start date for time-based filtering (ISO format)",
                },
                end: {
                  type: "string",
                  format: "date",
                  description: "End date for time-based filtering (ISO format)",
                },
              },
              description: "Optional timeframe to filter results",
            },
          },
          required: ["queryType"],
        },
      },
      {
        name: "getDocumentById",
        description:
          "Retrieve a specific medical document by its unique identifier. Use when you have a document ID from search results.",
        inputSchema: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "Unique identifier of the document to retrieve",
            },
          },
          required: ["documentId"],
        },
      },
      {
        name: "getPatientTimeline",
        description:
          "Get chronological patient history with medical events ordered by date. Use when you need to understand the progression of medical conditions over time.",
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
                'Filter by event types (e.g., "diagnosis", "medication", "procedure", "test")',
            },
            includeDetails: {
              type: "boolean",
              description:
                "Include detailed information for each timeline event (default: true)",
            },
          },
          required: [],
        },
      },
      // TODO: Implement analyzeMedicalTrends - currently incomplete
      // {
      //   name: 'analyzeMedicalTrends',
      //   description: 'Analyze trends and patterns in medical data over time. Use when you need to identify changes in patient condition, medication effectiveness, or disease progression.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       analysisType: {
      //         type: 'string',
      //         enum: ['vital_signs', 'lab_values', 'symptoms', 'medications', 'conditions'],
      //         description: 'Type of medical trend to analyze'
      //       },
      //       parameter: {
      //         type: 'string',
      //         description: 'Specific parameter to analyze (e.g., "blood_pressure", "glucose", "weight")'
      //       },
      //       timeframe: {
      //         type: 'object',
      //         properties: {
      //           start: { type: 'string', format: 'date' },
      //           end: { type: 'string', format: 'date' }
      //         },
      //         description: 'Time period for trend analysis'
      //       },
      //       includeCorrelations: {
      //         type: 'boolean',
      //         description: 'Include correlations with other medical parameters (default: false)'
      //       }
      //     },
      //     required: ['analysisType']
      //   }
      // },
      // TODO: Implement getMedicationHistory - currently incomplete
      // {
      //   name: 'getMedicationHistory',
      //   description: 'Get comprehensive medication history including current medications, past prescriptions, dosage changes, and potential interactions.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       includeCurrentMedications: {
      //         type: 'boolean',
      //         description: 'Include currently prescribed medications (default: true)'
      //       },
      //       includeHistoricalMedications: {
      //         type: 'boolean',
      //         description: 'Include past medications and discontinued prescriptions (default: true)'
      //       },
      //       checkInteractions: {
      //         type: 'boolean',
      //         description: 'Check for potential drug interactions (default: true)'
      //       },
      //       medicationClass: {
      //         type: 'string',
      //         description: 'Filter by medication class (e.g., "antihypertensive", "diabetes", "antibiotic")'
      //       },
      //       timeframe: {
      //         type: 'object',
      //         properties: {
      //           start: { type: 'string', format: 'date' },
      //           end: { type: 'string', format: 'date' }
      //         },
      //         description: 'Optional timeframe to filter medication history'
      //       }
      //     },
      //     required: []
      //   }
      // },
      // TODO: Implement getTestResultSummary - currently incomplete
      // {
      //   name: 'getTestResultSummary',
      //   description: 'Get aggregated summary of laboratory test results, diagnostic imaging, and other medical tests with trend analysis.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       testTypes: {
      //         type: 'array',
      //         items: { type: 'string' },
      //         description: 'Filter by test types (e.g., "blood_work", "imaging", "cardiac", "endocrine")'
      //       },
      //       abnormalOnly: {
      //         type: 'boolean',
      //         description: 'Show only abnormal or concerning results (default: false)'
      //       },
      //       timeframe: {
      //         type: 'object',
      //         properties: {
      //           start: { type: 'string', format: 'date' },
      //           end: { type: 'string', format: 'date' }
      //         },
      //         description: 'Time period for test result summary'
      //       },
      //       includeTrends: {
      //         type: 'boolean',
      //         description: 'Include trend analysis for repeated tests (default: true)'
      //       },
      //       groupByTest: {
      //         type: 'boolean',
      //         description: 'Group results by test type rather than chronologically (default: false)'
      //       }
      //     },
      //     required: []
      //   }
      // },
      // TODO: Implement identifyMedicalPatterns - currently incomplete
      // {
      //   name: 'identifyMedicalPatterns',
      //   description: 'Identify patterns and correlations across medical documents using AI analysis. Use when you need to find hidden connections in patient data.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       patternType: {
      //         type: 'string',
      //         enum: ['symptom_clusters', 'treatment_responses', 'risk_factors', 'comorbidities', 'medication_effects'],
      //         description: 'Type of medical pattern to identify'
      //       },
      //       focusArea: {
      //         type: 'string',
      //         description: 'Specific medical area to focus analysis on (e.g., "cardiovascular", "diabetes", "mental_health")'
      //       },
      //       confidenceThreshold: {
      //         type: 'number',
      //         minimum: 0.5,
      //         maximum: 1.0,
      //         description: 'Minimum confidence level for pattern identification (default: 0.7)'
      //       },
      //       includeHypotheses: {
      //         type: 'boolean',
      //         description: 'Include AI-generated hypotheses about identified patterns (default: true)'
      //       }
      //     },
      //     required: ['patternType']
      //   }
      // },
      // TODO: Implement generateClinicalSummary - currently incomplete
      // {
      //   name: 'generateClinicalSummary',
      //   description: 'Generate AI-powered clinical summary of patient condition, recent changes, and key medical insights.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       summaryType: {
      //         type: 'string',
      //         enum: ['comprehensive', 'recent_changes', 'condition_specific', 'risk_assessment'],
      //         description: 'Type of clinical summary to generate'
      //       },
      //       focusCondition: {
      //         type: 'string',
      //         description: 'Focus summary on specific condition or medical area'
      //       },
      //       timeframe: {
      //         type: 'object',
      //         properties: {
      //           start: { type: 'string', format: 'date' },
      //           end: { type: 'string', format: 'date' }
      //         },
      //         description: 'Time period for summary (defaults to last 6 months)'
      //       },
      //       includeRecommendations: {
      //         type: 'boolean',
      //         description: 'Include clinical recommendations and follow-up suggestions (default: true)'
      //       },
      //       audience: {
      //         type: 'string',
      //         enum: ['physician', 'patient', 'specialist'],
      //         description: 'Target audience for the summary (affects language and detail level)'
      //       }
      //     },
      //     required: ['summaryType']
      //   }
      // },
      // TODO: Implement searchBySymptoms - currently incomplete
      // {
      //   name: 'searchBySymptoms',
      //   description: 'Search medical documents based on symptom descriptions and clinical presentations. Use when analyzing symptom patterns or differential diagnosis.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       symptoms: {
      //         type: 'array',
      //         items: { type: 'string' },
      //         description: 'List of symptoms to search for (e.g., ["chest pain", "shortness of breath", "fatigue"])'
      //       },
      //       severity: {
      //         type: 'string',
      //         enum: ['mild', 'moderate', 'severe', 'any'],
      //         description: 'Filter by symptom severity (default: "any")'
      //       },
      //       duration: {
      //         type: 'string',
      //         description: 'Symptom duration (e.g., "acute", "chronic", "3 days", "2 weeks")'
      //       },
      //       associatedFindings: {
      //         type: 'array',
      //         items: { type: 'string' },
      //         description: 'Associated clinical findings or exam results'
      //       },
      //       includeRelatedConditions: {
      //         type: 'boolean',
      //         description: 'Include documents about conditions commonly associated with these symptoms (default: true)'
      //       }
      //     },
      //     required: ['symptoms']
      //   }
      // },
      // TODO: Implement getSpecialtyRecommendations - currently incomplete
      // {
      //   name: 'getSpecialtyRecommendations',
      //   description: 'Get specialty-specific recommendations and insights based on patient data and current medical evidence.',
      //   inputSchema: {
      //     type: 'object',
      //     properties: {
      //       specialty: {
      //         type: 'string',
      //         enum: ['cardiology', 'endocrinology', 'neurology', 'psychiatry', 'gastroenterology', 'pulmonology', 'nephrology', 'oncology', 'general'],
      //         description: 'Medical specialty for focused recommendations'
      //       },
      //       clinicalQuestion: {
      //         type: 'string',
      //         description: 'Specific clinical question or area of concern'
      //       },
      //       includeGuidelines: {
      //         type: 'boolean',
      //         description: 'Include relevant clinical guidelines and evidence-based recommendations (default: true)'
      //       },
      //       riskLevel: {
      //         type: 'string',
      //         enum: ['low', 'moderate', 'high', 'unknown'],
      //         description: 'Patient risk level for risk-stratified recommendations (default: "unknown")'
      //       },
      //       includeDifferentialDx: {
      //         type: 'boolean',
      //         description: 'Include differential diagnosis considerations (default: false)'
      //       }
      //     },
      //     required: ['specialty']
      //   }
      // }
    ];
  }

  /**
   * Search patient documents by medical terms - MCP compliant
   */
  async searchDocuments(
    params: {
      terms: string[];
      limit?: number;
      threshold?: number;
      includeContent?: boolean;
      documentTypes?: string[];
    },
    profileId: string,
  ): Promise<MCPToolResult> {
    try {
      // Get user documents directly instead of using context
      const currentUser = get(user);
      if (!currentUser) {
        return {
          content: [
            {
              type: "text",
              text: "Error: User not authenticated. Please log in to access medical documents.",
            },
          ],
          isError: true,
        };
      }

      // Debug: Show ID information for troubleshooting
      console.log(`🔍 Document Lookup Debug:`);
      console.log(`   User ID: ${currentUser.id}`);
      console.log(`   Profile ID: ${profileId}`);
      console.log(`   Using Profile ID for document lookup...`);

      // Get all user documents using profileId (not currentUser.id)
      const documentsStore = await byUser(profileId);
      const allDocuments = get(documentsStore);

      // Debug: Log all documents we're about to search
      console.group("📚 Documents Loading Debug");
      console.log(
        `Total documents loaded for profile ${profileId}:`,
        allDocuments?.length || 0,
      );

      if (allDocuments && allDocuments.length > 0) {
        console.log("📄 All documents to search:");
        allDocuments.forEach((doc, index) => {
          console.log(`  ${index + 1}. ID: ${doc.id}`);
          console.log(
            `     Title: ${typeof doc.content === "object" && doc.content?.title ? doc.content.title : "No title"}`,
          );
          console.log(
            `     Medical Terms: ${doc.medicalTerms ? `[${doc.medicalTerms.join(", ")}]` : "None"}`,
          );
          console.log(`     Temporal Type: ${doc.temporalType || "None"}`);
          console.log(
            `     Document Type: ${doc.metadata?.documentType || "Unknown"}`,
          );
          console.log(`     Created: ${(doc as any).created_at || "Unknown"}`);
          console.log("     ---");
        });
      }
      console.groupEnd();

      if (!allDocuments || allDocuments.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No medical documents found for this profile.",
            },
          ],
          isError: false,
        };
      }

      // Search documents using simple medical terms matching
      const searchResults = this.searchDocumentsByTerms(
        allDocuments,
        params.terms,
        {
          maxResults: params.limit || 10,
          threshold: params.threshold || 0.6,
          documentTypes: params.documentTypes,
        },
      );

      // Search results are already filtered by document types in the search method
      const filteredResults = searchResults;

      // Format results for AI consumption
      const documents = await Promise.all(
        filteredResults.slice(0, params.limit || 10).map(async (result) => {
          const doc = result.document;
          const docData: any = {
            id: doc.id,
            title:
              doc.content?.title ||
              doc.metadata?.summary?.substring(0, 100) + "...",
            date: doc.metadata?.date || doc.created_at,
            type: doc.metadata?.documentType || "document",
            summary: doc.metadata?.summary || "",
            relevance: result.relevance,
            matchedTerms: result.matchedTerms,
            temporalType: doc.temporalType,
            excerpt: doc.metadata?.summary?.substring(0, 200) + "...",
          };

          // Include full content if requested and relevant
          if (params.includeContent && result.relevance > 0.8) {
            try {
              const fullDoc = await getDocument(doc.id);
              if (fullDoc && fullDoc.content) {
                docData.content = this.sanitizeContentForAI(fullDoc.content);
              }
            } catch (error) {
              logger
                .namespace("Context")
                ?.warn("Failed to load full document content", {
                  documentId: doc.id,
                  error: error instanceof Error ? error.message : String(error),
                });
            }
          }

          return docData;
        }),
      );

      const searchData = {
        searchTerms: params.terms,
        totalResults: filteredResults.length,
        documents,
        searchMetadata: {
          threshold: params.threshold || 0.6,
          limit: params.limit || 10,
          searchMethod: "medical_terms_matching",
          documentTypes: params.documentTypes,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: `Found ${documents.length} relevant documents matching terms [${params.terms.join(", ")}]:\n\n${documents
              .map(
                (doc) =>
                  `**${doc.title}** (${doc.type}, ${doc.date})\n` +
                  `Relevance: ${(doc.relevance * 100).toFixed(1)}%\n` +
                  `Matched terms: ${doc.matchedTerms?.join(", ") || "none"}\n` +
                  `Summary: ${doc.summary || doc.excerpt}\n`,
              )
              .join("\n")}`,
          },
          {
            type: "resource",
            resource: searchData,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.namespace("Context")?.error("Failed to search documents", {
        error: errorMessage,
        profileId,
        terms: params.terms,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Document search failed: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get assembled medical context for current conversation - MCP compliant
   */
  async getAssembledContext(
    params: {
      conversationContext: string;
      maxTokens?: number;
      includeMedicalContext?: boolean;
      priorityTypes?: string[];
    },
    profileId: string,
  ): Promise<MCPToolResult> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(
        params.conversationContext,
      );

      // Get context stats
      const contextStats =
        profileContextManager.getProfileContextStats(profileId);
      if (!contextStats) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No context available for this profile. Please ensure documents are loaded and context is initialized.",
            },
          ],
          isError: true,
        };
      }

      // Search for relevant context
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 20,
        threshold: 0.6,
        includeMetadata: true,
      });

      // Assemble context
      const assembledContext = await contextAssembler.assembleContextForAI(
        searchResults,
        params.conversationContext,
        {
          maxTokens: params.maxTokens || 3000, // Leave room for conversation
          includeMetadata: true,
          includeMedicalContext: params.includeMedicalContext ?? true,
          priorityTypes: params.priorityTypes,
        },
      );

      const contextData = {
        summary: assembledContext.summary,
        keyPoints: assembledContext.keyPoints.map((kp) => ({
          text: kp.text,
          type: kp.type,
          date: kp.date,
          confidence: kp.confidence,
        })),
        relevantDocuments: assembledContext.relevantDocuments.map((doc) => ({
          id: doc.documentId,
          type: doc.type,
          date: doc.date,
          excerpt: doc.excerpt,
          relevance: doc.relevance,
        })),
        medicalContext: assembledContext.medicalContext,
        contextMetadata: {
          tokenCount: assembledContext.tokenCount,
          documentCount: assembledContext.relevantDocuments.length,
          keyPointCount: assembledContext.keyPoints.length,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: `Assembled medical context:\n\n**Summary:** ${assembledContext.summary}\n\n**Key Points:** ${assembledContext.keyPoints.length} relevant medical points identified\n\n**Relevant Documents:** ${assembledContext.relevantDocuments.length} documents found\n\n**Confidence:** ${(assembledContext.confidence * 100).toFixed(1)}%`,
          },
          {
            type: "resource",
            resource: contextData,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.namespace("Context")?.error("Failed to assemble context", {
        error: errorMessage,
        profileId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Context assembly failed: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get patient profile information - MCP compliant
   */
  async getProfileData(params: {}, profileId: string): Promise<MCPToolResult> {
    try {
      const profile = profiles.get(profileId) as Profile;
      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Profile not found",
            },
          ],
          isError: true,
        };
      }

      // Sanitize profile data for AI consumption
      const profileData = {
        id: profile.id,
        fullName: profile.fullName,
        language: profile.language,
        birthDate: profile.birthDate,
        vcard: profile.vcard
          ? {
              firstName: profile.vcard.firstName,
              lastName: profile.vcard.lastName,
              gender: profile.vcard.gender,
              phone: profile.vcard.phone,
              email: profile.vcard.email,
            }
          : null,
        health: profile.health
          ? {
              bloodType: profile.health.bloodType,
              height: profile.health.height,
              weight: profile.health.weight,
              allergies: profile.health.allergies,
              chronicConditions: profile.health.chronicConditions,
              currentMedications: profile.health.currentMedications,
            }
          : null,
        insurance: profile.insurance
          ? {
              provider: profile.insurance.provider,
              planType: profile.insurance.planType,
            }
          : null,
      };

      let profileText = `**Patient Profile: ${profile.fullName}**\n\n`;
      if (profile.birthDate)
        profileText += `Birth Date: ${profile.birthDate}\n`;
      if (profile.vcard?.gender)
        profileText += `Gender: ${profile.vcard.gender}\n`;
      if (profile.health?.bloodType)
        profileText += `Blood Type: ${profile.health.bloodType}\n`;
      if (profile.health?.allergies?.length)
        profileText += `Allergies: ${profile.health.allergies.join(", ")}\n`;
      if (profile.health?.chronicConditions?.length)
        profileText += `Chronic Conditions: ${profile.health.chronicConditions.join(", ")}\n`;

      return {
        content: [
          {
            type: "text",
            text: profileText,
          },
          {
            type: "resource",
            resource: profileData,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.namespace("Context")?.error("Failed to get profile data", {
        error: errorMessage,
        profileId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Profile data access failed: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Query specific medical information types - MCP compliant
   */
  async queryMedicalHistory(
    params: {
      queryType:
        | "medications"
        | "conditions"
        | "procedures"
        | "allergies"
        | "timeline";
      timeframe?: { start?: string; end?: string };
    },
    profileId: string,
  ): Promise<MCPToolResult> {
    try {
      const contextStats =
        profileContextManager.getProfileContextStats(profileId);
      if (!contextStats) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No medical history context available",
            },
          ],
          isError: true,
        };
      }

      // Build type-specific query
      let query = "";
      switch (params.queryType) {
        case "medications":
          query = "medications prescriptions drugs dosage treatment pharmacy";
          break;
        case "conditions":
          query = "diagnosis condition disease illness symptoms diagnosed";
          break;
        case "procedures":
          query = "procedure surgery operation test examination performed";
          break;
        case "allergies":
          query = "allergy allergic reaction adverse effects contraindication";
          break;
        case "timeline":
          query = "chronological timeline history progression events dates";
          break;
      }

      // Search for relevant documents
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 15,
        threshold: 0.5,
        includeMetadata: true,
      });

      // Filter by timeframe if specified
      let filteredResults = searchResults;
      if (params.timeframe) {
        filteredResults = searchResults.filter((result) => {
          const docDate = new Date(result.metadata.date);
          const start = params.timeframe.start
            ? new Date(params.timeframe.start)
            : null;
          const end = params.timeframe.end
            ? new Date(params.timeframe.end)
            : null;

          return (!start || docDate >= start) && (!end || docDate <= end);
        });
      }

      // Extract relevant information based on query type
      const extractedData = await this.extractMedicalData(
        filteredResults,
        params.queryType,
      );

      const historyData = {
        queryType: params.queryType,
        timeframe: params.timeframe,
        totalDocuments: filteredResults.length,
        extractedData,
        documents: filteredResults.slice(0, 10).map((result) => ({
          id: result.documentId,
          title: result.metadata.title,
          date: result.metadata.date,
          relevance: result.similarity,
          excerpt:
            result.excerpt ||
            result.metadata.summary?.substring(0, 150) + "...",
        })),
      };

      const timeframeText = params.timeframe
        ? ` (${params.timeframe.start || "start"} to ${params.timeframe.end || "present"})`
        : "";
      const summaryText =
        `Medical history query for ${params.queryType}${timeframeText}:\n\n` +
        `Found ${filteredResults.length} relevant documents with ${extractedData.length} extracted ${params.queryType} entries.\n\n` +
        extractedData
          .slice(0, 5)
          .map(
            (item) =>
              `• ${item.date || "Unknown date"}: ${Object.values(item)
                .filter((v) =>
                  Array.isArray(v)
                    ? v.join(", ")
                    : typeof v === "string" && v !== item.date,
                )
                .join(" - ")}`,
          )
          .join("\n");

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
          {
            type: "resource",
            resource: historyData,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.namespace("Context")?.error("Failed to query medical history", {
        error: errorMessage,
        profileId,
        queryType: params.queryType,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Medical history query failed: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get document by ID with full content - MCP compliant
   */
  async getDocumentById(
    params: { documentId: string },
    profileId?: string,
  ): Promise<MCPToolResult> {
    try {
      const document = await getDocument(params.documentId);
      if (!document) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Document not found",
            },
          ],
          isError: true,
        };
      }

      const sanitizedDoc = {
        id: document.id,
        type: document.type,
        metadata: document.metadata,
        content: this.sanitizeContentForAI(document.content),
        author_id: document.author_id,
        created: document.metadata?.date,
      };

      const docText =
        `**Document: ${document.metadata?.title || "Untitled"}**\n\n` +
        `Type: ${document.type}\n` +
        `Date: ${document.metadata?.date || "Unknown"}\n\n` +
        `Content:\n${typeof document.content === "string" ? document.content : JSON.stringify(document.content, null, 2)}`;

      return {
        content: [
          {
            type: "text",
            text: docText,
          },
          {
            type: "resource",
            resource: sanitizedDoc,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.namespace("Context")?.error("Failed to get document", {
        error: errorMessage,
        documentId: params.documentId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Document access failed: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Extract medical data based on query type
   */
  private async extractMedicalData(results: any[], queryType: string) {
    const data = [];

    for (const result of results.slice(0, 10)) {
      try {
        const document = await getDocument(result.documentId);
        if (!document?.content) continue;

        const content =
          typeof document.content === "string"
            ? document.content
            : JSON.stringify(document.content);

        // Extract relevant information based on type
        const extracted = this.extractTypeSpecificData(
          content,
          queryType,
          result.metadata,
        );
        if (extracted) {
          data.push({
            documentId: result.documentId,
            date: result.metadata.date,
            title: result.metadata.title,
            relevance: result.similarity,
            ...extracted,
          });
        }
      } catch (error) {
        logger
          .namespace("Context")
          ?.warn("Failed to extract data from document", {
            documentId: result.documentId,
            error,
          });
      }
    }

    return data;
  }

  /**
   * Extract type-specific medical data
   */
  private extractTypeSpecificData(
    content: string,
    queryType: string,
    metadata: any,
  ) {
    const text = content.toLowerCase();

    switch (queryType) {
      case "medications":
        const medications = this.extractMedications(text);
        return medications.length > 0 ? { medications } : null;

      case "conditions":
        const conditions = this.extractConditions(text);
        return conditions.length > 0 ? { conditions } : null;

      case "procedures":
        const procedures = this.extractProcedures(text);
        return procedures.length > 0 ? { procedures } : null;

      case "allergies":
        const allergies = this.extractAllergies(text);
        return allergies.length > 0 ? { allergies } : null;

      case "timeline":
        return {
          summary: content.substring(0, 200) + "...",
          date: metadata.date,
          type: metadata.documentType,
        };

      default:
        return null;
    }
  }

  /**
   * Extract medication information from text
   */
  private extractMedications(text: string): string[] {
    const medPatterns = [
      /(?:taking|prescribed|medication|drug)\s+([a-z]+(?:\s+[a-z]+)*)/gi,
      /([a-z]+(?:ine|ol|al|um|ate|ide))\s*(?:\d+\s*mg)/gi,
      /(\w+)\s+(?:\d+\s*(?:mg|mcg|units))/gi,
    ];

    const medications = new Set<string>();
    medPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const med = match
            .replace(/^(?:taking|prescribed|medication|drug)\s+/i, "")
            .trim();
          if (med.length > 2 && med.length < 50) {
            medications.add(med);
          }
        });
      }
    });

    return Array.from(medications).slice(0, 10);
  }

  /**
   * Extract condition information from text
   */
  private extractConditions(text: string): string[] {
    const conditionPatterns = [
      /(?:diagnosed|diagnosis|condition|disease|illness)\s+(?:with|of)?\s*([a-z\s]+)/gi,
      /(?:suffers?\s+from|has|experiencing)\s+([a-z\s]+)/gi,
    ];

    const conditions = new Set<string>();
    conditionPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const condition = match
            .replace(
              /^(?:diagnosed|diagnosis|condition|disease|illness|suffers?\s+from|has|experiencing)\s+(?:with|of)?\s*/i,
              "",
            )
            .trim();
          if (condition.length > 3 && condition.length < 100) {
            conditions.add(condition);
          }
        });
      }
    });

    return Array.from(conditions).slice(0, 10);
  }

  /**
   * Extract procedure information from text
   */
  private extractProcedures(text: string): string[] {
    const procedurePatterns = [
      /(?:procedure|surgery|operation|test|examination|performed|completed)\s+([a-z\s]+)/gi,
      /(?:underwent|had)\s+(?:a|an)?\s*([a-z\s]+(?:procedure|surgery|operation|test|scan))/gi,
    ];

    const procedures = new Set<string>();
    procedurePatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const procedure = match
            .replace(
              /^(?:procedure|surgery|operation|test|examination|performed|completed|underwent|had)\s+(?:a|an)?\s*/i,
              "",
            )
            .trim();
          if (procedure.length > 3 && procedure.length < 100) {
            procedures.add(procedure);
          }
        });
      }
    });

    return Array.from(procedures).slice(0, 10);
  }

  /**
   * Extract allergy information from text
   */
  private extractAllergies(text: string): string[] {
    const allergyPatterns = [
      /(?:allergic|allergy|allergies)\s+(?:to|from)?\s*([a-z\s]+)/gi,
      /(?:adverse|negative)\s+(?:reaction|response)\s+(?:to|from)\s+([a-z\s]+)/gi,
      /contraindicated?\s+(?:for|with)\s+([a-z\s]+)/gi,
    ];

    const allergies = new Set<string>();
    allergyPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const allergy = match
            .replace(
              /^(?:allergic|allergy|allergies|adverse|negative|contraindicated?)\s+(?:to|from|reaction|response|for|with)?\s*/i,
              "",
            )
            .trim();
          if (allergy.length > 2 && allergy.length < 50) {
            allergies.add(allergy);
          }
        });
      }
    });

    return Array.from(allergies).slice(0, 10);
  }

  /**
   * Sanitize document content for AI consumption
   */
  private sanitizeContentForAI(content: any): any {
    if (typeof content === "string") {
      return content;
    }

    if (typeof content === "object" && content !== null) {
      const sanitized = { ...content };

      // Remove sensitive fields
      delete sanitized.attachments;
      delete sanitized.encryption;
      delete sanitized.keys;

      // Limit content size
      if (sanitized.text && sanitized.text.length > 5000) {
        sanitized.text = sanitized.text.substring(0, 5000) + "... [truncated]";
      }

      if (
        sanitized.content &&
        typeof sanitized.content === "string" &&
        sanitized.content.length > 5000
      ) {
        sanitized.content =
          sanitized.content.substring(0, 5000) + "... [truncated]";
      }

      return sanitized;
    }

    return content;
  }

  /**
   * Get patient timeline with chronological medical events - MCP compliant
   */
  async getPatientTimeline(
    params: {
      startDate?: string;
      endDate?: string;
      eventTypes?: string[];
      includeDetails?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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
      const documents = get(byUser(targetProfileId));

      // Build timeline events from documents
      const timelineEvents = [];

      for (const doc of documents) {
        if (!doc.content) continue;

        // Extract date from document
        let eventDate = doc.metadata?.date || doc.content.date;
        if (!eventDate) continue;

        // Filter by date range if specified
        if (
          params.startDate &&
          new Date(eventDate) < new Date(params.startDate)
        )
          continue;
        if (params.endDate && new Date(eventDate) > new Date(params.endDate))
          continue;

        // Extract events from document content
        const extractedEvents = this.extractTimelineEvents(
          doc,
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

      return {
        content: [
          {
            type: "text",
            text: timelineText,
          },
          {
            type: "resource",
            resource: {
              timeline: timelineEvents,
              totalEvents: timelineEvents.length,
              dateRange: {
                start: timelineEvents[0]?.date,
                end: timelineEvents[timelineEvents.length - 1]?.date,
              },
            },
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
   * Analyze medical trends over time - MCP compliant
   */
  async analyzeMedicalTrends(
    params: {
      analysisType:
        | "vital_signs"
        | "lab_values"
        | "symptoms"
        | "medications"
        | "conditions";
      parameter?: string;
      timeframe?: { start: string; end: string };
      includeCorrelations?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Get documents from memory for trend analysis
      const documents = get(byUser(targetProfileId));

      // Extract trend data based on analysis type
      const trendData = this.extractTrendData(
        documents,
        params.analysisType,
        params.parameter,
        params.timeframe,
      );

      // Analyze trends
      const trendAnalysis = this.analyzeTrends(
        trendData,
        params.includeCorrelations,
      );

      // Format analysis results
      const analysisText = this.formatTrendAnalysis(
        trendAnalysis,
        params.analysisType,
        params.parameter,
      );

      return {
        content: [
          {
            type: "text",
            text: analysisText,
          },
          {
            type: "resource",
            resource: trendAnalysis,
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to analyze medical trends", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing medical trends: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get comprehensive medication history - MCP compliant
   */
  async getMedicationHistory(
    params: {
      includeCurrentMedications?: boolean;
      includeHistoricalMedications?: boolean;
      checkInteractions?: boolean;
      medicationClass?: string;
      timeframe?: { start: string; end: string };
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Search for medication-related documents
      const queryEmbedding = await this.generateQueryEmbedding(
        "medications prescriptions drugs pharmacy",
      );
      const contextStats =
        profileContextManager.getProfileContextStats(targetProfileId);

      if (!contextStats?.database) {
        return {
          content: [
            {
              type: "text",
              text: "No medical context available. Please ensure documents are loaded.",
            },
          ],
          isError: true,
        };
      }

      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 30,
        threshold: 0.5,
        includeMetadata: true,
      });

      // Extract medication data
      const medicationHistory = this.extractMedicationData(
        searchResults,
        params,
      );

      // Check for interactions if requested
      let interactionWarnings = [];
      if (params.checkInteractions !== false) {
        interactionWarnings = this.checkMedicationInteractions(
          medicationHistory.currentMedications,
        );
      }

      // Format medication history
      const historyText = this.formatMedicationHistory(
        medicationHistory,
        interactionWarnings,
      );

      return {
        content: [
          {
            type: "text",
            text: historyText,
          },
          {
            type: "resource",
            resource: {
              ...medicationHistory,
              interactionWarnings,
              summary: {
                totalCurrent: medicationHistory.currentMedications.length,
                totalHistorical: medicationHistory.historicalMedications.length,
                interactionCount: interactionWarnings.length,
              },
            },
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to get medication history", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving medication history: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get test result summary with trends - MCP compliant
   */
  async getTestResultSummary(
    params: {
      testTypes?: string[];
      abnormalOnly?: boolean;
      timeframe?: { start: string; end: string };
      includeTrends?: boolean;
      groupByTest?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Search for test and lab result documents
      const queryEmbedding = await this.generateQueryEmbedding(
        "laboratory tests lab results diagnostic imaging blood work",
      );
      const contextStats =
        profileContextManager.getProfileContextStats(targetProfileId);

      if (!contextStats?.database) {
        return {
          content: [
            {
              type: "text",
              text: "No medical context available. Please ensure documents are loaded.",
            },
          ],
          isError: true,
        };
      }

      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 50,
        threshold: 0.4,
        includeMetadata: true,
      });

      // Extract and analyze test results
      const testResults = this.extractTestResults(searchResults, params);

      // Analyze trends if requested
      let trendAnalysis = null;
      if (params.includeTrends !== false) {
        trendAnalysis = this.analyzeTestTrends(testResults);
      }

      // Format test summary
      const summaryText = this.formatTestResultSummary(
        testResults,
        trendAnalysis,
        params,
      );

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
          {
            type: "resource",
            resource: {
              testResults,
              trendAnalysis,
              summary: {
                totalTests: testResults.length,
                abnormalTests: testResults.filter(
                  (t) => t.status === "abnormal",
                ).length,
                testTypes: [...new Set(testResults.map((t) => t.type))],
              },
            },
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to get test result summary", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving test results: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Identify medical patterns using AI analysis - MCP compliant
   */
  async identifyMedicalPatterns(
    params: {
      patternType:
        | "symptom_clusters"
        | "treatment_responses"
        | "risk_factors"
        | "comorbidities"
        | "medication_effects";
      focusArea?: string;
      confidenceThreshold?: number;
      includeHypotheses?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Build pattern-specific search query
      const patternQuery = this.buildPatternQuery(
        params.patternType,
        params.focusArea,
      );
      const queryEmbedding = await this.generateQueryEmbedding(patternQuery);

      const contextStats =
        profileContextManager.getProfileContextStats(targetProfileId);
      if (!contextStats?.database) {
        return {
          content: [
            {
              type: "text",
              text: "No medical context available. Please ensure documents are loaded.",
            },
          ],
          isError: true,
        };
      }

      // Search for relevant documents
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 40,
        threshold: params.confidenceThreshold || 0.7,
        includeMetadata: true,
      });

      // Analyze patterns across documents
      const patternAnalysis = this.analyzePatterns(searchResults, params);

      // Generate AI hypotheses if requested
      let hypotheses = [];
      if (params.includeHypotheses !== false) {
        hypotheses = this.generatePatternHypotheses(
          patternAnalysis,
          params.patternType,
        );
      }

      // Format pattern analysis
      const analysisText = this.formatPatternAnalysis(
        patternAnalysis,
        hypotheses,
        params,
      );

      return {
        content: [
          {
            type: "text",
            text: analysisText,
          },
          {
            type: "resource",
            resource: {
              patterns: patternAnalysis,
              hypotheses,
              metadata: {
                patternType: params.patternType,
                focusArea: params.focusArea,
                confidenceThreshold: params.confidenceThreshold || 0.7,
                documentsAnalyzed: searchResults.length,
              },
            },
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to identify medical patterns", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error identifying medical patterns: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Generate clinical summary - MCP compliant
   */
  async generateClinicalSummary(
    params: {
      summaryType:
        | "comprehensive"
        | "recent_changes"
        | "condition_specific"
        | "risk_assessment";
      focusCondition?: string;
      timeframe?: { start: string; end: string };
      includeRecommendations?: boolean;
      audience?: "physician" | "patient" | "specialist";
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Get assembled context for summary generation
      const contextResult = await this.getAssembledContext(
        {
          conversationContext: this.buildSummaryQuery(params),
          maxTokens: 4000,
          includeMedicalContext: true,
        },
        targetProfileId,
      );

      if (contextResult.isError) {
        return contextResult;
      }

      // Generate summary based on type and audience
      const clinicalSummary = this.generateSummaryContent(
        contextResult,
        params,
      );

      return {
        content: [
          {
            type: "text",
            text: clinicalSummary.text,
          },
          {
            type: "resource",
            resource: clinicalSummary.structured,
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to generate clinical summary", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error generating clinical summary: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Search by symptoms - MCP compliant
   */
  async searchBySymptoms(
    params: {
      symptoms: string[];
      severity?: "mild" | "moderate" | "severe" | "any";
      duration?: string;
      associatedFindings?: string[];
      includeRelatedConditions?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Build symptom search query
      const symptomQuery = this.buildSymptomQuery(params);
      const queryEmbedding = await this.generateQueryEmbedding(symptomQuery);

      const contextStats =
        profileContextManager.getProfileContextStats(targetProfileId);
      if (!contextStats?.database) {
        return {
          content: [
            {
              type: "text",
              text: "No medical context available. Please ensure documents are loaded.",
            },
          ],
          isError: true,
        };
      }

      // Search for symptom-related documents
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 25,
        threshold: 0.6,
        includeMetadata: true,
      });

      // Analyze symptom patterns
      const symptomAnalysis = this.analyzeSymptomDocuments(
        searchResults,
        params,
      );

      // Format symptom search results
      const resultsText = this.formatSymptomResults(symptomAnalysis, params);

      return {
        content: [
          {
            type: "text",
            text: resultsText,
          },
          {
            type: "resource",
            resource: symptomAnalysis,
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to search by symptoms", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error searching by symptoms: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get specialty-specific recommendations - MCP compliant
   */
  async getSpecialtyRecommendations(
    params: {
      specialty: string;
      clinicalQuestion?: string;
      includeGuidelines?: boolean;
      riskLevel?: "low" | "moderate" | "high" | "unknown";
      includeDifferentialDx?: boolean;
    },
    profileId?: string,
  ): Promise<MCPToolResult> {
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

      // Build specialty-specific query
      const specialtyQuery = this.buildSpecialtyQuery(params);

      // Get relevant medical context
      const contextResult = await this.getAssembledContext(
        {
          conversationContext: specialtyQuery,
          maxTokens: 3000,
          priorityTypes: [params.specialty, "medications", "conditions"],
        },
        targetProfileId,
      );

      if (contextResult.isError) {
        return contextResult;
      }

      // Generate specialty recommendations
      const recommendations = this.generateSpecialtyRecommendations(
        contextResult,
        params,
      );

      return {
        content: [
          {
            type: "text",
            text: recommendations.text,
          },
          {
            type: "resource",
            resource: recommendations.structured,
          },
        ],
      };
    } catch (error) {
      logger
        .namespace("MCPTools")
        .error("Failed to get specialty recommendations", { error });
      return {
        content: [
          {
            type: "text",
            text: `Error getting specialty recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Helper methods for the new tools

  /**
   * Extract timeline events from search results
   */
  private extractTimelineEvents(searchResults: any[]): any[] {
    return searchResults
      .map((result) => ({
        date: result.metadata.date || "Unknown date",
        type: result.metadata.documentType || "medical-record",
        title: result.metadata.title || "Medical event",
        description: result.excerpt || result.metadata.summary || "",
        documentId: result.metadata.documentId,
        confidence: result.confidence || 0,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Format timeline events for display
   */
  private formatTimeline(events: any[]): string {
    if (events.length === 0) return "No timeline events found.";

    return events
      .map(
        (event) =>
          `${event.date}: ${event.title} - ${event.description.substring(0, 100)}...`,
      )
      .join("\n");
  }

  /**
   * Extract trend data from search results
   */
  private extractTrendData(searchResults: any[], trendType: string): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        const metadata = result.metadata || {};

        switch (trendType) {
          case "medication":
            return (
              content.includes("medication") ||
              content.includes("prescription") ||
              metadata.documentType === "medication"
            );
          case "vitals":
            return (
              content.includes("blood pressure") ||
              content.includes("heart rate") ||
              content.includes("temperature") ||
              metadata.documentType === "vitals"
            );
          case "symptoms":
            return (
              content.includes("symptom") ||
              content.includes("pain") ||
              content.includes("discomfort") ||
              metadata.documentType === "symptoms"
            );
          default:
            return true;
        }
      })
      .map((result) => ({
        date: result.metadata.date,
        value: this.extractValueFromContent(result.excerpt, trendType),
        source: result.metadata.title || "Medical record",
        confidence: result.confidence,
      }));
  }

  /**
   * Analyze trends in the extracted data
   */
  private analyzeTrends(trendData: any[]): any {
    if (trendData.length === 0) {
      return {
        trend: "insufficient-data",
        pattern: "No data available for trend analysis",
      };
    }

    const sortedData = trendData
      .filter((item) => item.date && item.value)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sortedData.length < 2) {
      return {
        trend: "insufficient-data",
        pattern: "Need at least 2 data points for trend analysis",
      };
    }

    // Simple trend analysis
    const firstValue = parseFloat(sortedData[0].value);
    const lastValue = parseFloat(sortedData[sortedData.length - 1].value);

    if (isNaN(firstValue) || isNaN(lastValue)) {
      return {
        trend: "qualitative",
        pattern: "Trend analysis based on qualitative data",
      };
    }

    const change = ((lastValue - firstValue) / firstValue) * 100;

    let trend = "stable";
    if (change > 10) trend = "increasing";
    else if (change < -10) trend = "decreasing";

    return {
      trend,
      change: change.toFixed(1) + "%",
      pattern: `${trend} pattern observed over ${sortedData.length} data points`,
      dataPoints: sortedData.length,
    };
  }

  /**
   * Format trend analysis for display
   */
  private formatTrendAnalysis(analysis: any, trendType: string): string {
    return `${trendType.charAt(0).toUpperCase() + trendType.slice(1)} Trend Analysis:
Pattern: ${analysis.pattern}
Trend: ${analysis.trend}${analysis.change ? ` (${analysis.change})` : ""}
Data Points: ${analysis.dataPoints || "N/A"}`;
  }

  /**
   * Extract medication data from search results
   */
  private extractMedicationData(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("medication") ||
          content.includes("prescription") ||
          content.includes("drug") ||
          result.metadata.documentType === "medication"
        );
      })
      .map((result) => ({
        name: this.extractMedicationName(result.excerpt),
        dosage: this.extractDosage(result.excerpt),
        frequency: this.extractFrequency(result.excerpt),
        date: result.metadata.date,
        prescriber: result.metadata.author || "Unknown",
        source: result.metadata.title,
      }));
  }

  /**
   * Check for medication interactions
   */
  private checkMedicationInteractions(medications: any[]): string[] {
    // Simplified interaction checking - in real implementation, this would use a drug interaction database
    const warnings: string[] = [];

    const medicationNames = medications
      .map((med) => med.name?.toLowerCase())
      .filter(Boolean);

    // Common interaction patterns (simplified)
    const interactions = [
      { drugs: ["warfarin", "aspirin"], warning: "Increased bleeding risk" },
      { drugs: ["metformin", "alcohol"], warning: "Risk of lactic acidosis" },
      { drugs: ["ace inhibitor", "potassium"], warning: "Hyperkalemia risk" },
    ];

    interactions.forEach((interaction) => {
      const foundDrugs = interaction.drugs.filter((drug) =>
        medicationNames.some((med) => med.includes(drug)),
      );
      if (foundDrugs.length === interaction.drugs.length) {
        warnings.push(`${interaction.warning} (${foundDrugs.join(" + ")})`);
      }
    });

    return warnings;
  }

  /**
   * Format medication history for display
   */
  private formatMedicationHistory(
    medications: any[],
    interactions: string[],
  ): string {
    let result = "Medication History:\n";

    if (medications.length === 0) {
      result += "No medications found in records.\n";
    } else {
      medications.forEach((med) => {
        result += `- ${med.name || "Unknown medication"}`;
        if (med.dosage) result += ` (${med.dosage})`;
        if (med.frequency) result += ` - ${med.frequency}`;
        if (med.date) result += ` [${med.date}]`;
        result += "\n";
      });
    }

    if (interactions.length > 0) {
      result += "\nPotential Interactions:\n";
      interactions.forEach((interaction) => {
        result += `⚠️ ${interaction}\n`;
      });
    }

    return result;
  }

  /**
   * Extract test results from search results
   */
  private extractTestResults(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("test") ||
          content.includes("result") ||
          content.includes("lab") ||
          result.metadata.documentType === "test-result"
        );
      })
      .map((result) => ({
        testName: this.extractTestName(result.excerpt),
        value: this.extractTestValue(result.excerpt),
        range: this.extractReferenceRange(result.excerpt),
        date: result.metadata.date,
        status: this.determineTestStatus(result.excerpt),
        source: result.metadata.title,
      }));
  }

  /**
   * Analyze test trends over time
   */
  private analyzeTestTrends(testResults: any[]): any {
    const testsByName = testResults.reduce(
      (acc, test) => {
        const name = test.testName || "Unknown test";
        if (!acc[name]) acc[name] = [];
        acc[name].push(test);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const trends = Object.entries(testsByName).map(([testName, results]) => {
      const sortedResults = results
        .filter((r) => r.date && r.value)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      return {
        testName,
        resultCount: sortedResults.length,
        trend:
          sortedResults.length >= 2
            ? this.calculateTestTrend(sortedResults)
            : "insufficient-data",
        latest: sortedResults[sortedResults.length - 1],
        earliest: sortedResults[0],
      };
    });

    return trends;
  }

  /**
   * Format test result summary
   */
  private formatTestResultSummary(testResults: any[], trends: any[]): string {
    let result = "Test Results Summary:\n";

    if (testResults.length === 0) {
      result += "No test results found in records.\n";
      return result;
    }

    // Recent results
    const recentResults = testResults
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    result += "\nRecent Results:\n";
    recentResults.forEach((test) => {
      result += `- ${test.testName}: ${test.value} ${test.range ? `(Ref: ${test.range})` : ""} [${test.date}]\n`;
    });

    // Trends
    if (trends.length > 0) {
      result += "\nTrends:\n";
      trends.forEach((trend) => {
        if (trend.trend !== "insufficient-data") {
          result += `- ${trend.testName}: ${trend.trend} (${trend.resultCount} results)\n`;
        }
      });
    }

    return result;
  }

  /**
   * Build pattern query for medical patterns
   */
  private buildPatternQuery(patternType: string): string {
    const patternQueries = {
      "symptom-clusters": "symptoms occurring together patterns clusters",
      "disease-progression": "disease progression timeline development",
      "treatment-response": "treatment response outcome effectiveness",
      "medication-effects": "medication effects side effects response",
      "diagnostic-patterns": "diagnosis differential patterns signs",
    };

    return patternQueries[patternType] || `medical patterns ${patternType}`;
  }

  /**
   * Analyze patterns in medical data
   */
  private analyzePatterns(searchResults: any[], patternType: string): any {
    const patterns = {
      frequencies: this.calculateFrequencies(searchResults),
      correlations: this.findCorrelations(searchResults, patternType),
      temporal: this.analyzeTemporalPatterns(searchResults),
      severity: this.analyzeSeverityPatterns(searchResults),
    };

    return patterns;
  }

  /**
   * Generate pattern hypotheses
   */
  private generatePatternHypotheses(
    patterns: any,
    patternType: string,
  ): string[] {
    const hypotheses: string[] = [];

    // Frequency-based hypotheses
    if (patterns.frequencies && Object.keys(patterns.frequencies).length > 0) {
      const topFrequent = Object.entries(patterns.frequencies)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3);

      topFrequent.forEach(([pattern, freq]) => {
        hypotheses.push(`Recurring pattern: ${pattern} (frequency: ${freq})`);
      });
    }

    // Temporal hypotheses
    if (patterns.temporal?.trend) {
      hypotheses.push(`Temporal trend: ${patterns.temporal.trend}`);
    }

    // Pattern-specific hypotheses
    switch (patternType) {
      case "symptom-clusters":
        hypotheses.push(
          "Consider symptom constellation and common underlying conditions",
        );
        break;
      case "treatment-response":
        hypotheses.push(
          "Evaluate treatment efficacy patterns and dose-response relationships",
        );
        break;
      case "disease-progression":
        hypotheses.push("Monitor disease trajectory and progression markers");
        break;
    }

    return hypotheses.length > 0
      ? hypotheses
      : ["No clear patterns identified in available data"];
  }

  /**
   * Format pattern analysis
   */
  private formatPatternAnalysis(
    patterns: any,
    hypotheses: string[],
    patternType: string,
  ): string {
    let result = `Medical Pattern Analysis (${patternType}):\n\n`;

    result += "Key Patterns:\n";
    if (patterns.frequencies && Object.keys(patterns.frequencies).length > 0) {
      Object.entries(patterns.frequencies).forEach(([pattern, freq]) => {
        result += `- ${pattern}: ${freq} occurrences\n`;
      });
    } else {
      result += "- No significant frequency patterns detected\n";
    }

    result += "\nHypotheses:\n";
    hypotheses.forEach((hypothesis) => {
      result += `• ${hypothesis}\n`;
    });

    if (patterns.temporal?.trend) {
      result += `\nTemporal Pattern: ${patterns.temporal.trend}\n`;
    }

    return result;
  }

  /**
   * Build summary query for clinical summary
   */
  private buildSummaryQuery(summaryType: string, timeframe?: any): string {
    const queries = {
      comprehensive: "complete medical history diagnosis treatment medications",
      recent: "recent medical events treatments medications last 30 days",
      chronic: "chronic conditions ongoing treatments long-term medications",
      acute: "acute conditions recent hospitalizations emergency care",
    };

    let query = queries[summaryType] || "medical summary clinical overview";

    if (timeframe?.start || timeframe?.end) {
      query += ` ${timeframe.start || ""} ${timeframe.end || ""}`.trim();
    }

    return query;
  }

  /**
   * Generate summary content from search results
   */
  private generateSummaryContent(
    searchResults: any[],
    summaryType: string,
  ): any {
    const sections = {
      demographics: this.extractDemographics(searchResults),
      conditions: this.extractConditionsFromSearchResults(searchResults),
      medications: this.extractMedicationData(searchResults),
      procedures: this.extractProceduresFromSearchResults(searchResults),
      allergies: this.extractAllergiesFromSearchResults(searchResults),
      vitals: this.extractVitalSigns(searchResults),
    };

    const summary = {
      type: summaryType,
      sections,
      keyFindings: this.extractKeyFindings(searchResults),
      riskFactors: this.identifyRiskFactors(searchResults),
      recommendations: this.generateRecommendations(sections, summaryType),
    };

    return summary;
  }

  /**
   * Build symptom query for symptom search
   */
  private buildSymptomQuery(symptoms: string[]): string {
    return symptoms.join(" OR ") + " symptoms signs manifestations";
  }

  /**
   * Analyze symptom documents
   */
  private analyzeSymptomDocuments(
    searchResults: any[],
    symptoms: string[],
  ): any {
    const analysis = {
      matchedSymptoms: this.findMatchedSymptoms(searchResults, symptoms),
      relatedConditions: this.findRelatedConditions(searchResults),
      severity: this.assessSymptomSeverity(searchResults),
      timeline: this.extractSymptomTimeline(searchResults),
      associations: this.findSymptomAssociations(searchResults),
    };

    return analysis;
  }

  /**
   * Format symptom search results
   */
  private formatSymptomResults(analysis: any, symptoms: string[]): string {
    let result = `Symptom Search Results for: ${symptoms.join(", ")}\n\n`;

    if (analysis.matchedSymptoms.length > 0) {
      result += "Matched Symptoms:\n";
      analysis.matchedSymptoms.forEach((symptom: any) => {
        result += `- ${symptom.name}: ${symptom.description} [${symptom.date}]\n`;
      });
    }

    if (analysis.relatedConditions.length > 0) {
      result += "\nRelated Conditions:\n";
      analysis.relatedConditions.forEach((condition: any) => {
        result += `- ${condition.name}: ${condition.relationship}\n`;
      });
    }

    if (analysis.timeline.length > 0) {
      result += "\nSymptom Timeline:\n";
      analysis.timeline.forEach((event: any) => {
        result += `- ${event.date}: ${event.description}\n`;
      });
    }

    return result;
  }

  /**
   * Build specialty query for specialty recommendations
   */
  private buildSpecialtyQuery(condition: string, symptoms: string[]): string {
    return `${condition} ${symptoms.join(" ")} specialist referral consultation`;
  }

  /**
   * Generate specialty recommendations
   */
  private generateSpecialtyRecommendations(
    searchResults: any[],
    condition: string,
  ): any[] {
    const specialtyMap = {
      heart: "Cardiology",
      diabetes: "Endocrinology",
      cancer: "Oncology",
      "mental health": "Psychiatry",
      bone: "Orthopedics",
      skin: "Dermatology",
      eye: "Ophthalmology",
      ear: "ENT (Otolaryngology)",
      kidney: "Nephrology",
      liver: "Gastroenterology",
    };

    const recommendations = [];

    // Match condition to specialties
    Object.entries(specialtyMap).forEach(([keyword, specialty]) => {
      if (condition.toLowerCase().includes(keyword)) {
        recommendations.push({
          specialty,
          priority: "high",
          reason: `Condition involves ${keyword} - ${specialty} consultation recommended`,
        });
      }
    });

    // Analyze search results for specialty mentions
    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      Object.values(specialtyMap).forEach((specialty) => {
        if (content.includes(specialty.toLowerCase())) {
          recommendations.push({
            specialty,
            priority: "medium",
            reason: `${specialty} mentioned in medical records`,
            source: result.metadata.title,
          });
        }
      });
    });

    // Remove duplicates and prioritize
    const uniqueRecommendations = recommendations.reduce((acc, rec) => {
      const existing = acc.find((r) => r.specialty === rec.specialty);
      if (!existing || rec.priority === "high") {
        acc = acc.filter((r) => r.specialty !== rec.specialty);
        acc.push(rec);
      }
      return acc;
    }, [] as any[]);

    return uniqueRecommendations.slice(0, 5); // Top 5 recommendations
  }

  // Additional utility methods for content extraction and analysis

  /**
   * Extract value from content based on type
   */
  private extractValueFromContent(content: string, type: string): string {
    if (!content) return "";

    switch (type) {
      case "medication":
        return this.extractMedicationName(content) || "medication mentioned";
      case "vitals":
        return this.extractVitalValue(content) || "vital signs recorded";
      case "symptoms":
        return this.extractSymptomDescription(content) || "symptoms noted";
      default:
        return content.substring(0, 50);
    }
  }

  /**
   * Extract medication name from text
   */
  private extractMedicationName(text: string): string {
    if (!text) return "";

    // Simple medication name extraction (would be more sophisticated in real implementation)
    const medicationPatterns = [
      /(?:taking|prescribed|medication)\s+([A-Za-z]+)/i,
      /([A-Za-z]+)\s+(?:mg|tablets|capsules)/i,
      /^([A-Za-z]+)\s+\d+/,
    ];

    for (const pattern of medicationPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return "medication";
  }

  /**
   * Extract dosage from text
   */
  private extractDosage(text: string): string {
    if (!text) return "";

    const dosagePattern = /(\d+\s*(?:mg|g|ml|tablets|capsules))/i;
    const match = text.match(dosagePattern);
    return match ? match[1] : "";
  }

  /**
   * Extract frequency from text
   */
  private extractFrequency(text: string): string {
    if (!text) return "";

    const frequencies = [
      "daily",
      "twice daily",
      "three times",
      "weekly",
      "monthly",
      "as needed",
    ];
    const lowerText = text.toLowerCase();

    for (const freq of frequencies) {
      if (lowerText.includes(freq)) return freq;
    }

    return "";
  }

  /**
   * Extract vital value from text
   */
  private extractVitalValue(text: string): string {
    if (!text) return "";

    const vitalPatterns = [
      /blood pressure[:\s]+(\d+\/\d+)/i,
      /heart rate[:\s]+(\d+)/i,
      /temperature[:\s]+(\d+\.?\d*)/i,
      /weight[:\s]+(\d+\.?\d*)/i,
    ];

    for (const pattern of vitalPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return "recorded";
  }

  /**
   * Extract symptom description from text
   */
  private extractSymptomDescription(text: string): string {
    if (!text) return "";

    const symptomKeywords = [
      "pain",
      "ache",
      "discomfort",
      "nausea",
      "fatigue",
      "fever",
    ];
    const lowerText = text.toLowerCase();

    for (const symptom of symptomKeywords) {
      if (lowerText.includes(symptom)) {
        return `${symptom} reported`;
      }
    }

    return "symptoms noted";
  }

  /**
   * Extract test name from text
   */
  private extractTestName(text: string): string {
    if (!text) return "Unknown test";

    const testPatterns = [
      /(?:blood|lab|test)\s+([a-z\s]+)/i,
      /([A-Z][a-z]+)\s+(?:test|level|count)/i,
      /(CBC|BUN|Creatinine|Glucose|Cholesterol)/i,
    ];

    for (const pattern of testPatterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }

    return "Medical test";
  }

  /**
   * Extract test value from text
   */
  private extractTestValue(text: string): string {
    if (!text) return "";

    const valuePattern = /(\d+\.?\d*\s*(?:mg\/dl|mmol\/l|%|\/ul)?)/i;
    const match = text.match(valuePattern);
    return match ? match[1] : "result recorded";
  }

  /**
   * Extract reference range from text
   */
  private extractReferenceRange(text: string): string {
    if (!text) return "";

    const rangePattern =
      /(?:normal|reference|range)[:\s]+(\d+\.?\d*\s*-\s*\d+\.?\d*)/i;
    const match = text.match(rangePattern);
    return match ? match[1] : "";
  }

  /**
   * Determine test status from text
   */
  private determineTestStatus(text: string): string {
    if (!text) return "unknown";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("high") || lowerText.includes("elevated"))
      return "high";
    if (lowerText.includes("low") || lowerText.includes("decreased"))
      return "low";
    if (lowerText.includes("normal") || lowerText.includes("within range"))
      return "normal";

    return "unknown";
  }

  /**
   * Calculate test trend from sorted results
   */
  private calculateTestTrend(sortedResults: any[]): string {
    if (sortedResults.length < 2) return "insufficient-data";

    const first = parseFloat(sortedResults[0].value);
    const last = parseFloat(sortedResults[sortedResults.length - 1].value);

    if (isNaN(first) || isNaN(last)) return "qualitative";

    const change = ((last - first) / first) * 100;

    if (change > 15) return "increasing";
    if (change < -15) return "decreasing";
    return "stable";
  }

  /**
   * Calculate frequencies of patterns in search results
   */
  private calculateFrequencies(searchResults: any[]): Record<string, number> {
    const frequencies: Record<string, number> = {};

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      const words = content.split(/\s+/).filter((word) => word.length > 3);

      words.forEach((word) => {
        frequencies[word] = (frequencies[word] || 0) + 1;
      });
    });

    // Return top patterns
    return Object.fromEntries(
      Object.entries(frequencies)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10),
    );
  }

  /**
   * Find correlations in search results
   */
  private findCorrelations(searchResults: any[], patternType: string): any[] {
    // Simplified correlation analysis
    const correlations: any[] = [];

    const keyTerms = this.extractKeyTerms(searchResults, patternType);

    for (let i = 0; i < keyTerms.length; i++) {
      for (let j = i + 1; j < keyTerms.length; j++) {
        const cooccurrence = this.calculateCooccurrence(
          searchResults,
          keyTerms[i],
          keyTerms[j],
        );
        if (cooccurrence > 0.3) {
          correlations.push({
            term1: keyTerms[i],
            term2: keyTerms[j],
            strength: cooccurrence.toFixed(2),
          });
        }
      }
    }

    return correlations.slice(0, 5);
  }

  /**
   * Extract key terms based on pattern type
   */
  private extractKeyTerms(searchResults: any[], patternType: string): string[] {
    const termSets = {
      "symptom-clusters": ["pain", "nausea", "fatigue", "fever", "headache"],
      "disease-progression": ["diagnosis", "progression", "stage", "severity"],
      "treatment-response": [
        "treatment",
        "response",
        "improvement",
        "side effect",
      ],
      "medication-effects": ["medication", "dosage", "effect", "reaction"],
      "diagnostic-patterns": [
        "test",
        "result",
        "normal",
        "abnormal",
        "finding",
      ],
    };

    return (
      termSets[patternType] || ["medical", "condition", "treatment", "patient"]
    );
  }

  /**
   * Calculate co-occurrence of two terms
   */
  private calculateCooccurrence(
    searchResults: any[],
    term1: string,
    term2: string,
  ): number {
    let bothCount = 0;
    let term1Count = 0;
    let term2Count = 0;

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      const hasTerm1 = content.includes(term1.toLowerCase());
      const hasTerm2 = content.includes(term2.toLowerCase());

      if (hasTerm1) term1Count++;
      if (hasTerm2) term2Count++;
      if (hasTerm1 && hasTerm2) bothCount++;
    });

    if (term1Count === 0 || term2Count === 0) return 0;

    return bothCount / Math.min(term1Count, term2Count);
  }

  /**
   * Analyze temporal patterns in search results
   */
  private analyzeTemporalPatterns(searchResults: any[]): any {
    const datedResults = searchResults
      .filter((result) => result.metadata.date)
      .sort(
        (a, b) =>
          new Date(a.metadata.date).getTime() -
          new Date(b.metadata.date).getTime(),
      );

    if (datedResults.length < 3) {
      return { trend: "insufficient-data" };
    }

    // Simple temporal analysis
    const timeSpan =
      new Date(datedResults[datedResults.length - 1].metadata.date).getTime() -
      new Date(datedResults[0].metadata.date).getTime();
    const daySpan = timeSpan / (1000 * 60 * 60 * 24);

    let trend = "stable";
    if (daySpan < 30) trend = "recent";
    else if (daySpan > 365) trend = "long-term";

    return {
      trend,
      timeSpan: Math.round(daySpan),
      dataPoints: datedResults.length,
    };
  }

  /**
   * Analyze severity patterns in search results
   */
  private analyzeSeverityPatterns(searchResults: any[]): any {
    const severityTerms = {
      severe: ["severe", "critical", "acute", "emergency"],
      moderate: ["moderate", "significant", "notable"],
      mild: ["mild", "slight", "minor", "light"],
    };

    const severityCounts = { severe: 0, moderate: 0, mild: 0 };

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();

      Object.entries(severityTerms).forEach(([level, terms]) => {
        if (terms.some((term) => content.includes(term))) {
          severityCounts[level]++;
        }
      });
    });

    return severityCounts;
  }

  /**
   * Extract demographics from search results
   */
  private extractDemographics(searchResults: any[]): any {
    // Simple demographic extraction
    return {
      age: this.findDemographicValue(searchResults, "age"),
      gender: this.findDemographicValue(searchResults, "gender"),
      occupation: this.findDemographicValue(searchResults, "occupation"),
    };
  }

  /**
   * Find demographic value in search results
   */
  private findDemographicValue(searchResults: any[], type: string): string {
    for (const result of searchResults) {
      const content = (result.excerpt || "").toLowerCase();
      if (content.includes(type)) {
        // Simple extraction logic
        return `${type} information found`;
      }
    }
    return "not specified";
  }

  /**
   * Extract conditions from search results
   */
  private extractConditionsFromSearchResults(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("diagnosis") ||
          content.includes("condition") ||
          result.metadata.documentType === "diagnosis"
        );
      })
      .map((result) => ({
        name: this.extractConditionName(result.excerpt),
        date: result.metadata.date,
        status: this.extractConditionStatus(result.excerpt),
        source: result.metadata.title,
      }));
  }

  /**
   * Extract condition name from text
   */
  private extractConditionName(text: string): string {
    if (!text) return "Medical condition";

    // Simple condition extraction
    const conditionPattern = /(?:diagnosis|condition)[:\s]+([a-z\s]+)/i;
    const match = text.match(conditionPattern);
    return match ? match[1].trim() : "Medical condition";
  }

  /**
   * Extract condition status from text
   */
  private extractConditionStatus(text: string): string {
    if (!text) return "unknown";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("resolved") || lowerText.includes("cured"))
      return "resolved";
    if (lowerText.includes("active") || lowerText.includes("ongoing"))
      return "active";
    if (lowerText.includes("chronic")) return "chronic";

    return "active";
  }

  /**
   * Extract procedures from search results
   */
  private extractProceduresFromSearchResults(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("procedure") ||
          content.includes("surgery") ||
          content.includes("operation") ||
          result.metadata.documentType === "procedure"
        );
      })
      .map((result) => ({
        name: this.extractProcedureName(result.excerpt),
        date: result.metadata.date,
        outcome: this.extractProcedureOutcome(result.excerpt),
        source: result.metadata.title,
      }));
  }

  /**
   * Extract procedure name from text
   */
  private extractProcedureName(text: string): string {
    if (!text) return "Medical procedure";

    const procedurePattern = /(?:procedure|surgery|operation)[:\s]+([a-z\s]+)/i;
    const match = text.match(procedurePattern);
    return match ? match[1].trim() : "Medical procedure";
  }

  /**
   * Extract procedure outcome from text
   */
  private extractProcedureOutcome(text: string): string {
    if (!text) return "unknown";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("successful") || lowerText.includes("completed"))
      return "successful";
    if (lowerText.includes("complications")) return "complications";

    return "completed";
  }

  /**
   * Extract allergies from search results
   */
  private extractAllergiesFromSearchResults(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("allergy") ||
          content.includes("allergic") ||
          result.metadata.documentType === "allergy"
        );
      })
      .map((result) => ({
        allergen: this.extractAllergen(result.excerpt),
        reaction: this.extractReaction(result.excerpt),
        severity: this.extractAllergySeverity(result.excerpt),
        source: result.metadata.title,
      }));
  }

  /**
   * Extract allergen from text
   */
  private extractAllergen(text: string): string {
    if (!text) return "Unknown allergen";

    const allergenPattern = /(?:allergic to|allergy to)\s+([a-z\s]+)/i;
    const match = text.match(allergenPattern);
    return match ? match[1].trim() : "allergen";
  }

  /**
   * Extract reaction from text
   */
  private extractReaction(text: string): string {
    if (!text) return "reaction noted";

    const reactions = [
      "rash",
      "swelling",
      "breathing difficulty",
      "hives",
      "anaphylaxis",
    ];
    const lowerText = text.toLowerCase();

    for (const reaction of reactions) {
      if (lowerText.includes(reaction)) return reaction;
    }

    return "allergic reaction";
  }

  /**
   * Extract allergy severity from text
   */
  private extractAllergySeverity(text: string): string {
    if (!text) return "unknown";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("severe") || lowerText.includes("anaphylaxis"))
      return "severe";
    if (lowerText.includes("moderate")) return "moderate";
    if (lowerText.includes("mild")) return "mild";

    return "unknown";
  }

  /**
   * Extract vital signs from search results
   */
  private extractVitalSigns(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes("vital") ||
          content.includes("blood pressure") ||
          content.includes("heart rate") ||
          result.metadata.documentType === "vitals"
        );
      })
      .map((result) => ({
        type: this.extractVitalType(result.excerpt),
        value: this.extractVitalValue(result.excerpt),
        date: result.metadata.date,
        status: this.determineVitalStatus(result.excerpt),
        source: result.metadata.title,
      }));
  }

  /**
   * Extract vital type from text
   */
  private extractVitalType(text: string): string {
    if (!text) return "vital signs";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("blood pressure")) return "blood pressure";
    if (lowerText.includes("heart rate")) return "heart rate";
    if (lowerText.includes("temperature")) return "temperature";
    if (lowerText.includes("weight")) return "weight";

    return "vital signs";
  }

  /**
   * Determine vital status from text
   */
  private determineVitalStatus(text: string): string {
    if (!text) return "unknown";

    const lowerText = text.toLowerCase();
    if (lowerText.includes("normal")) return "normal";
    if (lowerText.includes("high") || lowerText.includes("elevated"))
      return "high";
    if (lowerText.includes("low")) return "low";

    return "recorded";
  }

  /**
   * Extract key findings from search results
   */
  private extractKeyFindings(searchResults: any[]): string[] {
    return searchResults.slice(0, 5).map((result) => {
      const title = result.metadata.title || "Medical finding";
      const excerpt = result.excerpt || "";
      return `${title}: ${excerpt.substring(0, 100)}...`;
    });
  }

  /**
   * Identify risk factors from search results
   */
  private identifyRiskFactors(searchResults: any[]): string[] {
    const riskKeywords = [
      "smoking",
      "diabetes",
      "hypertension",
      "obesity",
      "family history",
    ];
    const foundRisks: string[] = [];

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      riskKeywords.forEach((risk) => {
        if (content.includes(risk) && !foundRisks.includes(risk)) {
          foundRisks.push(risk);
        }
      });
    });

    return foundRisks;
  }

  /**
   * Generate recommendations based on summary sections
   */
  private generateRecommendations(
    sections: any,
    summaryType: string,
  ): string[] {
    const recommendations: string[] = [];

    // Medication-based recommendations
    if (sections.medications?.length > 0) {
      recommendations.push(
        "Review current medications for interactions and effectiveness",
      );
    }

    // Condition-based recommendations
    if (sections.conditions?.length > 0) {
      recommendations.push("Monitor chronic conditions with regular follow-up");
    }

    // Risk factor recommendations
    if (sections.vitals?.some((v: any) => v.status === "high")) {
      recommendations.push(
        "Address elevated vital signs with appropriate interventions",
      );
    }

    // Summary type specific recommendations
    switch (summaryType) {
      case "comprehensive":
        recommendations.push("Comprehensive care plan review recommended");
        break;
      case "recent":
        recommendations.push("Follow up on recent medical events");
        break;
      case "chronic":
        recommendations.push("Optimize chronic disease management");
        break;
      case "acute":
        recommendations.push("Monitor for acute condition resolution");
        break;
    }

    return recommendations.length > 0
      ? recommendations
      : ["Continue routine medical care"];
  }

  /**
   * Find matched symptoms in search results
   */
  private findMatchedSymptoms(searchResults: any[], symptoms: string[]): any[] {
    const matched: any[] = [];

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      symptoms.forEach((symptom) => {
        if (content.includes(symptom.toLowerCase())) {
          matched.push({
            name: symptom,
            description: result.excerpt || "symptom documented",
            date: result.metadata.date || "unknown date",
            source: result.metadata.title,
          });
        }
      });
    });

    return matched;
  }

  /**
   * Find related conditions in search results
   */
  private findRelatedConditions(searchResults: any[]): any[] {
    const conditions: any[] = [];

    searchResults.forEach((result) => {
      const content = (result.excerpt || "").toLowerCase();
      if (content.includes("condition") || content.includes("diagnosis")) {
        conditions.push({
          name: this.extractConditionName(result.excerpt),
          relationship: "documented in medical history",
          source: result.metadata.title,
        });
      }
    });

    return conditions.slice(0, 5);
  }

  /**
   * Assess symptom severity from search results
   */
  private assessSymptomSeverity(searchResults: any[]): any {
    const severityAnalysis = this.analyzeSeverityPatterns(searchResults);

    let overallSeverity = "mild";
    if (severityAnalysis.severe > 0) overallSeverity = "severe";
    else if (severityAnalysis.moderate > 0) overallSeverity = "moderate";

    return {
      overall: overallSeverity,
      breakdown: severityAnalysis,
    };
  }

  /**
   * Extract symptom timeline from search results
   */
  private extractSymptomTimeline(searchResults: any[]): any[] {
    return searchResults
      .filter((result) => result.metadata.date)
      .sort(
        (a, b) =>
          new Date(b.metadata.date).getTime() -
          new Date(a.metadata.date).getTime(),
      )
      .slice(0, 10)
      .map((result) => ({
        date: result.metadata.date,
        description: result.excerpt || "symptom event",
        source: result.metadata.title,
      }));
  }

  /**
   * Find symptom associations in search results
   */
  private findSymptomAssociations(searchResults: any[]): any[] {
    // Simple association analysis
    const associations: any[] = [];

    const commonAssociations = [
      { primary: "headache", secondary: "nausea" },
      { primary: "chest pain", secondary: "shortness of breath" },
      { primary: "fever", secondary: "fatigue" },
    ];

    commonAssociations.forEach((assoc) => {
      const hasAssociation = searchResults.some((result) => {
        const content = (result.excerpt || "").toLowerCase();
        return (
          content.includes(assoc.primary) && content.includes(assoc.secondary)
        );
      });

      if (hasAssociation) {
        associations.push(assoc);
      }
    });

    return associations;
  }

  /**
   * Generate search terms for text-based search (replaces embedding search)
   */
  private async generateQueryEmbedding(query: string): Promise<Float32Array> {
    // Embedding system has been removed - return empty array as placeholder
    // This method is kept for backward compatibility but should be replaced
    // with text-based search in the future
    logger
      .namespace("MCPTools")
      .debug("Embedding search disabled - using text-based fallback", {
        query: query.substring(0, 100),
      });

    return new Float32Array(0);
  }

  /**
   * Search documents by medical terms matching
   */
  private searchDocumentsByTerms(
    documents: (Document | any)[],
    searchTerms: string[],
    options: {
      maxResults: number;
      threshold: number;
      documentTypes?: string[];
    },
  ): Array<{
    document: Document | any;
    relevance: number;
    matchedTerms: string[];
  }> {
    console.group("🔍 Three-Stage Medical Document Search");
    console.log("AI-provided search terms:", searchTerms);
    console.log("Total documents to search:", documents.length);
    console.log("Search options:", options);

    // STAGE 1: Category Filtering
    console.group("🎯 STAGE 1: Category Filtering");
    let stageOneResults = documents;

    if (options.documentTypes && options.documentTypes.length > 0) {
      stageOneResults = documents.filter((doc) => {
        const docCategory = doc.metadata?.category || "unknown";
        const matches = options.documentTypes!.includes(docCategory);
        console.log(
          `📄 ${doc.id}: category="${docCategory}" → ${matches ? "✅ INCLUDED" : "❌ EXCLUDED"}`,
        );
        return matches;
      });
      console.log(
        `📊 Category filtering: ${documents.length} → ${stageOneResults.length} documents`,
      );
    } else {
      console.log(
        "📝 No category filter applied - proceeding with all documents",
      );
    }

    if (stageOneResults.length === 0) {
      console.log("❌ No documents passed category filtering");
      console.groupEnd();
      console.groupEnd();
      return [];
    }
    console.groupEnd();

    // STAGE 2: Term Refinement (Optional)
    console.group("🔬 STAGE 2: Term Refinement");
    let stageTwoResults: Array<{
      document: Document | any;
      relevance: number;
      matchedTerms: string[];
    }> = [];

    // Extract non-temporal search terms for this stage
    const temporalTerms = Object.keys(classificationConfig.temporalTerms).map(
      (t) => t.toLowerCase(),
    );
    const nonTemporalTerms = searchTerms.filter(
      (term) => !temporalTerms.includes(term.toLowerCase()),
    );

    console.log(
      `🏷️ Temporal terms in search: [${searchTerms.filter((term) => temporalTerms.includes(term.toLowerCase())).join(", ")}]`,
    );
    console.log(
      `🔍 Non-temporal terms for refinement: [${nonTemporalTerms.join(", ")}]`,
    );

    if (nonTemporalTerms.length > 0) {
      // Try to refine by medical terms
      for (const doc of stageOneResults) {
        let relevance = 0;
        const matchedTerms: string[] = [];

        // Check medical terms
        if (doc.medicalTerms && doc.medicalTerms.length > 0) {
          for (const searchTerm of nonTemporalTerms) {
            const searchTermLower = searchTerm.toLowerCase();
            for (const docTerm of doc.medicalTerms) {
              const docTermLower = docTerm.toLowerCase();
              if (docTermLower === searchTermLower) {
                relevance += 2;
                matchedTerms.push(docTerm);
              } else if (
                docTermLower.includes(searchTermLower) ||
                searchTermLower.includes(docTermLower)
              ) {
                relevance += 1;
                matchedTerms.push(docTerm);
              }
            }
          }
        }

        // Check tags
        if (doc.metadata?.tags && Array.isArray(doc.metadata.tags)) {
          for (const searchTerm of nonTemporalTerms) {
            const searchTermLower = searchTerm.toLowerCase();
            for (const tag of doc.metadata.tags) {
              const tagLower = tag.toLowerCase();
              if (
                tagLower === searchTermLower ||
                tagLower.includes(searchTermLower)
              ) {
                relevance += 1.5;
                matchedTerms.push(`tag:${tag}`);
              }
            }
          }
        }

        if (relevance > 0) {
          stageTwoResults.push({
            document: doc,
            relevance: Math.min(relevance / (nonTemporalTerms.length * 2), 1),
            matchedTerms,
          });
        }
      }

      if (stageTwoResults.length > 0) {
        console.log(
          `📊 Term refinement: ${stageOneResults.length} → ${stageTwoResults.length} documents (refined by terms)`,
        );
      } else {
        // No term matches found, keep original category-filtered results
        stageTwoResults = stageOneResults.map((doc) => ({
          document: doc,
          relevance: 0.5, // Base relevance for category match
          matchedTerms: [`category:${doc.metadata?.category || "unknown"}`],
        }));
        console.log(
          `📊 Term refinement: No term matches found, keeping all ${stageTwoResults.length} category-filtered documents`,
        );
      }
    } else {
      // No non-temporal terms, keep category results
      stageTwoResults = stageOneResults.map((doc) => ({
        document: doc,
        relevance: 0.5,
        matchedTerms: [`category:${doc.metadata?.category || "unknown"}`],
      }));
      console.log(
        `📊 Term refinement: No non-temporal terms to refine by, keeping all ${stageTwoResults.length} documents`,
      );
    }
    console.groupEnd();

    // STAGE 3: Temporal Processing
    console.group("⏰ STAGE 3: Temporal Processing");
    let finalResults = stageTwoResults;

    const temporalSearchTerms = searchTerms.filter((term) =>
      temporalTerms.includes(term.toLowerCase()),
    );

    if (temporalSearchTerms.length > 0) {
      console.log(
        `🕒 Applying temporal processing for: [${temporalSearchTerms.join(", ")}]`,
      );

      // Add dates to all documents and sort
      const documentsWithDates = finalResults
        .map((result) => {
          const docDate = this.extractDocumentDate(result.document);
          const dynamicTemporal = docDate
            ? this.classifyDocumentByDate(docDate, documents)
            : "historical";
          return {
            ...result,
            docDate,
            dynamicTemporal,
          };
        })
        .sort((a, b) => {
          // Sort by date (newest first), then by relevance
          if (a.docDate && b.docDate) {
            return b.docDate.getTime() - a.docDate.getTime();
          }
          return b.relevance - a.relevance;
        });

      // Apply temporal filtering/boosting
      for (const temporalTerm of temporalSearchTerms) {
        const temporalLower = temporalTerm.toLowerCase();

        if (temporalLower === "latest") {
          // Return the most recent documents (top 20% or at least 1)
          const latestCount = Math.max(
            1,
            Math.floor(documentsWithDates.length * 0.2),
          );
          finalResults = documentsWithDates
            .slice(0, latestCount)
            .map((item) => {
              return {
                document: item.document,
                relevance: Math.min(item.relevance + 0.5, 1), // Boost for being latest
                matchedTerms: [...item.matchedTerms, `temporal:latest`],
              };
            });
          console.log(
            `📅 Applied "latest" filter: returning ${finalResults.length} most recent documents`,
          );
        } else if (temporalLower === "recent") {
          // Filter to last 30 days, or if none, top 50%
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const recentDocs = documentsWithDates.filter(
            (item) => item.docDate && item.docDate >= thirtyDaysAgo,
          );

          if (recentDocs.length > 0) {
            finalResults = recentDocs.map((item) => ({
              document: item.document,
              relevance: Math.min(item.relevance + 0.3, 1),
              matchedTerms: [...item.matchedTerms, `temporal:recent`],
            }));
            console.log(
              `📅 Applied "recent" filter: ${finalResults.length} documents from last 30 days`,
            );
          } else {
            // Fallback to top 50%
            const recentCount = Math.max(
              1,
              Math.floor(documentsWithDates.length * 0.5),
            );
            finalResults = documentsWithDates
              .slice(0, recentCount)
              .map((item) => ({
                document: item.document,
                relevance: Math.min(item.relevance + 0.2, 1),
                matchedTerms: [
                  ...item.matchedTerms,
                  `temporal:recent_fallback`,
                ],
              }));
            console.log(
              `📅 Applied "recent" fallback: ${finalResults.length} most recent documents (no docs in last 30 days)`,
            );
          }
        } else if (temporalLower === "historical") {
          // Return older documents (bottom 50%)
          const historicalStartIndex = Math.floor(
            documentsWithDates.length * 0.5,
          );
          finalResults = documentsWithDates
            .slice(historicalStartIndex)
            .map((item) => ({
              document: item.document,
              relevance: item.relevance, // No boost for historical
              matchedTerms: [...item.matchedTerms, `temporal:historical`],
            }));
          console.log(
            `📅 Applied "historical" filter: ${finalResults.length} older documents`,
          );
        }
      }
    } else {
      console.log(
        "📝 No temporal terms found - no temporal processing applied",
      );
    }

    // Final sorting and limiting
    finalResults.sort((a, b) => b.relevance - a.relevance);
    const limitedResults = finalResults.slice(0, options.maxResults);

    console.log(`📊 Final Results Summary:`);
    console.log(
      `   Stage 1 (Category): ${documents.length} → ${stageOneResults.length}`,
    );
    console.log(
      `   Stage 2 (Terms): ${stageOneResults.length} → ${stageTwoResults.length}`,
    );
    console.log(
      `   Stage 3 (Temporal): ${stageTwoResults.length} → ${finalResults.length}`,
    );
    console.log(
      `   Final (Limited): ${finalResults.length} → ${limitedResults.length}`,
    );
    console.log(
      `   Results:`,
      limitedResults.map((r) => ({
        id: r.document.id,
        title: r.document.content?.title || "No title",
        category: r.document.metadata?.category,
        relevance: r.relevance.toFixed(2),
        matchedTerms: r.matchedTerms,
      })),
    );

    console.groupEnd();
    console.groupEnd();

    return limitedResults;

    for (const doc of documents) {
      console.group(`📄 Examining document: ${doc.id}`);

      // Log the entire document object to understand its structure
      console.log("🔍 Full Document Object:", doc);
      console.log("🔍 Document Keys:", Object.keys(doc));
      console.log("🔍 Content Object:", doc.content);
      console.log("🔍 Metadata Object:", doc.metadata);

      console.log("📋 Document Metadata Summary:");
      console.log(
        `   Title: "${typeof doc.content === "object" && doc.content?.title ? doc.content.title : "No title"}"`,
      );
      console.log(`   Category: "${doc.metadata?.category || "undefined"}"`);
      console.log(
        `   Medical Terms: ${doc.medicalTerms ? `[${doc.medicalTerms.join(", ")}]` : "None"}`,
      );
      console.log(`   Temporal Type: ${doc.temporalType || "None"}`);
      console.log(`   Created: ${(doc as any).created_at || "Unknown"}`);

      // Filter by document category if specified (using metadata.category instead of documentType)
      if (options.documentTypes && options.documentTypes.length > 0) {
        const docCategory = doc.metadata?.category || "unknown";
        console.log(`🔍 Category Filter Check:`);
        console.log(
          `   Requested categories: [${options.documentTypes.join(", ")}]`,
        );
        console.log(`   Document category: "${docCategory}"`);
        console.log(`   Match: ${options.documentTypes.includes(docCategory)}`);

        if (!options.documentTypes.includes(docCategory)) {
          console.log(
            `⏭️  SKIPPED - Document category "${docCategory}" not in filter [${options.documentTypes.join(", ")}]`,
          );
          console.groupEnd();
          continue;
        } else {
          console.log(
            `✅ INCLUDED - Document category "${docCategory}" matches filter`,
          );
        }
      } else {
        console.log(`📝 No category filter applied - all documents included`);
      }

      let relevance = 0;
      const matchedTerms: string[] = [];

      // Check medical terms in document
      if (doc.medicalTerms && doc.medicalTerms.length > 0) {
        console.log("🔬 Matching against document medical terms...");

        for (const searchTerm of searchTerms) {
          const searchTermLower = searchTerm.toLowerCase();
          console.log(`  🔍 Searching for: "${searchTerm}"`);

          for (const docTerm of doc.medicalTerms) {
            const docTermLower = docTerm.toLowerCase();

            // Exact match (highest weight)
            if (docTermLower === searchTermLower) {
              relevance += 2;
              matchedTerms.push(docTerm);
              console.log(`    ✅ EXACT match: "${docTerm}" (score +2)`);
            }
            // Partial match (medium weight)
            else if (
              docTermLower.includes(searchTermLower) ||
              searchTermLower.includes(docTermLower)
            ) {
              relevance += 1;
              matchedTerms.push(docTerm);
              console.log(`    ✅ PARTIAL match: "${docTerm}" (score +1)`);
            }
          }
        }

        if (matchedTerms.length === 0) {
          console.log("    ❌ No medical term matches found");
        }
      } else {
        console.log("❌ Document has no medical terms");
      }

      // Check category matching
      if (doc.metadata?.category) {
        console.log("🏷️ Checking category matching...");
        for (const searchTerm of searchTerms) {
          if (
            searchTerm.toLowerCase() === doc.metadata.category.toLowerCase()
          ) {
            relevance += 2.5; // High boost for category matching
            matchedTerms.push(`category:${doc.metadata.category}`);
            console.log(
              `    ✅ CATEGORY match: "${doc.metadata.category}" (score +2.5)`,
            );
          }
        }
      }

      // Check tags matching
      if (doc.metadata?.tags && Array.isArray(doc.metadata.tags)) {
        console.log("🏷️ Checking tags matching...");
        for (const searchTerm of searchTerms) {
          const searchTermLower = searchTerm.toLowerCase();
          for (const tag of doc.metadata.tags) {
            const tagLower = tag.toLowerCase();
            if (
              tagLower === searchTermLower ||
              tagLower.includes(searchTermLower)
            ) {
              relevance += 1.5; // Medium boost for tag matching
              matchedTerms.push(`tag:${tag}`);
              console.log(`    ✅ TAG match: "${tag}" (score +1.5)`);
            }
          }
        }
      }

      // Boost relevance for temporal matching
      if (doc.temporalType) {
        console.log("⏰ Checking temporal matching...");
        for (const searchTerm of searchTerms) {
          if (searchTerm.toLowerCase() === doc.temporalType.toLowerCase()) {
            relevance += 3; // High boost for temporal matching
            matchedTerms.push(`temporal:${doc.temporalType}`);
            console.log(
              `    ✅ TEMPORAL match: "${doc.temporalType}" (score +3)`,
            );
          }
        }
      }

      // Fallback to text content search if no medical terms match
      if (relevance === 0) {
        console.log("📝 Fallback: searching in content/summary...");
        const content = doc.content?.title || "";
        const summary = doc.metadata?.summary || "";
        const searchText = (content + " " + summary).toLowerCase();

        for (const searchTerm of searchTerms) {
          if (searchText.includes(searchTerm.toLowerCase())) {
            relevance += 0.5;
            matchedTerms.push(`content:${searchTerm}`);
            console.log(`    ✅ CONTENT match: "${searchTerm}" (score +0.5)`);
          }
        }
      }

      // Normalize relevance score (0-1)
      const normalizedRelevance = Math.min(
        relevance / (searchTerms.length * 2),
        1,
      );

      console.log(
        `📊 Final relevance: ${normalizedRelevance.toFixed(3)} (threshold: ${options.threshold})`,
      );
      console.log(`🎯 Matched terms: [${matchedTerms.join(", ")}]`);

      if (normalizedRelevance >= options.threshold) {
        results.push({
          document: doc,
          relevance: normalizedRelevance,
          matchedTerms: [...new Set(matchedTerms)],
        });
        console.log("✅ Document INCLUDED in results");
      } else {
        console.log("❌ Document EXCLUDED (below threshold)");
      }

      console.groupEnd();
    }

    // Sort by relevance (descending) and return top results
    const sortedResults = results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options.maxResults);

    console.log(`📋 Search Results Summary:`);
    console.log(`  Total documents searched: ${documents.length}`);
    console.log(`  Documents above threshold: ${results.length}`);
    console.log(`  Final results returned: ${sortedResults.length}`);
    console.log(
      `  Top results:`,
      sortedResults.map((r) => ({
        id: r.document.id,
        relevance: r.relevance.toFixed(3),
        matchedTerms: r.matchedTerms,
      })),
    );
    console.groupEnd();

    return sortedResults;
  }
}

// Export singleton instance
export const medicalExpertTools = new MedicalExpertTools();

// Secure MCP tools with security validation and audit logging
export const secureMcpTools = {
  searchDocuments: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "searchDocuments",
      "search",
      context,
      params,
      () => medicalExpertTools.searchDocuments(params, context.profileId),
    );
  },

  getAssembledContext: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "getAssembledContext",
      "context_assembly",
      context,
      params,
      () => medicalExpertTools.getAssembledContext(params, context.profileId),
    );
  },

  getProfileData: async (context: MCPSecurityContext, params: any = {}) => {
    return await medicalExpertTools.secureToolCall(
      "getProfileData",
      "profile_access",
      context,
      params,
      () => medicalExpertTools.getProfileData(params, context.profileId),
    );
  },

  queryMedicalHistory: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "queryMedicalHistory",
      "medical_history_query",
      context,
      params,
      () => medicalExpertTools.queryMedicalHistory(params, context.profileId),
    );
  },

  getDocumentById: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "getDocumentById",
      "document_access",
      context,
      params,
      () => medicalExpertTools.getDocumentById(params, context.profileId),
    );
  },

  // Advanced medical tools with security
  getPatientTimeline: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "getPatientTimeline",
      "timeline_access",
      context,
      params,
      () => medicalExpertTools.getPatientTimeline(params, context.profileId),
    );
  },

  analyzeMedicalTrends: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "analyzeMedicalTrends",
      "trend_analysis",
      context,
      params,
      () => medicalExpertTools.analyzeMedicalTrends(params, context.profileId),
    );
  },

  getMedicationHistory: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "getMedicationHistory",
      "medication_access",
      context,
      params,
      () => medicalExpertTools.getMedicationHistory(params, context.profileId),
    );
  },

  getTestResultSummary: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "getTestResultSummary",
      "test_results_access",
      context,
      params,
      () => medicalExpertTools.getTestResultSummary(params, context.profileId),
    );
  },

  identifyMedicalPatterns: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "identifyMedicalPatterns",
      "pattern_analysis",
      context,
      params,
      () =>
        medicalExpertTools.identifyMedicalPatterns(params, context.profileId),
    );
  },

  generateClinicalSummary: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "generateClinicalSummary",
      "clinical_summary",
      context,
      params,
      () =>
        medicalExpertTools.generateClinicalSummary(params, context.profileId),
    );
  },

  searchBySymptoms: async (context: MCPSecurityContext, params: any) => {
    return await medicalExpertTools.secureToolCall(
      "searchBySymptoms",
      "symptom_search",
      context,
      params,
      () => medicalExpertTools.searchBySymptoms(params, context.profileId),
    );
  },

  getSpecialtyRecommendations: async (
    context: MCPSecurityContext,
    params: any,
  ) => {
    return await medicalExpertTools.secureToolCall(
      "getSpecialtyRecommendations",
      "specialty_recommendations",
      context,
      params,
      () =>
        medicalExpertTools.getSpecialtyRecommendations(
          params,
          context.profileId,
        ),
    );
  },
};

// Legacy export for backward compatibility (without security)
export const mcpTools = {
  searchDocuments: (profileId: string, params: any) =>
    medicalExpertTools.searchDocuments(params, profileId),
  getAssembledContext: (profileId: string, params: any) =>
    medicalExpertTools.getAssembledContext(params, profileId),
  getProfileData: (profileId: string, params: any = {}) =>
    medicalExpertTools.getProfileData(params, profileId),
  queryMedicalHistory: (profileId: string, params: any) =>
    medicalExpertTools.queryMedicalHistory(params, profileId),
  getDocumentById: (params: any, profileId?: string) =>
    medicalExpertTools.getDocumentById(params, profileId),
};
