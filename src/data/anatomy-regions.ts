/**
 * Anatomy region meta-layer (Care Plan build row 7n).
 *
 * Groups the 472 fine-grained mesh names in `src/data/objects.json` into named
 * anatomical regions that roll up through body-part → limb/system → whole_body:
 *
 *   R_patella → R_knee → R_lower_limb → whole_body
 *   heart     → cardiovascular        → whole_body
 *
 * Regions are FIRST-CLASS anchors in the body-parts extraction schema — the LLM
 * may emit a leaf mesh name OR a region id (see `_schema-enums.ts`). The merge
 * function uses the rollup chain to match across granularity differences
 * ("patellar tendinopathy" vs "right knee pain"), and the 3D viewer expands a
 * region to its meshes for painting.
 *
 * SOURCE OF TRUTH — hand-maintained. Bootstrapped by
 * `scripts/generate-anatomy-regions-draft.ts` from objects.json, then reviewed.
 * The integrity test (`anatomy-regions.test.ts`) guarantees every mesh stays
 * reachable from at least one region; it does NOT assert anatomical precision,
 * so refinements (a handful of forearm/foot toe-muscle edge cases) are safe to
 * land incrementally without breaking the contract.
 *
 * `whole_body` is the reserved root for items that affect the body generally
 * (depression, autoimmune disease without a localised lesion). `bodyParts: []`
 * on a Care Plan item is also valid — the list never hides an item because no
 * mesh lights up.
 */

export interface AnatomyRegion {
  /** Region id — also a valid value for `bodyParts[].identification`. */
  id: string;
  /** Parent region id; undefined only for `whole_body`. */
  parent?: string;
  /** Leaf mesh names from objects.json that belong directly to this region. */
  meshes?: string[];
}

