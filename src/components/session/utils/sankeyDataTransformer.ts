import type {
  SessionAnalysis,
  SankeyData,
  SankeyNode,
  SankeyLink,
} from "../types/visualization";
import { getNodeColor, getLinkColor, NODE_SIZE } from "../config/visual-config";

// Import threshold types from session-viewer-store
type ThresholdConfig = {
  symptoms: { severityThreshold: number; showAll: boolean };
  diagnoses: { probabilityThreshold: number; showAll: boolean };
  treatments: { priorityThreshold: number; showAll: boolean };
};

type HiddenCounts = {
  symptoms: number;
  diagnoses: number;
  treatments: number;
};

/**
 * Transform MoE session analysis JSON to D3 Sankey format
 * Handles embedded relationships and creates proper node/link structures
 */
export function transformToSankeyData(
  sessionData: SessionAnalysis,
): SankeyData {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const nodeMap = new Map<string, SankeyNode>();

  // Validate input data
  if (!sessionData || !sessionData.nodes) {
    console.error("Invalid session data:", sessionData);
    return {
      nodes: [],
      links: [],
      metadata: { sessionId: "", analysisVersion: 0, timestamp: "" },
    };
  }

  // Process symptoms (Column 1)
  const symptoms = [...(sessionData.nodes.symptoms || [])];

  // Define source priority order for consistent grouping
  const sourceOrder = {
    transcript: 1,
    medical_history: 2,
    family_history: 3,
    social_history: 4,
    medication_history: 5,
    suspected: 6,
  };

  // Sort by severity first (most severe = lowest number), then by source, then alphabetically
  symptoms.sort((a, b) => {
    // Primary: Severity (1-10, lower is more severe)
    const aSeverity = typeof a.severity === "number" ? a.severity : 5;
    const bSeverity = typeof b.severity === "number" ? b.severity : 5;
    const severityDiff = aSeverity - bSeverity;
    if (severityDiff !== 0) return severityDiff;

    // Secondary: Source priority
    const aSourcePriority =
      sourceOrder[a.source as keyof typeof sourceOrder] || 999;
    const bSourcePriority =
      sourceOrder[b.source as keyof typeof sourceOrder] || 999;
    const sourceDiff = aSourcePriority - bSourcePriority;
    if (sourceDiff !== 0) return sourceDiff;

    // Tertiary: Alphabetical by symptom text
    return a.text.localeCompare(b.text);
  });

  symptoms.forEach((symptom, index) => {
    const node: SankeyNode = {
      id: symptom.id,
      name: symptom.text,
      type: "symptom",
      column: 0,
      priority: symptom.severity || 5,
      confidence: symptom.confidence || 0.5,
      source: symptom.source || "transcript",
      data: symptom,
      x: 0, // Will be calculated by D3 Sankey
      y: index * 80,
      color: getNodeColor("symptom", symptom.severity || 5, symptom.source),
      // Calculate node value (height) based on severity and confidence
      value: calculateNodeValue(
        symptom.severity || 5,
        symptom.confidence || 0.5,
      ),
      // Add explicit sort index to preserve our intended order
      sortIndex: index,
    };
    nodes.push(node);
    nodeMap.set(node.id, node);
  });

  // Process diagnoses (Column 2)
  const diagnoses = [...(sessionData.nodes.diagnoses || [])];
  // Sort by priority (most critical first) and then by probability (highest first)
  diagnoses.sort((a, b) => {
    const aCoeff = calculateNodeValue(a.priority || 5, a.probability || 0.5);
    const bCoeff = calculateNodeValue(b.priority || 5, b.probability || 0.5);
    return bCoeff - aCoeff; // Descending order (highest coefficient first)
  });

  diagnoses.forEach((diagnosis, index) => {
    const node: SankeyNode = {
      id: diagnosis.id,
      name: diagnosis.name,
      type: "diagnosis",
      column: 1,
      priority: diagnosis.priority || 5,
      confidence: diagnosis.confidence || diagnosis.probability || 0.5,
      probability: diagnosis.probability,
      data: diagnosis,
      x: 0, // Will be calculated by D3 Sankey
      y: index * 80,
      color: getNodeColor("diagnosis", diagnosis.priority || 5),
      // Calculate node value based on priority and probability
      value: calculateNodeValue(
        diagnosis.priority || 5,
        diagnosis.probability || 0.5,
      ),
    };
    nodes.push(node);
    nodeMap.set(node.id, node);
  });

  // Process treatments (Column 3)
  const treatments = [...(sessionData.nodes.treatments || [])];
  // Sort by priority (most critical first) and then by effectiveness
  treatments.sort((a, b) => {
    const aCoeff = calculateNodeValue(a.priority || 5, a.effectiveness || 0.5);
    const bCoeff = calculateNodeValue(b.priority || 5, b.effectiveness || 0.5);
    return bCoeff - aCoeff; // Descending order (highest coefficient first)
  });

  treatments.forEach((treatment, index) => {
    const node: SankeyNode = {
      id: treatment.id,
      name: treatment.name,
      type: "treatment",
      column: 2,
      priority: treatment.priority || 5,
      confidence: treatment.confidence || treatment.effectiveness || 0.5,
      data: treatment,
      x: 0, // Will be calculated by D3 Sankey
      y: index * 80,
      color: getNodeColor("treatment", treatment.priority || 5),
      // Calculate node value based on priority and effectiveness
      value: calculateNodeValue(
        treatment.priority || 5,
        treatment.effectiveness || 0.5,
      ),
    };
    nodes.push(node);
    nodeMap.set(node.id, node);
  });

  // Actions are not rendered as nodes - they create investigative pathways between existing nodes

  // Create links based on relationships: handle both forward and bidirectional flows
  nodes.forEach((sourceNode) => {
    const relationships = sourceNode.data.relationships || [];
    relationships.forEach((rel: any) => {
      const targetNode = nodeMap.get(rel.nodeId);
      if (!targetNode) {
        return;
      }

      // Determine if we should create this link based on relationship type and direction
      let shouldCreateLink = false;
      let linkDirection = "";

      if (rel.direction === "outgoing") {
        // Forward-flowing relationships
        if (
          sourceNode.type === "symptom" &&
          targetNode.type === "diagnosis" &&
          ["supports", "suggests", "indicates", "confirms"].includes(
            rel.relationship,
          )
        ) {
          shouldCreateLink = true;
          linkDirection = "forward";
          // creating symptom->diagnosis link
        } else if (
          sourceNode.type === "diagnosis" &&
          targetNode.type === "treatment" &&
          ["requires", "treats", "manages"].includes(rel.relationship)
        ) {
          shouldCreateLink = true;
          linkDirection = "forward";
          // creating diagnosis->treatment link
        } else if (
          sourceNode.type === "treatment" &&
          targetNode.type === "diagnosis" &&
          ["investigates", "clarifies", "explores"].includes(rel.relationship)
        ) {
          // Investigation relationships: reverse the link direction to maintain left-to-right flow
          // Instead of treatment->diagnosis, create diagnosis->treatment for proper visual flow
          shouldCreateLink = true;
          linkDirection = "investigation";
          // reversed investigation link for visual flow
        }
      }

      // skip creating link when not applicable

      if (shouldCreateLink) {
        // For investigation relationships, reverse source and target to maintain visual flow
        let actualSource, actualTarget, actualLinkKey;

        if (linkDirection === "investigation") {
          // Reverse: diagnosis -> treatment (investigation)
          actualSource = targetNode.id;
          actualTarget = sourceNode.id;
          actualLinkKey = `${targetNode.id}-${sourceNode.id}`;
        } else {
          // Normal: source -> target
          actualSource = sourceNode.id;
          actualTarget = targetNode.id;
          actualLinkKey = `${sourceNode.id}-${targetNode.id}`;
        }

        // Avoid duplicates
        if (!links.find((l) => `${l.source}-${l.target}` === actualLinkKey)) {
          const link: SankeyLink = {
            source: actualSource,
            target: actualTarget,
            value: Math.max(1, rel.strength * 20), // Scale for visibility
            type: rel.relationship,
            strength: rel.strength,
            reasoning: rel.reasoning,
            direction: rel.direction,
          };

          links.push(link);
          // created link
        }
      }
    });

    // No action-specific processing here - actions create investigative pathways
  });

  // Create investigative pathway links from actions
  // These create links between nodes that are connected through investigative questions
  sessionData.nodes.actions?.forEach((action) => {
    if (action.impact?.diagnoses) {
      Object.entries(action.impact.diagnoses).forEach(
        ([targetDiagnosisId, impactValue]: [string, any]) => {
          if (impactValue !== 0) {
            const targetDiagnosis = nodeMap.get(targetDiagnosisId);
            if (!targetDiagnosis) return;

            // Find the investigative pathway source:
            // Look for nodes that this action investigates
            let sourceNodeId: string | null = null;

            if (action.relationships) {
              for (const rel of action.relationships) {
                if (rel.relationship === "investigates") {
                  // This action investigates some node (usually a treatment)
                  // Find what diagnosis requires/treats that node
                  const investigatedNode = nodeMap.get(rel.nodeId);
                  if (investigatedNode?.type === "treatment") {
                    // Look for diagnoses that require this treatment
                    nodes.forEach((potentialSource) => {
                      if (
                        potentialSource.type === "diagnosis" &&
                        potentialSource.data.relationships
                      ) {
                        const hasRelationToTreatment =
                          potentialSource.data.relationships.some(
                            (r: any) =>
                              r.nodeId === rel.nodeId &&
                              ["requires", "treats"].includes(r.relationship),
                          );
                        if (hasRelationToTreatment) {
                          sourceNodeId = potentialSource.id;
                        }
                      }
                    });
                  }
                }
              }
            }

            // Create investigative link if we found a source
            if (sourceNodeId && sourceNodeId !== targetDiagnosisId) {
              const linkKey = `${sourceNodeId}-${targetDiagnosisId}`;
              const existingLink = links.find(
                (l) =>
                  l.source === sourceNodeId && l.target === targetDiagnosisId,
              );

              if (!existingLink) {
                const link: SankeyLink = {
                  source: sourceNodeId,
                  target: targetDiagnosisId,
                  value: Math.abs(impactValue) * 50, // Convert impact to visual weight
                  type: "investigates",
                  strength: Math.abs(impactValue),
                  direction: "outgoing",
                  reasoning: `Investigative pathway via ${action.id}`,
                };
                links.push(link);
                // creating investigative pathway link
              }
            }
          }
        },
      );
    }
  });

  // Remove any cycles that might have been created by bidirectional relationships
  const finalLinks = removeCycles(links, nodes);
  // cycle removal summary omitted in production logs

  return {
    nodes,
    links: finalLinks,
    metadata: {
      sessionId: sessionData.sessionId,
      analysisVersion: sessionData.analysisVersion,
      timestamp: sessionData.timestamp,
    },
  };
}

