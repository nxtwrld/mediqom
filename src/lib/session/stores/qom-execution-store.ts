// QOM Execution Store
// Manages the dynamic state of the QOM execution with real-time updates
// Store is null until initialize() is called - no JavaScript execution until needed

import { writable, derived, get } from "svelte/store";
import type { Writable, Readable } from "svelte/store";
import type {
  QOMNode,
  QOMLink,
  QOMExecutionState,
  QOMEvent,
  D3QOMNode,
  D3QOMLink,
  NodeStartedEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  ExpertTriggeredEvent,
  RelationshipAddedEvent,
} from "$components/session/types/qom";
import {
  createLayoutEngine,
  DEFAULT_LAYOUT_CONFIG,
  type DynamicLayoutEngine,
} from "$lib/session/qom/dynamic-layout-engine";
import type {
  LayoutNode,
  LayoutLink,
  LayoutResult,
  NodeAdditionOptions,
} from "$lib/session/qom/dynamic-layout-engine";
import qomConfiguration from "virtual:qom-config";

// Store interfaces
interface QOMStoreState {
  nodes: Map<string, QOMNode>;
  links: Map<string, QOMLink>;
  nodeStates: Map<string, string>; // nodeId -> state
  executionState: QOMExecutionState;
  lastUpdate: number;
  configuration?: any; // Dynamic configuration from /config
  layoutEngine?: DynamicLayoutEngine; // Dynamic layout engine instance
}

// Main store - starts as null until initialize() is called
const qomStore: Writable<QOMStoreState | null> = writable(null);

// Derived store for D3 data format
export const d3QOMData: Readable<{ nodes: D3QOMNode[]; links: D3QOMLink[] }> =
  derived(qomStore, ($qomStore) => {
    // Handle null/uninitialized state
    if (!$qomStore || !$qomStore.nodes) {
      return { nodes: [], links: [] };
    }

    const nodes: D3QOMNode[] = [];
    const links: D3QOMLink[] = [];

    // Convert nodes to D3 format
    $qomStore.nodes.forEach((node) => {
      const d3Node: D3QOMNode = {
        ...node,
        x: node.x || 0,
        y: node.y || 0,
      };
      nodes.push(d3Node);
    });

    // Convert links to D3 format with node references
    $qomStore.links.forEach((link) => {
      const sourceNode = nodes.find((n) => n.id === link.source);
      const targetNode = nodes.find((n) => n.id === link.target);

      if (sourceNode && targetNode) {
        const d3Link: D3QOMLink = {
          ...link,
          source: sourceNode,
          target: targetNode,
        };
        links.push(d3Link);
      }
    });

    return { nodes, links };
  });

// Derived store for execution metrics
export const qomMetrics = derived(qomStore, ($qomStore) => {
  // Handle null/uninitialized state
  if (!$qomStore || !$qomStore.executionState) {
    return {
      totalNodes: 0,
      completedNodes: 0,
      failedNodes: 0,
      activeNodes: 0,
      pendingNodes: 0,
      successRate: 0,
      totalCost: 0,
      totalDuration: 0,
      status: "idle" as const,
    };
  }

  const { executionState } = $qomStore;
  const nodeCount = $qomStore.nodes.size;
  const completedCount = executionState.completedNodes.length;
  const failedCount = executionState.failedNodes.length;
  const activeCount = executionState.activeNodes.length;

  return {
    totalNodes: nodeCount,
    completedNodes: completedCount,
    failedNodes: failedCount,
    activeNodes: activeCount,
    pendingNodes: nodeCount - completedCount - failedCount - activeCount,
    successRate: nodeCount > 0 ? (completedCount / nodeCount) * 100 : 0,
    totalCost: executionState.totalCost,
    totalDuration: executionState.totalDuration,
    status: executionState.status,
  };
});

// Helper functions for internal use

/**
 * Update store state from layout engine result
 */
