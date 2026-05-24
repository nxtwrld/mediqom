import { describe, it, expect } from "vitest";
import {
  buildRelationshipIndex,
  buildNodeAndLinkMaps,
  calculatePathFromNode,
  calculateCompositeScore,
  calculateTreatmentPath,
  calculateSymptomPath,
  calculateDiagnosisPath,
} from "./session-data-utils";
import type { SessionAnalysis } from "$components/session/types/visualization";

// ─── Helpers ────────────────────────────────────────────

function makeSessionData(
  overrides: Partial<SessionAnalysis["nodes"]> = {},
): SessionAnalysis {
  return {
    sessionId: "test-session",
    timestamp: "2024-01-01T00:00:00Z",
    analysisVersion: 1,
    nodes: {
      symptoms: [],
      diagnoses: [],
      treatments: [],
      actions: [],
      ...overrides,
    },
  };
}

// ─── buildRelationshipIndex ─────────────────────────────

describe("buildRelationshipIndex", () => {
  it("returns empty maps for empty session data", () => {
    const index = buildRelationshipIndex(makeSessionData());
    expect(index.forward.size).toBe(0);
    expect(index.reverse.size).toBe(0);
    expect(index.nodeTypes.size).toBe(0);
  });

  it("registers node types correctly", () => {
    const data = makeSessionData({
      symptoms: [
        { id: "s1", text: "Headache", severity: 5, confidence: 0.8, source: "transcript" },
      ],
      diagnoses: [
        { id: "d1", name: "Migraine", probability: 0.7, priority: 3, reasoning: "test", confidence: 0.8 },
      ],
      treatments: [
        { id: "t1", type: "medication", name: "Ibuprofen", priority: 2, confidence: 0.9 },
      ],
    });

    const index = buildRelationshipIndex(data);
    expect(index.nodeTypes.get("s1")).toBe("symptom");
    expect(index.nodeTypes.get("d1")).toBe("diagnosis");
    expect(index.nodeTypes.get("t1")).toBe("treatment");
  });

  it("builds forward relationships for outgoing direction", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Headache",
          severity: 5,
          confidence: 0.8,
          source: "transcript",
          relationships: [
            { nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.9 },
          ],
        },
      ],
      diagnoses: [
        { id: "d1", name: "Migraine", probability: 0.7, priority: 3, reasoning: "test", confidence: 0.8 },
      ],
    });

    const index = buildRelationshipIndex(data);
    const fwd = index.forward.get("s1");
    expect(fwd).toBeDefined();
    const entries = Array.from(fwd!);
    expect(entries.some((e) => e.targetId === "d1" && e.type === "supports")).toBe(true);
  });

  it("builds reverse relationships for outgoing direction", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Fever",
          severity: 7,
          confidence: 0.9,
          source: "transcript",
          relationships: [
            { nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.8 },
          ],
        },
      ],
      diagnoses: [
        { id: "d1", name: "Infection", probability: 0.6, priority: 4, reasoning: "fever", confidence: 0.7 },
      ],
    });

    const index = buildRelationshipIndex(data);
    const rev = index.reverse.get("d1");
    expect(rev).toBeDefined();
    const entries = Array.from(rev!);
    expect(entries.some((e) => e.sourceId === "s1")).toBe(true);
  });

  it("handles incoming relationships", () => {
    const data = makeSessionData({
      treatments: [
        {
          id: "t1",
          type: "medication",
          name: "Aspirin",
          priority: 3,
          confidence: 0.8,
          relationships: [
            { nodeId: "d1", relationship: "treats", direction: "incoming", strength: 0.9 },
          ],
        },
      ],
      diagnoses: [
        { id: "d1", name: "Pain", probability: 0.5, priority: 2, reasoning: "pain", confidence: 0.7 },
      ],
    });

    const index = buildRelationshipIndex(data);
    // Incoming: d1 -> t1 is added to forward
    const fwd = index.forward.get("d1");
    expect(fwd).toBeDefined();
    const entries = Array.from(fwd!);
    expect(entries.some((e) => e.targetId === "t1")).toBe(true);
  });

  it("handles bidirectional relationships", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Nausea",
          severity: 4,
          confidence: 0.7,
          source: "transcript",
          relationships: [
            { nodeId: "s2", relationship: "confirms", direction: "bidirectional", strength: 0.6 },
          ],
        },
        {
          id: "s2",
          text: "Vomiting",
          severity: 5,
          confidence: 0.8,
          source: "transcript",
        },
      ],
    });

    const index = buildRelationshipIndex(data);
    // Both forward directions should exist
    const fwdS1 = index.forward.get("s1");
    const fwdS2 = index.forward.get("s2");
    expect(fwdS1).toBeDefined();
    expect(fwdS2).toBeDefined();
  });

  it("defaults confidence to 1.0 when not provided", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Pain",
          severity: 3,
          confidence: 0.5,
          source: "transcript",
          relationships: [
            { nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.7 },
          ],
        },
      ],
      diagnoses: [
        { id: "d1", name: "Injury", probability: 0.4, priority: 2, reasoning: "pain", confidence: 0.6 },
      ],
    });

    const index = buildRelationshipIndex(data);
    const fwd = Array.from(index.forward.get("s1")!);
    expect(fwd[0].confidence).toBe(1.0);
  });
});

