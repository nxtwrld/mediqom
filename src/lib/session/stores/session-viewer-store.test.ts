import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// ── Mocks (must come before module import) ────────────────────────────────

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock("$components/session/utils/sankeyDataTransformer", () => ({
  transformToSankeyData: vi.fn((session: any) => ({ nodes: [], links: [], _session: session })),
  applySankeyThresholds: vi.fn((sankeyData: any) => ({
    sankeyData,
    hiddenCounts: { symptoms: 0, diagnoses: 0, treatments: 0 },
  })),
}));

vi.mock("$lib/session/constants", () => ({
  QUESTION_SCORING: {
    URGENCY_SCORES: {
      red_flag: 10,
      risk_assessment: 8,
      drug_interaction: 7,
      contraindication: 7,
      allergy: 7,
      warning: 6,
      diagnostic_clarification: 6,
      symptom_exploration: 4,
      treatment_selection: 3,
    },
    WEIGHTS: { URGENCY: 0.4, RELEVANCE: 0.4, PRIORITY: 0.2 },
    SCALING: { PROBABILITY_MULTIPLIER: 10, PRIORITY_INVERSION: 11 },
  },
}));

// Import after mocks
import {
  sessionViewerActions,
  sessionViewerStore,
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
} from "./session-viewer-store";

import { sessionDataActions, thresholds } from "./session-data-store";
import type { SessionAnalysis } from "$components/session/types/visualization";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    sessionId: "session-1",
    timestamp: "2024-01-01T00:00:00Z",
    analysisVersion: 1,
    nodes: {
      symptoms: [],
      diagnoses: [],
      treatments: [],
      actions: [],
    },
    ...overrides,
  };
}

function makeSymptom(id = "s1") {
  return { id, text: "Headache", severity: 5, confidence: 0.8, source: "transcript" as const };
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionViewerActions.resetViewerState();
  sessionDataActions.clearSession();
});

// ── Initial state ─────────────────────────────────────────────────────────

describe("initial state", () => {
  it("selectedItem is null", () => {
    expect(get(selectedItem)).toBeNull();
  });

  it("hoveredItem is null", () => {
    expect(get(hoveredItem)).toBeNull();
  });

  it("activePath is null", () => {
    expect(get(activePath)).toBeNull();
  });

  it("highlightedNodes is empty set", () => {
    expect(get(highlightedNodes).size).toBe(0);
  });

  it("highlightedLinks is empty set", () => {
    expect(get(highlightedLinks).size).toBe(0);
  });

  it("zoomLevel is 1", () => {
    expect(get(zoomLevel)).toBe(1);
  });

  it("panOffset is {x:0, y:0}", () => {
    expect(get(panOffset)).toEqual({ x: 0, y: 0 });
  });

  it("sidebarOpen is true", () => {
    expect(get(sidebarOpen)).toBe(true);
  });

  it("activeTab is 'questions'", () => {
    expect(get(activeTab)).toBe("questions");
  });

  it("isInteractive is true", () => {
    expect(get(isInteractive)).toBe(true);
  });

  it("acknowledgedAlerts is empty set", () => {
    expect(get(acknowledgedAlerts).size).toBe(0);
  });

  it("answeredQuestions is empty map", () => {
    expect(get(answeredQuestions).size).toBe(0);
  });
});

// ── selectItem ────────────────────────────────────────────────────────────

describe("sessionViewerActions.selectItem", () => {
  it("sets selectedItem with node type", () => {
    sessionViewerActions.selectItem("node", "s1", { id: "s1" });
    const si = get(selectedItem);
    expect(si).not.toBeNull();
    expect(si!.type).toBe("node");
    expect(si!.id).toBe("s1");
  });

  it("sets selectedItem with link type", () => {
    sessionViewerActions.selectItem("link", "s1-d1", { source: "s1", target: "d1" });
    const si = get(selectedItem);
    expect(si!.type).toBe("link");
    expect(si!.id).toBe("s1-d1");
  });

  it("triggers calculateAndSetActivePath when node is selected without session data", () => {
    // Without session data, path calculation returns null -> clearActivePath is called
    sessionViewerActions.selectItem("node", "s1", { id: "s1" });
    // activePath should be null (no session data, so path calc returned null)
    expect(get(activePath)).toBeNull();
  });

  it("sets active path when node is selected with session data", () => {
    const symptom = makeSymptom("s1");
    sessionDataActions.loadSession(makeSession({ nodes: { symptoms: [symptom], diagnoses: [], treatments: [], actions: [] } }));
    sessionViewerActions.selectItem("node", "s1", symptom);
    // Should have set activePath (may be minimal since no relationships)
    const path = get(activePath);
    expect(path).not.toBeNull();
    expect(path!.nodes).toContain("s1");
  });

  it("does not set activePath when link is selected", () => {
    sessionViewerActions.selectItem("link", "s1-d1", {});
    // No path calculation for links
    expect(get(activePath)).toBeNull();
  });
});

