import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// ── Mocks (must come before module import) ────────────────────────────────

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

vi.mock("$lib/session/constants", () => ({
  QUESTION_SCORING: {
    URGENCY_SCORES: {
      red_flag: 10,
      risk_assessment: 8,
    },
    WEIGHTS: { URGENCY: 0.4, RELEVANCE: 0.4, PRIORITY: 0.2 },
    SCALING: { PROBABILITY_MULTIPLIER: 10, PRIORITY_INVERSION: 11 },
  },
}));

vi.mock("$components/session/utils/sankeyDataTransformer", () => ({
  transformToSankeyData: vi.fn().mockReturnValue({ nodes: [], links: [] }),
  applySankeyThresholds: vi.fn().mockImplementation((data: any) => ({
    sankeyData: data,
    hiddenCounts: { symptoms: 1, diagnoses: 2, treatments: 3 },
  })),
}));

vi.mock("./utils/session-data-utils", () => ({
  buildRelationshipIndex: vi.fn().mockReturnValue({
    forward: new Map(),
    reverse: new Map(),
    nodeTypes: new Map(),
  }),
  buildNodeAndLinkMaps: vi.fn().mockReturnValue({
    nodeMap: new Map(),
    linkMap: new Map(),
  }),
  calculatePathFromNode: vi.fn().mockReturnValue({
    trigger: { type: "node", id: "n1", item: null },
    path: { nodes: ["n1"], links: [] },
  }),
  calculateCompositeScore: vi.fn().mockReturnValue(0.5),
}));

// ── Import after mocks ────────────────────────────────────────────────────

import { createSessionViewerStoreInstance } from "./session-viewer-store-instance";

// ── Mock data store factory ───────────────────────────────────────────────