/**
 * Apply threshold filtering to already-transformed SankeyData
 * This is more efficient than re-running the complex transformation
 */
export function applySankeyThresholds(
  fullSankeyData: SankeyData,
  thresholds: ThresholdConfig,
): { sankeyData: SankeyData; hiddenCounts: HiddenCounts } {
  // Initialize hidden counts
  const hiddenCounts: HiddenCounts = {
    symptoms: 0,
    diagnoses: 0,
    treatments: 0,
  };

  // If all "showAll" flags are true, return full data with zero hidden counts
  if (
    thresholds.symptoms.showAll &&
    thresholds.diagnoses.showAll &&
    thresholds.treatments.showAll
  ) {
    return { sankeyData: fullSankeyData, hiddenCounts };
  }

  // Separate nodes by type and apply filters
  const visibleNodeIds = new Set<string>();
  const filteredNodes: SankeyNode[] = [];

  fullSankeyData.nodes.forEach((node) => {
    let shouldShow = true;

    switch (node.type) {
      case "symptom":
        if (!thresholds.symptoms.showAll) {
          const severity = (node.data as any)?.severity || 5;
          shouldShow = severity < thresholds.symptoms.severityThreshold;
        }
        if (!shouldShow) hiddenCounts.symptoms++;
        break;

      case "diagnosis":
        if (!thresholds.diagnoses.showAll) {
          const probability = (node.data as any)?.probability || 0.5;
          shouldShow = probability > thresholds.diagnoses.probabilityThreshold;
        }
        if (!shouldShow) hiddenCounts.diagnoses++;
        break;

      case "treatment":
        if (!thresholds.treatments.showAll) {
          const priority = (node.data as any)?.priority || 5;
          shouldShow = priority < thresholds.treatments.priorityThreshold;
        }
        if (!shouldShow) hiddenCounts.treatments++;
        break;

      default:
        // Other node types (actions, etc.) are always shown
        shouldShow = true;
        break;
    }

    if (shouldShow) {
      visibleNodeIds.add(node.id);
      filteredNodes.push(node);
    }
  });

  // Remove orphaned nodes (nodes that lose all their connections)
  const { finalVisibleNodes, additionalHiddenCounts } =
    removeOrphanedSankeyNodes(
      filteredNodes,
      fullSankeyData.links,
      visibleNodeIds,
    );

  // Update hidden counts with additional orphaned nodes
  hiddenCounts.symptoms += additionalHiddenCounts.symptoms;
  hiddenCounts.diagnoses += additionalHiddenCounts.diagnoses;
  hiddenCounts.treatments += additionalHiddenCounts.treatments;

  // Filter links to only include connections between final visible nodes
  const finalVisibleNodeIds = new Set(finalVisibleNodes.map((n) => n.id));
  const filteredLinks = fullSankeyData.links.filter((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    return (
      finalVisibleNodeIds.has(sourceId) && finalVisibleNodeIds.has(targetId)
    );
  });

  const filteredSankeyData: SankeyData = {
    nodes: finalVisibleNodes,
    links: filteredLinks,
    metadata: fullSankeyData.metadata,
  };

  return { sankeyData: filteredSankeyData, hiddenCounts };
}

