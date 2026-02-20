import { writable, derived, get, readable } from "svelte/store";
import type { Writable, Readable } from "svelte/store";
import type {
  SessionAnalysis,
  ActionNode,
} from "$components/session/types/visualization";
import {
  transformToSankeyData,
  applySankeyThresholds,
} from "$components/session/utils/sankeyDataTransformer";
import {
  QUESTION_SCORING,
  type QuestionCategory,
} from "$lib/session/constants";

// Import utility functions from shared module
import {
  buildRelationshipIndex,
  buildNodeAndLinkMaps,
  calculatePathFromNode,
  calculateCompositeScore,
  type RelationshipIndex,
  type PathCalculation,
  type SessionComputedData,
} from "./utils/session-data-utils";

// Store 1: Session Data Store (immutable data + derived calculations)
const sessionDataStore: Writable<SessionComputedData | null> = writable(null);

/**
 * Actions for managing session data
 */
export const sessionDataActions = {
  /**
   * Load new session data and compute all derived data
   */
  loadSession(sessionData: SessionAnalysis): void {
    // Build all derived data
    const relationshipIndex = buildRelationshipIndex(sessionData);
    const { nodeMap, linkMap } = buildNodeAndLinkMaps(sessionData);

    const computedData: SessionComputedData = {
      sessionData,
      relationshipIndex,
      nodeMap,
      linkMap,
      isLoading: false,
      error: null,
    };

    sessionDataStore.set(computedData);
  },

  /**
   * Get path calculation (pure function, no mutations)
   */
  calculatePath(nodeId: string): PathCalculation | null {
    const data = get(sessionDataStore);
    if (!data) return null;

    // Calculate path without mutating store
    const pathCalculation = calculatePathFromNode(nodeId, data);

    return pathCalculation;
  },

  /**
   * Clear the session data
   */
  clearSession(): void {
    sessionDataStore.set(null);
  },

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const data = get(sessionDataStore);
    if (!data?.sessionData?.nodes?.actions) return;

    const updatedActions = data.sessionData.nodes.actions.map(
      (action: ActionNode) =>
        action.id === alertId && action.actionType === "alert"
          ? { ...action, status: "acknowledged" as const }
          : action,
    );

    const updatedSessionData = {
      ...data.sessionData,
      nodes: {
        ...data.sessionData.nodes,
        actions: updatedActions,
      },
    };

    this.loadSession(updatedSessionData);
  },

  /**
   * Answer a question
   */
  answerQuestion(
    questionId: string,
    answer: string,
    confidence?: number,
  ): void {
    const data = get(sessionDataStore);
    if (!data?.sessionData?.nodes?.actions) return;

    const updatedActions = data.sessionData.nodes.actions.map(
      (action: ActionNode) =>
        action.id === questionId && action.actionType === "question"
          ? { ...action, status: "answered" as const, answer, confidence }
          : action,
    );

    const updatedSessionData = {
      ...data.sessionData,
      nodes: {
        ...data.sessionData.nodes,
        actions: updatedActions,
      },
    };

    this.loadSession(updatedSessionData);
  },

  /**
   * Node lookup utilities
   */
  findNodeById(nodeId: string): any {
    const data = get(sessionDataStore);
    if (!data?.nodeMap) return null;
    return data.nodeMap.get(nodeId) || null;
  },

  getNodeDisplayText(nodeId: string): string {
    const node = this.findNodeById(nodeId);
    if (!node) return nodeId;

    return node.name || node.text || nodeId;
  },

  /**
   * Handle node actions (suppress, etc.)
   */
  handleNodeAction(action: string, targetId: string, reason?: string): void {
    const data = get(sessionDataStore);
    if (!data?.sessionData) return;

    let updatedSessionData = { ...data.sessionData };

    // Handle different actions
    if (action === "suppress") {
      // Update diagnoses
      if (updatedSessionData.nodes.diagnoses) {
        updatedSessionData.nodes.diagnoses =
          updatedSessionData.nodes.diagnoses.map((diagnosis) =>
            diagnosis.id === targetId
              ? {
                  ...diagnosis,
                  suppressed: true,
                  suppressionReason: reason || "User suppressed",
                }
              : diagnosis,
          );
      }

      // Could handle other node types here
    }

    // Add user action to session history if userActions exists
    if (updatedSessionData.userActions) {
      const userAction = {
        timestamp: new Date().toISOString(),
        action: action as any,
        targetId: targetId,
        reason: reason,
      };

      updatedSessionData.userActions = [
        ...updatedSessionData.userActions,
        userAction,
      ];
    }

    this.loadSession(updatedSessionData);
  },

  /**
   * Update session (alias for loadSession for backwards compatibility)
   */
  updateSession(sessionData: SessionAnalysis): void {
    this.loadSession(sessionData);
  },

  /**
   * Update partial session data (simplified implementation)
   */
  updatePartial(sessionData: SessionAnalysis): void {
    this.loadSession(sessionData);
  },

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    sessionDataStore.update((data) =>
      data ? { ...data, isLoading: loading } : null,
    );
  },

  /**
   * Set error state
   */
  setError(error: string | null): void {
    sessionDataStore.update((data) => (data ? { ...data, error } : null));
  },
};

