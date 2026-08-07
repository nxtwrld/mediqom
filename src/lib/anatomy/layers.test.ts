import { describe, it, expect } from "vitest";
import objects from "$data/objects.json";
import {
  ALL_MESHES,
  filesForLayer,
  isWholeSystemOnly,
  layerOf,
  layersFor,
  meshesInLayer,
} from "./layers";

describe("layer index", () => {
  it("indexes all 465 unique mesh names", () => {
    expect(ALL_MESHES.length).toBe(465);
  });

  it("assigns each mesh exactly one layer", () => {
    for (const mesh of ALL_MESHES) {
      expect(layerOf(mesh)).toBeDefined();
    }
  });

  it("dedupes the shared organs file by declaration order", () => {
    // respiratory, digestive and urogenital all declare the same 18 objects
    // from organs.obj. First declaration wins.
    expect(layerOf("lungs")).toBe("respiratory");
    expect(layersFor(["lungs"])).toEqual(["respiratory"]);
  });

  it("does not report three layers for a single organ mesh", () => {
    for (const mesh of objects.respiratory.objects) {
      expect(layersFor([mesh]).length).toBe(1);
    }
  });

  it("returns layers in canonical order", () => {
    expect(layersFor(["heart", "skull", "lungs"])).toEqual([
      "skeleton",
      "vascular",
      "respiratory",
    ]);
  });

  it("appends skeleton as a spatial anchor only when asked", () => {
    expect(layersFor(["lungs"])).toEqual(["respiratory"]);
    expect(layersFor(["lungs"], { anchor: true })).toEqual([
      "skeleton",
      "respiratory",
    ]);
  });

  it("does not anchor when skeleton or skin is already present", () => {
    expect(layersFor(["skull", "lungs"], { anchor: true })).toEqual([
      "skeleton",
      "respiratory",
    ]);
    expect(layersFor(["body", "lungs"], { anchor: true })).toEqual([
      "skin",
      "respiratory",
    ]);
  });

  it("does not anchor an empty result", () => {
    expect(layersFor([], { anchor: true })).toEqual([]);
    expect(layersFor(["not_a_mesh"], { anchor: true })).toEqual([]);
  });

  it("flags the three layers with no sub-layer granularity", () => {
    expect(isWholeSystemOnly("vascular_system")).toBe(true);
    expect(isWholeSystemOnly("heart")).toBe(true);
    expect(isWholeSystemOnly("nerves")).toBe(true);
    expect(isWholeSystemOnly("brain")).toBe(true);
    expect(isWholeSystemOnly("lymphatic_system")).toBe(true);
    expect(isWholeSystemOnly("skull")).toBe(false);
    expect(isWholeSystemOnly("lungs")).toBe(false);
  });

  it("reports the .obj basenames each layer loads", () => {
    expect(filesForLayer("skeleton")).toEqual(["skeletal_system"]);
    expect(filesForLayer("connective")).toEqual([
      "connective_tissue",
      "cartilage_tissue",
    ]);
    expect(filesForLayer("respiratory")).toEqual(["organs"]);
  });

  it("dedupes repeated declarations within one layer", () => {
    // respiratory declares 18 entries but several appear twice.
    const meshes = meshesInLayer("respiratory");
    expect(new Set(meshes).size).toBe(meshes.length);
    expect(meshes.length).toBeLessThan(objects.respiratory.objects.length);
  });
});