/**
 * Remove orphaned nodes following medical flow logic:
 * - Symptoms: Already filtered by threshold only
 * - Diagnoses: Remove if no visible symptoms link to them
 * - Treatments: Remove if no visible diagnoses link to them
 */
function removeOrphanedSankeyNodes(
  filteredNodes: SankeyNode[],
  allLinks: SankeyLink[],
  visibleNodeIds: Set<string>,
): {
  finalVisibleNodes: SankeyNode[];
  additionalHiddenCounts: HiddenCounts;
} {
  const additionalHiddenCounts: HiddenCounts = {
    symptoms: 0,
    diagnoses: 0,
    treatments: 0,
  };

  // Create a map for quick node lookup
  const nodeMap = new Map<string, SankeyNode>();
  filteredNodes.forEach((node) => nodeMap.set(node.id, node));

  const finalVisibleNodeIds = new Set(visibleNodeIds);
  let changed = true;

  // Iteratively remove orphaned nodes until no more changes
  while (changed) {
    changed = false;

    // Check each visible node for orphaning based on medical flow
    for (const nodeId of finalVisibleNodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      let shouldRemove = false;

      switch (node.type) {
        case "symptom":
          // Symptoms are never removed as orphans - only by threshold
          break;

        case "diagnosis":
          // Remove diagnosis if no visible symptoms link TO it
          const hasVisibleSymptoms = allLinks.some((link) => {
            const sourceId = getNodeId(link.source);
            const targetId = getNodeId(link.target);

            // Check if any visible symptom links to this diagnosis
            return (
              targetId === nodeId &&
              finalVisibleNodeIds.has(sourceId) &&
              nodeMap.get(sourceId)?.type === "symptom"
            );
          });

          if (!hasVisibleSymptoms) {
            shouldRemove = true;
            additionalHiddenCounts.diagnoses++;
          }
          break;

        case "treatment":
          // Remove treatment if no visible diagnoses link TO it
          const hasVisibleDiagnoses = allLinks.some((link) => {
            const sourceId = getNodeId(link.source);
            const targetId = getNodeId(link.target);

            // Check if any visible diagnosis links to this treatment
            return (
              targetId === nodeId &&
              finalVisibleNodeIds.has(sourceId) &&
              nodeMap.get(sourceId)?.type === "diagnosis"
            );
          });

          if (!hasVisibleDiagnoses) {
            shouldRemove = true;
            additionalHiddenCounts.treatments++;
          }
          break;

        default:
          // Other node types (actions, etc.) are never removed as orphans
          break;
      }

      if (shouldRemove) {
        finalVisibleNodeIds.delete(nodeId);
        changed = true;
      }
    }
  }

  // Build final node list
  const finalVisibleNodes: SankeyNode[] = [];
  filteredNodes.forEach((node) => {
    if (finalVisibleNodeIds.has(node.id)) {
      finalVisibleNodes.push(node);
    }
  });

  return { finalVisibleNodes, additionalHiddenCounts };
}