// Exported stores and derived stores
export const sessionData: Readable<SessionAnalysis | null> = derived(
  sessionDataStore,
  ($store) => $store?.sessionData || null,
);

export const sankeyData: Readable<any | null> = readable<any | null>(
  null,
  (set) => {
    let lastSessionRef: SessionAnalysis | null = null;

    const unsubscribe = sessionDataStore.subscribe(($store) => {
      const nextSession = $store?.sessionData || null;
      if (nextSession !== lastSessionRef) {
        lastSessionRef = nextSession;
        set(nextSession ? transformToSankeyData(nextSession) : null);
      }
    });

    return unsubscribe;
  },
);

export const relationshipIndex: Readable<RelationshipIndex | null> = derived(
  sessionDataStore,
  ($store) => $store?.relationshipIndex || null,
);

export const nodeMap: Readable<Map<string, any> | null> = derived(
  sessionDataStore,
  ($store) => $store?.nodeMap || null,
);

export const linkMap: Readable<Map<string, any> | null> = derived(
  sessionDataStore,
  ($store) => $store?.linkMap || null,
);

export const isLoading: Readable<boolean> = derived(
  sessionDataStore,
  ($store) => $store?.isLoading || false,
);

export const error: Readable<string | null> = derived(
  sessionDataStore,
  ($store) => $store?.error || null,
);

// Factory function for node-specific questions and alerts
export function questionsForNode(nodeId: string): Readable<ActionNode[]> {
  return derived(sessionData, ($sessionData) => {
    if (!$sessionData?.nodes?.actions) return [];

    return $sessionData.nodes.actions.filter(
      (action: ActionNode) =>
        action.actionType === "question" &&
        action.relationships?.some((rel: any) => rel.nodeId === nodeId),
    );
  });
}

export function alertsForNode(nodeId: string): Readable<ActionNode[]> {
  return derived(sessionData, ($sessionData) => {
    if (!$sessionData?.nodes?.actions) return [];

    return $sessionData.nodes.actions.filter(
      (action: ActionNode) =>
        action.actionType === "alert" &&
        action.relationships?.some((rel: any) => rel.nodeId === nodeId),
    );
  });
}

// Additional derived stores for actions
export const questions: Readable<ActionNode[]> = derived(
  sessionData,
  ($sessionData) =>
    $sessionData?.nodes?.actions?.filter(
      (action: ActionNode) => action.actionType === "question",
    ) || [],
);

export const alerts: Readable<ActionNode[]> = derived(
  sessionData,
  ($sessionData) =>
    $sessionData?.nodes?.actions?.filter(
      (action: ActionNode) => action.actionType === "alert",
    ) || [],
);