function updateStoreFromLayoutResult(
  state: QOMStoreState,
  layoutResult: LayoutResult,
) {
  console.log(
    `🔄 Updating store from layout result: ${layoutResult.nodes.length} nodes, ${layoutResult.links.length} links`,
  );

  // Update all nodes with new positions and layers
  layoutResult.nodes.forEach((layoutNode: LayoutNode) => {
    const existingNode = state.nodes.get(layoutNode.id);
    if (existingNode) {
      // Update existing node
      existingNode.x = layoutNode.x;
      existingNode.y = layoutNode.y;
      existingNode.layer = layoutNode.layer;
      existingNode.children = layoutNode.childNodes;
      existingNode.parent = layoutNode.parentNodes[0]; // Use first parent as primary
      console.log(
        `⬆️ Updated existing node: ${layoutNode.id} at layer ${layoutNode.layer}`,
      );
    } else {
      // Create new QOM node from layout node
      const newNode: QOMNode = {
        id: layoutNode.id,
        name: layoutNode.name,
        type: layoutNode.type as QOMNode["type"],
        category: layoutNode.category,
        layer: layoutNode.layer,
        parent: layoutNode.parentNodes[0],
        children: layoutNode.childNodes,
        state: "pending",
        provider: "openai",
        model: "gpt-4",
        x: layoutNode.x,
        y: layoutNode.y,
      };
      state.nodes.set(newNode.id, newNode);
      console.log(
        `➕ Created new node: ${layoutNode.id} at layer ${layoutNode.layer}`,
      );
    }
  });

  // Update links more carefully - don't clear all, just update what's needed
  const existingLinkIds = new Set(state.links.keys());
  const newLinkIds = new Set(layoutResult.links.map((l: LayoutLink) => l.id));

  // Remove links that are no longer in the layout
  existingLinkIds.forEach((linkId) => {
    if (!newLinkIds.has(linkId)) {
      state.links.delete(linkId);
      console.log(`➖ Removed link: ${linkId}`);
    }
  });

  // Add or update links from layout result
  layoutResult.links.forEach((layoutLink: LayoutLink) => {
    const newLink: QOMLink = {
      id: layoutLink.id,
      source: layoutLink.source,
      target: layoutLink.target,
      type: layoutLink.type as QOMLink["type"],
      direction: "forward",
      strength: 0.6,
      active: true,
    };

    const existing = state.links.get(layoutLink.id);
    if (existing) {
      // Update existing link
      Object.assign(existing, newLink);
    } else {
      // Add new link
      state.links.set(newLink.id, newLink);
      console.log(
        `➕ Added link: ${layoutLink.source} -> ${layoutLink.target}`,
      );
    }
  });
}

function recalculateLayoutInternal(
  state: QOMStoreState,
  containerWidth?: number,
  containerHeight?: number,
) {
  if (!state.layoutEngine) return;

  // Update layout engine configuration with actual container dimensions
  if (containerWidth && containerHeight) {
    const dynamicConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      width: containerWidth,
      height: containerHeight,
    };
    state.layoutEngine = createLayoutEngine(dynamicConfig);
  }

  // Convert current nodes and links to layout engine format
  const currentConfig = {
    id: state.configuration?.id || "dynamic",
    description: "Dynamic QOM",
    version: "1.0.0",
    defaultFlow: {
      description: "Dynamic flow",
      nodes: Array.from(state.nodes.values()).map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        category: node.category,
        description: "",
        inputs: node.parent ? [node.parent] : [],
        outputs: node.children,
      })),
      connections: Array.from(state.links.values()).map((link) => ({
        from: link.source,
        to: link.target,
        type: link.type,
      })),
    },
  };

  // Generate new layout
  const layoutResult = state.layoutEngine.generateLayout(currentConfig);

  // Update store with layout result
  updateStoreFromLayoutResult(state, layoutResult);
}

