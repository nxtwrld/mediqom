/**
 * Sankey Diagram Event Handlers
 * Centralized event handling logic for the Sankey diagram
 */

import type { SankeyNode, SankeyLink } from "../types/visualization";
import * as d3 from "d3";

export interface EventHandlers {
  onNodeClick?: (event: MouseEvent | TouchEvent, node: SankeyNode) => void;
  onNodeHover?: (nodeId: string, isEntering: boolean) => void;
  onLinkClick?: (event: MouseEvent | TouchEvent, link: SankeyLink) => void;
  onLinkHover?: (link: any, isEntering: boolean) => void;
  onCanvasClick?: (event: MouseEvent) => void;
}

/**
 * Create a debounced hover handler to prevent excessive updates
 */
export function createDebouncedHover(
  callback: (id: string, isEntering: boolean) => void,
  delay: number = 100,
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (id: string, isEntering: boolean) => {
    if (timeoutId) clearTimeout(timeoutId);

    if (isEntering) {
      // Immediate hover enter
      callback(id, true);
    } else {
      // Debounced hover exit
      timeoutId = setTimeout(() => {
        callback(id, false);
      }, delay);
    }
  };
}

/**
 * Handle keyboard navigation for accessibility
 */
export class KeyboardNavigationHandler {
  private focusableNodes: SankeyNode[] = [];
  private focusedIndex: number = -1;
  private onFocusChange?: (nodeId: string | null, index: number) => void;
  private onNodeSelect?: (node: SankeyNode) => void;

  constructor(options: {
    onFocusChange?: (nodeId: string | null, index: number) => void;
    onNodeSelect?: (node: SankeyNode) => void;
  }) {
    this.onFocusChange = options.onFocusChange;
    this.onNodeSelect = options.onNodeSelect;
  }

  updateFocusableNodes(nodes: SankeyNode[]) {
    // Order nodes by medical workflow: symptoms -> diagnoses -> treatments
    this.focusableNodes = [
      ...nodes.filter((n) => n.type === "symptom"),
      ...nodes.filter((n) => n.type === "diagnosis"),
      ...nodes.filter((n) => n.type === "treatment"),
      ...nodes.filter(
        (n) => !["symptom", "diagnosis", "treatment"].includes(n.type),
      ),
    ];
  }

  focusNext() {
    if (this.focusableNodes.length === 0) return;

    this.focusedIndex = (this.focusedIndex + 1) % this.focusableNodes.length;
    const node = this.focusableNodes[this.focusedIndex];
    this.onFocusChange?.(node.id, this.focusedIndex);
  }

  focusPrevious() {
    if (this.focusableNodes.length === 0) return;

    this.focusedIndex =
      this.focusedIndex <= 0
        ? this.focusableNodes.length - 1
        : this.focusedIndex - 1;

    const node = this.focusableNodes[this.focusedIndex];
    this.onFocusChange?.(node.id, this.focusedIndex);
  }

  selectFocused() {
    if (
      this.focusedIndex >= 0 &&
      this.focusedIndex < this.focusableNodes.length
    ) {
      const node = this.focusableNodes[this.focusedIndex];
      this.onNodeSelect?.(node);
    }
  }

  clearFocus() {
    this.focusedIndex = -1;
    this.onFocusChange?.(null, -1);
  }

  getFocusedNode(): SankeyNode | null {
    if (
      this.focusedIndex >= 0 &&
      this.focusedIndex < this.focusableNodes.length
    ) {
      return this.focusableNodes[this.focusedIndex];
    }
    return null;
  }
}

/**
 * Path calculation for medical reasoning visualization
 */
