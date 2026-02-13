// QOM Data Transformer
// Transforms QOM configuration and state to D3-compatible format

import type {
  QOMNode,
  QOMLink,
  D3QOMNode,
  D3QOMLink,
} from "$components/session/types/qom";
import qomConfig from "$lib/config/qom-default.json";
import {
  QOM_VISUAL_CONFIG,
  createForceSimulation,
} from "$components/session/config/qom-visual-config";

// Calculate initial positions for nodes based on their layer
export function calculateInitialPositions(
  nodes: QOMNode[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const layerGroups = new Map<number, QOMNode[]>();

  // Group nodes by layer
  nodes.forEach((node) => {
    const layer = node.layer;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(node);
  });

  // Calculate positions for each layer
  const maxLayer = Math.max(...Array.from(layerGroups.keys()));
  const layerWidth =
    (width -
      QOM_VISUAL_CONFIG.layout.margins.left -
      QOM_VISUAL_CONFIG.layout.margins.right) /
    (maxLayer + 2);
  const usableHeight =
    height -
    QOM_VISUAL_CONFIG.layout.margins.top -
    QOM_VISUAL_CONFIG.layout.margins.bottom;

  layerGroups.forEach((layerNodes, layer) => {
    const nodeCount = layerNodes.length;
    const nodeSpacing = Math.min(
      QOM_VISUAL_CONFIG.layout.nodeSpacing,
      usableHeight / (nodeCount + 1),
    );

    // Sort nodes by category for better grouping
    layerNodes.sort((a, b) => a.category.localeCompare(b.category));

    layerNodes.forEach((node, index) => {
      const x =
        QOM_VISUAL_CONFIG.layout.margins.left + layerWidth * (layer + 1);
      const y =
        QOM_VISUAL_CONFIG.layout.margins.top +
        nodeSpacing * (index + 1) +
        (usableHeight - nodeSpacing * nodeCount) / 2;

      positions.set(node.id, { x, y });
    });
  });

  return positions;
}

// Transform nodes to D3 format with positions
export function transformNodesToD3(
  nodes: Map<string, QOMNode>,
  width: number,
  height: number,
): D3QOMNode[] {
  const nodeArray = Array.from(nodes.values());
  const positions = calculateInitialPositions(nodeArray, width, height);

  return nodeArray.map((node, index) => {
    const pos = positions.get(node.id) || { x: width / 2, y: height / 2 };

    const d3Node: D3QOMNode = {
      ...node,
      index,
      x: node.x || pos.x,
      y: node.y || pos.y,
      fx: node.fx, // Fixed position if node is pinned
      fy: node.fy,
      vx: 0,
      vy: 0,
    };

    return d3Node;
  });
}

// Transform links to D3 format with node references
export function transformLinksToD3(
  links: Map<string, QOMLink>,
  nodes: D3QOMNode[],
): D3QOMLink[] {
  const d3Links: D3QOMLink[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  links.forEach((link, index) => {
    const sourceNode = nodeMap.get(
      typeof link.source === "string" ? link.source : link.source.id,
    );
    const targetNode = nodeMap.get(
      typeof link.target === "string" ? link.target : link.target.id,
    );

    if (sourceNode && targetNode) {
      const d3Link: D3QOMLink = {
        ...link,
        source: sourceNode,
        target: targetNode,
        index: d3Links.length,
      };
      d3Links.push(d3Link);
    }
  });

  return d3Links;
}

// Create bidirectional refinement links
export function createRefinementLinks(nodes: D3QOMNode[]): D3QOMLink[] {
  const refinementLinks: D3QOMLink[] = [];

  // Create refinement links from sub-experts back to parents
  nodes.forEach((node) => {
    if (node.parent && node.state === "completed") {
      const parentNode = nodes.find((n) => n.id === node.parent);
      if (parentNode) {
        refinementLinks.push({
          id: `${node.id}_refines_${node.parent}`,
          source: node,
          target: parentNode,
          type: "refines",
          direction: "reverse",
          strength: 0.4,
          active: true,
          animated: true,
          particleDirection: "reverse",
        });
      }
    }
  });

  return refinementLinks;
}

// Check if an expert should be triggered based on conditions
export function shouldTriggerExpert(
  symptoms: string[],
  context: Record<string, any>,
  expertCategory: string,
): boolean {
  // Check symptom triggers
  for (const symptom of symptoms) {
    const normalizedSymptom = symptom.toLowerCase().replace(/\s+/g, "_");
    const mappedExperts =
      (qomConfig.triggerConditions.symptomMapping as any)[normalizedSymptom] || [];
    if (mappedExperts.includes(expertCategory)) {
      return true;
    }
  }

  // Check context triggers
  for (const [key, value] of Object.entries(context)) {
    const mappedExperts = (qomConfig.triggerConditions.contextMapping as any)[key] || [];
    if (mappedExperts.includes(expertCategory) && value === true) {
      return true;
    }
  }

  return false;
}

// Get potential sub-specialty triggers for a parent expert
export function getSubSpecialtyTriggers(
  parentCategory: string,
  symptoms: string[],
): string[] {
  const triggers =
    (qomConfig.triggerConditions.subSpecialtyTriggers as any)[parentCategory] || {};
  const triggeredSubSpecialties: string[] = [];

  for (const [condition, subspecialties] of Object.entries(triggers)) {
    if (symptoms.some((s) => s.toLowerCase().includes(condition))) {
      if (Array.isArray(subspecialties)) {
        triggeredSubSpecialties.push(...subspecialties);
      }
    }
  }

  return [...new Set(triggeredSubSpecialties)];
}

// Create a new expert node from template
export function createExpertNode(
  id: string,
  name: string,
  type: string,
  category: string,
  layer: number,
  parent?: string,
): QOMNode {
  const templateKey = `${type}_expert`;
  const template =
    (qomConfig.expertTemplates as any)[templateKey] ||
    qomConfig.expertTemplates.specialist_expert;

  return {
    id,
    name,
    type: template.type,
    category,
    layer,
    parent,
    children: [],
    state: "pending",
    provider: template.modelConfig.provider,
    model: template.modelConfig.model,
    triggerThreshold: qomConfig.behaviorRules.specializationThreshold,
    triggered: false,
    radius: 25 + (3 - layer) * 5, // Smaller radius for deeper layers
  };
}

// Calculate force simulation parameters based on node count
export function getAdaptiveForceParams(nodeCount: number) {
  const baseConfig = createForceSimulation(
    QOM_VISUAL_CONFIG.layout.width,
    QOM_VISUAL_CONFIG.layout.height,
  );

  // Adjust forces based on node density
  const densityFactor = Math.min(1.5, nodeCount / 20);

  return {
    ...baseConfig,
    chargeStrength:
      QOM_VISUAL_CONFIG.forces.chargeStrength * (1 / densityFactor),
    collisionRadius: (node: D3QOMNode) => {
      const baseRadius =
        typeof QOM_VISUAL_CONFIG.forces.collisionRadius === "function"
          ? QOM_VISUAL_CONFIG.forces.collisionRadius(node)
          : QOM_VISUAL_CONFIG.forces.collisionRadius;
      return baseRadius * densityFactor;
    },
    alphaDecay: baseConfig.alphaDecay * (1 + densityFactor * 0.1),
  };
}

// Group nodes by category for visual clustering
export function groupNodesByCategory(
  nodes: D3QOMNode[],
): Map<string, D3QOMNode[]> {
  const groups = new Map<string, D3QOMNode[]>();

  nodes.forEach((node) => {
    if (!groups.has(node.category)) {
      groups.set(node.category, []);
    }
    groups.get(node.category)!.push(node);
  });

  return groups;
}

// Calculate cluster centers for category grouping
export function calculateClusterCenters(
  groups: Map<string, D3QOMNode[]>,
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const centers = new Map<string, { x: number; y: number }>();
  const categoryCount = groups.size;
  let index = 0;

  groups.forEach((nodes, category) => {
    // Arrange categories in a grid pattern
    const cols = Math.ceil(Math.sqrt(categoryCount));
    const row = Math.floor(index / cols);
    const col = index % cols;

    const cellWidth = width / cols;
    const cellHeight = height / Math.ceil(categoryCount / cols);

    centers.set(category, {
      x: cellWidth * (col + 0.5),
      y: cellHeight * (row + 0.5),
    });

    index++;
  });

  return centers;
}

// Transform QOM state for visualization
export function transformQOMState(
  nodes: Map<string, QOMNode>,
  links: Map<string, QOMLink>,
  width: number,
  height: number,
): { nodes: D3QOMNode[]; links: D3QOMLink[] } {
  const d3Nodes = transformNodesToD3(nodes, width, height);
  const d3Links = transformLinksToD3(links, d3Nodes);

  // Add refinement links for completed nodes
  const refinementLinks = createRefinementLinks(d3Nodes);

  return {
    nodes: d3Nodes,
    links: [...d3Links, ...refinementLinks],
  };
}

// Export utility to check if node should be animated
export function shouldAnimateNode(node: D3QOMNode): boolean {
  return node.state === "running";
}

// Export utility to get node importance for sizing
export function getNodeImportance(node: D3QOMNode): number {
  const typeWeights: Record<string, number> = {
    merger: 1.5,
    primary: 1.3,
    specialist: 1.0,
    "sub-specialist": 0.9,
    functional: 1.1,
  };

  const stateWeights: Record<string, number> = {
    running: 1.2,
    completed: 1.0,
    failed: 0.9,
    pending: 0.8,
    skipped: 0.7,
  };

  return (typeWeights[node.type] || 1.0) * (stateWeights[node.state] || 1.0);
}
