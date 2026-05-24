import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/private", () => ({
  DEBUG_IMPORT: "false",
}));

import {
  NodeRegistry,
  nodeRegistry,
  type NodeDefinition,
} from "./node-registry";

function makeNode(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    nodeName: overrides.nodeName || "test-node",
    description: "Test node",
    featureDetectionTriggers: overrides.featureDetectionTriggers || ["hasMedications"],
    priority: overrides.priority || 3,
    dependencies: overrides.dependencies,
    nodeFunction: overrides.nodeFunction || vi.fn().mockResolvedValue({}),
  };
}

describe("NodeRegistry", () => {
  beforeEach(() => {
    nodeRegistry.clear();
  });

  describe("getInstance", () => {
    it("returns the same instance (singleton)", () => {
      const a = NodeRegistry.getInstance();
      const b = NodeRegistry.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("registerNode / getNode / getAllNodes", () => {
    it("registers and retrieves a node", () => {
      const node = makeNode({ nodeName: "medications" });
      nodeRegistry.registerNode(node);

      expect(nodeRegistry.getNode("medications")).toBe(node);
      expect(nodeRegistry.getAllNodes()).toHaveLength(1);
    });

    it("returns undefined for unregistered node", () => {
      expect(nodeRegistry.getNode("nonexistent")).toBeUndefined();
    });

    it("overwrites node with same name", () => {
      nodeRegistry.registerNode(makeNode({ nodeName: "dup", priority: 1 }));
      nodeRegistry.registerNode(makeNode({ nodeName: "dup", priority: 5 }));

      expect(nodeRegistry.getAllNodes()).toHaveLength(1);
      expect(nodeRegistry.getNode("dup")!.priority).toBe(5);
    });
  });

  describe("selectNodes", () => {
    it("selects nodes matching feature flags", () => {
      nodeRegistry.registerNode(
        makeNode({ nodeName: "med", featureDetectionTriggers: ["hasMedications"] }),
      );
      nodeRegistry.registerNode(
        makeNode({ nodeName: "img", featureDetectionTriggers: ["hasImaging"] }),
      );

      const selected = nodeRegistry.selectNodes({
        hasMedications: true,
        hasImaging: false,
      });

      expect(selected).toHaveLength(1);
      expect(selected[0].nodeName).toBe("med");
    });

    it("selects node when any trigger matches", () => {
      nodeRegistry.registerNode(
        makeNode({
          nodeName: "multi",
          featureDetectionTriggers: ["hasSignals", "hasImaging"],
        }),
      );

      const selected = nodeRegistry.selectNodes({ hasImaging: true });
      expect(selected).toHaveLength(1);
    });

    it("returns empty when no features match", () => {
      nodeRegistry.registerNode(makeNode());
      const selected = nodeRegistry.selectNodes({ hasImaging: true });
      expect(selected).toHaveLength(0);
    });

    it("returns empty for null feature results", () => {
      nodeRegistry.registerNode(makeNode());
      const selected = nodeRegistry.selectNodes(null);
      expect(selected).toHaveLength(0);
    });
  });

  describe("clear", () => {
    it("removes all registered nodes", () => {
      nodeRegistry.registerNode(makeNode({ nodeName: "a" }));
      nodeRegistry.registerNode(makeNode({ nodeName: "b" }));
      expect(nodeRegistry.getAllNodes()).toHaveLength(2);

      nodeRegistry.clear();
      expect(nodeRegistry.getAllNodes()).toHaveLength(0);
    });
  });
});
