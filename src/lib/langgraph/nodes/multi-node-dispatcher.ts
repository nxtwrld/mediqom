/**
 * Multi-Node Dispatcher
 *
 * Selects and executes specialized processing nodes based on feature detection results.
 * This is a cleaner implementation that integrates better with LangGraph compared to
 * the old orchestrator, using the node registry for dynamic node selection and
 * executing nodes directly with proper state management.
 */

import type { DocumentProcessingState } from "../state";
import { nodeRegistry } from "../registry/node-registry";
import {
  UniversalNodeFactory,
  NODE_CONFIGURATIONS,
} from "../factories/universal-node-factory";

/**
 * Bridge NODE_CONFIGURATIONS (factory) → nodeRegistry (registry).
 * Called once before first use to ensure nodes are available for selection.
 */
let nodesRegistered = false;
function ensureNodesRegistered(): void {
  if (nodesRegistered) return;
  nodesRegistered = true;

  for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
    nodeRegistry.registerNode({
      nodeName: config.nodeName,
      description: config.description,
      featureDetectionTriggers: config.triggers,
      priority: config.priority,
      nodeFunction: UniversalNodeFactory.createNode(nodeId),
    });
  }
  console.log(
    `📝 Registered ${Object.keys(NODE_CONFIGURATIONS).length} nodes from factory into registry`,
  );
}

/**
 * Dispatcher node that selects and executes specialized processing nodes
 *
 * Note: LangGraph v0.0.26 doesn't support Send API yet, so we execute nodes
 * directly here but with better integration than the old orchestrator.
 */
export const multiNodeDispatcherNode = async (
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> => {
  console.log("🎯 Multi-node dispatcher: analyzing feature detection results");

  // Ensure all factory-configured nodes are registered in the registry
  ensureNodesRegistered();

  // Check if we have feature detection results
  if (!state.featureDetectionResults) {
    console.warn(
      "⚠️ No feature detection results - skipping multi-node dispatch",
    );
    return {
      multiNodeResults: {
        processedNodes: [],
        executionTime: 0,
        message: "No features detected - skipping specialized processing",
      },
    };
  }

  // Emit initial progress
  state.emitProgress?.(
    "multi_node_dispatcher",
    0,
    "Selecting specialized processing nodes",
  );

  // Use existing node registry to select appropriate nodes based on features
  const selectedNodes = nodeRegistry.selectNodes(state.featureDetectionResults);

  if (selectedNodes.length === 0) {
    console.log(
      "📝 No specialized nodes selected - document may not contain processable medical sections",
    );

    state.emitProgress?.(
      "multi_node_dispatcher",
      100,
      "No specialized processing required",
    );

    return {
      multiNodeResults: {
        processedNodes: [],
        executionTime: 0,
        message: "No specialized processing required",
      },
    };
  }

  console.log(
    `📤 Executing ${selectedNodes.length} nodes: ${selectedNodes.map((n) => n.nodeName).join(", ")}`,
  );

  state.emitProgress?.(
    "multi_node_dispatcher",
    10,
    `Executing ${selectedNodes.length} specialized nodes in parallel`,
  );

  // Execute all selected nodes in parallel
  // Use existing registry's parallel execution capability
  const executionPlan = nodeRegistry.createExecutionPlan(selectedNodes);

  console.log(
    `📋 Execution plan: ${executionPlan.totalNodes} nodes in ${executionPlan.parallelGroups.length} groups`,
  );

  const startTime = Date.now();
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Execute nodes with progress tracking
  const processedState = await nodeRegistry.executeNodes(
    executionPlan,
    state,
    (progress, message) => {
      // Map execution progress to 10-90% of dispatcher progress
      const dispatcherProgress = 10 + progress * 0.8;
      state.emitProgress?.("multi_node_dispatcher", dispatcherProgress, message);
    },
    { jobId: state.jobId, runTimestamp },
  );

  const executionTime = Date.now() - startTime;

  state.emitProgress?.(
    "multi_node_dispatcher",
    100,
    `Completed ${selectedNodes.length} specialized nodes in ${executionTime}ms`,
  );

  console.log(
    `✅ Dispatcher executed ${selectedNodes.length} nodes in ${executionTime}ms`,
  );

  // Return the processed state with all node results
  // Note: Individual node results are already in processedState
  // We just add execution metadata
  return {
    ...processedState,
    multiNodeResults: {
      processedNodes: executionPlan.executionOrder,
      executionTime,
      parallelGroups: executionPlan.parallelGroups.length,
      message: `Executed ${selectedNodes.length} specialized nodes`,
    },
  };
};