// ── clearSelection ────────────────────────────────────────────────────────

describe("sessionViewerActions.clearSelection", () => {
  it("clears selectedItem", () => {
    sessionViewerActions.selectItem("node", "s1", {});
    sessionViewerActions.clearSelection();
    expect(get(selectedItem)).toBeNull();
  });

  it("clears activePath", () => {
    sessionViewerActions.setActivePath(["s1"], ["s1-d1"]);
    sessionViewerActions.clearSelection();
    expect(get(activePath)).toBeNull();
  });

  it("clears highlighted nodes", () => {
    sessionViewerActions.setActivePath(["s1", "d1"], []);
    sessionViewerActions.clearSelection();
    expect(get(highlightedNodes).size).toBe(0);
  });
});

// ── setHoveredItem ────────────────────────────────────────────────────────

describe("sessionViewerActions.setHoveredItem", () => {
  it("sets hoveredItem", () => {
    sessionViewerActions.setHoveredItem("node", "d1", { id: "d1" });
    expect(get(hoveredItem)).toEqual({ type: "node", id: "d1", item: { id: "d1" } });
  });

  it("clears hoveredItem when type is null", () => {
    sessionViewerActions.setHoveredItem("node", "d1", {});
    sessionViewerActions.setHoveredItem(null);
    expect(get(hoveredItem)).toBeNull();
  });
});

// ── setActivePath / clearActivePath ──────────────────────────────────────

describe("sessionViewerActions.setActivePath / clearActivePath", () => {
  it("sets activePath with nodes and links", () => {
    sessionViewerActions.setActivePath(["s1", "d1"], ["s1-d1"]);
    const path = get(activePath);
    expect(path).not.toBeNull();
    expect(path!.nodes).toEqual(["s1", "d1"]);
    expect(path!.links).toEqual(["s1-d1"]);
  });

  it("sets highlightedNodes from path nodes", () => {
    sessionViewerActions.setActivePath(["s1", "d1"], []);
    expect(get(highlightedNodes).has("s1")).toBe(true);
    expect(get(highlightedNodes).has("d1")).toBe(true);
  });

  it("sets highlightedLinks from path links", () => {
    sessionViewerActions.setActivePath([], ["s1-d1"]);
    expect(get(highlightedLinks).has("s1-d1")).toBe(true);
  });

  it("clearActivePath resets to null", () => {
    sessionViewerActions.setActivePath(["s1"], ["s1-d1"]);
    sessionViewerActions.clearActivePath();
    expect(get(activePath)).toBeNull();
    expect(get(highlightedNodes).size).toBe(0);
    expect(get(highlightedLinks).size).toBe(0);
  });
});

// ── calculateAndSetActivePath ─────────────────────────────────────────────

describe("sessionViewerActions.calculateAndSetActivePath", () => {
  it("clears path when no session data available", () => {
    sessionViewerActions.setActivePath(["s1"], []);
    sessionViewerActions.calculateAndSetActivePath("s1");
    expect(get(activePath)).toBeNull();
  });

  it("sets path based on session data", () => {
    const symptom = makeSymptom("s1");
    sessionDataActions.loadSession(makeSession({ nodes: { symptoms: [symptom], diagnoses: [], treatments: [], actions: [] } }));
    sessionViewerActions.calculateAndSetActivePath("s1");
    const path = get(activePath);
    expect(path).not.toBeNull();
    expect(path!.nodes).toContain("s1");
  });
});

// ── highlightNodes / highlightLinks / clearHighlights ────────────────────

