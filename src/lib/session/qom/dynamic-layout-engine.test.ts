import { describe, it, expect, beforeEach } from "vitest";
import {
  DynamicLayoutEngine,
  type LayoutConfig,
  type LayoutNode,
  type LayoutLink,
} from "./dynamic-layout-engine";

const DEFAULT_CONFIG: LayoutConfig = {
  width: 800,
  height: 600,
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  nodeSpacing: { x: 100, y: 80 },
  parallelSpacing: 60,
};

function makeNode(
  id: string,
  overrides: Partial<LayoutNode> = {},
): LayoutNode {
  return {
    id,
    name: id,
    type: "default",
    category: "default",
    x: 0,
    y: 0,
    layer: 0,
    isParallel: false,
    parentNodes: [],
    childNodes: [],
    ...overrides,
  };
}

describe("DynamicLayoutEngine — addNode / addNodes", () => {
  let engine: DynamicLayoutEngine;
  beforeEach(() => {
    engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
  });

  it("addNode adds a single node and returns it in the result", () => {
    const result = engine.addNode(makeNode("a"));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("a");
    expect(result.affectedNodeIds).toContain("a");
  });

  it("addNodes adds multiple nodes at once", () => {
    const result = engine.addNodes([makeNode("a"), makeNode("b")]);
    expect(result.nodes).toHaveLength(2);
  });

  it("subsequent addNode calls accumulate nodes", () => {
    engine.addNode(makeNode("a"));
    const result = engine.addNode(makeNode("b"));
    expect(result.nodes).toHaveLength(2);
  });
});

describe("DynamicLayoutEngine — addLink", () => {
  let engine: DynamicLayoutEngine;
  beforeEach(() => {
    engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    engine.addNodes([makeNode("a"), makeNode("b")]);
  });

  it("creates a link between existing nodes", () => {
    const link: LayoutLink = {
      id: "a_to_b",
      source: "a",
      target: "b",
      type: "data_flow",
    };
    const result = engine.addLink(link);
    expect(result.links).toHaveLength(1);
    expect(result.affectedNodeIds).toContain("a");
    expect(result.affectedNodeIds).toContain("b");
  });

  it("does not duplicate an existing link", () => {
    const link: LayoutLink = {
      id: "a_to_b",
      source: "a",
      target: "b",
      type: "data_flow",
    };
    engine.addLink(link);
    const result = engine.addLink(link);
    expect(result.links).toHaveLength(1);
    expect(result.affectedNodeIds).toEqual([]);
  });

  it("updates parent-child relationships on both nodes", () => {
    const link: LayoutLink = {
      id: "a_to_b",
      source: "a",
      target: "b",
      type: "data_flow",
    };
    const result = engine.addLink(link);
    const a = result.nodes.find((n) => n.id === "a")!;
    const b = result.nodes.find((n) => n.id === "b")!;
    expect(a.childNodes).toContain("b");
    expect(b.parentNodes).toContain("a");
  });
});

describe("DynamicLayoutEngine — insertBetween", () => {
  let engine: DynamicLayoutEngine;
  beforeEach(() => {
    engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    // Create A -> C chain
    engine.addNodes([makeNode("A"), makeNode("C")]);
    engine.addLink({
      id: "A_to_C",
      source: "A",
      target: "C",
      type: "data_flow",
    });
  });

  it("inserts a new node B between A and C", () => {
    const result = engine.addNodes([makeNode("B")], {
      insertBetween: { parents: ["A"], children: ["C"] },
    });

    const nodeA = result.nodes.find((n) => n.id === "A")!;
    const nodeB = result.nodes.find((n) => n.id === "B")!;
    const nodeC = result.nodes.find((n) => n.id === "C")!;

    // A should now point to B (not C)
    expect(nodeA.childNodes).toContain("B");
    expect(nodeA.childNodes).not.toContain("C");

    // B should sit between A and C
    expect(nodeB.parentNodes).toContain("A");
    expect(nodeB.childNodes).toContain("C");

    // C should now point to B as parent (not A)
    expect(nodeC.parentNodes).toContain("B");
    expect(nodeC.parentNodes).not.toContain("A");
  });
});

describe("DynamicLayoutEngine — layer assignment", () => {
  it("root nodes get layer 0, children get higher layers", () => {
    const engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    engine.addNodes([makeNode("root"), makeNode("mid"), makeNode("leaf")]);
    engine.addLink({
      id: "root_to_mid",
      source: "root",
      target: "mid",
      type: "data_flow",
    });
    engine.addLink({
      id: "mid_to_leaf",
      source: "mid",
      target: "leaf",
      type: "data_flow",
    });

    const result = engine.addNode(makeNode("dummy")); // trigger re-layout
    const root = result.nodes.find((n) => n.id === "root")!;
    const mid = result.nodes.find((n) => n.id === "mid")!;
    const leaf = result.nodes.find((n) => n.id === "leaf")!;

    expect(root.layer).toBe(0);
    expect(mid.layer).toBeGreaterThan(root.layer);
    expect(leaf.layer).toBeGreaterThan(mid.layer);
  });
});

describe("DynamicLayoutEngine — generateLayout", () => {
  it("produces nodes and links from a QOM config", () => {
    const engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    const config = {
      id: "test",
      defaultFlow: {
        nodes: [
          { id: "start", name: "Start", type: "entry" },
          { id: "process", name: "Process", type: "processor" },
          { id: "end", name: "End", type: "output" },
        ],
        connections: [
          { from: "start", to: "process", type: "data_flow" },
          { from: "process", to: "end", type: "data_flow" },
        ],
      },
    };

    const result = engine.generateLayout(config);
    expect(result.nodes).toHaveLength(3);
    expect(result.links).toHaveLength(2);
    expect(result.layerCount).toBe(3);
  });

  it("resets state between generateLayout calls", () => {
    const engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    const config1 = {
      defaultFlow: {
        nodes: [{ id: "a", name: "A", type: "x" }],
        connections: [],
      },
    };
    const config2 = {
      defaultFlow: {
        nodes: [
          { id: "b", name: "B", type: "x" },
          { id: "c", name: "C", type: "x" },
        ],
        connections: [{ from: "b", to: "c" }],
      },
    };

    engine.generateLayout(config1);
    const result = engine.generateLayout(config2);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((n) => n.id === "a")).toBeUndefined();
  });
});

describe("DynamicLayoutEngine — position calculation", () => {
  it("positions nodes with y increasing by layer", () => {
    const engine = new DynamicLayoutEngine(DEFAULT_CONFIG);
    const result = engine.generateLayout({
      defaultFlow: {
        nodes: [
          { id: "a", name: "A", type: "entry" },
          { id: "b", name: "B", type: "output" },
        ],
        connections: [{ from: "a", to: "b" }],
      },
    });

    const a = result.nodes.find((n) => n.id === "a")!;
    const b = result.nodes.find((n) => n.id === "b")!;
    expect(b.y).toBeGreaterThan(a.y);
  });
});