// ─── buildNodeAndLinkMaps ───────────────────────────────

describe("buildNodeAndLinkMaps", () => {
  it("returns empty maps for empty session data", () => {
    const { nodeMap, linkMap } = buildNodeAndLinkMaps(makeSessionData());
    expect(nodeMap.size).toBe(0);
    expect(linkMap.size).toBe(0);
  });

  it("indexes all node types into nodeMap", () => {
    const data = makeSessionData({
      symptoms: [{ id: "s1", text: "Cough", severity: 3, confidence: 0.7, source: "transcript" }],
      diagnoses: [{ id: "d1", name: "Bronchitis", probability: 0.5, priority: 3, reasoning: "cough", confidence: 0.6 }],
      treatments: [{ id: "t1", type: "medication", name: "Cough syrup", priority: 1, confidence: 0.8 }],
      actions: [
        {
          id: "a1",
          text: "Check lungs",
          category: "diagnostic_clarification",
          actionType: "question",
          priority: 3,
          status: "pending",
        },
      ],
    });

    const { nodeMap } = buildNodeAndLinkMaps(data);
    expect(nodeMap.size).toBe(4);
    expect(nodeMap.get("s1")?.text).toBe("Cough");
    expect(nodeMap.get("d1")?.name).toBe("Bronchitis");
    expect(nodeMap.get("t1")?.name).toBe("Cough syrup");
    expect(nodeMap.get("a1")?.text).toBe("Check lungs");
  });

  it("builds link map when links are present", () => {
    const data = makeSessionData() as any;
    data.links = [
      { sourceId: "s1", targetId: "d1", type: "supports" },
      { sourceId: "d1", targetId: "t1", type: "treats" },
    ];

    const { linkMap } = buildNodeAndLinkMaps(data);
    expect(linkMap.size).toBe(2);
    expect(linkMap.get("s1-d1")).toBeDefined();
    expect(linkMap.get("d1-t1")).toBeDefined();
  });
});

// ─── calculatePathFromNode ──────────────────────────────

describe("calculatePathFromNode", () => {
  function makeComputedData(session: SessionAnalysis) {
    const relationshipIndex = buildRelationshipIndex(session);
    const { nodeMap, linkMap } = buildNodeAndLinkMaps(session);
    return {
      sessionData: session,
      relationshipIndex,
      nodeMap,
      linkMap,
      isLoading: false,
      error: null,
    };
  }

  it("returns the starting node in the path", () => {
    const data = makeSessionData({
      symptoms: [{ id: "s1", text: "Pain", severity: 3, confidence: 0.7, source: "transcript" }],
    });
    const computed = makeComputedData(data);
    const result = calculatePathFromNode("s1", computed);
    expect(result.path.nodes).toContain("s1");
    expect(result.trigger.id).toBe("s1");
    expect(result.trigger.type).toBe("node");
  });

  it("follows symptom → diagnosis → treatment path", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Headache",
          severity: 6,
          confidence: 0.8,
          source: "transcript",
          relationships: [
            { nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.9 },
          ],
        },
      ],
      diagnoses: [
        {
          id: "d1",
          name: "Migraine",
          probability: 0.7,
          priority: 3,
          reasoning: "headache",
          confidence: 0.8,
          relationships: [
            { nodeId: "t1", relationship: "treats", direction: "outgoing", strength: 0.8 },
          ],
        },
      ],
      treatments: [
        { id: "t1", type: "medication", name: "Sumatriptan", priority: 2, confidence: 0.9 },
      ],
    });

    const computed = makeComputedData(data);
    const result = calculatePathFromNode("s1", computed);
    expect(result.path.nodes).toContain("s1");
    expect(result.path.nodes).toContain("d1");
    expect(result.path.nodes).toContain("t1");
  });

  it("follows diagnosis path: symptoms ← diagnosis → treatments", () => {
    const data = makeSessionData({
      symptoms: [
        {
          id: "s1",
          text: "Cough",
          severity: 4,
          confidence: 0.7,
          source: "transcript",
          relationships: [
            { nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.8 },
          ],
        },
      ],
      diagnoses: [
        {
          id: "d1",
          name: "Bronchitis",
          probability: 0.6,
          priority: 3,
          reasoning: "cough",
          confidence: 0.7,
          relationships: [
            { nodeId: "t1", relationship: "treats", direction: "outgoing", strength: 0.7 },
          ],
        },
      ],
      treatments: [
        { id: "t1", type: "medication", name: "Antibiotics", priority: 2, confidence: 0.8 },
      ],
    });

    const computed = makeComputedData(data);
    const result = calculatePathFromNode("d1", computed);
    expect(result.path.nodes).toContain("d1");
    expect(result.path.nodes).toContain("s1"); // incoming symptom
    expect(result.path.nodes).toContain("t1"); // outgoing treatment
  });

  it("returns only the starting node for unknown type", () => {
    const data = makeSessionData({
      actions: [
        {
          id: "a1",
          text: "Check BP",
          category: "diagnostic_clarification",
          actionType: "question",
          priority: 3,
          status: "pending",
        },
      ],
    });

    const computed = makeComputedData(data);
    const result = calculatePathFromNode("a1", computed);
    expect(result.path.nodes).toEqual(["a1"]);
    expect(result.path.links).toEqual([]);
  });
});

