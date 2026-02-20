import type {
  SessionAnalysis,
  ActionNode,
} from "$components/session/types/visualization";
import {
  QUESTION_SCORING,
  type QuestionCategory,
} from "$lib/session/constants";

// Types for derived calculations (exported for reuse)
export interface RelationshipIndex {
  forward: Map<
    string,
    Set<{
      targetId: string;
      type: string;
      confidence: number;
      targetType: string;
    }>
  >;
  reverse: Map<
    string,
    Set<{
      sourceId: string;
      type: string;
      confidence: number;
      sourceType: string;
    }>
  >;
  nodeTypes: Map<string, string>;
}

export interface PathCalculation {
  trigger: { type: "node" | "link"; id: string; item: any };
  path: { nodes: string[]; links: string[] };
}

export interface SessionComputedData {
  sessionData: SessionAnalysis;
  relationshipIndex: RelationshipIndex;
  nodeMap: Map<string, any>;
  linkMap: Map<string, any>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Builds the relationship index for efficient lookups
 * Pure utility function - no side effects
 */
export function buildRelationshipIndex(
  sessionData: SessionAnalysis,
): RelationshipIndex {
  const index: RelationshipIndex = {
    forward: new Map(),
    reverse: new Map(),
    nodeTypes: new Map(),
  };

  // Helper to add a node to the type map
  const addNodeType = (nodeId: string, nodeType: string) => {
    index.nodeTypes.set(nodeId, nodeType);
  };

  // Process all node types
  const nodeGroups = [
    { nodes: sessionData.nodes.symptoms || [], type: "symptom" },
    { nodes: sessionData.nodes.diagnoses || [], type: "diagnosis" },
    { nodes: sessionData.nodes.treatments || [], type: "treatment" },
    { nodes: sessionData.nodes.actions || [], type: "action" },
  ];

  // FIRST PASS: Register all node types
  for (const group of nodeGroups) {
    for (const node of group.nodes) {
      addNodeType(node.id, group.type);
    }
  }

  // SECOND PASS: Process relationships (now all node types are registered)
  for (const group of nodeGroups) {
    for (const node of group.nodes) {
      // Process relationships if they exist
      if (node.relationships) {
        for (const rel of node.relationships) {
          const targetType = index.nodeTypes.get(rel.nodeId) || "unknown";

          // Handle relationship direction
          if (
            rel.direction === "outgoing" ||
            rel.direction === "bidirectional"
          ) {
            // Add to forward map (this node -> target)
            if (!index.forward.has(node.id)) {
              index.forward.set(node.id, new Set());
            }
            index.forward.get(node.id)!.add({
              targetId: rel.nodeId,
              type: rel.relationship,
              confidence: (rel as any).confidence ?? 1.0,
              targetType,
            });

            // ALSO add to reverse map (target <- this node) - KEY DIFFERENCE from old broken logic
            if (!index.reverse.has(rel.nodeId)) {
              index.reverse.set(rel.nodeId, new Set());
            }
            index.reverse.get(rel.nodeId)!.add({
              sourceId: node.id,
              type: rel.relationship,
              confidence: (rel as any).confidence ?? 1.0,
              sourceType: group.type,
            });
          }

          if (
            rel.direction === "incoming" ||
            rel.direction === "bidirectional"
          ) {
            // Add to forward map (target -> this node) - reverse of what's defined
            if (!index.forward.has(rel.nodeId)) {
              index.forward.set(rel.nodeId, new Set());
            }
            index.forward.get(rel.nodeId)!.add({
              targetId: node.id,
              type: rel.relationship,
              confidence: (rel as any).confidence ?? 1.0,
              targetType: group.type,
            });

            // Add to reverse map (this node <- target)
            if (!index.reverse.has(node.id)) {
              index.reverse.set(node.id, new Set());
            }
            index.reverse.get(node.id)!.add({
              sourceId: rel.nodeId,
              type: rel.relationship,
              confidence: (rel as any).confidence ?? 1.0,
              sourceType: targetType,
            });
          }
        }
      }
    }
  }

  // Build additional forward relationships from reverse relationships
  // IMPORTANT: Don't overwrite existing forward relationships, merge them
  for (const [nodeId, relationships] of index.reverse.entries()) {
    // Get existing forward relationships or create new set
    if (!index.forward.has(nodeId)) {
      index.forward.set(nodeId, new Set());
    }
    const existingRels = index.forward.get(nodeId)!;

    // Add reverse relationships as forward relationships
    for (const rel of relationships) {
      existingRels.add({
        targetId: rel.sourceId,
        type: rel.type, // Keep this as rel.type since we're building it from existing relationship objects
        confidence: rel.confidence,
        targetType: index.nodeTypes.get(rel.sourceId) || "unknown",
      });
    }
  }

  return index;
}

/**
 * Builds node and link maps for quick lookups
 * Pure utility function - no side effects
 */
export function buildNodeAndLinkMaps(sessionData: SessionAnalysis): {
  nodeMap: Map<string, any>;
  linkMap: Map<string, any>;
} {
  const nodeMap = new Map<string, any>();
  const linkMap = new Map<string, any>();

  // Build node map
  const allNodeGroups = [
    ...(sessionData.nodes.symptoms || []),
    ...(sessionData.nodes.diagnoses || []),
    ...(sessionData.nodes.treatments || []),
    ...(sessionData.nodes.actions || []),
  ];

  allNodeGroups.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  // Build link map (if links exist)
  if ((sessionData as any).links) {
    (sessionData as any).links.forEach((link: any) => {
      const linkId = `${link.sourceId}-${link.targetId}`;
      linkMap.set(linkId, link);
    });
  }

  return { nodeMap, linkMap };
}

/**
 * Calculate medical reasoning path from a node using relationship index
 * Follows medical logic: Symptoms → Diagnoses → Treatments
 * Pure utility function - no side effects
 */
export function calculatePathFromNode(
  nodeId: string,
  data: SessionComputedData,
): PathCalculation {
  const { relationshipIndex, nodeMap } = data;

  const pathNodes = new Set<string>();
  const pathLinks = new Set<string>();
  pathNodes.add(nodeId);

  const startingNodeType = relationshipIndex.nodeTypes.get(nodeId) || "unknown";

  // Medical reasoning path calculation based on node type
  switch (startingNodeType) {
    case "treatment":
      calculateTreatmentPath(nodeId, pathNodes, pathLinks, relationshipIndex);
      break;
    case "symptom":
      calculateSymptomPath(nodeId, pathNodes, pathLinks, relationshipIndex);
      break;
    case "diagnosis":
      calculateDiagnosisPath(nodeId, pathNodes, pathLinks, relationshipIndex);
      break;
    default:
      break;
  }

  const nodeItem = nodeMap.get(nodeId);

  return {
    trigger: { type: "node", id: nodeId, item: nodeItem },
    path: {
      nodes: Array.from(pathNodes),
      links: Array.from(pathLinks),
    },
  };
}

/**
 * Calculate path for treatment: Treatment ← Diagnosis ← Symptoms
 * Treatments have incoming relationships from diagnoses they treat
 * Pure utility function - no side effects
 */
export function calculateTreatmentPath(
  treatmentId: string,
  pathNodes: Set<string>,
  pathLinks: Set<string>,
  relationshipIndex: RelationshipIndex,
) {
  // Find diagnoses that this treatment treats (incoming relationships)
  const reverseRels = relationshipIndex.reverse.get(treatmentId);

  // Debug what relationships actually exist for this treatment
  const forwardRels = relationshipIndex.forward.get(treatmentId);

  // Process reverse relationships (diagnoses that require/treat this treatment)
  if (reverseRels) {
    for (const rel of reverseRels) {
      if (rel.sourceType === "diagnosis") {
        pathNodes.add(rel.sourceId);
        pathLinks.add(`${rel.sourceId}-${treatmentId}`);

        // Find symptoms that support this diagnosis
        const diagnosisReverseRels = relationshipIndex.reverse.get(
          rel.sourceId,
        );
        if (diagnosisReverseRels) {
          for (const symptomRel of diagnosisReverseRels) {
            if (symptomRel.sourceType === "symptom") {
              pathNodes.add(symptomRel.sourceId);
              pathLinks.add(`${symptomRel.sourceId}-${rel.sourceId}`);
            }
          }
        }
      }
    }
  }

  // Process forward relationships (what this treatment investigates/clarifies/explores)
  if (forwardRels) {
    for (const rel of forwardRels) {
      if (rel.targetType === "diagnosis") {
        pathNodes.add(rel.targetId);
        // For investigates relationships, the link direction might be reversed visually
        pathLinks.add(`${rel.targetId}-${treatmentId}`);

        // Find symptoms that support the investigated diagnosis
        const diagnosisReverseRels = relationshipIndex.reverse.get(
          rel.targetId,
        );
        if (diagnosisReverseRels) {
          for (const symptomRel of diagnosisReverseRels) {
            if (symptomRel.sourceType === "symptom") {
              pathNodes.add(symptomRel.sourceId);
              pathLinks.add(`${symptomRel.sourceId}-${rel.targetId}`);
            }
          }
        }
      }
    }
  }
}

/**
 * Calculate path for symptom: Symptoms → Diagnosis → Treatments
 * Symptoms have outgoing relationships to diagnoses they support
 * Pure utility function - no side effects
 */
export function calculateSymptomPath(
  symptomId: string,
  pathNodes: Set<string>,
  pathLinks: Set<string>,
  relationshipIndex: RelationshipIndex,
) {
  // Find diagnoses that this symptom supports (outgoing relationships)
  const forwardRels = relationshipIndex.forward.get(symptomId);
  if (forwardRels) {
    for (const rel of forwardRels) {
      if (rel.targetType === "diagnosis") {
        pathNodes.add(rel.targetId);
        pathLinks.add(`${symptomId}-${rel.targetId}`);

        // Find treatments that this diagnosis requires
        const diagnosisForwardRels = relationshipIndex.forward.get(
          rel.targetId,
        );
        if (diagnosisForwardRels) {
          for (const treatmentRel of diagnosisForwardRels) {
            if (treatmentRel.targetType === "treatment") {
              pathNodes.add(treatmentRel.targetId);
              pathLinks.add(`${rel.targetId}-${treatmentRel.targetId}`);
            }
          }
        }
      }
    }
  }
}

/**
 * Calculate path for diagnosis: Symptoms → Diagnosis → Treatments
 * Diagnoses connect symptoms (incoming) with treatments (outgoing)
 * Pure utility function - no side effects
 */
export function calculateDiagnosisPath(
  diagnosisId: string,
  pathNodes: Set<string>,
  pathLinks: Set<string>,
  relationshipIndex: RelationshipIndex,
) {
  // Find symptoms that support this diagnosis (incoming relationships)
  const reverseRels = relationshipIndex.reverse.get(diagnosisId);
  if (reverseRels) {
    for (const rel of reverseRels) {
      if (rel.sourceType === "symptom") {
        pathNodes.add(rel.sourceId);
        pathLinks.add(`${rel.sourceId}-${diagnosisId}`);
      }
    }
  }

  // Find treatments that this diagnosis requires (outgoing relationships)
  const forwardRels = relationshipIndex.forward.get(diagnosisId);
  if (forwardRels) {
    for (const rel of forwardRels) {
      if (rel.targetType === "treatment") {
        pathNodes.add(rel.targetId);
        pathLinks.add(`${diagnosisId}-${rel.targetId}`);
      }
    }
  }
}

/**
 * Calculate composite score for question prioritization
 * Combines urgency, diagnosis relevance, and question priority
 * Pure utility function - no side effects
 */
export function calculateCompositeScore(
  question: ActionNode,
  sessionData: SessionAnalysis,
): number {
  const { URGENCY_SCORES, WEIGHTS, SCALING } = QUESTION_SCORING;

  // 1. Urgency Score (0-10 based on category)
  const urgencyScore =
    URGENCY_SCORES[question.category as QuestionCategory] || 3;

  // 2. Relevance Score - highest probability among related diagnoses
  let maxDiagnosisProbability = 0;
  if (question.impact?.diagnoses && sessionData?.nodes?.diagnoses) {
    const diagnosisMap = new Map(
      sessionData.nodes.diagnoses.map((d) => [d.id, d.probability]),
    );

    Object.entries(question.impact.diagnoses).forEach(([diagnosisId]) => {
      const probability = diagnosisMap.get(diagnosisId) || 0;
      maxDiagnosisProbability = Math.max(maxDiagnosisProbability, probability);
    });
  }

  // 3. Priority Score (invert so lower priority number = higher score)
  const priorityScore = SCALING.PRIORITY_INVERSION - (question.priority || 5);

  // Calculate weighted composite score
  const compositeScore =
    WEIGHTS.URGENCY * urgencyScore +
    WEIGHTS.RELEVANCE *
      maxDiagnosisProbability *
      SCALING.PROBABILITY_MULTIPLIER +
    WEIGHTS.PRIORITY * priorityScore;

  return compositeScore;
}
