/**
 * What clinicians and patients actually say, mapped to ids the model contains.
 *
 * This is deliberately NOT `src/data/anatomy-aliases.ts`. That table feeds
 * `normalizeAnatomyId()`, which runs live during Care Plan load
 * (`src/lib/careplan/store.ts`, `bodyparts.ts`); adding conversational synonyms
 * there would silently change production merge behaviour. This table is read
 * only by the resolver.
 *
 * Values are region ids or exact-case mesh names. Keys are lowercase.
 *
 * Where the model has no dedicated mesh for a structure, the alias points at
 * the closest thing that DOES exist rather than at nothing — "medial meniscus"
 * resolves to `cartilage_knee`, because there is no meniscus mesh but knee
 * cartilage is the honest nearest anchor. Sided variants are generated
 * automatically from an `L_`/`R_` template, so only the base entry is listed.
 */

/** Aliases that resolve to a single id (no laterality). */
const MIDLINE_ALIASES: Record<string, string> = {
  // Spine — patients and reports both use the segment shorthand.
  "l1-l2": "lumbar_spine",
  "l2-l3": "lumbar_spine",
  "l3-l4": "lumbar_spine",
  "l4-l5": "lumbar_spine",
  "l5-s1": "lumbar_spine",
  "c5-c6": "cervical_spine",
  "c6-c7": "cervical_spine",
  "lumbar disc": "intervertebral_disks",
  "cervical disc": "intervertebral_disks",
  "herniated disc": "intervertebral_disks",
  "slipped disc": "intervertebral_disks",
  "bulging disc": "intervertebral_disks",
  disc: "intervertebral_disks",
  "lower back": "lumbar_spine",
  "small of the back": "lumbar_spine",
  "tail bone": "coccyx",
  tailbone: "coccyx",
  "collar bone": "R_clavicle",
  "breast bone": "sternum",
  breastbone: "sternum",
  "rib cage": "thorax",
  ribcage: "thorax",
  "voice box": "thyroid_cartilage",
  "adam's apple": "thyroid_cartilage",
  windpipe: "bronchi",
  gullet: "esophagus",
  "food pipe": "esophagus",
  "wind pipe": "bronchi",

  // Whole-system-only layers — see WHOLE_SYSTEM_ONLY_LAYERS. These resolve, but
  // the resolver flags them so the caller does not promise sub-layer precision.
  aorta: "vascular_system",
  "coronary artery": "vascular_system",
  "carotid artery": "vascular_system",
  "femoral artery": "vascular_system",
  "pulmonary artery": "vascular_system",
  artery: "vascular_system",
  vein: "vascular_system",
  "spinal cord": "nerves",
  "sciatic nerve": "nerves",
  "median nerve": "nerves",
  "ulnar nerve": "nerves",
  "vagus nerve": "nerves",
  "optic nerve": "nerves",
  nerve: "nerves",
  "lymph node": "lymphatic_system",
  "lymph nodes": "lymphatic_system",

  // Organs.
  womb: "uterus",
  "voicebox": "thyroid_cartilage",
  gullet_: "esophagus",
};

/**
 * Aliases with a natural left/right pair. The value is a template containing
 * `{S}`, replaced by `L` or `R`. An unsided query returns both.
 */