// ─── calculateCompositeScore ────────────────────────────

describe("calculateCompositeScore", () => {
  const baseSession = makeSessionData({
    diagnoses: [
      { id: "d1", name: "Test", probability: 0.8, priority: 3, reasoning: "test", confidence: 0.7 },
      { id: "d2", name: "Other", probability: 0.3, priority: 5, reasoning: "other", confidence: 0.5 },
    ],
  });

  it("gives higher score to red_flag than symptom_exploration", () => {
    const redFlag = {
      id: "q1",
      text: "Chest pain?",
      category: "red_flag" as const,
      actionType: "question" as const,
      priority: 1,
      status: "pending" as const,
    };
    const exploration = {
      id: "q2",
      text: "Any itching?",
      category: "symptom_exploration" as const,
      actionType: "question" as const,
      priority: 1,
      status: "pending" as const,
    };

    const redFlagScore = calculateCompositeScore(redFlag, baseSession);
    const explorationScore = calculateCompositeScore(exploration, baseSession);
    expect(redFlagScore).toBeGreaterThan(explorationScore);
  });

  it("boosts score when question impacts high-probability diagnosis", () => {
    const withImpact = {
      id: "q1",
      text: "Medication history?",
      category: "diagnostic_clarification" as const,
      actionType: "question" as const,
      priority: 3,
      status: "pending" as const,
      impact: { diagnoses: { d1: 0.5 } }, // d1 has probability 0.8
    };
    const noImpact = {
      id: "q2",
      text: "Sleep quality?",
      category: "diagnostic_clarification" as const,
      actionType: "question" as const,
      priority: 3,
      status: "pending" as const,
    };

    const impactScore = calculateCompositeScore(withImpact, baseSession);
    const noImpactScore = calculateCompositeScore(noImpact, baseSession);
    expect(impactScore).toBeGreaterThan(noImpactScore);
  });

  it("inverts priority: lower priority number yields higher score", () => {
    const highPriority = {
      id: "q1",
      text: "Urgent?",
      category: "risk_assessment" as const,
      actionType: "question" as const,
      priority: 1,
      status: "pending" as const,
    };
    const lowPriority = {
      id: "q2",
      text: "History?",
      category: "risk_assessment" as const,
      actionType: "question" as const,
      priority: 9,
      status: "pending" as const,
    };

    const highScore = calculateCompositeScore(highPriority, baseSession);
    const lowScore = calculateCompositeScore(lowPriority, baseSession);
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("defaults urgency to 3 for unknown category", () => {
    const unknown = {
      id: "q1",
      text: "Something?",
      category: "unknown_category" as any,
      actionType: "question" as const,
      priority: 5,
      status: "pending" as const,
    };

    // Should not throw, just use default score
    const score = calculateCompositeScore(unknown, baseSession);
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThan(0);
  });

  it("picks highest probability among impacted diagnoses", () => {
    const question = {
      id: "q1",
      text: "Test?",
      category: "risk_assessment" as const,
      actionType: "question" as const,
      priority: 3,
      status: "pending" as const,
      impact: { diagnoses: { d1: 0.5, d2: 0.3 } }, // d1=0.8 prob, d2=0.3 prob
    };

    const score = calculateCompositeScore(question, baseSession);
    // The max probability used should be 0.8 (from d1)
    // Score = 0.4*8 + 0.4*0.8*10 + 0.2*(11-3) = 3.2 + 3.2 + 1.6 = 8.0
    expect(score).toBeCloseTo(8.0, 1);
  });
});