export function calculateMedicalPath(
  nodeId: string,
  nodeType: string,
  nodeMap: Map<string, any>,
  forwardMap: Map<string, Set<string>>,
  backwardMap: Map<string, Set<string>>,
): { nodes: Set<string>; links: Set<string> } {
  const connectedNodeIds = new Set<string>();
  const connectedLinkIds = new Set<string>();

  connectedNodeIds.add(nodeId);

  // Helper function to find forward connections
  const findForward = (sourceId: string, allowedTypes: string[]) => {
    const targets = forwardMap.get(sourceId) || new Set();
    targets.forEach((targetId) => {
      const targetNode = nodeMap.get(targetId);
      if (targetNode && allowedTypes.includes(targetNode.type)) {
        connectedNodeIds.add(targetId);
        connectedLinkIds.add(`${sourceId}-${targetId}`);

        // Continue forward if we found a diagnosis and need treatments
        if (targetNode.type === "diagnosis") {
          const treatmentTargets = forwardMap.get(targetId) || new Set();
          treatmentTargets.forEach((treatmentId) => {
            const treatmentNode = nodeMap.get(treatmentId);
            if (treatmentNode && treatmentNode.type === "treatment") {
              connectedNodeIds.add(treatmentId);
              connectedLinkIds.add(`${targetId}-${treatmentId}`);
            }
          });
        }
      }
    });
  };

  // Helper function to find backward connections
  const findBackward = (targetId: string, allowedTypes: string[]) => {
    const sources = backwardMap.get(targetId) || new Set();
    sources.forEach((sourceId) => {
      const sourceNode = nodeMap.get(sourceId);
      if (sourceNode && allowedTypes.includes(sourceNode.type)) {
        connectedNodeIds.add(sourceId);
        connectedLinkIds.add(`${sourceId}-${targetId}`);

        // Continue backward if we found a diagnosis and need symptoms
        if (sourceNode.type === "diagnosis") {
          const symptomSources = backwardMap.get(sourceId) || new Set();
          symptomSources.forEach((symptomId) => {
            const symptomNode = nodeMap.get(symptomId);
            if (symptomNode && symptomNode.type === "symptom") {
              connectedNodeIds.add(symptomId);
              connectedLinkIds.add(`${symptomId}-${sourceId}`);
            }
          });
        }
      }
    });
  };

  // Apply directional logic based on node type
  switch (nodeType) {
    case "symptom":
      // Symptom -> Diagnoses -> Treatments
      findForward(nodeId, ["diagnosis", "treatment"]);
      break;

    case "diagnosis":
      // Symptoms -> Diagnosis -> Treatments
      findBackward(nodeId, ["symptom"]);
      findForward(nodeId, ["treatment"]);
      break;

    case "treatment":
      // Find diagnoses that lead to or are investigated by this treatment
      findBackward(nodeId, ["diagnosis"]);

      // Also find symptoms connected to those diagnoses
      connectedNodeIds.forEach((diagId) => {
        if (diagId !== nodeId) {
          const diagNode = nodeMap.get(diagId);
          if (diagNode && diagNode.type === "diagnosis") {
            findBackward(diagId, ["symptom"]);
          }
        }
      });
      break;
  }

  return { nodes: connectedNodeIds, links: connectedLinkIds };
}

/**
 * Handle node click events with proper event handling and store integration
 */
export function handleNodeClick(
  event: MouseEvent | TouchEvent,
  node: SankeyNode,
  viewerActions: any, // Actions from either global or isolated store instance
  onnodeSelect?: (event: CustomEvent) => void,
) {
  event.preventDefault();
  event.stopPropagation();

  // Use provided viewer actions to select node only
  // Store the original medical data, not the D3 Sankey wrapper
  // Path calculation will be handled by the reactive effect in SessionMoeVisualizer
  viewerActions.selectItem("node", node.id, node.data || node);

  // Also emit the event for backwards compatibility
  onnodeSelect?.(
    new CustomEvent("nodeSelect", {
      detail: {
        node: node.data || node,
        nodeId: node.id,
      },
    }),
  );
}

/**
 * Handle link click events with proper event handling and store integration
 */
export function handleLinkClick(
  event: MouseEvent | TouchEvent,
  link: SankeyLink,
  viewerActions: any, // Actions from either global or isolated store instance
  onlinkSelect?: (event: CustomEvent) => void,
) {
  event.preventDefault();
  event.stopPropagation();

  // Use provided viewer actions to select link
  viewerActions.selectItem("link", `${link.source}-${link.target}`, link);

  // Also emit the event for backwards compatibility
  onlinkSelect?.(
    new CustomEvent("linkSelect", {
      detail: {
        link: link,
        linkId: `${link.source}-${link.target}`,
      },
    }),
  );
}

/**
 * Handle canvas click events with proper selection clearing
 */