describe("highlight management", () => {
  it("highlightNodes sets highlighted nodes", () => {
    sessionViewerActions.highlightNodes(["s1", "d1"]);
    const nodes = get(highlightedNodes);
    expect(nodes.has("s1")).toBe(true);
    expect(nodes.has("d1")).toBe(true);
  });

  it("highlightLinks sets highlighted links", () => {
    sessionViewerActions.highlightLinks(["s1-d1", "d1-t1"]);
    const links = get(highlightedLinks);
    expect(links.has("s1-d1")).toBe(true);
    expect(links.has("d1-t1")).toBe(true);
  });

  it("clearHighlights resets both sets", () => {
    sessionViewerActions.highlightNodes(["s1"]);
    sessionViewerActions.highlightLinks(["s1-d1"]);
    sessionViewerActions.clearHighlights();
    expect(get(highlightedNodes).size).toBe(0);
    expect(get(highlightedLinks).size).toBe(0);
  });
});

// ── zoom and pan ──────────────────────────────────────────────────────────

describe("zoom and pan", () => {
  it("setZoom clamps to minimum 0.1", () => {
    sessionViewerActions.setZoom(0.0001);
    expect(get(zoomLevel)).toBe(0.1);
  });

  it("setZoom clamps to maximum 5", () => {
    sessionViewerActions.setZoom(100);
    expect(get(zoomLevel)).toBe(5);
  });

  it("setZoom sets level within bounds", () => {
    sessionViewerActions.setZoom(2.5);
    expect(get(zoomLevel)).toBe(2.5);
  });

  it("setPan sets pan offset", () => {
    sessionViewerActions.setPan(100, 200);
    expect(get(panOffset)).toEqual({ x: 100, y: 200 });
  });

  it("resetView resets zoom and pan", () => {
    sessionViewerActions.setZoom(3);
    sessionViewerActions.setPan(50, 50);
    sessionViewerActions.resetView();
    expect(get(zoomLevel)).toBe(1);
    expect(get(panOffset)).toEqual({ x: 0, y: 0 });
  });
});

// ── sidebar controls ──────────────────────────────────────────────────────

describe("sidebar controls", () => {
  it("toggleSidebar toggles from true to false", () => {
    expect(get(sidebarOpen)).toBe(true);
    sessionViewerActions.toggleSidebar();
    expect(get(sidebarOpen)).toBe(false);
  });

  it("toggleSidebar toggles from false to true", () => {
    sessionViewerActions.setSidebarOpen(false);
    sessionViewerActions.toggleSidebar();
    expect(get(sidebarOpen)).toBe(true);
  });

  it("setSidebarOpen sets explicit value", () => {
    sessionViewerActions.setSidebarOpen(false);
    expect(get(sidebarOpen)).toBe(false);
    sessionViewerActions.setSidebarOpen(true);
    expect(get(sidebarOpen)).toBe(true);
  });
});

// ── tab controls ──────────────────────────────────────────────────────────

describe("tab controls", () => {
  it("setActiveTab updates activeTabId", () => {
    sessionViewerActions.setActiveTab("details");
    expect(get(activeTab)).toBe("details");
  });

  it("selectDetailsTab opens sidebar and sets activeTabId to details", () => {
    sessionViewerActions.setSidebarOpen(false);
    sessionViewerActions.selectDetailsTab();
    expect(get(sidebarOpen)).toBe(true);
    expect(get(activeTab)).toBe("details");
  });

  it("updateTabContext updates tabContext in store", () => {
    const context = { hasTranscript: true, isMobile: false, questionCount: 3, alertCount: 1 };
    sessionViewerActions.updateTabContext(context);
    const state = get(sessionViewerStore);
    expect(state.tabContext).toEqual(context);
  });
});

// ── legend ────────────────────────────────────────────────────────────────

describe("legend", () => {
  it("toggleLegend toggles showLegend", () => {
    const before = get(sessionViewerStore).showLegend;
    sessionViewerActions.toggleLegend();
    expect(get(sessionViewerStore).showLegend).toBe(!before);
  });
});

// ── filter options ────────────────────────────────────────────────────────

