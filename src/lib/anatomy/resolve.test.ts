import { describe, it, expect } from "vitest";
import { regionIds, regionMeshes } from "$data/anatomy-regions";
import manifest from "$data/anatomy-manifest.json";
import { ALL_MESHES } from "./layers";
import { resolveAnatomy } from "./resolve";
import type { AnatomyManifest } from "./types";

const MESH_SET = new Set(ALL_MESHES);
const MANIFEST = manifest as AnatomyManifest;

/**
 * The clinical fixture — 80 phrases a doctor, a report or a patient would
 * plausibly produce, each with the id it must resolve to. This is the gate for
 * "does the free-text `highlight` argument actually work".
 */
const FIXTURE: [phrase: string, expected: string][] = [
  // Exact ids (the trivial path, but it must not regress).
  ["L_knee", "L_knee"],
  ["R_femur", "R_femur"],
  ["heart", "heart"],
  ["skull", "skull"],
  ["lumbar_spine", "lumbar_spine"],

  // Case-insensitive — the live bug. Every one of these silently no-ops today.
  ["l_knee", "L_knee"],
  ["r_femur", "R_femur"],
  ["R_PATELLA", "R_patella"],
  ["Skull", "skull"],
  ["lungs", "lungs"],

  // Laterality words.
  ["left knee", "L_knee"],
  ["right knee", "R_knee"],
  ["left shoulder", "L_shoulder"],
  ["right ankle", "R_ankle"],
  ["left hip", "L_hip"],
  ["right wrist", "R_wrist"],
  ["left elbow", "L_forearm"],
  ["right hand", "R_hand"],
  ["left foot", "L_foot"],
  ["right thigh", "R_thigh"],

  // Spaces instead of underscores.
  ["lumbar spine", "lumbar_spine"],
  ["cervical spine", "cervical_spine"],
  ["thoracic spine", "thoracic_spine"],
  ["intervertebral disks", "intervertebral_disks"],
  ["pubic symphysis", "pubic_symphysis"],
  ["costal cartilage", "costal_cartilage"],
  ["upper teeth", "upper_teeth"],
  ["jaw bone", "jaw_bone"],
  ["hyoid bone", "hyoid_bone"],
  ["whole body", "whole_body"],

  // English SNOMED labels.
  ["talus", "L_talus"],
  ["calcaneus", "L_calcaneum"],
  ["sacrum", "sacrum"],
  ["coccyx", "coccyx"],
  ["sternum", "sternum"],
  ["uterus", "uterus"],
  ["epididymis", "epididymis"],
  ["seminal vesicle", "seminal_vesicle"],

  // Clinical shorthand — the reason CLINICAL_ALIASES exists.
  ["acl", "ligaments_knee"],
  ["anterior cruciate ligament", "ligaments_knee"],
  ["pcl", "ligaments_knee"],
  ["mcl", "ligaments_knee"],
  ["medial meniscus", "cartilage_knee"],
  ["lateral meniscus", "cartilage_knee"],
  ["torn meniscus", "cartilage_knee"],
  ["l4-l5", "lumbar_spine"],
  ["l5-s1", "lumbar_spine"],
  ["c5-c6", "cervical_spine"],
  ["herniated disc", "intervertebral_disks"],
  ["slipped disc", "intervertebral_disks"],
  ["lower back", "lumbar_spine"],
  ["tailbone", "coccyx"],
  ["breastbone", "sternum"],
  ["rib cage", "thorax"],

  // Sided clinical shorthand.
  ["right rotator cuff", "R_supraspinatus"],
  ["left rotator cuff", "L_supraspinatus"],
  ["left achilles", "L_calcaneofibular_achilles_tendon"],
  ["right achilles tendon", "R_calcaneofibular_achilles_tendon"],
  ["right carpal tunnel", "R_flexor_retinaculum"],
  ["left carpal tunnel syndrome", "L_flexor_retinaculum"],
  ["right kneecap", "R_patella"],
  ["left knee cap", "L_patella"],
  ["right hamstring", "R_biceps_femoris_longus"],
  ["left quadriceps", "L_rectus_femoris"],
  ["right calf", "R_gastrocnemius_medial_head"],
  ["left shin", "L_tibia"],
  ["right tennis elbow", "R_extensor_carpi_radialis_brevis"],
  ["left frozen shoulder", "L_shoulder"],
  ["right shoulder blade", "R_scapula"],
  ["left biceps", "L_bicep_brachii_long_head"],
  ["right glutes", "R_gluteus_maximus"],
  ["left piriformis", "L_piriformis"],
  ["right plantar fasciitis", "R_foot"],
  ["left heel bone", "L_calcaneum"],

  // Whole-system-only targets — must resolve, but flagged.
  ["aorta", "vascular_system"],
  ["sciatic nerve", "nerves"],
  ["spinal cord", "nerves"],
  ["lymph nodes", "lymphatic_system"],
  ["carotid artery", "vascular_system"],
  ["median nerve", "nerves"],
];

