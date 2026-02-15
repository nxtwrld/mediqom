/**
 * Results Aggregator Node
 *
 * Aggregates results from all parallel specialized nodes that were executed
 * via the multi-node-dispatcher. Validates completeness and creates summary.
 */

import type { DocumentProcessingState } from "../state";

/**
 * Aggregates results from all parallel specialized processing nodes
 *
 * This node runs after all Send nodes complete their parallel execution.
 * State reducers have already accumulated the results, so this node:
 * 1. Counts what was processed
 * 2. Validates completeness
 * 3. Creates execution summary
 */
export const resultsAggregatorNode = async (
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> => {
  console.log("📊 Results Aggregator: collecting results from specialized nodes");

  state.emitProgress?.(
    "results_aggregator",
    0,
    "Aggregating results from specialized processing nodes",
  );

  // Count how many sections were actually processed
  // Check each possible result field in the state
  const processedSections: string[] = [];
  const sectionCounts: Record<string, number> = {};

  // Core medical sections
  if (state.signals && Array.isArray(state.signals) && state.signals.length > 0) {
    processedSections.push("signals");
    sectionCounts.signals = state.signals.length;
  }

  if (state.medications && Array.isArray(state.medications) && state.medications.length > 0) {
    processedSections.push("medications");
    sectionCounts.medications = state.medications.length;
  }

  if (state.procedures && Array.isArray(state.procedures) && state.procedures.length > 0) {
    processedSections.push("procedures");
    sectionCounts.procedures = state.procedures.length;
  }

  if (state.imaging && Object.keys(state.imaging || {}).length > 0) {
    processedSections.push("imaging");
  }

  // Check report object sections (from medical-analysis and other nodes)
  if (state.report && typeof state.report === "object") {
    const reportSections = Object.keys(state.report).filter((key) => {
      const value = state.report![key];
      // Include section if it has data (non-null, non-empty array/object)
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return value !== null && value !== undefined;
    });

    for (const section of reportSections) {
      if (!processedSections.includes(section)) {
        processedSections.push(section);
        const value = state.report[section];
        if (Array.isArray(value)) {
          sectionCounts[section] = value.length;
        }
      }
    }
  }

  // Check for errors during processing
  const errors = state.errors || [];
  const failedNodes = errors.map((e) => e.node);

  console.log(
    `✅ Aggregated ${processedSections.length} sections: ${processedSections.join(", ")}`,
  );
  console.log(`📈 Section counts:`, sectionCounts);

  if (failedNodes.length > 0) {
    console.warn(`⚠️ ${failedNodes.length} nodes failed:`, failedNodes);
  }

  state.emitProgress?.(
    "results_aggregator",
    50,
    `Aggregated ${processedSections.length} medical sections`,
  );

  // Calculate execution time if available
  const executionTime = Date.now(); // This will be refined in future iterations

  // Create comprehensive multi-node results summary
  const multiNodeResults = {
    processedNodes: processedSections,
    successfulNodes: processedSections.length,
    failedNodes: failedNodes.length,
    executionTime: 0, // Will be calculated properly in future
    sectionCounts,
    message: `Successfully processed ${processedSections.length} medical sections`,
    errors: failedNodes.length > 0 ? errors : undefined,
  };

  console.log("📋 Multi-node results summary:", multiNodeResults);

  state.emitProgress?.(
    "results_aggregator",
    100,
    `Aggregation complete: ${processedSections.length} sections processed`,
  );

  // Return the aggregated summary
  // Note: Individual section results (signals, medications, etc.) are already in state
  // via reducers - we just add the summary metadata here
  return {
    multiNodeResults,
  };
};