describe("filter options", () => {
  it("setFilter updates a specific filter key", () => {
    sessionViewerActions.setFilter("showSymptoms", false);
    expect(get(filterOptions).showSymptoms).toBe(false);
  });

  it("setFilter does not affect other filter keys", () => {
    sessionViewerActions.setFilter("showDiagnoses", false);
    const opts = get(filterOptions);
    expect(opts.showSymptoms).toBe(true);
    expect(opts.showTreatments).toBe(true);
    expect(opts.showActions).toBe(true);
  });
});

// ── interaction state ─────────────────────────────────────────────────────

describe("interaction state", () => {
  it("setDragging sets isDragging true", () => {
    sessionViewerActions.setDragging(true);
    expect(get(sessionViewerStore).isDragging).toBe(true);
  });

  it("setDragging sets isDragging false", () => {
    sessionViewerActions.setDragging(true);
    sessionViewerActions.setDragging(false);
    expect(get(sessionViewerStore).isDragging).toBe(false);
  });

  it("setZooming sets isZooming true", () => {
    sessionViewerActions.setZooming(true);
    expect(get(sessionViewerStore).isZooming).toBe(true);
  });

  it("setZooming sets isZooming false", () => {
    sessionViewerActions.setZooming(true);
    sessionViewerActions.setZooming(false);
    expect(get(sessionViewerStore).isZooming).toBe(false);
  });
});

// ── interactivity mode ────────────────────────────────────────────────────

describe("sessionViewerActions.setInteractive", () => {
  it("sets isInteractive to false", () => {
    sessionViewerActions.setInteractive(false);
    expect(get(isInteractive)).toBe(false);
  });

  it("sets isInteractive back to true", () => {
    sessionViewerActions.setInteractive(false);
    sessionViewerActions.setInteractive(true);
    expect(get(isInteractive)).toBe(true);
  });
});

// ── alert acknowledgment ──────────────────────────────────────────────────

describe("sessionViewerActions.acknowledgeAlert", () => {
  it("adds alertId to acknowledgedAlerts set", () => {
    sessionViewerActions.acknowledgeAlert("a1");
    expect(get(acknowledgedAlerts).has("a1")).toBe(true);
  });

  it("acknowledges multiple alerts", () => {
    sessionViewerActions.acknowledgeAlert("a1");
    sessionViewerActions.acknowledgeAlert("a2");
    const acked = get(acknowledgedAlerts);
    expect(acked.has("a1")).toBe(true);
    expect(acked.has("a2")).toBe(true);
  });

  it("acknowledging the same alert twice does not add duplicates", () => {
    sessionViewerActions.acknowledgeAlert("a1");
    sessionViewerActions.acknowledgeAlert("a1");
    expect(get(acknowledgedAlerts).size).toBe(1);
  });
});

// ── question answering ────────────────────────────────────────────────────

describe("sessionViewerActions.answerQuestion", () => {
  it("adds question answer to answeredQuestions map", () => {
    sessionViewerActions.answerQuestion("q1", "yes", 0.9);
    const answers = get(answeredQuestions);
    expect(answers.has("q1")).toBe(true);
    expect(answers.get("q1")).toEqual({ answer: "yes", confidence: 0.9 });
  });

  it("overwrites previous answer for same questionId", () => {
    sessionViewerActions.answerQuestion("q1", "yes", 0.9);
    sessionViewerActions.answerQuestion("q1", "no", 0.5);
    const answers = get(answeredQuestions);
    expect(answers.get("q1")).toEqual({ answer: "no", confidence: 0.5 });
  });

  it("stores answers for multiple questions", () => {
    sessionViewerActions.answerQuestion("q1", "yes", 0.9);
    sessionViewerActions.answerQuestion("q2", "no", 0.4);
    expect(get(answeredQuestions).size).toBe(2);
  });
});

// ── threshold management ──────────────────────────────────────────────────

