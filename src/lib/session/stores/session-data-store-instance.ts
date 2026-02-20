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
import { logger } from "$lib/logging/logger";

// Import shared utility functions (no duplication!)
import {
  buildRelationshipIndex,
  buildNodeAndLinkMaps,
  calculatePathFromNode,
  calculateCompositeScore,
  type RelationshipIndex,
  type PathCalculation,
  type SessionComputedData,
} from "./utils/session-data-utils";

// Threshold configuration types
export interface ThresholdConfig {
  symptoms: { severityThreshold: number; showAll: boolean };
  diagnoses: { probabilityThreshold: number; showAll: boolean };
  treatments: { priorityThreshold: number; showAll: boolean };
}

export interface HiddenCounts {
  symptoms: number;
  diagnoses: number;
  treatments: number;
}

/**
 * Factory function to create isolated session data store instances
 * Reuses utility functions from shared module - NO CODE DUPLICATION
 */
export function createSessionDataStoreInstance(instanceId?: string) {
  const storeId =
    instanceId ||
    `session_data_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  logger.session.debug("Creating session data store instance", { storeId });

  // Create isolated store instance
  const sessionDataStore: Writable<SessionComputedData | null> = writable(null);

  // Create isolated thresholds store
  const thresholds: Writable<ThresholdConfig> = writable({
    symptoms: { severityThreshold: 7, showAll: false },
    diagnoses: { probabilityThreshold: 0.35, showAll: false },
    treatments: { priorityThreshold: 10, showAll: true },
  });

  // Actions that operate on the local store instance (reusing imported utility functions)
  const actions = {
    loadSession(sessionData: SessionAnalysis): void {
      logger.session.debug("Loading session data", {
        storeId,
        analysisVersion: sessionData.analysisVersion,
      });

      // Reuse utility functions - no duplication!
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

    calculatePath(nodeId: string): PathCalculation | null {
      const data = get(sessionDataStore);
      if (!data) return null;
      // Reuse utility function - no duplication!
      return calculatePathFromNode(nodeId, data);
    },

    clearSession(): void {
      logger.session.debug("Clearing session data", { storeId });
      sessionDataStore.set(null);
    },

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

    handleNodeAction(action: string, targetId: string, reason?: string): void {
      const data = get(sessionDataStore);
      if (!data?.sessionData) return;

      let updatedSessionData = { ...data.sessionData };

      if (action === "suppress") {
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
      }

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

    updateSession(sessionData: SessionAnalysis): void {
      this.loadSession(sessionData);
    },

    updatePartial(sessionData: SessionAnalysis): void {
      this.loadSession(sessionData);
    },

    setLoading(loading: boolean): void {
      sessionDataStore.update((data) =>
        data ? { ...data, isLoading: loading } : null,
      );
    },

    setError(error: string | null): void {
      sessionDataStore.update((data) => (data ? { ...data, error } : null));
    },

    // Get current state snapshot
    getCurrentSessionData(): SessionAnalysis | null {
      const data = get(sessionDataStore);
      return data?.sessionData || null;
    },
  };

  // Derived stores (same logic as original but with local store)
  const sessionData: Readable<SessionAnalysis | null> = derived(
    sessionDataStore,
    ($store) => $store?.sessionData || null,
  );

  const sankeyData: Readable<any | null> = readable<any | null>(null, (set) => {
    let lastSessionRef: SessionAnalysis | null = null;

    const unsubscribe = sessionDataStore.subscribe(($store) => {
      const nextSession = $store?.sessionData || null;
      if (nextSession !== lastSessionRef) {
        lastSessionRef = nextSession;
        set(nextSession ? transformToSankeyData(nextSession) : null);
      }
    });

    return unsubscribe;
  });

  const relationshipIndex: Readable<RelationshipIndex | null> = derived(
    sessionDataStore,
    ($store) => $store?.relationshipIndex || null,
  );

  const nodeMap: Readable<Map<string, any> | null> = derived(
    sessionDataStore,
    ($store) => $store?.nodeMap || null,
  );

  const linkMap: Readable<Map<string, any> | null> = derived(
    sessionDataStore,
    ($store) => $store?.linkMap || null,
  );

  const isLoading: Readable<boolean> = derived(
    sessionDataStore,
    ($store) => $store?.isLoading || false,
  );

  const error: Readable<string | null> = derived(
    sessionDataStore,
    ($store) => $store?.error || null,
  );

  // Factory functions for node-specific queries (same logic as original)
  const questionsForNode = (nodeId: string): Readable<ActionNode[]> => {
    return derived(sessionData, ($sessionData) => {
      if (!$sessionData?.nodes?.actions) return [];

      return $sessionData.nodes.actions.filter(
        (action: ActionNode) =>
          action.actionType === "question" &&
          action.relationships?.some((rel: any) => rel.nodeId === nodeId),
      );
    });
  };

  const alertsForNode = (nodeId: string): Readable<ActionNode[]> => {
    return derived(sessionData, ($sessionData) => {
      if (!$sessionData?.nodes?.actions) return [];

      return $sessionData.nodes.actions.filter(
        (action: ActionNode) =>
          action.actionType === "alert" &&
          action.relationships?.some((rel: any) => rel.nodeId === nodeId),
      );
    });
  };

  // Additional derived stores
  const questions: Readable<ActionNode[]> = derived(
    sessionData,
    ($sessionData) =>
      $sessionData?.nodes?.actions?.filter(
        (action: ActionNode) => action.actionType === "question",
      ) || [],
  );

  const alerts: Readable<ActionNode[]> = derived(
    sessionData,
    ($sessionData) =>
      $sessionData?.nodes?.actions?.filter(
        (action: ActionNode) => action.actionType === "alert",
      ) || [],
  );

  const pendingQuestions: Readable<ActionNode[]> = derived(
    questions,
    ($questions) => $questions.filter((q) => q.status === "pending"),
  );

  const pendingAlerts: Readable<ActionNode[]> = derived(alerts, ($alerts) =>
    $alerts.filter((a) => a.status === "pending"),
  );

  const questionsForLink = (link: any): Readable<ActionNode[]> => {
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
  };

  const alertsForLink = (link: any): Readable<ActionNode[]> => {
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
  };

  // Sorted questions (reusing imported calculateCompositeScore - no duplication!)
  const sortedQuestions: Readable<ActionNode[]> = derived(
    [questions, sessionData],
    ([$questions, $sessionData]) => {
      if (!$questions.length || !$sessionData) return $questions;

      return [...$questions].sort((a, b) => {
        const scoreA = calculateCompositeScore(a, $sessionData);
        const scoreB = calculateCompositeScore(b, $sessionData);
        return scoreB - scoreA;
      });
    },
  );

  const sortedPendingQuestions: Readable<ActionNode[]> = derived(
    sortedQuestions,
    ($sortedQuestions) =>
      $sortedQuestions.filter((q) => q.status === "pending"),
  );

  // Filtered Sankey data with thresholds
  const sankeyDataFiltered = derived(
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

  const hiddenCounts: Readable<HiddenCounts> = derived(
    [sankeyData, thresholds],
    ([$sankeyData, $thresholds]) => {
      if (!$sankeyData || !$thresholds) {
        return { symptoms: 0, diagnoses: 0, treatments: 0 } as HiddenCounts;
      }

      const { hiddenCounts } = applySankeyThresholds($sankeyData, $thresholds);
      return hiddenCounts;
    },
  );

  // Cleanup function
  const cleanup = () => {
    logger.session.debug("Cleaning up session data store instance", {
      storeId,
    });
    sessionDataStore.set(null);
    thresholds.set({
      symptoms: { severityThreshold: 7, showAll: false },
      diagnoses: { probabilityThreshold: 0.35, showAll: false },
      treatments: { priorityThreshold: 10, showAll: true },
    });
  };

  return {
    // Instance metadata
    id: storeId,
    cleanup,

    // Actions
    actions,

    // Core stores
    sessionData,
    sankeyData,
    sankeyDataFiltered,
    relationshipIndex,
    nodeMap,
    linkMap,
    isLoading,
    error,
    thresholds,
    hiddenCounts,

    // Derived stores
    questions,
    alerts,
    pendingQuestions,
    pendingAlerts,
    sortedQuestions,
    sortedPendingQuestions,

    // Factory functions
    questionsForNode,
    alertsForNode,
    questionsForLink,
    alertsForLink,
  };
}

export type SessionDataStoreInstance = ReturnType<
  typeof createSessionDataStoreInstance
>;
