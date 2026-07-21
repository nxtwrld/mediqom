import { describe, it, expect, vi } from "vitest";

// Mock visual config to avoid importing from component directory
vi.mock("$components/session/config/qom-visual-config", () => ({
  QOM_VISUAL_CONFIG: {
    layout: {
      width: 800,
      height: 600,
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      nodeSpacing: 60,
    },
    forces: {
      chargeStrength: -200,
      collisionRadius: 30,
    },
  },
  createForceSimulation: (width: number, height: number) => ({
    width,
    height,
    chargeStrength: -200,
    alphaDecay: 0.02,
  }),
}));

// Mock the QOM config JSON
vi.mock("$lib/config/qom-default.json", () => ({
  default: {
    triggerConditions: {
      symptomMapping: {
        chest_pain: ["cardiology", "emergency"],
        headache: ["neurology", "emergency"],
        fever: ["infectious_disease", "emergency"],
        rash: ["dermatology"],
      },
      contextMapping: {
        age_over_65: ["geriatrics"],
        pregnancy: ["obstetrics"],
        immunocompromised: ["infectious_disease"],
      },
      subSpecialtyTriggers: {
        cardiology: {
          arrhythmia: ["electrophysiology"],
          heart_failure: ["heart_failure_specialist"],
        },
        neurology: {
          seizures: ["epileptology"],
        },
      },
    },
    behaviorRules: {
      specializationThreshold: 0.8,
    },
    expertTemplates: {
      specialist_expert: {
        type: "specialist",
        modelConfig: { provider: "openai", model: "gpt-4" },
      },
    },
  },
}));

import {
  calculateInitialPositions,
  shouldTriggerExpert,
  getSubSpecialtyTriggers,
  createExpertNode,
  shouldAnimateNode,
  getNodeImportance,
  groupNodesByCategory,
  calculateClusterCenters,
  createRefinementLinks,
} from "./qom-transformer";

import type { QOMNode, D3QOMNode } from "$components/session/types/qom";

function makeQOMNode(overrides: Partial<QOMNode> = {}): QOMNode {
  return {
    id: "node-1",
    name: "Test Node",
    type: "specialist",
    category: "test",
    layer: 0,
    children: [],
    state: "pending",
    provider: "openai",
    model: "gpt-4",
    triggerThreshold: 0.8,
    triggered: false,
    radius: 25,
    ...overrides,
  };
}

function makeD3Node(overrides: Partial<D3QOMNode> = {}): D3QOMNode {
  return {
    ...makeQOMNode(),
    index: 0,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    ...overrides,
  } as D3QOMNode;
}

// ─── Tests ──────────────────────────────────────────────

describe("calculateInitialPositions", () => {
  it("assigns positions to all nodes", () => {
    const nodes = [
      makeQOMNode({ id: "n1", layer: 0 }),
      makeQOMNode({ id: "n2", layer: 1 }),
      makeQOMNode({ id: "n3", layer: 1 }),
    ];

    const positions = calculateInitialPositions(nodes, 800, 600);
    expect(positions.size).toBe(3);
    expect(positions.get("n1")).toBeDefined();
    expect(positions.get("n2")).toBeDefined();
    expect(positions.get("n3")).toBeDefined();
  });

  it("places higher layer nodes further right", () => {
    const nodes = [
      makeQOMNode({ id: "n1", layer: 0 }),
      makeQOMNode({ id: "n2", layer: 2 }),
    ];

    const positions = calculateInitialPositions(nodes, 800, 600);
    expect(positions.get("n2")!.x).toBeGreaterThan(positions.get("n1")!.x);
  });

  it("distributes nodes in same layer vertically", () => {
    const nodes = [
      makeQOMNode({ id: "a", layer: 1, category: "alpha" }),
      makeQOMNode({ id: "b", layer: 1, category: "beta" }),
    ];

    const positions = calculateInitialPositions(nodes, 800, 600);
    const ya = positions.get("a")!.y;
    const yb = positions.get("b")!.y;
    expect(ya).not.toBe(yb);
  });
});

describe("shouldTriggerExpert", () => {
  it("triggers cardiology for chest_pain symptom", () => {
    expect(shouldTriggerExpert(["chest pain"], {}, "cardiology")).toBe(true);
  });

  it("triggers emergency for headache", () => {
    expect(shouldTriggerExpert(["headache"], {}, "emergency")).toBe(true);
  });

  it("does not trigger unrelated expert", () => {
    expect(shouldTriggerExpert(["headache"], {}, "dermatology")).toBe(false);
  });

  it("triggers via context mapping", () => {
    expect(shouldTriggerExpert([], { age_over_65: true }, "geriatrics")).toBe(true);
  });

  it("does not trigger when context value is false", () => {
    expect(shouldTriggerExpert([], { pregnancy: false }, "obstetrics")).toBe(false);
  });

  it("normalizes symptom names (spaces to underscores, lowercase)", () => {
    expect(shouldTriggerExpert(["Chest Pain"], {}, "cardiology")).toBe(true);
  });

  it("returns false for empty symptoms and context", () => {
    expect(shouldTriggerExpert([], {}, "cardiology")).toBe(false);
  });
});