describe("threshold management", () => {
  it("setSymptomThreshold clamps to min 1", () => {
    sessionViewerActions.setSymptomThreshold(0);
    expect(get(thresholds).symptoms.severityThreshold).toBe(1);
  });

  it("setSymptomThreshold clamps to max 10", () => {
    sessionViewerActions.setSymptomThreshold(15);
    expect(get(thresholds).symptoms.severityThreshold).toBe(10);
  });

  it("setSymptomThreshold sets value within bounds", () => {
    sessionViewerActions.setSymptomThreshold(5);
    expect(get(thresholds).symptoms.severityThreshold).toBe(5);
  });

  it("setDiagnosisThreshold clamps to min 0", () => {
    sessionViewerActions.setDiagnosisThreshold(-1);
    expect(get(thresholds).diagnoses.probabilityThreshold).toBe(0);
  });

  it("setDiagnosisThreshold clamps to max 1", () => {
    sessionViewerActions.setDiagnosisThreshold(5);
    expect(get(thresholds).diagnoses.probabilityThreshold).toBe(1);
  });

  it("setDiagnosisThreshold sets value within bounds", () => {
    sessionViewerActions.setDiagnosisThreshold(0.6);
    expect(get(thresholds).diagnoses.probabilityThreshold).toBe(0.6);
  });

  it("setTreatmentThreshold clamps to min 1", () => {
    sessionViewerActions.setTreatmentThreshold(0);
    expect(get(thresholds).treatments.priorityThreshold).toBe(1);
  });

  it("setTreatmentThreshold clamps to max 10", () => {
    sessionViewerActions.setTreatmentThreshold(20);
    expect(get(thresholds).treatments.priorityThreshold).toBe(10);
  });

  it("setTreatmentThreshold sets value within bounds", () => {
    sessionViewerActions.setTreatmentThreshold(7);
    expect(get(thresholds).treatments.priorityThreshold).toBe(7);
  });
});

// ── toggleShowAll* ────────────────────────────────────────────────────────

describe("toggleShowAll* actions", () => {
  it("toggleShowAllSymptoms flips symptoms.showAll", () => {
    const before = get(thresholds).symptoms.showAll;
    sessionViewerActions.toggleShowAllSymptoms();
    expect(get(thresholds).symptoms.showAll).toBe(!before);
  });

  it("toggleShowAllDiagnoses flips diagnoses.showAll", () => {
    const before = get(thresholds).diagnoses.showAll;
    sessionViewerActions.toggleShowAllDiagnoses();
    expect(get(thresholds).diagnoses.showAll).toBe(!before);
  });

  it("toggleShowAllTreatments flips treatments.showAll", () => {
    const before = get(thresholds).treatments.showAll;
    sessionViewerActions.toggleShowAllTreatments();
    expect(get(thresholds).treatments.showAll).toBe(!before);
  });
});

// ── setHiddenCounts ───────────────────────────────────────────────────────

describe("sessionViewerActions.setHiddenCounts", () => {
  it("updates hiddenCounts in viewer store", () => {
    sessionViewerActions.setHiddenCounts({ symptoms: 3, diagnoses: 1, treatments: 0 });
    const state = get(sessionViewerStore);
    expect(state.hiddenCounts).toEqual({ symptoms: 3, diagnoses: 1, treatments: 0 });
  });
});

// ── resetViewerState ──────────────────────────────────────────────────────

describe("sessionViewerActions.resetViewerState", () => {
  it("resets all state to initial values", () => {
    sessionViewerActions.selectItem("node", "s1", {});
    sessionViewerActions.setZoom(3);
    sessionViewerActions.setPan(100, 100);
    sessionViewerActions.setActiveTab("details");
    sessionViewerActions.acknowledgeAlert("a1");
    sessionViewerActions.answerQuestion("q1", "yes", 0.9);

    sessionViewerActions.resetViewerState();

    expect(get(selectedItem)).toBeNull();
    expect(get(zoomLevel)).toBe(1);
    expect(get(panOffset)).toEqual({ x: 0, y: 0 });
    expect(get(activeTab)).toBe("questions");
    expect(get(acknowledgedAlerts).size).toBe(0);
    expect(get(answeredQuestions).size).toBe(0);
  });
});

// ── sessionViewerStore direct export ─────────────────────────────────────

describe("sessionViewerStore (direct export)", () => {
  it("is exposed for direct access", () => {
    expect(sessionViewerStore).toBeDefined();
    expect(typeof sessionViewerStore.subscribe).toBe("function");
  });

  it("reflects current state", () => {
    const state = get(sessionViewerStore);
    expect(state.sidebarOpen).toBe(true);
    expect(state.activeTabId).toBe("questions");
  });
});
