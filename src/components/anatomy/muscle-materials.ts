/**
 * Muscle material system for 3D anatomy viewer.
 * Classifies 400+ muscles into anatomical groups and provides
 * per-muscle color variation with adaptive PBR/matcap materials.
 */
import * as THREE from "three";

// --- Anatomical group classification ---

type MuscleGroup =
  | "head_face"
  | "head_jaw"
  | "neck"
  | "shoulder"
  | "arm_flexor"
  | "arm_extensor"
  | "forearm_flexor"
  | "forearm_extensor"
  | "hand"
  | "torso_anterior"
  | "torso_posterior"
  | "torso_deep"
  | "pelvis"
  | "hip"
  | "leg_anterior"
  | "leg_posterior"
  | "leg_medial"
  | "lower_leg"
  | "foot";

// Base colors per group (HSL-ish, stored as hex for THREE.Color)
// Palette ranges from deep red-brown (deep muscles) to lighter pinkish-red (superficial)
const GROUP_COLORS: Record<MuscleGroup, number> = {
  head_face: 0xc47070, // lighter pinkish
  head_jaw: 0xb55858, // medium pink-red
  neck: 0xb06060, // medium
  shoulder: 0xa04848, // deeper red
  arm_flexor: 0xb54040, // rich red
  arm_extensor: 0x9e4545, // darker red-brown
  forearm_flexor: 0xa83838, // warm red
  forearm_extensor: 0x953d3d, // brown-red
  hand: 0xc06868, // lighter (small muscles)
  torso_anterior: 0xb53535, // deep red
  torso_posterior: 0x8b3030, // dark red-brown
  torso_deep: 0x7a2828, // deepest
  pelvis: 0x802e2e, // deep dark
  hip: 0x9a3838, // medium-deep
  leg_anterior: 0xb04040, // rich
  leg_posterior: 0x8e3535, // darker
  leg_medial: 0x9c4242, // medium
  lower_leg: 0xa54545, // medium-warm
  foot: 0xbe6565, // lighter
};

/**
 * Classify a muscle name into an anatomical group using keyword heuristics.
 */
function classifyMuscle(name: string): MuscleGroup {
  // Strip L_/R_ prefix for matching
  const n = name.replace(/^[LR]_/, "").toLowerCase();

  // Head & Face
  if (
    /frontalis|orbicularis_oculi|procerus|corrugator|nasalis|depressor_supercilii|auricularis|zygomaticus|levator_labii|depressor_(anguli|labii)|mentalis|risorius|orbicularis_oris|nose_muscle|buccinator/.test(
      n,
    )
  )
    return "head_face";

  // Jaw / mastication
  if (
    /masseter|temporalis|pterygoid|digastric|mylohyoid|hyoglossus|stylohyoid/.test(
      n,
    )
  )
    return "head_jaw";

  // Neck
  if (
    /sternocleidomastoid|scalene|platysma|omohyoid|sternohyoid|sternothyroid|thyrohyoid|semispinalis_capitis|splenius|levator_scapularis/.test(
      n,
    )
  )
    return "neck";

  // Shoulder
  if (
    /deltoi[td]|supraspinatus|infraspinatus|teres_(major|minor)|subscapularis|subclavius/.test(
      n,
    )
  )
    return "shoulder";

  // Upper arm flexors
  if (/bicep_brachii|bicipital_aponeurosis|brachialis|coracobrachialis/.test(n))
    return "arm_flexor";

  // Upper arm extensors
  if (/triceps|anconeus/.test(n)) return "arm_extensor";

  // Forearm flexors
  if (
    /flexor_carpi|flexor_digitorum|flexor_pollicis|palmaris_longus|pronator|flexor_retinaculum|flexor_digiti_minimi/.test(
      n,
    )
  )
    return "forearm_flexor";

  // Forearm extensors
  if (
    /extensor_carpi|extensor_digitorum(?!.*(?:brevis|longus.*(?:foot|halluc)))|extensor_indicis|extensor_pollicis|brachioradialis|supinator|retinaculum/.test(
      n,
    )
  )
    return "forearm_extensor";

  // Hand intrinsic
  if (
    /lumbrical|interossei|opponens|adductor_pollicis|abductor_pollicis_brevis|abductor_digiti_minimi(?!.*foot)/.test(
      n,
    )
  )
    return "hand";

  // Torso anterior
  if (/pectoralis|rectus_abdominis|external_oblique|serratus_anterior/.test(n))
    return "torso_anterior";

  // Torso posterior
  if (
    /latissimus|rhomboid|trapezius|erector|longissimus|iliocostalis|spinalis/.test(
      n,
    )
  )
    return "torso_posterior";

  // Torso deep
  if (
    /internal_oblique|transverse_abdominis|intercostal|diaphragm|quadratus_lumborum/.test(
      n,
    )
  )
    return "torso_deep";

  // Pelvis / pelvic floor
  if (
    /levator_ani|coccygeus|pubococcygeus|puborectalis|ischiocavernosus|bulbospongiosus|sacrotuberous/.test(
      n,
    )
  )
    return "pelvis";

  // Hip
  if (
    /gluteus|piriformis|obturator|gemellus|quadratus_femoris|iliacus|psoas|tensor_fasciae_latae/.test(
      n,
    )
  )
    return "hip";

  // Leg anterior (quadriceps)
  if (/rectus_femoris|vastus|sartorius|pectineus/.test(n))
    return "leg_anterior";

  // Leg posterior (hamstrings)
  if (/bicep_femoris|biceps_femoris|semitendinosus|semimembranosus/.test(n))
    return "leg_posterior";

  // Leg medial (adductors)
  if (/adductor|gracilis/.test(n)) return "leg_medial";

  // Lower leg
  if (
    /gastrocnemius|soleus|tibialis|peroneus|fibularis|achilles|extensor_digitorum_(longus|brevis)|extensor_hallucis|flexor_digitorum_longus|flexor_hallucis/.test(
      n,
    )
  )
    return "lower_leg";

  // Foot
  if (
    /abductor_hallucis|abductor_digiti_minimi_foot|flexor_digitorum_brevis|extensor_digitorum_brevis/.test(
      n,
    )
  )
    return "foot";

  // Fallback
  return "torso_deep";
}