describe("getSubSpecialtyTriggers", () => {
  it("returns subspecialties when symptom matches trigger", () => {
    const result = getSubSpecialtyTriggers("cardiology", ["arrhythmia detected"]);
    expect(result).toContain("electrophysiology");
  });

  it("returns empty for unknown parent category", () => {
    const result = getSubSpecialtyTriggers("unknown_specialty", ["anything"]);
    expect(result).toEqual([]);
  });

  it("returns empty when no symptom matches", () => {
    const result = getSubSpecialtyTriggers("cardiology", ["headache"]);
    expect(result).toEqual([]);
  });

  it("deduplicates triggered subspecialties", () => {
    // Two symptoms that both trigger the same subspecialty
    const result = getSubSpecialtyTriggers("cardiology", [
      "severe arrhythmia",
      "arrhythmia recurrence",
    ]);
    const unique = [...new Set(result)];
    expect(result.length).toBe(unique.length);
  });
});

describe("createExpertNode", () => {
  it("creates a node with correct properties", () => {
    const node = createExpertNode("e1", "Cardiology Expert", "specialist", "cardiology", 2, "parent-1");
    expect(node.id).toBe("e1");
    expect(node.name).toBe("Cardiology Expert");
    expect(node.category).toBe("cardiology");
    expect(node.layer).toBe(2);
    expect(node.parent).toBe("parent-1");
    expect(node.state).toBe("pending");
    expect(node.children).toEqual([]);
  });

  it("sets smaller radius for deeper layers", () => {
    const shallow = createExpertNode("s", "Shallow", "specialist", "cat", 1);
    const deep = createExpertNode("d", "Deep", "specialist", "cat", 3);
    expect(shallow.radius).toBeGreaterThan(deep.radius!);
  });

  it("uses specializationThreshold from config", () => {
    const node = createExpertNode("e1", "Test", "specialist", "test", 1);
    expect(node.triggerThreshold).toBe(0.8);
  });
});

describe("shouldAnimateNode", () => {
  it("returns true for running state", () => {
    expect(shouldAnimateNode(makeD3Node({ state: "running" }))).toBe(true);
  });

  it("returns false for completed state", () => {
    expect(shouldAnimateNode(makeD3Node({ state: "completed" }))).toBe(false);
  });

  it("returns false for pending state", () => {
    expect(shouldAnimateNode(makeD3Node({ state: "pending" }))).toBe(false);
  });
});

describe("getNodeImportance", () => {
  it("gives merger highest type weight", () => {
    const merger = getNodeImportance(makeD3Node({ type: "merger", state: "completed" }));
    const specialist = getNodeImportance(makeD3Node({ type: "specialist", state: "completed" }));
    expect(merger).toBeGreaterThan(specialist);
  });

  it("boosts importance for running state", () => {
    const running = getNodeImportance(makeD3Node({ type: "specialist", state: "running" }));
    const pending = getNodeImportance(makeD3Node({ type: "specialist", state: "pending" }));
    expect(running).toBeGreaterThan(pending);
  });

  it("defaults to 1.0 for unknown type/state", () => {
    const importance = getNodeImportance(makeD3Node({ type: "unknown" as any, state: "unknown" as any }));
    expect(importance).toBe(1.0);
  });
});

describe("groupNodesByCategory", () => {
  it("groups nodes by their category", () => {
    const nodes = [
      makeD3Node({ id: "a", category: "cardiology" }),
      makeD3Node({ id: "b", category: "neurology" }),
      makeD3Node({ id: "c", category: "cardiology" }),
    ];

    const groups = groupNodesByCategory(nodes);
    expect(groups.size).toBe(2);
    expect(groups.get("cardiology")!.length).toBe(2);
    expect(groups.get("neurology")!.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    const groups = groupNodesByCategory([]);
    expect(groups.size).toBe(0);
  });
});

describe("calculateClusterCenters", () => {
  it("assigns center positions to each category", () => {
    const groups = new Map<string, D3QOMNode[]>();
    groups.set("a", [makeD3Node()]);
    groups.set("b", [makeD3Node()]);

    const centers = calculateClusterCenters(groups, 800, 600);
    expect(centers.size).toBe(2);
    expect(centers.get("a")!.x).toBeDefined();
    expect(centers.get("b")!.y).toBeDefined();
  });

  it("distributes centers across the area", () => {
    const groups = new Map<string, D3QOMNode[]>();
    groups.set("a", [makeD3Node()]);
    groups.set("b", [makeD3Node()]);
    groups.set("c", [makeD3Node()]);
    groups.set("d", [makeD3Node()]);

    const centers = calculateClusterCenters(groups, 800, 600);
    const positions = Array.from(centers.values());
    // Not all at the same position
    const uniqueX = new Set(positions.map((p) => p.x));
    expect(uniqueX.size).toBeGreaterThan(1);
  });
});

describe("createRefinementLinks", () => {
  it("creates refinement link for completed child with parent", () => {
    const parent = makeD3Node({ id: "parent", state: "completed" });
    const child = makeD3Node({ id: "child", state: "completed", parent: "parent" });
    const nodes = [parent, child];

    const links = createRefinementLinks(nodes);
    expect(links.length).toBe(1);
    expect(links[0].type).toBe("refines");
    expect(links[0].source).toBe(child);
    expect(links[0].target).toBe(parent);
  });

  it("does not create link for pending child", () => {
    const parent = makeD3Node({ id: "parent", state: "completed" });
    const child = makeD3Node({ id: "child", state: "pending", parent: "parent" });

    const links = createRefinementLinks([parent, child]);
    expect(links.length).toBe(0);
  });

  it("does not create link for child without parent", () => {
    const orphan = makeD3Node({ id: "orphan", state: "completed" });
    const links = createRefinementLinks([orphan]);
    expect(links.length).toBe(0);
  });
});