function makeMockDataStore() {
  return {
    sankeyData: {
      subscribe: vi.fn((cb: (v: any) => void) => {
        cb(null);
        return () => {};
      }),
    },
    thresholds: {
      subscribe: vi.fn((cb: (v: any) => void) => {
        cb({
          symptoms: { severityThreshold: 7, showAll: false },
          diagnoses: { probabilityThreshold: 0.35, showAll: false },
          treatments: { priorityThreshold: 10, showAll: true },
        });
        return () => {};
      }),
      update: vi.fn(),
    },
    actions: {
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      calculatePath: vi.fn().mockReturnValue(null),
    },
    sessionData: {
      subscribe: vi.fn((cb: (v: any) => void) => {
        cb(null);
        return () => {};
      }),
    },
    nodeMap: {
      subscribe: vi.fn((cb: (v: any) => void) => {
        cb(null);
        return () => {};
      }),
    },
    cleanup: vi.fn(),
    id: "mock-data-store",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("createSessionViewerStoreInstance", () => {
  let mockDataStore: ReturnType<typeof makeMockDataStore>;
  let instance: ReturnType<typeof createSessionViewerStoreInstance>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDataStore = makeMockDataStore();
    instance = createSessionViewerStoreInstance(mockDataStore as any, "test-viewer");
  });

  afterEach(() => {
    instance.cleanup();
  });

  // ── Factory basics ──────────────────────────────────────────────────────

  it("returns object with store and actions", () => {
    expect(instance).toBeDefined();
    expect(typeof instance.sessionViewerStore.subscribe).toBe("function");
    expect(typeof instance.actions).toBe("object");
  });

  it("creates instance with given ID", () => {
    expect(instance.id).toBe("test-viewer");
  });

  it("creates instance with generated ID when none provided", () => {
    const auto = createSessionViewerStoreInstance(mockDataStore as any);
    expect(auto.id).toMatch(/^session_viewer_/);
    auto.cleanup();
  });

  it("exposes expected action methods", () => {
    const expectedActions = [
      "selectItem",
      "clearSelection",
      "setHoveredItem",
      "setActivePath",
      "clearActivePath",
      "calculateAndSetActivePath",
      "highlightNodes",
      "highlightLinks",
      "clearHighlights",
      "setZoom",
      "setPan",
      "resetView",
      "toggleSidebar",
      "setSidebarOpen",
      "setActiveTab",
      "selectDetailsTab",
      "updateTabContext",
      "toggleLegend",
      "setFilter",
      "setDragging",
      "setZooming",
      "setInteractive",
      "acknowledgeAlert",
      "answerQuestion",
      "setSymptomThreshold",
      "setDiagnosisThreshold",
      "setTreatmentThreshold",
      "toggleShowAllSymptoms",
      "toggleShowAllDiagnoses",
      "toggleShowAllTreatments",
      "setHiddenCounts",
      "resetViewerState",
    ];
    for (const name of expectedActions) {
      expect(typeof (instance.actions as any)[name]).toBe("function");
    }
  });

  // ── Initial state ───────────────────────────────────────────────────────

  it("store.subscribe callback gets called with initial state", () => {
    let captured: any = null;
    const unsub = instance.sessionViewerStore.subscribe((v) => {
      captured = v;
    });
    unsub();
    expect(captured).not.toBeNull();
  });

  it("initial selectedItem is null", () => {
    expect(get(instance.selectedItem)).toBeNull();
  });

  it("initial hoveredItem is null", () => {
    expect(get(instance.hoveredItem)).toBeNull();
  });

  it("initial activePath is null", () => {
    expect(get(instance.activePath)).toBeNull();
  });

  it("initial isInteractive is false", () => {
    expect(get(instance.isInteractive)).toBe(false);
  });

  it("initial activeTab is 'questions'", () => {
    expect(get(instance.activeTab)).toBe("questions");
  });

  it("initial sidebarOpen is true", () => {
    expect(get(instance.sidebarOpen)).toBe(true);
  });

  it("initial zoomLevel is 1", () => {
    expect(get(instance.zoomLevel)).toBe(1);
  });

  it("initial panOffset is {x:0, y:0}", () => {
    expect(get(instance.panOffset)).toEqual({ x: 0, y: 0 });
  });

  it("initial highlightedNodes is an empty Set", () => {
    const nodes = get(instance.highlightedNodes);
    expect(nodes).toBeInstanceOf(Set);
    expect(nodes.size).toBe(0);
  });

  it("initial acknowledgedAlerts is an empty Set", () => {
    const alerts = get(instance.acknowledgedAlerts);
    expect(alerts).toBeInstanceOf(Set);
    expect(alerts.size).toBe(0);
  });

  it("initial answeredQuestions is an empty Map", () => {
    const answered = get(instance.answeredQuestions);
    expect(answered).toBeInstanceOf(Map);
    expect(answered.size).toBe(0);
  });

  // ── actions.setActiveTab ────────────────────────────────────────────────

  describe("actions.setActiveTab", () => {
    it("updates activeTabId in the store", () => {
      instance.actions.setActiveTab("details");
      const state = get(instance.sessionViewerStore);
      expect(state.activeTabId).toBe("details");
    });

    it("updates the activeTab derived store", () => {
      instance.actions.setActiveTab("transcript");
      expect(get(instance.activeTab)).toBe("transcript");
    });
  });

  // ── actions.setActiveTab (multiple tabs) ───────────────────────────────

  it("can switch between multiple tabs", () => {
    instance.actions.setActiveTab("questions");
    expect(get(instance.activeTab)).toBe("questions");
    instance.actions.setActiveTab("details");
    expect(get(instance.activeTab)).toBe("details");
  });

  // ── actions.selectItem ──────────────────────────────────────────────────

  describe("actions.selectItem", () => {
    it("sets selectedItem in the store", () => {
      const item = { id: "n1", name: "test" };
      instance.actions.selectItem("node", "n1", item);
      const selected = get(instance.selectedItem);
      expect(selected).not.toBeNull();
      expect(selected!.type).toBe("node");
      expect(selected!.id).toBe("n1");
      expect(selected!.item).toEqual(item);
    });

    it("calls calculatePath when a node is selected", () => {
      instance.actions.selectItem("node", "n1", {});
      expect(mockDataStore.actions.calculatePath).toHaveBeenCalledWith("n1");
    });

    it("does not call calculatePath for link selections", () => {
      instance.actions.selectItem("link", "l1", {});
      expect(mockDataStore.actions.calculatePath).not.toHaveBeenCalled();
    });
  });

  // ── actions.clearSelection ──────────────────────────────────────────────

  describe("actions.clearSelection", () => {
    it("resets selectedItem to null", () => {
      instance.actions.selectItem("node", "n1", {});
      instance.actions.clearSelection();
      expect(get(instance.selectedItem)).toBeNull();
    });

    it("resets activePath to null", () => {
      instance.actions.setActivePath(["n1"], ["l1"]);
      instance.actions.clearSelection();
      expect(get(instance.activePath)).toBeNull();
    });
  });

  // ── actions.setActivePath ───────────────────────────────────────────────

  describe("actions.setActivePath", () => {
    it("sets activePath", () => {
      instance.actions.setActivePath(["n1", "n2"], ["l1"]);
      const path = get(instance.activePath);
      expect(path).not.toBeNull();
      expect(path!.nodes).toEqual(["n1", "n2"]);
      expect(path!.links).toEqual(["l1"]);
    });

    it("updates highlightedNodes", () => {
      instance.actions.setActivePath(["n1", "n2"], []);
      const nodes = get(instance.highlightedNodes);
      expect(nodes.has("n1")).toBe(true);
      expect(nodes.has("n2")).toBe(true);
    });

    it("updates highlightedLinks", () => {
      instance.actions.setActivePath([], ["l1", "l2"]);
      const links = get(instance.highlightedLinks);
      expect(links.has("l1")).toBe(true);
      expect(links.has("l2")).toBe(true);
    });
  });

  // ── actions.clearActivePath ─────────────────────────────────────────────

  describe("actions.clearActivePath", () => {
    it("resets activePath to null", () => {
      instance.actions.setActivePath(["n1"], []);
      instance.actions.clearActivePath();
      expect(get(instance.activePath)).toBeNull();
    });

    it("clears highlightedNodes", () => {
      instance.actions.setActivePath(["n1"], []);
      instance.actions.clearActivePath();
      expect(get(instance.highlightedNodes).size).toBe(0);
    });
  });

  // ── actions.setZoom ─────────────────────────────────────────────────────

  describe("actions.setZoom", () => {
    it("sets zoom level", () => {
      instance.actions.setZoom(2);
      expect(get(instance.zoomLevel)).toBe(2);
    });

    it("clamps zoom to minimum 0.1", () => {
      instance.actions.setZoom(0);
      expect(get(instance.zoomLevel)).toBe(0.1);
    });

    it("clamps zoom to maximum 5", () => {
      instance.actions.setZoom(10);
      expect(get(instance.zoomLevel)).toBe(5);
    });
  });

  // ── actions.setPan ──────────────────────────────────────────────────────

  it("actions.setPan updates panOffset", () => {
    instance.actions.setPan(100, 200);
    expect(get(instance.panOffset)).toEqual({ x: 100, y: 200 });
  });

  // ── actions.resetView ───────────────────────────────────────────────────

  it("actions.resetView resets zoom and pan to defaults", () => {
    instance.actions.setZoom(3);
    instance.actions.setPan(50, 50);
    instance.actions.resetView();
    expect(get(instance.zoomLevel)).toBe(1);
    expect(get(instance.panOffset)).toEqual({ x: 0, y: 0 });
  });

  // ── actions.toggleSidebar ───────────────────────────────────────────────

  it("actions.toggleSidebar toggles sidebarOpen", () => {
    const initial = get(instance.sidebarOpen);
    instance.actions.toggleSidebar();
    expect(get(instance.sidebarOpen)).toBe(!initial);
    instance.actions.toggleSidebar();
    expect(get(instance.sidebarOpen)).toBe(initial);
  });

  // ── actions.setSidebarOpen ──────────────────────────────────────────────

  it("actions.setSidebarOpen sets sidebarOpen directly", () => {
    instance.actions.setSidebarOpen(false);
    expect(get(instance.sidebarOpen)).toBe(false);
    instance.actions.setSidebarOpen(true);
    expect(get(instance.sidebarOpen)).toBe(true);
  });

  // ── actions.selectDetailsTab ────────────────────────────────────────────

  it("actions.selectDetailsTab opens sidebar and sets 'details' tab", () => {
    instance.actions.setSidebarOpen(false);
    instance.actions.selectDetailsTab();
    expect(get(instance.sidebarOpen)).toBe(true);
    expect(get(instance.activeTab)).toBe("details");
  });

  // ── actions.setInteractive ──────────────────────────────────────────────

  it("actions.setInteractive updates isInteractive", () => {
    instance.actions.setInteractive(true);
    expect(get(instance.isInteractive)).toBe(true);
    instance.actions.setInteractive(false);
    expect(get(instance.isInteractive)).toBe(false);
  });

  // ── actions.acknowledgeAlert ────────────────────────────────────────────

  it("actions.acknowledgeAlert adds alertId to acknowledgedAlerts", () => {
    instance.actions.acknowledgeAlert("alert-1");
    const acknowledged = get(instance.acknowledgedAlerts);
    expect(acknowledged.has("alert-1")).toBe(true);
  });

  // ── actions.answerQuestion ──────────────────────────────────────────────

  it("actions.answerQuestion adds entry to answeredQuestions", () => {
    instance.actions.answerQuestion("q1", "yes", 0.9);
    const answered = get(instance.answeredQuestions);
    expect(answered.has("q1")).toBe(true);
    expect(answered.get("q1")).toEqual({ answer: "yes", confidence: 0.9 });
  });

  // ── actions.setHiddenCounts ─────────────────────────────────────────────

  it("actions.setHiddenCounts updates hiddenCounts in store", () => {
    instance.actions.setHiddenCounts({ symptoms: 5, diagnoses: 3, treatments: 1 });
    const state = get(instance.sessionViewerStore);
    expect(state.hiddenCounts).toEqual({ symptoms: 5, diagnoses: 3, treatments: 1 });
  });

  // ── actions.setSymptomThreshold ─────────────────────────────────────────

  it("actions.setSymptomThreshold delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.setSymptomThreshold(5);
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  // ── actions.setDiagnosisThreshold ──────────────────────────────────────

  it("actions.setDiagnosisThreshold delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.setDiagnosisThreshold(0.5);
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  // ── actions.setTreatmentThreshold ──────────────────────────────────────

  it("actions.setTreatmentThreshold delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.setTreatmentThreshold(8);
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  // ── actions.toggleShowAll* ──────────────────────────────────────────────

  it("actions.toggleShowAllSymptoms delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.toggleShowAllSymptoms();
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  it("actions.toggleShowAllDiagnoses delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.toggleShowAllDiagnoses();
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  it("actions.toggleShowAllTreatments delegates to dataStoreInstance.thresholds.update", () => {
    instance.actions.toggleShowAllTreatments();
    expect(mockDataStore.thresholds.update).toHaveBeenCalled();
  });

  // ── actions.resetViewerState ────────────────────────────────────────────

  it("actions.resetViewerState resets to initial defaults", () => {
    instance.actions.setActiveTab("details");
    instance.actions.setZoom(3);
    instance.actions.setSidebarOpen(false);
    instance.actions.resetViewerState();
    const state = get(instance.sessionViewerStore);
    expect(state.activeTabId).toBe("questions");
    expect(state.zoomLevel).toBe(1);
    expect(state.sidebarOpen).toBe(true);
    expect(state.isInteractive).toBe(false);
  });

  // ── actions.setFilter ───────────────────────────────────────────────────

  describe("actions.setFilter", () => {
    it("updates a filter option", () => {
      instance.actions.setFilter("showSymptoms", false);
      const opts = get(instance.filterOptions);
      expect(opts.showSymptoms).toBe(false);
    });

    it("does not affect other filter options", () => {
      instance.actions.setFilter("showSymptoms", false);
      const opts = get(instance.filterOptions);
      expect(opts.showDiagnoses).toBe(true);
      expect(opts.showTreatments).toBe(true);
    });
  });

  // ── actions.setDragging / setZooming ───────────────────────────────────

  it("actions.setDragging updates isDragging in store", () => {
    instance.actions.setDragging(true);
    expect(get(instance.sessionViewerStore).isDragging).toBe(true);
    instance.actions.setDragging(false);
    expect(get(instance.sessionViewerStore).isDragging).toBe(false);
  });

  it("actions.setZooming updates isZooming in store", () => {
    instance.actions.setZooming(true);
    expect(get(instance.sessionViewerStore).isZooming).toBe(true);
  });

  // ── actions.highlightNodes / highlightLinks / clearHighlights ───────────

  it("actions.highlightNodes sets highlightedNodes", () => {
    instance.actions.highlightNodes(["n1", "n2"]);
    const nodes = get(instance.highlightedNodes);
    expect(nodes.has("n1")).toBe(true);
    expect(nodes.has("n2")).toBe(true);
  });

  it("actions.highlightLinks sets highlightedLinks", () => {
    instance.actions.highlightLinks(["l1"]);
    const links = get(instance.highlightedLinks);
    expect(links.has("l1")).toBe(true);
  });

  it("actions.clearHighlights empties both sets", () => {
    instance.actions.highlightNodes(["n1"]);
    instance.actions.highlightLinks(["l1"]);
    instance.actions.clearHighlights();
    expect(get(instance.highlightedNodes).size).toBe(0);
    expect(get(instance.highlightedLinks).size).toBe(0);
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("can be called without error", () => {
      expect(() => instance.cleanup()).not.toThrow();
    });

    it("resets activeTab to 'questions' after cleanup", () => {
      instance.actions.setActiveTab("details");
      instance.cleanup();
      expect(get(instance.activeTab)).toBe("questions");
    });

    it("resets isInteractive to false after cleanup", () => {
      instance.actions.setInteractive(true);
      instance.cleanup();
      expect(get(instance.isInteractive)).toBe(false);
    });
  });

  // ── Instance isolation ──────────────────────────────────────────────────

  it("two instances are isolated from each other", () => {
    const otherDataStore = makeMockDataStore();
    const other = createSessionViewerStoreInstance(otherDataStore as any, "other-viewer");
    try {
      instance.actions.setActiveTab("details");
      expect(get(instance.activeTab)).toBe("details");
      expect(get(other.activeTab)).toBe("questions");
    } finally {
      other.cleanup();
    }
  });
});
