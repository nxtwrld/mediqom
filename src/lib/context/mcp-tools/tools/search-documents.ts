/**
 * Search Documents Tool
 *
 * Implements the three-stage document search: category filtering, term refinement, temporal processing
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import { classificationConfig } from "$lib/config/classification";
import type { Document } from "$lib/documents/types.d";

export class SearchDocumentsTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    const categoryList = this.getCategoryDescriptions();
    const temporalTerms = this.getTemporalTerms();

    return {
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
    };
  }

  async execute(params: any, profileId: string): Promise<MCPToolResult> {
    const currentUser = await this.getCurrentUser();

    // Get all user documents using profileId (not currentUser.id)
    const documentsStore = await this.getUserDocuments(profileId);
    const allDocuments = documentsStore;

    console.log(`🔍 Document Lookup Debug:`);
    console.log(`   User ID: ${currentUser.id}`);
    console.log(`   Profile ID: ${profileId}`);
    console.log(`   Using Profile ID for document lookup...`);
    console.log(
      `📊 Documents Loading Debug: Total documents loaded for user ${profileId}: ${allDocuments.length}`,
    );

    // Validate required parameters
    if (
      !params.terms ||
      !Array.isArray(params.terms) ||
      params.terms.length === 0
    ) {
      return {
        content: [
          {
            type: "text",
            text: "Error: search terms are required and must be an array",
          },
        ],
        isError: true,
      };
    }

    // Set defaults
    const searchOptions = {
      maxResults: params.limit || 10,
      threshold: params.threshold || 0.6,
      documentTypes: params.documentTypes || undefined,
    };

    // Perform the three-stage search
    const searchResults = this.searchDocumentsByTerms(
      allDocuments,
      params.terms,
      searchOptions,
    );

    // Format results
    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No documents found matching the search terms: ${params.terms.join(", ")}. Please try different or more general terms.`,
          },
        ],
      };
    }

    // Build response text
    let responseText = `Found ${searchResults.length} relevant documents:\n\n`;

    searchResults.forEach((result, index) => {
      const doc = result.document;
      const title =
        typeof doc.content === "object" && doc.content?.title
          ? doc.content.title
          : `Document ${doc.id}`;

      responseText += `${index + 1}. **${title}**\n`;
      responseText += `   - Category: ${doc.metadata?.category || "Unknown"}\n`;
      responseText += `   - Date: ${doc.metadata?.date || "Unknown"}\n`;
      responseText += `   - Relevance: ${(result.relevance * 100).toFixed(1)}%\n`;
      responseText += `   - Matched terms: ${result.matchedTerms.join(", ")}\n`;

      // Include matched signal data so the AI can use actual values
      const hasSignalMatch = result.matchedTerms.some((t) => t.startsWith("signal:"));
      if (hasSignalMatch && doc.content?.signals) {
        const signalsArray = Array.isArray(doc.content.signals)
          ? doc.content.signals
          : doc.content.signals?.signals && Array.isArray(doc.content.signals.signals)
            ? doc.content.signals.signals
            : [];
        const matchedSignalNames = result.matchedTerms
          .filter((t) => t.startsWith("signal:"))
          .map((t) => t.replace("signal:", "").toLowerCase());
        const matchedSignals = signalsArray.filter((s: any) =>
          matchedSignalNames.some((name) =>
            (s.signal || s.test || "").toLowerCase().includes(name) ||
            name.includes((s.signal || s.test || "").toLowerCase())
          )
        );
        if (matchedSignals.length > 0) {
          responseText += `   - Signal Data:\n`;
          for (const s of matchedSignals) {
            const name = s.signal || s.test || "Unknown";
            const val = s.value ?? "N/A";
            const unit = s.unit || "";
            const ref = s.reference || "";
            responseText += `     • ${name}: ${val} ${unit}${ref ? ` (ref: ${ref})` : ""}\n`;
          }
        }
      }

      if (params.includeContent && result.relevance > 0.8 && doc.content) {
        const contentPreview =
          typeof doc.content === "string"
            ? doc.content.substring(0, 200) + "..."
            : doc.content.summary || "Content available";
        responseText += `   - Preview: ${contentPreview}\n`;
      }

      responseText += "\n";
    });

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  }

  /**
   * Generate category descriptions from classification config
   */
  private getCategoryDescriptions(): string {
    const categories = Object.values(classificationConfig.categories)
      .map((cat) => `"${cat.id}"`)
      .join(", ");
    return categories;
  }

  /**
   * Generate temporal term descriptions from classification config
   */
  private getTemporalTerms(): string {
    const terms = Object.keys(classificationConfig.temporalTerms).join('", "');
    return `"${terms}"`;
  }

  /**
   * Search documents using three-stage approach: category filtering, term refinement, temporal processing
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

        // Check signal names (e.g. "Glucose", "Cholesterol") stored in metadata.signals
        if (doc.metadata?.signals && Array.isArray(doc.metadata.signals)) {
          for (const searchTerm of nonTemporalTerms) {
            const searchTermLower = searchTerm.toLowerCase();
            for (const signalName of doc.metadata.signals) {
              const signalLower = (signalName as string).toLowerCase();
              if (signalLower === searchTermLower) {
                relevance += 3; // High relevance for exact signal match
                matchedTerms.push(`signal:${signalName}`);
              } else if (
                signalLower.includes(searchTermLower) ||
                searchTermLower.includes(signalLower)
              ) {
                relevance += 2;
                matchedTerms.push(`signal:${signalName}`);
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
  }
}