describe("resolveAnatomy — clinical fixture", () => {
  it("has 80 phrases", () => {
    expect(FIXTURE.length).toBe(80);
  });

  const misses: string[] = [];
  for (const [phrase, expected] of FIXTURE) {
    it(`resolves "${phrase}" -> ${expected}`, () => {
      const r = resolveAnatomy(phrase);
      if (r.canonicalId !== expected) {
        misses.push(`${phrase} -> ${r.canonicalId} (want ${expected})`);
      }
      expect(r.canonicalId).toBe(expected);
      expect(r.ok).toBe(true);
    });
  }

  it("hits >= 90% top-1 across the fixture", () => {
    const hits = FIXTURE.filter(
      ([phrase, expected]) => resolveAnatomy(phrase).canonicalId === expected,
    ).length;
    expect(hits / FIXTURE.length).toBeGreaterThanOrEqual(0.9);
  });
});

describe("resolveAnatomy — contract", () => {
  it("returns only exact-case mesh names that exist in objects.json", () => {
    for (const [phrase] of FIXTURE) {
      for (const mesh of resolveAnatomy(phrase).meshes) {
        expect(MESH_SET.has(mesh), `${phrase} produced unknown mesh ${mesh}`).toBe(
          true,
        );
      }
    }
  });

  it("resolves every one of the 50 region ids to at least one mesh", () => {
    for (const id of regionIds()) {
      const r = resolveAnatomy(id);
      expect(r.ok, `${id} did not resolve`).toBe(true);
      expect(r.meshes.length, `${id} expanded to no meshes`).toBeGreaterThan(0);
    }
  });

  it("expands a region to the same meshes regionMeshes() does", () => {
    for (const id of regionIds()) {
      expect(new Set(resolveAnatomy(id).meshes)).toEqual(
        new Set(regionMeshes(id)),
      );
    }
  });

  it("returns an empty, not-ok result for blank input", () => {
    for (const blank of ["", "   ", null as unknown as string]) {
      const r = resolveAnatomy(blank);
      expect(r.ok).toBe(false);
      expect(r.meshes).toEqual([]);
      expect(r.matchedBy).toBeNull();
    }
  });

  it("reports the step that matched", () => {
    expect(resolveAnatomy("L_knee").matchedBy).toBe("exact");
    expect(resolveAnatomy("l_knee").matchedBy).toBe("case-insensitive");
    expect(resolveAnatomy("talus").matchedBy).toBe("label");
    expect(resolveAnatomy("acl").matchedBy).toBe("clinical-alias");
  });
});

describe("resolveAnatomy — laterality", () => {
  it("treats left/right/L_/l as the same request", () => {
    for (const phrase of ["L_knee", "l_knee", "left knee", "left_knee"]) {
      expect(resolveAnatomy(phrase).canonicalId, phrase).toBe("L_knee");
    }
  });

  it("filters a bilateral label down to the requested side", () => {
    const left = resolveAnatomy("left talus");
    expect(left.meshes).toEqual(["L_talus"]);
    const right = resolveAnatomy("right talus");
    expect(right.meshes).toEqual(["R_talus"]);
  });

  it("returns both sides for an unsided bilateral label", () => {
    const r = resolveAnatomy("talus");
    expect(new Set(r.meshes)).toEqual(new Set(["L_talus", "R_talus"]));
    expect(r.side).toBe("bilateral");
  });

  it("does not empty the result when a side is asked of a midline structure", () => {
    const r = resolveAnatomy("left sternum");
    expect(r.ok).toBe(true);
    expect(r.meshes).toContain("sternum");
  });
});

describe("resolveAnatomy — whole-system-only layers", () => {
  it("flags vascular, nervous and lymphatic targets", () => {
    for (const phrase of ["aorta", "sciatic nerve", "lymph nodes"]) {
      const r = resolveAnatomy(phrase);
      expect(r.ok, phrase).toBe(true);
      expect(r.wholeSystemOnly, phrase).toBe(true);
    }
  });

  it("does not flag structures that do have sub-layer granularity", () => {
    for (const phrase of ["L_knee", "skull", "lungs", "acl"]) {
      expect(resolveAnatomy(phrase).wholeSystemOnly, phrase).toBe(false);
    }
  });
});