export const pendingQuestions: Readable<ActionNode[]> = derived(
  questions,
  ($questions) => $questions.filter((q) => q.status === "pending"),
);

export const pendingAlerts: Readable<ActionNode[]> = derived(
  alerts,
  ($alerts) => $alerts.filter((a) => a.status === "pending"),
);

// Factory functions for link-related actions
export function questionsForLink(link: any): Readable<ActionNode[]> {
  return derived(sessionData, ($sessionData) => {
    if (!$sessionData?.nodes?.actions || !link) return [];

    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    return $sessionData.nodes.actions.filter(
      (action: ActionNode) =>
        action.actionType === "question" &&
        action.relationships?.some(
          (rel: any) => rel.nodeId === sourceId || rel.nodeId === targetId,
        ),
    );
  });
}

export function alertsForLink(link: any): Readable<ActionNode[]> {
  return derived(sessionData, ($sessionData) => {
    if (!$sessionData?.nodes?.actions || !link) return [];

    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    return $sessionData.nodes.actions.filter(
      (action: ActionNode) =>
        action.actionType === "alert" &&
        action.relationships?.some(
          (rel: any) => rel.nodeId === sourceId || rel.nodeId === targetId,
        ),
    );
  });
}

/**
 * Derived store for questions sorted by composite score
 * Considers urgency, diagnosis probability, and question priority
 */
export const sortedQuestions: Readable<ActionNode[]> = derived(
  [questions, sessionData],
  ([$questions, $sessionData]) => {
    if (!$questions.length || !$sessionData) return $questions;

    return [...$questions].sort((a, b) => {
      const scoreA = calculateCompositeScore(a, $sessionData);
      const scoreB = calculateCompositeScore(b, $sessionData);

      // Sort by highest score first
      return scoreB - scoreA;
    });
  },
);

/**
 * Derived store for pending questions sorted by composite score
 */
export const sortedPendingQuestions: Readable<ActionNode[]> = derived(
  sortedQuestions,
  ($sortedQuestions) => $sortedQuestions.filter((q) => q.status === "pending"),
);

// Export the main store for direct access if needed
export { sessionDataStore };

// Threshold configuration types
interface ThresholdConfig {
  symptoms: { severityThreshold: number; showAll: boolean };
  diagnoses: { probabilityThreshold: number; showAll: boolean };
  treatments: { priorityThreshold: number; showAll: boolean };
}

interface HiddenCounts {
  symptoms: number;
  diagnoses: number;
  treatments: number;
}

// Thresholds store - primary data store (not derived from viewer store)
export const thresholds: Writable<ThresholdConfig> = writable({
  symptoms: { severityThreshold: 7, showAll: false }, // Show severity 1-7 by default
  diagnoses: { probabilityThreshold: 0.35, showAll: false }, // Show probability > 30% by default
  treatments: { priorityThreshold: 10, showAll: true }, // Future use
});

/**
 * Filtered Sankey data with thresholds applied
 * This provides the same interface as sankeyData but with filtering
 */
export const sankeyDataFiltered = derived(
  [sankeyData, thresholds],
  ([$sankeyData, $thresholds]) => {
    if (!$sankeyData || !$thresholds) return $sankeyData;

    const { sankeyData: filteredData } = applySankeyThresholds(
      $sankeyData,
      $thresholds,
    );
    return filteredData;
  },
);

/**
 * Hidden counts calculated reactively from threshold filtering
 */
export const hiddenCounts: Readable<HiddenCounts> = derived(
  [sankeyData, thresholds],
  ([$sankeyData, $thresholds]) => {
    if (!$sankeyData || !$thresholds) {
      return { symptoms: 0, diagnoses: 0, treatments: 0 } as HiddenCounts;
    }

    const { hiddenCounts } = applySankeyThresholds($sankeyData, $thresholds);
    return hiddenCounts;
  },
);

export type { ThresholdConfig, HiddenCounts };