// Store actions
export const qomActions = {
  // Initialize QOM for a session - creates full state
  initialize(sessionId: string) {
    const currentState = get(qomStore);

    // Skip if already initialized for this session
    if (currentState?.executionState.sessionId === sessionId) {
      return;
    }

    // Create full state now
    console.log("🏗️ Initializing QOM Store State");

    const nodes = new Map<string, QOMNode>();
    const links = new Map<string, QOMLink>();

    // Use imported configuration
    const configuration = qomConfiguration;
    console.log("📋 QOM Configuration source:", {
      id: configuration?.id || "unknown",
      hasDefaultFlow: !!configuration?.defaultFlow,
      nodeCount: configuration?.defaultFlow?.nodes?.length || 0,
      configType: typeof configuration,
      firstNodeId: configuration?.defaultFlow?.nodes?.[0]?.id || "none",
    });

    // Log the actual node IDs being loaded
    if (configuration?.defaultFlow?.nodes) {
      console.log(
        "🔍 Node IDs from configuration:",
        configuration.defaultFlow.nodes.map((n: any) => n.id),
      );
    }

    const layoutEngine = createLayoutEngine(DEFAULT_LAYOUT_CONFIG);

    // Generate layout from configuration synchronously
    const { nodes: layoutNodes, links: layoutLinks } =
      layoutEngine.generateLayout(configuration);

    // Convert layout nodes to QOM nodes
    layoutNodes.forEach((layoutNode) => {
      const node: QOMNode = {
        id: layoutNode.id,
        name: layoutNode.name,
        type: layoutNode.type as QOMNode["type"],
        category: layoutNode.category,
        layer: layoutNode.layer,
        parent: layoutNode.parentNodes[0], // Take first parent as primary
        children: layoutNode.childNodes,
        state: "pending",
        provider: "openai",
        model: "gpt-4",
        x: layoutNode.x,
        y: layoutNode.y,
      };
      nodes.set(node.id, node);
    });

    // Convert layout links to QOM links
    layoutLinks.forEach((layoutLink) => {
      const link: QOMLink = {
        id: layoutLink.id,
        source: layoutLink.source,
        target: layoutLink.target,
        type: layoutLink.type as QOMLink["type"],
        direction: "forward",
        strength: 0.6,
        active: true, // Default flow links should be active to show proper arrows
      };
      links.set(link.id, link);
    });

    console.log(
      `✅ QOM Store initialized with ${nodes.size} nodes and ${links.size} links`,
    );

    qomStore.set({
      nodes,
      links,
      nodeStates: new Map(),
      configuration,
      layoutEngine,
      executionState: {
        sessionId,
        qomModelId: configuration.id,
        status: "initializing",
        currentLayer: 0,
        activeNodes: [],
        completedNodes: [],
        failedNodes: [],
        totalNodes: nodes.size,
        totalCost: 0,
        totalDuration: 0,
        successRate: 0,
      },
      lastUpdate: Date.now(),
    });
  },

  // Reset QOM to null state
  reset() {
    qomStore.set(null);
  },

  // Update node state
  updateNodeState(
    nodeId: string,
    newState: QOMNode["state"],
    data?: Partial<QOMNode>,
  ) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      const node = state.nodes.get(nodeId);
      if (node) {
        node.state = newState;
        if (data) {
          Object.assign(node, data);
        }

        // Update execution state
        const execState = state.executionState;

        // Remove from all arrays first
        execState.activeNodes = execState.activeNodes.filter(
          (id) => id !== nodeId,
        );
        execState.completedNodes = execState.completedNodes.filter(
          (id) => id !== nodeId,
        );
        execState.failedNodes = execState.failedNodes.filter(
          (id) => id !== nodeId,
        );

        // Add to appropriate array
        if (newState === "running") {
          execState.activeNodes.push(nodeId);
        } else if (newState === "completed") {
          execState.completedNodes.push(nodeId);
        } else if (newState === "failed") {
          execState.failedNodes.push(nodeId);
        }

        // Update success rate
        const total = state.nodes.size;
        execState.successRate =
          total > 0 ? (execState.completedNodes.length / total) * 100 : 0;
      } else {
        console.warn(
          `⚠️ Node ${nodeId} not found in store when updating state to ${newState}. Available nodes:`,
          Array.from(state.nodes.keys()),
        );

        // Try to find the node in layout engine
        if (state.layoutEngine) {
          console.log("🔍 Checking layout engine for missing node...");
          // Don't attempt auto-creation here as it could cause loops
        }
      }

      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Add a new node dynamically using generic layout engine
  addNode(node: QOMNode, options?: NodeAdditionOptions) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      if (!state.layoutEngine) {
        console.error("Layout engine not available");
        return state;
      }

      // Convert QOM node to layout node
      const layoutNode: LayoutNode = {
        id: node.id,
        name: node.name,
        type: node.type,
        category: node.category,
        x: node.x || 0,
        y: node.y || 0,
        layer: node.layer,
        isParallel: false,
        parentNodes: node.parent ? [node.parent] : [],
        childNodes: node.children || [],
      };

      // Add node using layout engine
      const layoutResult = state.layoutEngine.addNode(layoutNode, options);

      // Update store with layout result
      updateStoreFromLayoutResult(state, layoutResult);

      state.executionState.totalNodes = state.nodes.size;
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Add multiple nodes dynamically
  addNodes(nodes: QOMNode[], options?: NodeAdditionOptions) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      if (!state.layoutEngine) {
        console.error("Layout engine not available");
        return state;
      }

      // Convert QOM nodes to layout nodes
      const layoutNodes: LayoutNode[] = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        category: node.category,
        x: node.x || 0,
        y: node.y || 0,
        layer: node.layer,
        isParallel: node.type === "specialist", // Mark specialists as parallel
        parallelGroup:
          node.category === "ai_generated"
            ? `${node.parent}_experts`
            : undefined,
        parentNodes: node.parent ? [node.parent] : [],
        childNodes: node.children || [],
      }));

      // Add nodes using layout engine
      const layoutResult = state.layoutEngine.addNodes(layoutNodes, options);

      // Update store with layout result
      updateStoreFromLayoutResult(state, layoutResult);

      state.executionState.totalNodes = state.nodes.size;
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Add a new link
  addLink(link: QOMLink) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      state.links.set(link.id, link);

      // Update child/parent relationships if needed
      const sourceId =
        typeof link.source === "string" ? link.source : link.source.id;
      const targetId =
        typeof link.target === "string" ? link.target : link.target.id;
      const sourceNode = state.nodes.get(sourceId);
      const targetNode = state.nodes.get(targetId);
      if (sourceNode && targetNode) {
        if (!sourceNode.children.includes(targetId)) {
          sourceNode.children.push(targetId);
        }
        if (!targetNode.parent || targetNode.parent !== sourceId) {
          // Only update parent if it makes sense in the hierarchy
          // Don't override existing parent relationships
        }
      }

      // Use layout engine to add link
      if (state.layoutEngine) {
        const layoutResult = state.layoutEngine.addLink({
          id: link.id,
          source:
            typeof link.source === "string" ? link.source : link.source.id,
          target:
            typeof link.target === "string" ? link.target : link.target.id,
          type: link.type as any,
        });
        updateStoreFromLayoutResult(state, layoutResult);
      }

      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Activate a link (when relationship becomes active)
  activateLink(linkId: string) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      const link = state.links.get(linkId);
      if (link) {
        link.active = true;
      }
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Update link properties
  updateLink(linkId: string, updates: Partial<QOMLink>) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      const link = state.links.get(linkId);
      if (link) {
        Object.assign(link, updates);
      }
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Process QOM event from SSE
  processEvent(event: QOMEvent) {
    switch (event.type) {
      case "qom_initialized":
        qomStore.update((state) => {
          if (!state) return state; // Guard against null

          // Only clear and rebuild if event contains actual data
          // Otherwise, just update the status to running
          if (event.nodes && event.nodes.length > 0) {
            // Clear and rebuild from event data
            state.nodes.clear();
            state.links.clear();

            event.nodes.forEach((node) => {
              state.nodes.set(node.id, node);
            });

            event.links.forEach((link) => {
              state.links.set(link.id, link);
            });
          }

          // Always update status to running when QOM is initialized
          state.executionState.status = "running";
          state.lastUpdate = Date.now();
          return state;
        });
        break;

      case "node_started":
        const startEvent = event as NodeStartedEvent;
        qomActions.updateNodeState(startEvent.nodeId, "running", {
          startTime: startEvent.timestamp,
        });
        break;

      case "node_completed":
        const completeEvent = event as NodeCompletedEvent;
        qomActions.updateNodeState(completeEvent.nodeId, "completed", {
          endTime: Date.now(),
          duration: completeEvent.duration,
          cost: completeEvent.cost,
          tokenUsage: completeEvent.tokenUsage,
          output: completeEvent.output,
        });

        // Update total metrics
        qomStore.update((state) => {
          if (!state) return state; // Guard against null

          state.executionState.totalCost += completeEvent.cost || 0;
          state.executionState.totalDuration += completeEvent.duration || 0;
          state.lastUpdate = Date.now();
          return state;
        });
        break;

      case "node_failed":
        const failEvent = event as NodeFailedEvent;
        qomActions.updateNodeState(failEvent.nodeId, "failed", {
          error: failEvent.error,
        });
        break;

      case "expert_triggered":
        const triggerEvent = event as ExpertTriggeredEvent;

        // Use the new generic addParallelExpert method instead of individual operations
        qomActions.addParallelExpert(triggerEvent);
        break;

      case "relationship_added":
        const relEvent = event as RelationshipAddedEvent;
        const relLink: QOMLink = {
          id: relEvent.linkId,
          source: relEvent.sourceId,
          target: relEvent.targetId,
          type: relEvent.relationshipType as any,
          direction: relEvent.direction,
          strength: 0.5,
          active: true,
        };
        qomActions.addLink(relLink);
        break;

      case "qom_completed":
        qomStore.update((state) => {
          if (!state) return state; // Guard against null

          state.executionState.status = "completed";
          state.executionState.totalCost = event.totalCost;
          state.executionState.totalDuration = event.totalDuration;
          state.lastUpdate = Date.now();
          return state;
        });
        break;
    }
  },

  // Update node positions (from D3 force simulation)
  updateNodePositions(
    positions: Map<string, { x: number; y: number; fx?: number; fy?: number }>,
  ) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      positions.forEach((pos, nodeId) => {
        const node = state.nodes.get(nodeId);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
          if (pos.fx !== undefined) node.fx = pos.fx;
          if (pos.fy !== undefined) node.fy = pos.fy;
        }
      });
      return state;
    });
  },

  // Fix node position (pin it)
  fixNodePosition(nodeId: string, x: number, y: number) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      const node = state.nodes.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Release node position (unpin it)
  releaseNodePosition(nodeId: string) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      const node = state.nodes.get(nodeId);
      if (node) {
        node.fx = undefined;
        node.fy = undefined;
      }
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Update layout with container dimensions
  updateLayoutDimensions(containerWidth: number, containerHeight: number) {
    qomStore.update((state) => {
      if (!state) return state; // Guard against null

      recalculateLayoutInternal(state, containerWidth, containerHeight);
      state.lastUpdate = Date.now();
      return state;
    });
  },

  // Add parallel expert using generic layout operations
  addParallelExpert(triggerEvent: ExpertTriggeredEvent) {
    console.log(
      `🎯 Adding parallel expert: ${triggerEvent.expertName} (${triggerEvent.expertId})`,
    );

    // Create new expert node
    const expertNode: QOMNode = {
      id: triggerEvent.expertId,
      name: triggerEvent.expertName,
      type: "specialist",
      category: "ai_generated",
      layer: 0, // Will be calculated by layout engine
      parent: triggerEvent.parentId,
      children: ["consensus_merger"],
      state: "pending",
      provider: "openai",
      model: "gpt-4",
      triggerConditions: triggerEvent.triggerConditions,
      triggered: true,
      x: 0,
      y: 0,
    };

    // Use generic addNodes with insertBetween option
    qomActions.addNodes([expertNode], {
      insertBetween: {
        parents: [triggerEvent.parentId],
        children: ["consensus_merger"],
      },
    });
  },
};

// Export stores and actions
export { qomStore };
