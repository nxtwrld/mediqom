/**
 * Dynamic Node Registry
 *
 * Manages registration and conditional execution of specialized processing nodes
 * based on feature detection results.
 */

import type { DocumentProcessingState } from "../state";

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
