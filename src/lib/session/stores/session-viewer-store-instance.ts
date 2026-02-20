import { writable, derived, get } from "svelte/store";
import type { Writable, Readable } from "svelte/store";
import { logger } from "$lib/logging/logger";
import type { SessionAnalysis } from "$components/session/types/visualization";
import type { SessionTabContext } from "$components/session/SessionTabs.svelte";
import type { SessionDataStoreInstance } from "./session-data-store-instance";

// Types for UI state (copied from session-viewer-store)
interface SelectedItem {
  type: "node" | "link";
  id: string;
  item: any;
}

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

interface ViewerState {
  // Selection state
  selectedItem: SelectedItem | null;
  hoveredItem: SelectedItem | null;

  // Visual state
  highlightedNodes: Set<string>;
  highlightedLinks: Set<string>;

  // Path visualization
  activePath: {
    nodes: string[];
    links: string[];
  } | null;

  // Zoom and pan
  zoomLevel: number;
  panOffset: { x: number; y: number };

  // UI controls
  sidebarOpen: boolean;
  activeTabId: string;
  tabContext: SessionTabContext;
  showLegend: boolean;
  filterOptions: {
    showSymptoms: boolean;
    showDiagnoses: boolean;
    showTreatments: boolean;
    showActions: boolean;
  };

  // Interaction state
  isDragging: boolean;
  isZooming: boolean;

  // Interactivity mode (false for passive/read-only mode in documents)
  isInteractive: boolean;

  // Alert acknowledgments (UI state, not data)
  acknowledgedAlerts: Set<string>;

  // Question responses (UI state, not data)
  answeredQuestions: Map<string, { answer: any; confidence: number }>;

  // hiddenCounts
  hiddenCounts: HiddenCounts;
}

// Initial state
const initialViewerState: ViewerState = {
  selectedItem: null,
  hoveredItem: null,
  highlightedNodes: new Set(),
  highlightedLinks: new Set(),
  activePath: null,
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },
  sidebarOpen: true,
  activeTabId: "questions",
  tabContext: {
    hasTranscript: false,
    isMobile: false,
    questionCount: 0,
    alertCount: 0,
  },
  showLegend: true,
  filterOptions: {
    showSymptoms: true,
    showDiagnoses: true,
    showTreatments: true,
    showActions: true,
  },
  isDragging: false,
  isZooming: false,
  isInteractive: false, // Default to non-interactive for document viewing
  acknowledgedAlerts: new Set(),
  answeredQuestions: new Map(),
  hiddenCounts: {
    symptoms: 0,
    diagnoses: 0,
    treatments: 0,
  },
};

/**
 * Factory function to create isolated session viewer store instances
 * For document viewing where UI state should not contaminate global state
 */