export const ANATOMY_REGIONS: Record<string, AnatomyRegion> = {
  L_ankle: {
    id: "L_ankle",
    parent: "L_lower_limb",
    meshes: ["L_talus", "L_calcaneum", "L_calcaneofibular_achilles_tendon"],
  },
  L_arm: {
    id: "L_arm",
    parent: "L_upper_limb",
    meshes: [
      "L_humerus",
      "L_triceps_tendon_medial_head",
      "L_triceps_medial_head",
      "L_bicep_brachii_short_head",
      "L_bicep_brachii_long_head",
      "L_brachialis",
      "L_triceps_lateral_head",
    ],
  },
  L_ear: {
    id: "L_ear",
    parent: "head_neck",
    meshes: [
      "L_auricularis_superior",
      "L_auricularis_posterior",
      "L_auricularis_anterior",
    ],
  },
  L_foot: {
    id: "L_foot",
    parent: "L_lower_limb",
    meshes: [
      "L_metatarsal_bones",
      "L_tarsal_bones",
      "L_flexor_digitorum_brevis",
      "L_extensor_hallucis_brevis",
      "L_extensor_digitorum_longus",
      "L_extensor_digitorum_brevis",
      "L_abductor_hallucis",
      "L_abductor_digiti_minimi_foot",
      "L_extensor_hallucis_longus",
      "L_flexor_hallucis_longus",
      "L_flexor_digitorum_longus",
      "L_abductor_digiti_minimi__foot",
    ],
  },
  L_forearm: {
    id: "L_forearm",
    parent: "L_upper_limb",
    meshes: [
      "L_radius",
      "L_ulna",
      "L_supinator",
      "L_pronator_teres",
      "L_pronator_quadratus",
      "L_bicipital_aponeurosis",
      "L_flexor_digitorum_superficialis",
      "L_flexor_digitorum_profundus",
      "L_extensor_indicis",
      "L_extensor_digitorum",
      "L_anconeus",
      "L_brachioradialis",
    ],
  },
  L_hand: {
    id: "L_hand",
    parent: "L_upper_limb",
    meshes: [
      "L_metacarpal_bones",
      "L_finger_bones",
      "L_phalanges",
      "L_palmar_interossei_4",
      "L_palmaris_longus",
      "L_palmar_interossei_3",
      "L_palmar_interossei_2",
      "L_opponens_pollicis",
      "L_lumbrical_1",
      "L_flexor_pollicis_longus",
      "L_flexor_retinaculum",
      "L_flexor_pollicis_brevis",
      "L_dorsal_interossei_4b",
      "L_dorsal_interossei_4a",
      "L_dorsal_interossei_3b",
      "L_dorsal_interossei_3a",
      "L_dorsal_interossei_2b",
      "L_dorsal_interossei_2a",
      "L_abductor_pollicis_longus",
      "L_abductor_pollicis_brevis",
      "L_abductor_digiti_minimi",
      "L_flexor_digiti_minimi_brevis",
      "L_lumbrical_2",
      "L_lumbrical_3",
      "L_lumbrical_4",
      "L_opponens_digiti_minimi",
      "L_palmar_interossei_1",
      "L_extensor_pollicis_longus",
      "L_extensor_pollicis_brevis",
      "L_dorsal_interossei",
      "L_adductor_pollicis",
    ],
  },
  L_hip: {
    id: "L_hip",
    parent: "L_lower_limb",
    meshes: [
      "L_superior_gemellus",
      "L_sacrotuberous_ligament_muscle",
      "L_piriformis",
      "L_obturator_externus",
      "L_internal_obturator",
      "L_inferior_gemellus",
      "L_iliacus",
      "L_quadratus_femoris",
    ],
  },
  L_knee: { id: "L_knee", parent: "L_lower_limb", meshes: ["L_patella"] },
  L_leg: {
    id: "L_leg",
    parent: "L_lower_limb",
    meshes: [
      "L_tibia",
      "L_fibula_",
      "L_fibula",
      "L_gastrocnemius_medial_head",
      "L_gastrocnemius_lateral_head",
      "L_soleus_",
      "L_tibialis_anterior",
      "L_peroneus_longus",
      "L_peroneus_brevis",
      "L_tibialis_posterior",
      "L_soleus",
    ],
  },
  L_lower_limb: { id: "L_lower_limb", parent: "whole_body" },
  L_shoulder: {
    id: "L_shoulder",
    parent: "L_upper_limb",
    meshes: [
      "L_scapula",
      "L_clavicle",
      "L_levator_scapularis",
      "L_subclavius",
      "L_supraspinatus",
      "L_deltoit",
      "L_teres_minor",
      "L_teres_major",
      "L_subscapularis",
      "L_infraspinatus",
    ],
  },
  L_thigh: {
    id: "L_thigh",
    parent: "L_lower_limb",
    meshes: [
      "L_femur",
      "L_vastus_intermedius",
      "L_vastus_medialis",
      "L_semitendinosus_",
      "L_semimembranosus_",
      "L_sartorius",
      "L_rectus_femoris",
      "L_pectineus",
      "L_gracilis",
      "L_adductor_magnus",
      "L_adductor_longus",
      "L_bicep_femoris_longus",
      "L_vastus_lateralis",
      "L_tensor_fasciae_latae",
      "L_semimembranosus",
      "L_semitendinosus",
      "L_biceps_femoris_longus",
    ],
  },
  L_upper_limb: { id: "L_upper_limb", parent: "whole_body" },
  L_wrist: {
    id: "L_wrist",
    parent: "L_upper_limb",
    meshes: [
      "L_wrist",
      "L_flexor_carpi_radialis",
      "L_extensor_carpi_radialis_brevis",
      "L_retinaculum_",
      "L_flexor_carpi_ulnaris",
      "L_extensor_carpi_ulnaris",
      "L_extensor_carpi_radialis_longus",
      "L_retinaculum",
    ],
  },
  R_ankle: {
    id: "R_ankle",
    parent: "R_lower_limb",
    meshes: ["R_talus", "R_calcaneum_", "R_calcaneofibular_achilles_tendon"],
  },
  R_arm: {
    id: "R_arm",
    parent: "R_upper_limb",
    meshes: [
      "R_humerus",
      "R_brachialis",
      "R_triceps_lateral_head",
      "R_triceps_long_head",
      "R_triceps_medial_head",
      "R_triceps_tendon_medial_head",
      "R_bicep_brachii_long_head",
      "R_bicep_brachii_short_head",
    ],
  },
  R_ear: {
    id: "R_ear",
    parent: "head_neck",
    meshes: [
      "R_auricularis_anterior",
      "R_auricularis_posterior",
      "R_auricularis_superior",
    ],
  },
  R_foot: {
    id: "R_foot",
    parent: "R_lower_limb",
    meshes: [
      "R_metatarsal_bones",
      "R_tarsal_bones",
      "R_abductor_digiti_minimi_foot",
      "R_extensor_digitorum_brevis",
      "R_extensor_digitorum_longus",
      "R_extensor_hallucis_longus",
      "R_flexor_digitorum_longus",
      "R_flexor_hallucis_longus",
      "R_abductor_hallucis",
      "R_flexor_digitorum_brevis",
      "R_extensor_hallucis_brevis",
      "R_abductor_digiti_minimi__foot",
    ],
  },
  R_forearm: {
    id: "R_forearm",
    parent: "R_upper_limb",
    meshes: [
      "R_ulna",
      "R_radius",
      "R_anconeus",
      "R_bicipital_aponeurosis",
      "R_brachioradialis",
      "R_extensor_digitorum",
      "R_extensor_indicis",
      "R_flexor_digitorum_profundus",
      "R_flexor_digitorum_superficialis",
      "R_supinator",
      "R_pronator_quadratus",
      "R_pronator_teres",
    ],
  },
  R_hand: {
    id: "R_hand",
    parent: "R_upper_limb",
    meshes: [
      "R_phalanges",
      "R_finger_bones",
      "R_metacarpal_bones",
      "R_palmar_interossei_4",
      "R_abductor_pollicis_brevis",
      "R_adductor_pollicis",
      "R_extensor_pollicis_brevis",
      "R_extensor_pollicis_longus",
      "R_flexor_pollicis_brevis",
      "R_opponens_pollicis",
      "R_dorsal_interossei",
      "R_abductor_digiti_minimi",
      "R_abductor_pollicis_longus",
      "R_dorsal_interossei_2a",
      "R_dorsal_interossei_2b",
      "R_dorsal_interossei_3a",
      "R_dorsal_interossei_4a",
      "R_dorsal_interossei_4b",
      "R_flexor_digiti_minimi_brevis",
      "R_flexor_retinaculum",
      "R_flexor_pollicis_longus",
      "R_lumbrical_1",
      "R_lumbrical_2",
      "R_lumbrical_3",
      "R_lumbrical_4",
      "R_opponens_digiti_minimi",
      "R_palmar_interossei_1",
      "R_palmar_interossei_2",
      "R_palmar_interossei_3",
      "R_palmaris_longus",
    ],
  },
  R_hip: {
    id: "R_hip",
    parent: "R_lower_limb",
    meshes: [
      "R_inferior_gemellus",
      "R_internal_obturator",
      "R_obturator_externus",
      "R_piriformis",
      "R_quadratus_femoris",
      "R_superior_gemellus",
      "R_sacrotuberous_ligament_muscle",
      "R_iliacus",
    ],
  },
  R_knee: { id: "R_knee", parent: "R_lower_limb", meshes: ["R_patella"] },
  R_leg: {
    id: "R_leg",
    parent: "R_lower_limb",
    meshes: [
      "R_tibia",
      "R_fibula",
      "R_gastrocnemius_lateral_head",
      "R_gastrocnemius_medial_head",
      "R_peroneus_brevis",
      "R_peroneus_longus",
      "R_soleus_",
      "R_tibialis_anterior",
      "R_tibialis_posterior",
      "R_soleus",
    ],
  },
  R_lower_limb: { id: "R_lower_limb", parent: "whole_body" },
  R_shoulder: {
    id: "R_shoulder",
    parent: "R_upper_limb",
    meshes: [
      "R_scapula",
      "R_clavicle",
      "R_subclavius",
      "R_deltoit",
      "R_infraspinatus",
      "R_subscapularis",
      "R_teres_major",
      "R_teres_minor",
      "R_supraspinatus",
      "R_levator_scapularis",
    ],
  },
  R_thigh: {
    id: "R_thigh",
    parent: "R_lower_limb",
    meshes: [
      "R_femur",
      "R_adductor_longus",
      "R_adductor_magnus",
      "R_bicep_femoris_longus",
      "R_gracilis",
      "R_pectineus",
      "R_semimembranosus_",
      "R_semitendinosus_",
      "R_tensor_fasciae_latae",
      "R_vastus_medialis",
      "R_vastus_lateralis",
      "R_sartorius",
      "R_rectus_femoris",
      "R_vastus_intermedius",
      "R_biceps_femoris_longus",
      "R_semimembranosus",
      "R_semitendinosus",
    ],
  },
  R_upper_limb: { id: "R_upper_limb", parent: "whole_body" },
  R_wrist: {
    id: "R_wrist",
    parent: "R_upper_limb",
    meshes: [
      "R_wrist",
      "R_retinaculum_",
      "R_extensor_carpi_radialis_longus",
      "R_extensor_carpi_ulnaris",
      "R_flexor_carpi_ulnaris",
      "R_extensor_carpi_radialis_brevis",
      "R_flexor_carpi_radialis",
      "R_retinaculum",
    ],
  },
  abdomen: {
    id: "abdomen",
    parent: "trunk",
    meshes: [
      "R_internal_oblique",
      "transverse_abdominis",
      "rectus_abdominis",
      "external_oblique_01",
      "external_oblique_02",
      "R_quadratus_lumborum",
      "R_psoas_minor",
      "R_psoas_major",
      "L_quadratus_lumborum",
      "L_psoas_minor",
      "L_psoas_major",
      "diaphragm",
      "L_internal_oblique",
      "external_oblique",
    ],
  },
  back: {
    id: "back",
    parent: "trunk",
    meshes: [
      "L_rhomboid_minor",
      "R_trapezius_",
      "R_rhomboid_major",
      "R_rhomboid_minor",
      "L_rhomboid_major",
      "L_latissimus_dorsi",
      "R_latissimus_dorsi",
      "L_splenius_capitis",
      "L_trapezius_",
      "R_splenius_capitis",
      "L_trapezius",
      "R_trapezius",
    ],
  },
  cardiovascular: {
    id: "cardiovascular",
    parent: "whole_body",
    meshes: ["heart", "vascular_system"],
  },
  connective: {
    id: "connective",
    parent: "whole_body",
    meshes: ["cartilage_articular"],
  },
  digestive: {
    id: "digestive",
    parent: "whole_body",
    meshes: [
      "stomach",
      "spleen",
      "esophagus",
      "liver_ligament",
      "liver_right",
      "liver_left",
      "gallbladder",
      "appendix",
      "colon",
      "pharynx",
      "thyroid",
      "gastrosplenic_ligament",
      "small_intestine",
      "pancreas",
      "pancreas_duct",
      "hepatic_duct",
      "left_hepatic_duct",
      "right_hepatic_duct",
    ],
  },
  face: {
    id: "face",
    parent: "head_neck",
    meshes: [
      "eyebrows",
      "eyelashes",
      "ligaments_nose",
      "nose_muscle",
      "R_corrugator_cupercilii",
      "R_depressor_anguli_oris",
      "R_depressor_labii_inferioris",
      "R_depressor_supercilii",
      "R_hyoglossus",
      "R_levator_anguli_oris_",
      "R_levator_labii_superioris",
      "R_levator_labii_superioris_alaeque_nasi_muscle",
      "R_nasalis_alar",
      "R_procerus",
      "R_risorius",
      "R_zygomaticus_major",
      "R_zygomaticus_minor",
      "orbicularis_oris",
      "nasalis_transverse",
      "L_zygomaticus_minor",
      "L_zygomaticus_major",
      "L_risorius",
      "L_procerus",
      "L_orbicularis_oculi",
      "L_nasalis_alar",
      "L_levator_labii_superioris_alaeque_nasi_muscle",
      "L_levator_labii_superioris",
      "L_levator_anguli_oris_",
      "L_hyoglossus",
      "L_depressor_supercilii",
      "L_depressor_labii_inferioris",
      "L_depressor_anguli_oris",
      "L_corrugator_supercilii",
      "frontalis",
      "R_orbicularis_oculi",
      "L_levator_anguli_oris",
      "R_levator_anguli_oris",
    ],
  },
  head_neck: { id: "head_neck", parent: "whole_body" },
  integumentary: {
    id: "integumentary",
    parent: "whole_body",
    meshes: ["eye_surface", "eyes", "body", "hair"],
  },
  jaw: {
    id: "jaw",
    parent: "head_neck",
    meshes: [
      "upper_teeth",
      "lower_teeth",
      "jaw_bone",
      "R_buccinator_",
      "R_masseter_deep",
      "R_mentalis",
      "L_temporalis",
      "L_mentalis",
      "L_masseter_superior",
      "L_masseter_deep",
      "L_buccinator_",
      "R_masseter_superior",
      "R_temporalis",
      "R_buccinator",
      "L_buccinator",
    ],
  },
  lower_limb: {
    id: "lower_limb",
    parent: "whole_body",
    meshes: [
      "ligaments_femur",
      "ligaments_foot",
      "ligaments_ilium",
      "ligaments_knee",
      "ligaments_toes",
      "cartilage_ankle",
      "cartilage_hip",
      "cartilage_knee",
    ],
  },
  lymphatic: {
    id: "lymphatic",
    parent: "whole_body",
    meshes: ["lymphatic_system"],
  },
  neck: {
    id: "neck",
    parent: "head_neck",
    meshes: [
      "hyoid_bone_skeletal",
      "R_digastric_",
      "R_mylohyoid_",
      "R_sternothyroid",
      "R_thyrohyoid_",
      "L_thyrohyoid_",
      "L_stylohyoid",
      "L_sternothyroid",
      "L_sternohyoid",
      "L_sternocleidomastoid",
      "L_scalene_posterior",
      "L_scalene_middle",
      "L_scalene_anterior",
      "L_platysma_",
      "L_omohyoid_",
      "L_mylohyoid_",
      "L_digastric_",
      "R_platysma_",
      "R_omohyoid_",
      "R_scalene_anterior",
      "R_scalene_middle",
      "R_scalene_posterior",
      "R_sternocleidomastoid",
      "R_sternohyoid",
      "L_mylohyoid",
      "L_omohyoid",
      "L_platysma",
      "L_thyrohyoid",
      "R_digastric",
      "R_omohyoid",
      "R_platysma",
      "R_thyrohyoid",
      "L_digastric",
      "thyrohyoid_membrane",
      "thyroid_cartilage",
      "transverse_arytenoid_muscle",
      "hyoid_bone",
      "epiglottis",
      "cricoid_cartilage",
      "arytenoid_cartilage",
      "corniculate_cartilage",
    ],
  },
  nervous: { id: "nervous", parent: "whole_body", meshes: ["brain", "nerves"] },
  pelvis: {
    id: "pelvis",
    parent: "trunk",
    meshes: [
      "pubic_symphysis",
      "ilium",
      "puborectalis",
      "pubococcygeus",
      "R_bulbospongiosus",
      "L_bulbospongiosus",
      "coccygeus",
      "levator_ani",
      "L_ischiocavernosus",
      "L_gluteus_minimus",
      "L_gluteus_medius",
      "R_gluteus_maximus",
      "R_gluteus_minimus",
      "R_ischiocavernosus",
      "R_gluteus_medius",
      "L_gluteus_maximus",
    ],
  },
  respiratory: {
    id: "respiratory",
    parent: "whole_body",
    meshes: ["lungs", "bronchi", "thymus"],
  },
  skull: { id: "skull", parent: "head_neck", meshes: ["skull"] },
  spine: {
    id: "spine",
    parent: "trunk",
    meshes: [
      "coccyx",
      "sacrum",
      "intervertebral_disks",
      "cervical_spine",
      "thoracic_spine",
      "lumbar_spine",
      "spinalis",
      "R_iliocostalis",
      "L_longissimus_thoracis",
      "L_semispinalis_capitis",
      "R_longissimus_thoracis",
      "L_iliocostalis",
    ],
  },
  thorax: {
    id: "thorax",
    parent: "trunk",
    meshes: [
      "costal_cartilage",
      "sternum",
      "thorax",
      "L_intercostal_muscles",
      "L_pectoralis_major",
      "L_pectoralis_minor",
      "R_pectoralis_major",
      "R_pectoralis_minor",
      "L_serratus_anterior",
      "R_serratus_anterior",
    ],
  },
  trunk: { id: "trunk", parent: "whole_body" },
  upper_limb: {
    id: "upper_limb",
    parent: "whole_body",
    meshes: [
      "ligaments_wrist",
      "ligaments_elbow",
      "ligaments_shoulder",
      "cartilage_elbow",
      "cartilage_shoulder",
    ],
  },
  urogenital: {
    id: "urogenital",
    parent: "whole_body",
    meshes: [
      "testis",
      "vas_deferens",
      "corpus_cavernosum",
      "prostate",
      "urethra",
      "bladder",
      "adrenal_glands",
      "kidneys",
      "ureter",
      "ejaculatory_duct",
      "glans_penis",
      "corpus_spongiosum",
      "ovariium_l",
      "ovariium_r",
      "uterus",
      "mammary_gland",
      "seminal_vesicle",
      "epididymis",
    ],
  },
  whole_body: { id: "whole_body" },
};