/**
 * Calculate node value (affects height) based on priority/severity and probability
 * Priority scale: 1 (critical) to 10 (low)
 * Probability/confidence/effectiveness: 0 to 1
 * Formula: MIN_HEIGHT_PX + (priority_impact + probability_impact)
 */
function calculateNodeValue(priority: number, probability: number): number {
  // Invert priority so higher severity = higher value
  const severityWeight = 11 - Math.max(1, Math.min(10, priority));
  const probWeight = Math.max(0, Math.min(1, probability));

  // Start with minimum height
  const baseValue = NODE_SIZE.MIN_HEIGHT_PX;

  // Calculate additional height based on priority and probability
  const additionalHeight =
    severityWeight * NODE_SIZE.PRIORITY_MULTIPLIER +
    probWeight * NODE_SIZE.PROBABILITY_MULTIPLIER * severityWeight;

  // Ensure we don't exceed maximum height
  return Math.min(baseValue + additionalHeight, NODE_SIZE.MAX_HEIGHT_PX);
}

// Note: getNodeColor is now imported from visual-config

/**
 * Determine which column an action should be positioned in based on its relationships
 */
function getActionColumn(
  action: any,
  nodeMap: Map<string, SankeyNode>,
): number {
  const relationships = action.relationships || [];

  // Find the average column of connected nodes
  let totalColumn = 0;
  let count = 0;

  relationships.forEach((rel: any) => {
    const relatedNode = nodeMap.get(rel.nodeId);
    if (relatedNode) {
      totalColumn += relatedNode.column;
      count++;
    }
  });

  return count > 0 ? Math.round(totalColumn / count) : 1; // Default to middle column
}