export function createSessionViewerStoreInstance(
  dataStoreInstance: SessionDataStoreInstance,
  instanceId?: string,
) {
  const storeId =
    instanceId ||
    `session_viewer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  logger.session.debug("Creating session viewer store instance", { storeId });

  // Create isolated viewer store instance
  const sessionViewerStore: Writable<ViewerState> = writable({
    ...initialViewerState,
    isInteractive: false, // Document viewing should be non-interactive by default
  });

  // Actions that operate on the local store instance
  const actions = {
    /**
     * Selection management
     */
    selectItem(type: "node" | "link", id: string, item: any): void {
      sessionViewerStore.update((state) => ({
        ...state,
        selectedItem: { type, id, item },
      }));

      // Automatically calculate path when a node is selected (using local data store)
      if (type === "node") {
        this.calculateAndSetActivePath(id);
      }

      logger.session.debug("Item selected (isolated)", { type, id, storeId });
    },

    clearSelection(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        selectedItem: null,
        activePath: null,
      }));

      // Clear the active path when selection is cleared
      this.clearActivePath();

      logger.session.debug("Selection cleared (isolated)", { storeId });
    },

    setHoveredItem(
      type: "node" | "link" | null,
      id?: string,
      item?: any,
    ): void {
      sessionViewerStore.update((state) => ({
        ...state,
        hoveredItem: type ? { type, id: id!, item } : null,
      }));
    },

    /**
     * Path visualization
     */
    setActivePath(nodes: string[], links: string[]): void {
      sessionViewerStore.update((state) => ({
        ...state,
        activePath: { nodes, links },
        highlightedNodes: new Set(nodes),
        highlightedLinks: new Set(links),
      }));

      logger.session.debug("Active path set (isolated)", {
        nodeCount: nodes.length,
        linkCount: links.length,
        storeId,
      });
    },

    clearActivePath(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        activePath: null,
        highlightedNodes: new Set(),
        highlightedLinks: new Set(),
      }));

      logger.session.debug("Active path cleared (isolated)", { storeId });
    },

    /**
     * Calculate path for a node and set it as active path using local data store
     */
    calculateAndSetActivePath(nodeId: string): void {
      // Use the local data store instance for path calculation
      const pathCalculation = dataStoreInstance.actions.calculatePath(nodeId);

      if (pathCalculation) {
        this.setActivePath(
          pathCalculation.path.nodes,
          pathCalculation.path.links,
        );
        logger.session.debug(
          "Calculated and set active path using isolated data store",
          {
            nodeId,
            pathNodes: pathCalculation.path.nodes.length,
            pathLinks: pathCalculation.path.links.length,
            storeId,
          },
        );
      } else {
        this.clearActivePath();
        logger.session.debug(
          "No path calculated, cleared active path (isolated)",
          {
            nodeId,
            storeId,
          },
        );
      }
    },

    /**
     * Highlight management
     */
    highlightNodes(nodeIds: string[]): void {
      sessionViewerStore.update((state) => ({
        ...state,
        highlightedNodes: new Set(nodeIds),
      }));
    },

    highlightLinks(linkIds: string[]): void {
      sessionViewerStore.update((state) => ({
        ...state,
        highlightedLinks: new Set(linkIds),
      }));
    },

    clearHighlights(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        highlightedNodes: new Set(),
        highlightedLinks: new Set(),
      }));
    },

    /**
     * Zoom and pan
     */
    setZoom(level: number): void {
      sessionViewerStore.update((state) => ({
        ...state,
        zoomLevel: Math.max(0.1, Math.min(5, level)),
      }));
    },

    setPan(x: number, y: number): void {
      sessionViewerStore.update((state) => ({
        ...state,
        panOffset: { x, y },
      }));
    },

    resetView(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        zoomLevel: 1,
        panOffset: { x: 0, y: 0 },
      }));

      logger.session.debug("View reset to default (isolated)", { storeId });
    },

    /**
     * UI controls
     */
    toggleSidebar(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        sidebarOpen: !state.sidebarOpen,
      }));
    },

    setSidebarOpen(open: boolean): void {
      sessionViewerStore.update((state) => ({
        ...state,
        sidebarOpen: open,
      }));
    },

    setActiveTab(tabId: string): void {
      sessionViewerStore.update((state) => ({
        ...state,
        activeTabId: tabId,
      }));

      logger.session.debug("Active tab changed (isolated)", { tabId, storeId });
    },

    selectDetailsTab(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        sidebarOpen: true,
        activeTabId: "details",
      }));

      logger.session.debug(
        "Details tab selected and sidebar opened (isolated)",
        { storeId },
      );
    },

    updateTabContext(context: SessionTabContext): void {
      sessionViewerStore.update((state) => ({
        ...state,
        tabContext: context,
      }));

      logger.session.debug("Tab context updated (isolated)", {
        context,
        storeId,
      });
    },

    toggleLegend(): void {
      sessionViewerStore.update((state) => ({
        ...state,
        showLegend: !state.showLegend,
      }));
    },

    setFilter(
      filterType: keyof ViewerState["filterOptions"],
      enabled: boolean,
    ): void {
      sessionViewerStore.update((state) => ({
        ...state,
        filterOptions: {
          ...state.filterOptions,
          [filterType]: enabled,
        },
      }));
    },

    /**
     * Interaction state
     */
    setDragging(isDragging: boolean): void {
      sessionViewerStore.update((state) => ({
        ...state,
        isDragging,
      }));
    },

    setZooming(isZooming: boolean): void {
      sessionViewerStore.update((state) => ({
        ...state,
        isZooming,
      }));
    },

    /**
     * Set interactivity mode
     */
    setInteractive(isInteractive: boolean): void {
      sessionViewerStore.update((state) => ({
        ...state,
        isInteractive,
      }));

      logger.session.debug("Interactivity mode updated (isolated)", {
        isInteractive,
        storeId,
      });
    },

    /**
     * Alert and question state (UI only)
     */
    acknowledgeAlert(alertId: string): void {
      sessionViewerStore.update((state) => {
        const newAcknowledged = new Set(state.acknowledgedAlerts);
        newAcknowledged.add(alertId);
        return {
          ...state,
          acknowledgedAlerts: newAcknowledged,
        };
      });

      logger.session.debug("Alert acknowledged (isolated)", {
        alertId,
        storeId,
      });
    },

    answerQuestion(questionId: string, answer: any, confidence: number): void {
      sessionViewerStore.update((state) => {
        const newAnswers = new Map(state.answeredQuestions);
        newAnswers.set(questionId, { answer, confidence });
        return {
          ...state,
          answeredQuestions: newAnswers,
        };
      });

      logger.session.debug("Question answered (isolated)", {
        questionId,
        confidence,
        storeId,
      });
    },

    /**
     * Threshold management (delegates to data store instance)
     */
    setSymptomThreshold(threshold: number): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        symptoms: {
          ...current.symptoms,
          severityThreshold: Math.max(1, Math.min(10, threshold)),
        },
      }));

      logger.session.debug("Symptom threshold updated (isolated)", {
        threshold,
        storeId,
      });
    },

    setDiagnosisThreshold(threshold: number): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        diagnoses: {
          ...current.diagnoses,
          probabilityThreshold: Math.max(0, Math.min(1, threshold)),
        },
      }));

      logger.session.debug("Diagnosis threshold updated (isolated)", {
        threshold,
        storeId,
      });
    },

    setTreatmentThreshold(threshold: number): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        treatments: {
          ...current.treatments,
          priorityThreshold: Math.max(1, Math.min(10, threshold)),
        },
      }));

      logger.session.debug("Treatment threshold updated (isolated)", {
        threshold,
        storeId,
      });
    },

    toggleShowAllSymptoms(): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        symptoms: {
          ...current.symptoms,
          showAll: !current.symptoms.showAll,
        },
      }));

      logger.session.debug("Toggle show all symptoms (isolated)", { storeId });
    },

    toggleShowAllDiagnoses(): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        diagnoses: {
          ...current.diagnoses,
          showAll: !current.diagnoses.showAll,
        },
      }));

      logger.session.debug("Toggle show all diagnoses (isolated)", { storeId });
    },

    toggleShowAllTreatments(): void {
      dataStoreInstance.thresholds.update((current) => ({
        ...current,
        treatments: {
          ...current.treatments,
          showAll: !current.treatments.showAll,
        },
      }));

      logger.session.debug("Toggle show all treatments (isolated)", {
        storeId,
      });
    },

    setHiddenCounts(counts: HiddenCounts): void {
      sessionViewerStore.update((state) => ({
        ...state,
        hiddenCounts: counts,
      }));

      logger.session.debug("Hidden counts updated (isolated)", {
        counts,
        storeId,
      });
    },

    /**
     * Reset viewer state
     */
    resetViewerState(): void {
      sessionViewerStore.set({
        ...initialViewerState,
        isInteractive: false, // Keep non-interactive for document viewing
      });
      logger.session.debug("Viewer state reset (isolated)", { storeId });
    },
  };

  // Derived stores for common UI queries
  const selectedItem: Readable<SelectedItem | null> = derived(
    sessionViewerStore,
    ($store) => $store.selectedItem,
  );

  const hoveredItem: Readable<SelectedItem | null> = derived(
    sessionViewerStore,
    ($store) => $store.hoveredItem,
  );

  const activePath: Readable<{ nodes: string[]; links: string[] } | null> =
    derived(sessionViewerStore, ($store) => $store.activePath);

  const highlightedNodes: Readable<Set<string>> = derived(
    sessionViewerStore,
    ($store) => $store.highlightedNodes,
  );

  const highlightedLinks: Readable<Set<string>> = derived(
    sessionViewerStore,
    ($store) => $store.highlightedLinks,
  );

  const zoomLevel: Readable<number> = derived(
    sessionViewerStore,
    ($store) => $store.zoomLevel,
  );

  const panOffset: Readable<{ x: number; y: number }> = derived(
    sessionViewerStore,
    ($store) => $store.panOffset,
  );

  const sidebarOpen: Readable<boolean> = derived(
    sessionViewerStore,
    ($store) => $store.sidebarOpen,
  );

  const activeTab: Readable<string> = derived(
    sessionViewerStore,
    ($store) => $store.activeTabId,
  );

  const filterOptions: Readable<ViewerState["filterOptions"]> = derived(
    sessionViewerStore,
    ($store) => $store.filterOptions,
  );

  const acknowledgedAlerts: Readable<Set<string>> = derived(
    sessionViewerStore,
    ($store) => $store.acknowledgedAlerts,
  );

  const answeredQuestions: Readable<
    Map<string, { answer: any; confidence: number }>
  > = derived(sessionViewerStore, ($store) => $store.answeredQuestions);

  const isInteractive: Readable<boolean> = derived(
    sessionViewerStore,
    ($store) => $store.isInteractive,
  );

  // Cleanup function
  const cleanup = () => {
    logger.session.debug("Cleaning up session viewer store instance", {
      storeId,
    });
    sessionViewerStore.set({
      ...initialViewerState,
      isInteractive: false,
    });
  };

  return {
    // Instance metadata
    id: storeId,
    cleanup,

    // Actions
    actions,

    // Core store
    sessionViewerStore,

    // Derived stores
    selectedItem,
    hoveredItem,
    activePath,
    highlightedNodes,
    highlightedLinks,
    zoomLevel,
    panOffset,
    sidebarOpen,
    activeTab,
    filterOptions,
    acknowledgedAlerts,
    answeredQuestions,
    isInteractive,
  };
}

export type SessionViewerStoreInstance = ReturnType<
  typeof createSessionViewerStoreInstance
>;