describe("resolveAnatomy — region scoping via `within`", () => {
  it("narrows a bilateral term to the enclosing region", () => {
    // "patella" alone is bilateral; scoping to R_knee must drop the left one.
    expect(new Set(resolveAnatomy("patella").meshes)).toEqual(
      new Set(["L_patella", "R_patella"]),
    );
    const r = resolveAnatomy("patella", { within: "R_knee" });
    expect(r.ok).toBe(true);
    expect(r.meshes).toEqual(["R_patella"]);
    for (const mesh of r.meshes) {
      expect(regionMeshes("R_knee")).toContain(mesh);
    }
  });

  it("does not empty the result when the term falls outside the scope", () => {
    const r = resolveAnatomy("skull", { within: "R_knee" });
    expect(r.ok).toBe(true);
    expect(r.meshes).toContain("skull");
  });
});

describe("resolveAnatomy — the AI_PLUGIN.md §1 flagship call", () => {
  // show_anatomy({ structure: "R_knee", highlight: ["medial meniscus"] })
  it("frames the region and refines the highlight within it", () => {
    const region = resolveAnatomy("R_knee", {
      sex: "male",
      manifest: MANIFEST,
    });
    expect(region.ok).toBe(true);
    expect(region.meshes).toEqual(["R_patella"]);
    expect(region.layers).toEqual(["skeleton"]);

    const highlight = resolveAnatomy("medial meniscus", {
      within: "R_knee",
      sex: "male",
      manifest: MANIFEST,
    });
    // There is no meniscus mesh; knee cartilage is the honest nearest anchor.
    expect(highlight.ok).toBe(true);
    expect(highlight.canonicalId).toBe("cartilage_knee");
    expect(highlight.layers).toEqual(["connective"]);
    expect(highlight.wholeSystemOnly).toBe(false);
  });

  it("leaves the region framed when the highlight does not resolve", () => {
    const highlight = resolveAnatomy("posterior horn signal change", {
      within: "R_knee",
    });
    expect(highlight.ok).toBe(false);
    expect(highlight.meshes).toEqual([]);
  });
});

describe("resolveAnatomy — manifest partitioning", () => {
  it("moves meshes absent from the sex's geometry into `unavailable`", () => {
    // `uterus` is declared in objects.json but absent from the male model.
    const male = resolveAnatomy("uterus", { sex: "male", manifest: MANIFEST });
    expect(male.meshes).toEqual([]);
    expect(male.unavailable).toContain("uterus");
    expect(male.ok).toBe(false);

    const female = resolveAnatomy("uterus", {
      sex: "female",
      manifest: MANIFEST,
    });
    expect(female.meshes).toContain("uterus");
    expect(female.unavailable).toEqual([]);
    expect(female.ok).toBe(true);
  });

  it("treats every declared mesh as available when no manifest is supplied", () => {
    const r = resolveAnatomy("uterus");
    expect(r.meshes).toContain("uterus");
    expect(r.unavailable).toEqual([]);
  });

  it("never returns a mesh missing from the manifest for that sex", () => {
    for (const sex of ["male", "female"] as const) {
      const available = new Set(MANIFEST[sex]);
      for (const id of regionIds()) {
        const r = resolveAnatomy(id, { sex, manifest: MANIFEST });
        for (const mesh of r.meshes) {
          expect(available.has(mesh), `${sex} ${id} -> ${mesh}`).toBe(true);
        }
      }
    }
  });
});

describe("resolveAnatomy — graceful failure", () => {
  it("returns ok:false with candidates rather than a wrong answer", () => {
    const r = resolveAnatomy("posterior horn tear of the something");
    expect(r.ok).toBe(false);
    expect(r.canonicalId).toBeNull();
    expect(r.meshes).toEqual([]);
  });

  it("offers at most 3 candidates", () => {
    const r = resolveAnatomy("gluteus zzz");
    expect(r.candidates.length).toBeLessThanOrEqual(3);
  });

  it("returns nothing at all for gibberish", () => {
    const r = resolveAnatomy("qqqq zzzz");
    expect(r.ok).toBe(false);
    expect(r.candidates).toEqual([]);
  });
});
