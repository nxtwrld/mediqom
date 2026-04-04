/**
 * Sankey Diagram Helper Functions
 * Utility functions for text processing, styling, and other helpers
 */

import { mount, unmount } from "svelte";
import type { SankeyNode } from "../types/visualization";
import SymptomNode from "../nodes/SymptomNode.svelte";
import DiagnosisNode from "../nodes/DiagnosisNode.svelte";
import TreatmentNode from "../nodes/TreatmentNode.svelte";

/**
 * Truncate text to fit within specified length
 */
export function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

/**
 * Calculate link strength class based on width
 */
export function getLinkStrengthClass(width: number): string {
  if (width >= 25) return "strength-maximum";
  if (width >= 12) return "strength-very-strong";
  if (width >= 8) return "strength-strong";
  if (width >= 4) return "strength-moderate";
  if (width >= 2) return "strength-weak";
  return "strength-minimal";
}

/**
 * Create HTML content for node based on its type and data using proper Svelte components
 * This maintains all the styling from src/css/session.css
 */
export function createNodeComponent(
  node: SankeyNode,
  _selectedNodeId: string | null,
  isMobile: boolean,
  nodeComponents: Map<string, { component: any; container: HTMLDivElement }>,
): string {
  let nodeComponent;
  const nodeContainer = document.createElement("div");

  switch (node.type) {
    case "symptom":
      nodeComponent = mount(SymptomNode, {
        target: nodeContainer,
        props: {
          node,
          symptom: node.data as any,
          isMobile,
        },
      });
      break;

    case "diagnosis":
      nodeComponent = mount(DiagnosisNode, {
        target: nodeContainer,
        props: {
          node,
          diagnosis: node.data as any,
          isMobile,
        },
      });
      break;

    case "treatment":
      nodeComponent = mount(TreatmentNode, {
        target: nodeContainer,
        props: {
          node,
          treatment: node.data as any,
          isMobile,
        },
      });
      break;

    default:
      // Fallback for action nodes or unknown types
      const escapedName = truncateText(node.name, isMobile ? 20 : 25)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      nodeContainer.innerHTML = `
                <div class="sankey-node" style="background-color: ${node.color};">
                    <div class="node-content">
                        <div class="node-title">${escapedName}</div>
                    </div>
                </div>
            `;
      break;
  }

  // Store component reference for cleanup
  nodeComponents.set(node.id, {
    component: nodeComponent,
    container: nodeContainer,
  });

  return nodeContainer.innerHTML;
}

/**
 * Clean up mounted Svelte components
 */
export function cleanupNodeComponents(
  nodeComponents: Map<string, { component: any; container: HTMLDivElement }>,
) {
  if (!nodeComponents || typeof nodeComponents.forEach !== "function") {
    return;
  }

  for (const [nodeId, { component, container }] of nodeComponents) {
    if (component) {
      try {
        unmount(component);
      } catch (error) {
        // Ignore unmount errors - component may already be unmounted
      }
    }
  }
  nodeComponents.clear();
}

/**
 * Calculate column positions for button placement
 */
export function calculateColumnPositions(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
): {
  symptomColumn: { centerX: number; bottomY: number } | null;
  diagnosisColumn: { centerX: number; bottomY: number } | null;
  treatmentColumn: { centerX: number; bottomY: number } | null;
} {
  if (!svg) {
    return {
      symptomColumn: null,
      diagnosisColumn: null,
      treatmentColumn: null,
    };
  }

  const allNodes = svg.selectAll(".node").data();

  if (!allNodes || allNodes.length === 0) {
    return {
      symptomColumn: null,
      diagnosisColumn: null,
      treatmentColumn: null,
    };
  }

  const symptomNodes = allNodes.filter((n: any) => n.type === "symptom");
  const diagnosisNodes = allNodes.filter((n: any) => n.type === "diagnosis");
  const treatmentNodes = allNodes.filter((n: any) => n.type === "treatment");

  const calculateColumnInfo = (nodes: any[]) => {
    if (!nodes.length) return null;

    const positions = nodes.map((n) => ({
      x: (n.x0 + n.x1) / 2, // Center X of node
      bottom: n.y1, // Bottom Y of node
    }));

    return {
      centerX: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      bottomY: Math.max(...positions.map((p) => p.bottom)),
    };
  };

  return {
    symptomColumn: calculateColumnInfo(symptomNodes),
    diagnosisColumn: calculateColumnInfo(diagnosisNodes),
    treatmentColumn: calculateColumnInfo(treatmentNodes),
  };
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}

/**
 * Throttle function for scroll/resize events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func.apply(null, args);
    }
  };
}