/** Reserved region id for items affecting the body generally. */
export const WHOLE_BODY = "whole_body";

// ── Derived indexes (built once at module load) ──────────────────────────────

const MESH_TO_REGION: Record<string, string> = {};
for (const region of Object.values(ANATOMY_REGIONS)) {
  for (const mesh of region.meshes ?? []) {
    // First region wins; meshes belong to exactly one leaf region.
    if (!(mesh in MESH_TO_REGION)) MESH_TO_REGION[mesh] = region.id;
  }
}

/** True when `id` is a known region id or a known mesh name. */
export function isKnownAnatomyId(id: string): boolean {
  return id in ANATOMY_REGIONS || id in MESH_TO_REGION;
}

/** All region ids (for schema enum population). */
export function regionIds(): string[] {
  return Object.keys(ANATOMY_REGIONS);
}

/**
 * Ordered rollup parents for a mesh or region id, broadest last.
 * For a mesh: [leafRegion, parent, …, whole_body].
 * For a region: [parent, …, whole_body]. Empty for whole_body / unknown ids.
 */
export function rollupChain(meshOrRegionId: string): string[] {
  let start: string | undefined;
  if (meshOrRegionId in ANATOMY_REGIONS) {
    start = ANATOMY_REGIONS[meshOrRegionId].parent;
  } else if (meshOrRegionId in MESH_TO_REGION) {
    start = MESH_TO_REGION[meshOrRegionId];
  } else {
    return [];
  }
  const chain: string[] = [];
  let cur = start;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    chain.push(cur);
    cur = ANATOMY_REGIONS[cur]?.parent;
  }
  return chain;
}

/** Nearest rollup parent region for a mesh or region id (or undefined). */
export function nearestRegion(meshOrRegionId: string): string | undefined {
  if (meshOrRegionId in MESH_TO_REGION) return MESH_TO_REGION[meshOrRegionId];
  if (meshOrRegionId in ANATOMY_REGIONS) return meshOrRegionId;
  return undefined;
}

/**
 * Transitive mesh expansion for a region id — every leaf mesh under it,
 * for 3D painting. A mesh id returns itself.
 */
export function regionMeshes(regionId: string): string[] {
  if (regionId in MESH_TO_REGION || !(regionId in ANATOMY_REGIONS)) {
    return regionId in MESH_TO_REGION ? [regionId] : [];
  }
  const out: string[] = [];
  const stack = [regionId];
  const guard = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (guard.has(id)) continue;
    guard.add(id);
    const region = ANATOMY_REGIONS[id];
    if (!region) continue;
    for (const m of region.meshes ?? []) out.push(m);
    for (const child of Object.values(ANATOMY_REGIONS)) {
      if (child.parent === id) stack.push(child.id);
    }
  }
  return out;
}