/**
 * Deterministic hash of a string to a float in [0, 1).
 * Used for per-muscle hue/saturation jitter.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return ((hash & 0x7fffffff) % 10000) / 10000;
}

/**
 * Get a per-muscle color with deterministic jitter from the group base color.
 */
function getMuscleTint(muscleName: string): THREE.Color {
  const group = classifyMuscle(muscleName);
  const base = new THREE.Color(GROUP_COLORS[group]);

  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  // Apply jitter: hue ±0.03, saturation ±0.08, lightness ±0.06
  const h = hashString(muscleName);
  const h2 = hashString(muscleName + "_s");
  const h3 = hashString(muscleName + "_l");

  hsl.h = (((hsl.h + (h - 0.5) * 0.06) % 1) + 1) % 1;
  hsl.s = Math.max(0.15, Math.min(0.85, hsl.s + (h2 - 0.5) * 0.16));
  hsl.l = Math.max(0.15, Math.min(0.55, hsl.l + (h3 - 0.5) * 0.12));

  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

/**
 * Create a desktop PBR muscle material using MeshPhysicalMaterial.
 * Provides wet-look sheen and subtle clearcoat for realistic appearance.
 */
export function createMuscleMaterial(
  muscleName: string,
): THREE.MeshPhysicalMaterial {
  const color = getMuscleTint(muscleName);

  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.65,
    metalness: 0.0,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xff6060),
    sheenRoughness: 0.5,
    clearcoat: 0.05,
    clearcoatRoughness: 0.7,
  });
}

/**
 * Create a mobile-optimized matcap muscle material.
 * Matcap materials require no light calculations - the matcap texture
 * encodes the entire lighting model. The per-muscle color tints the matcap.
 */
export function createMuscleMatcapMaterial(
  muscleName: string,
  matcapTexture: THREE.Texture,
): THREE.MeshMatcapMaterial {
  const color = getMuscleTint(muscleName);

  return new THREE.MeshMatcapMaterial({
    matcap: matcapTexture,
    color,
  });
}

/**
 * Check if a given system file ID is the muscular system.
 */
export function isMuscularSystem(fileId: string): boolean {
  return fileId === "muscular_system";
}
