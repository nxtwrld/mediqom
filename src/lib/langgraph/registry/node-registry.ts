/**
 * Dynamic Node Registry
 *
 * Manages registration and conditional execution of specialized processing nodes
 * based on feature detection results.
 */

import type { DocumentProcessingState } from "../state";
import { saveNodeResult } from "$lib/import.server/debug-output";

export interface NodeDefinition {
  nodeName: string;
  description: string;
  featureDetectionTriggers: string[];
  priority: number; // 1-5, where 1 is highest priority
  dependencies?: string[]; // Other nodes this depends on
  nodeFunction: (
    state: DocumentProcessingState,
  ) => Promise<Partial<DocumentProcessingState>>;
}

export interface NodeExecutionPlan {
  parallelGroups: NodeDefinition[][];
  executionOrder: string[];
  totalNodes: number;
}

export class NodeRegistry {
  private static instance: NodeRegistry;
  private nodes: Map<string, NodeDefinition> = new Map();

  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  /**
   * Register a processing node
   */
  registerNode(definition: NodeDefinition): void {
    this.nodes.set(definition.nodeName, definition);
    console.log(`📝 Registered processing node: ${definition.nodeName}`);
  }

  /**
   * Get all registered nodes
   */
  getAllNodes(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get a specific node by name
   */
  getNode(nodeName: string): NodeDefinition | undefined {
    return this.nodes.get(nodeName);
  }

  /**
   * Determine which nodes should execute based on feature detection results
   */
  selectNodes(featureDetectionResults: any): NodeDefinition[] {
    const selectedNodes: NodeDefinition[] = [];

    for (const node of this.nodes.values()) {
      if (this.shouldNodeExecute(node, featureDetectionResults)) {
        selectedNodes.push(node);
        console.log(`✅ Selected node for execution: ${node.nodeName}`);
      } else {
        console.log(
          `⏭️ Skipping node: ${node.nodeName} (features not detected)`,
        );
      }
    }

    return selectedNodes;
  }

  /**
   * Create an execution plan for selected nodes with dependency resolution
   */
  createExecutionPlan(selectedNodes: NodeDefinition[]): NodeExecutionPlan {
    // Sort by priority (lower number = higher priority)
    const sortedNodes = [...selectedNodes].sort(
      (a, b) => a.priority - b.priority,
    );

    // Group nodes for parallel execution
    const parallelGroups: NodeDefinition[][] = [];
    const executionOrder: string[] = [];

    // Simple grouping by priority for now
    // In the future, we can implement more sophisticated dependency resolution
    const priorityGroups = new Map<number, NodeDefinition[]>();

    for (const node of sortedNodes) {
      if (!priorityGroups.has(node.priority)) {
        priorityGroups.set(node.priority, []);
      }
      priorityGroups.get(node.priority)!.push(node);
    }

    // Convert priority groups to parallel execution groups
    for (const [priority, nodes] of Array.from(priorityGroups.entries()).sort(
      ([a], [b]) => a - b,
    )) {
      parallelGroups.push(nodes);
      for (const node of nodes) {
        executionOrder.push(node.nodeName);
      }
    }

    const plan: NodeExecutionPlan = {
      parallelGroups,
      executionOrder,
      totalNodes: selectedNodes.length,
    };

    console.log(`📋 Created execution plan:`, {
      totalNodes: plan.totalNodes,
      parallelGroups: plan.parallelGroups.length,
      executionOrder: plan.executionOrder,
    });

    return plan;
  }

  /**
   * Execute nodes according to the execution plan
   */
  async executeNodes(
    plan: NodeExecutionPlan,
    initialState: DocumentProcessingState,
    progressCallback?: (progress: number, message: string) => void,
    debugContext?: { jobId?: string; runTimestamp?: string },
  ): Promise<DocumentProcessingState> {
    let currentState = { ...initialState };
    let completedNodes = 0;

    console.log(
      `🚀 Starting execution of ${plan.totalNodes} nodes in ${plan.parallelGroups.length} parallel groups`,
    );

    for (
      let groupIndex = 0;
      groupIndex < plan.parallelGroups.length;
      groupIndex++
    ) {
      const group = plan.parallelGroups[groupIndex];

      console.log(
        `🔄 Executing parallel group ${groupIndex + 1}/${plan.parallelGroups.length} with ${group.length} nodes`,
      );

      // Execute all nodes in this group in parallel
      const groupPromises = group.map(async (node) => {
        try {
          console.log(`⚡ Starting ${node.nodeName}...`);
          const nodeResult = await node.nodeFunction(currentState);
          console.log(`✅ Completed ${node.nodeName}`);

          // Save per-node debug output
          if (debugContext?.jobId) {
            saveNodeResult(
              debugContext.jobId,
              node.nodeName,
              nodeResult,
              debugContext.runTimestamp,
            );
          }

          return { nodeName: node.nodeName, result: nodeResult, success: true };
        } catch (error) {
          console.error(`❌ Failed ${node.nodeName}:`, error);
          return {
            nodeName: node.nodeName,
            result: {
              errors: [
                ...(currentState.errors || []),
                {
                  node: node.nodeName,
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: new Date().toISOString(),
                },
              ],
            },
            success: false,
          };
        }
      });

      // Wait for all nodes in this group to complete
      const groupResults = await Promise.all(groupPromises);

      // Merge results into current state
      for (const { nodeName, result, success } of groupResults) {
        currentState = { ...currentState, ...result };
        completedNodes++;

        // Update progress
        const progress = Math.round((completedNodes / plan.totalNodes) * 100);
        progressCallback?.(
          progress,
          `Completed ${nodeName} (${completedNodes}/${plan.totalNodes})`,
        );

        if (success) {
          console.log(`✅ Successfully merged results from ${nodeName}`);
        } else {
          console.log(`⚠️ Merged error results from ${nodeName}`);
        }
      }

      console.log(
        `✅ Completed parallel group ${groupIndex + 1}/${plan.parallelGroups.length}`,
      );
    }

    console.log(`🎉 Completed execution of all ${plan.totalNodes} nodes`);
    return currentState;
  }

  /**
   * Check if a node should execute based on feature detection
   */
  private shouldNodeExecute(
    node: NodeDefinition,
    featureDetectionResults: any,
  ): boolean {
    if (!featureDetectionResults) return false;

    return node.featureDetectionTriggers.some((trigger) => {
      const result = featureDetectionResults[trigger];
      return result === true;
    });
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(plan: NodeExecutionPlan): any {
    const nodesByPriority = new Map<number, number>();

    for (const group of plan.parallelGroups) {
      for (const node of group) {
        nodesByPriority.set(
          node.priority,
          (nodesByPriority.get(node.priority) || 0) + 1,
        );
      }
    }

    return {
      totalNodes: plan.totalNodes,
      parallelGroups: plan.parallelGroups.length,
      maxParallelNodes: Math.max(...plan.parallelGroups.map((g) => g.length)),
      averageParallelNodes: plan.totalNodes / plan.parallelGroups.length,
      nodesByPriority: Object.fromEntries(nodesByPriority),
    };
  }

  /**
   * Clear all registered nodes (useful for testing)
   */
  clear(): void {
    this.nodes.clear();
    console.log("🧹 Cleared all registered nodes");
  }
}

/**
 * Global instance for easy access
 */
export const nodeRegistry = NodeRegistry.getInstance();
