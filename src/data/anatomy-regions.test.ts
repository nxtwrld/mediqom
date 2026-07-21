import { describe, it, expect } from "vitest";
import objects from "./objects.json";
import {
  ANATOMY_REGIONS,
  WHOLE_BODY,
  rollupChain,
  regionMeshes,
  nearestRegion,
  isKnownAnatomyId,
  regionIds,
} from "./anatomy-regions";

const allMeshes = new Set<string>(
  Object.values(objects as Record<string, { objects?: string[] }>).flatMap(
    (c) => c.objects ?? [],
  ),
);

describe("anatomy-regions integrity", () => {
  it("declares whole_body as the root with no parent", () => {
    expect(ANATOMY_REGIONS[WHOLE_BODY]).toBeDefined();
    expect(ANATOMY_REGIONS[WHOLE_BODY].parent).toBeUndefined();
  });

  it("every region's parent exists", () => {
    for (const region of Object.values(ANATOMY_REGIONS)) {
      if (region.parent) {
        expect(ANATOMY_REGIONS[region.parent], `parent of ${region.id}`).toBeDefined();
      }
    }
  });

  it("has no cycles — every region reaches whole_body", () => {
    for (const id of regionIds()) {
      if (id === WHOLE_BODY) continue;
      const chain = rollupChain(id);
      expect(chain[chain.length - 1], `chain tail of ${id}`).toBe(WHOLE_BODY);
    }
  });

  it("every mesh in objects.json is reachable from exactly one leaf region", () => {
    const meshToRegion = new Map<string, string[]>();
    for (const region of Object.values(ANATOMY_REGIONS)) {
      for (const mesh of region.meshes ?? []) {
        meshToRegion.set(mesh, [...(meshToRegion.get(mesh) ?? []), region.id]);
      }
    }
    const unreachable = [...allMeshes].filter((m) => !meshToRegion.has(m));
    expect(unreachable, "unreachable meshes").toEqual([]);
    const ambiguous = [...meshToRegion.entries()].filter(([, rs]) => rs.length > 1);
    expect(ambiguous, "meshes in >1 leaf region").toEqual([]);
  });

  it("region meshes reference real objects.json names", () => {
    for (const region of Object.values(ANATOMY_REGIONS)) {
      for (const mesh of region.meshes ?? []) {
        expect(allMeshes.has(mesh), `${region.id} → ${mesh}`).toBe(true);
      }
    }
  });
});

describe("anatomy-regions API", () => {
  it("rolls a leaf mesh up through its region chain (PRD example)", () => {
    expect(rollupChain("R_patella")).toEqual(["R_knee", "R_lower_limb", "whole_body"]);
  });

  it("rolls an organ mesh up its system chain", () => {
    expect(rollupChain("heart")).toEqual(["cardiovascular", "whole_body"]);
  });

  it("expands a region to its transitive meshes", () => {
    expect(regionMeshes("R_knee")).toContain("R_patella");
    expect(regionMeshes("R_lower_limb")).toContain("R_patella");
    expect(regionMeshes("R_lower_limb").length).toBeGreaterThan(10);
  });

  it("returns a mesh id unchanged from regionMeshes", () => {
    expect(regionMeshes("heart")).toEqual(["heart"]);
  });

  it("nearestRegion maps a mesh to its leaf region", () => {
    expect(nearestRegion("L_femur")).toBe("L_thigh");
    expect(nearestRegion("R_knee")).toBe("R_knee");
    expect(nearestRegion("nonsense")).toBeUndefined();
  });

  it("isKnownAnatomyId accepts meshes and regions, rejects junk", () => {
    expect(isKnownAnatomyId("R_patella")).toBe(true);
    expect(isKnownAnatomyId("R_knee")).toBe(true);
    expect(isKnownAnatomyId(WHOLE_BODY)).toBe(true);
    expect(isKnownAnatomyId("definitely_not_a_mesh")).toBe(false);
  });

  it("rollupChain of an unknown id is empty", () => {
    expect(rollupChain("nope")).toEqual([]);
  });
});