const SIDED_ALIASES: Record<string, string> = {
  // Knee. There is no meniscus or cruciate-ligament mesh; knee cartilage and
  // knee ligaments are the nearest structures that exist.
  "medial meniscus": "cartilage_knee",
  "lateral meniscus": "cartilage_knee",
  meniscus: "cartilage_knee",
  "torn meniscus": "cartilage_knee",
  acl: "ligaments_knee",
  "anterior cruciate ligament": "ligaments_knee",
  pcl: "ligaments_knee",
  "posterior cruciate ligament": "ligaments_knee",
  mcl: "ligaments_knee",
  "medial collateral ligament": "ligaments_knee",
  lcl: "ligaments_knee",
  "cruciate ligament": "ligaments_knee",
  "knee cap": "{S}_patella",
  kneecap: "{S}_patella",

  // Shoulder.
  "rotator cuff": "{S}_supraspinatus",
  supraspinatus: "{S}_supraspinatus",
  infraspinatus: "{S}_infraspinatus",
  subscapularis: "{S}_subscapularis",
  "teres minor": "{S}_teres_minor",
  "frozen shoulder": "{S}_shoulder",
  "shoulder blade": "{S}_scapula",
  "labrum": "cartilage_shoulder",
  "shoulder impingement": "{S}_shoulder",

  // Ankle / foot.
  achilles: "{S}_calcaneofibular_achilles_tendon",
  "achilles tendon": "{S}_calcaneofibular_achilles_tendon",
  "heel bone": "{S}_calcaneum",
  "plantar fascia": "{S}_foot",
  "plantar fasciitis": "{S}_foot",
  "ankle sprain": "{S}_ankle",

  // Elbow. There is no elbow region and the only elbow meshes
  // (`ligaments_elbow`, `cartilage_elbow`) are unsided, so a sided request is
  // best served by the forearm region — radius, ulna, anconeus, brachioradialis.
  elbow: "{S}_forearm",
  "elbow joint": "{S}_forearm",

  // Wrist / hand.
  "carpal tunnel": "{S}_flexor_retinaculum",
  "carpal tunnel syndrome": "{S}_flexor_retinaculum",
  "tennis elbow": "{S}_extensor_carpi_radialis_brevis",
  "golfer's elbow": "{S}_flexor_carpi_radialis",
  "funny bone": "{S}_ulna",

  // Hip / thigh / leg.
  hamstring: "{S}_biceps_femoris_longus",
  hamstrings: "{S}_biceps_femoris_longus",
  quad: "{S}_rectus_femoris",
  quadriceps: "{S}_rectus_femoris",
  "hip flexor": "{S}_hip",
  groin: "pelvis",
  calf: "{S}_gastrocnemius_medial_head",
  "shin bone": "{S}_tibia",
  shin: "{S}_tibia",
  "thigh bone": "{S}_femur",
  glute: "{S}_gluteus_maximus",
  glutes: "{S}_gluteus_maximus",
  piriformis: "{S}_piriformis",

  // Arm.
  bicep: "{S}_bicep_brachii_long_head",
  biceps: "{S}_bicep_brachii_long_head",
  tricep: "{S}_triceps_lateral_head",
  triceps: "{S}_triceps_lateral_head",
  "upper arm bone": "{S}_humerus",

  // Head.
  jaw: "jaw_bone",
  "jaw joint": "jaw",
  tmj: "jaw",
  "temporomandibular joint": "jaw",
};

export interface ClinicalAliasHit {
  /** Exact-case ids the alias resolves to (both sides when unsided). */
  ids: string[];
  /** True when the target layer has no sub-layer granularity. */
  term: string;
}

/**
 * Resolve a lowercase clinical phrase. `side` narrows a sided alias; without it
 * a sided alias returns both the left and right id.
 */
export function resolveClinicalAlias(
  term: string,
  side: "left" | "right" | null,
): string[] | null {
  const key = term.trim().toLowerCase();

  const midline = MIDLINE_ALIASES[key];
  if (midline) return [midline];

  const sided = SIDED_ALIASES[key];
  if (!sided) return null;

  if (!sided.includes("{S}")) return [sided];
  if (side === "left") return [sided.replace("{S}", "L")];
  if (side === "right") return [sided.replace("{S}", "R")];
  return [sided.replace("{S}", "L"), sided.replace("{S}", "R")];
}

/** Every alias key, for tests and for `list_anatomy_regions` style enumeration. */
export function clinicalAliasTerms(): string[] {
  return [...Object.keys(MIDLINE_ALIASES), ...Object.keys(SIDED_ALIASES)];
}