/**
 * Calculate X position for actions based on their target column
 */
function getActionXPosition(
  action: any,
  nodeMap: Map<string, SankeyNode>,
): number {
  const column = getActionColumn(action, nodeMap);
  const columnWidth = 300;
  return column * columnWidth + 150; // Center between columns
}

/**
 * Calculate optimal node sizes based on priority and type
 */
export function calculateNodeSize(
  node: SankeyNode,
  isMobile: boolean = false,
): { width: number; height: number } {
  const baseFactor = isMobile ? 0.7 : 1.0;

  // Size based on priority (1=critical/large, 10=low/small)
  const priorityFactor = Math.max(0.5, 1.2 - ((node.priority - 1) / 9) * 0.7);

  let baseWidth = 120;
  let baseHeight = 60;

  // Type-specific sizing
  switch (node.type) {
    case "symptom":
      baseWidth = 100;
      baseHeight = 50;
      break;
    case "diagnosis":
      baseWidth = 140;
      baseHeight = 70;
      break;
    case "treatment":
      baseWidth = 130;
      baseHeight = 65;
      break;
    case "question":
    case "alert":
      baseWidth = 80;
      baseHeight = 40;
      break;
  }

  return {
    width: Math.round(baseWidth * baseFactor * priorityFactor),
    height: Math.round(baseHeight * baseFactor * priorityFactor),
  };
}

/**
 * Extract node ID from D3 Sankey source/target (which can be string, number, or SankeyNode)
 */
function getNodeId(nodeRef: string | number | SankeyNode): string {
  if (typeof nodeRef === "string") return nodeRef;
  if (typeof nodeRef === "number") return nodeRef.toString();
  return nodeRef.id;
}

/**
 * Check if a link should be skipped to maintain Sankey flow direction
 */
function shouldSkipLink(
  sourceNode: SankeyNode,
  targetNode: SankeyNode,
): boolean {
  // Allow actions (questions/alerts) to connect anywhere
  if (
    sourceNode.type === "question" ||
    sourceNode.type === "alert" ||
    targetNode.type === "question" ||
    targetNode.type === "alert"
  ) {
    return false;
  }

  // Enforce main flow: symptoms(0) -> diagnoses(1) -> treatments(2)
  if (sourceNode.column > targetNode.column) {
    return true; // Would create backward flow
  }

  return false;
}

/**
 * Remove cycles from links using topological sorting approach
 */
function removeCycles(links: SankeyLink[], nodes: SankeyNode[]): SankeyLink[] {
  const nodeSet = new Set(nodes.map((n) => n.id));
  const validLinks: SankeyLink[] = [];
  const graph = new Map<string, Set<string>>();

  // Initialize graph
  nodes.forEach((node) => {
    graph.set(node.id, new Set());
  });

  // Add links one by one, checking for cycles
  for (const link of links) {
    // Extract string IDs from source/target
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);

    // Ensure both nodes exist
    if (!nodeSet.has(sourceId) || !nodeSet.has(targetId)) {
      continue;
    }

    // Skip self-loops
    if (sourceId === targetId) {
      continue;
    }

    // Temporarily add edge and check for cycles
    graph.get(sourceId)!.add(targetId);

    if (
      hasCycle(
        graph,
        nodes.map((n) => n.id),
      )
    ) {
      // Remove the edge that would create a cycle
      graph.get(sourceId)!.delete(targetId);
      console.warn(`Skipping link ${sourceId} -> ${targetId} to prevent cycle`);
    } else {
      // Keep this link
      validLinks.push(link);
    }
  }

  return validLinks;
}

/**
 * Detect cycles in directed graph using DFS
 */
function hasCycle(graph: Map<string, Set<string>>, nodeIds: string[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) {
      return true; // Cycle detected
    }

    if (visited.has(nodeId)) {
      return false; // Already processed
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = graph.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Check each unvisited node
  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        return true;
      }
    }
  }

  return false;
}

// Note: getLinkColor is now imported from visual-config