export function handleCanvasClick(
  event: MouseEvent,
  viewerActions: any, // Actions from either global or isolated store instance
) {
  // Ignore clicks that were part of a drag/zoom operation
  if (event.defaultPrevented) return;

  // Only clear selection if clicking on the SVG itself (not nodes or links)
  const target = event.target as SVGElement;
  const isClickableElement =
    target.classList?.contains("node-html") ||
    target.classList?.contains("link") ||
    target.tagName === "path" ||
    target.closest(".node-html") ||
    target.closest(".link");

  if (!isClickableElement) {
    // Clear all selections using the provided viewer actions
    viewerActions.clearSelection();
  }
}

/**
 * Handle node hover events with proper highlighting
 */
export function handleNodeHover(
  nodeId: string,
  isEntering: boolean,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null,
  allNodeArrays: any[],
  viewerActions: any, // Actions from either global or isolated store instance
) {
  if (!svg) return;

  // Use provided hover system
  if (!isEntering) {
    viewerActions.setHoveredItem(null);
    // Explicitly remove hover classes and reset all opacity states
    svg.selectAll(".node-html.hovered").classed("hovered", false);
    svg.selectAll(".link.hovered").classed("hovered", false);

    // Force reset all node states to default
    svg
      .selectAll(".node-html")
      .classed("dimmed", false)
      .classed("highlighted", false);

    return;
  }

  // Find the complete node object from allNodeArrays
  const nodeObject = allNodeArrays.find((n) => n.id === nodeId);
  if (nodeObject) {
    viewerActions.setHoveredItem("node", nodeId, nodeObject.data || nodeObject);
  }
}

/**
 * Handle link hover events with tooltip display
 */
export function handleLinkHover(
  link: any,
  isEntering: boolean,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null,
  tooltipData: any,
  viewerActions: any, // Actions from either global or isolated store instance
  container?: HTMLElement,
) {
  // Use provided hover system
  if (!isEntering) {
    viewerActions.setHoveredItem(null);
    tooltipData.visible = false;
    // Explicitly remove hover classes and reset all states
    if (svg) {
      svg.selectAll(".link.hovered").classed("hovered", false);
      svg.selectAll(".node-html.hovered").classed("hovered", false);

      // Force reset all node states to default
      svg
        .selectAll(".node-html")
        .classed("dimmed", false)
        .classed("highlighted", false);
    }
    return;
  }

  // Set hovered item for consistency
  const linkId = `${typeof link.source === "object" ? link.source.id : link.source}-${typeof link.target === "object" ? link.target.id : link.target}`;
  viewerActions.setHoveredItem("link", linkId, link);

  // Build tooltip content
  const sourceNode = typeof link.source === "object" ? link.source : null;
  const targetNode = typeof link.target === "object" ? link.target : null;

  if (sourceNode && targetNode) {
    // Extract relationship data from link or nodes
    const relationshipType = link.relationshipType || link.type || "related_to";
    const strength = link.confidence || link.value || 0.5;
    const strengthPercent = Math.round(strength * 100);

    const relationshipLabel =
      relationshipType.charAt(0).toUpperCase() + relationshipType.slice(1);

    tooltipData.title = `${sourceNode.name} → ${targetNode.name}`;
    tooltipData.subtitle = `${relationshipLabel} (${strengthPercent}% confidence)`;
    tooltipData.description = `This relationship was identified${link.source_context ? ` from ${link.source_context}` : ""}.`;

    // Position tooltip
    if (container) {
      const sankeyMidX = (sourceNode.x1 + targetNode.x0) / 2;
      const sankeyMidY = (link.y0 + link.y1) / 2;

      // Get container bounds for positioning
      const containerRect = container.getBoundingClientRect();

      // Basic positioning (can be refined)
      const tooltipWidth = 300;
      const tooltipHeight = 120;

      // Clamp to container bounds
      const clampedX = Math.max(
        10, // Min left margin
        Math.min(
          sankeyMidX - tooltipWidth / 2,
          containerRect.width - tooltipWidth - 10,
        ),
      );

      const clampedY = Math.max(
        10, // Min top margin
        Math.min(
          sankeyMidY - tooltipHeight - 20,
          containerRect.height - tooltipHeight - 10,
        ), // 20px above link
      );

      tooltipData.x = clampedX;
      tooltipData.y = clampedY;
      tooltipData.visible = true;
    }
  }
}
