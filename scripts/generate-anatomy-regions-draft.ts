/**
 * One-off draft generator for src/data/anatomy-regions.ts.
 *
 * Reads src/data/objects.json (472 mesh names across 10 systems) and emits a
 * region rollup taxonomy: every mesh is assigned to a leaf region, and leaf
 * regions roll up through body-part → limb/system → whole_body.
 *
 * This is a BOOTSTRAP, not the source of truth. Run it once, commit the output,
 * then hand-correct. The integrity test (anatomy-regions.test.ts) guarantees
 * every mesh stays reachable; anything the keyword tables miss lands in the
 * `__REVIEW__` region and fails no test but should be re-homed by a human.
 *
 *   npx tsx scripts/generate-anatomy-regions-draft.ts > /tmp/regions-draft.json
 *
 * The committed src/data/anatomy-regions.ts inlines the reviewed result.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const objects = JSON.parse(
  readFileSync(join(__dirname, "../src/data/objects.json"), "utf8"),
) as Record<string, { objects?: string[] }>;

// Region tree: id -> parent. Lateral regions are templated with {side}.
// Broadest parent is whole_body.
const PARENTS: Record<string, string> = {
  whole_body: "",

  head_neck: "whole_body",
  skull: "head_neck",
  face: "head_neck",
  jaw: "head_neck",
  neck: "head_neck",
  "{side}_ear": "head_neck",

  trunk: "whole_body",
  spine: "trunk",
  thorax: "trunk",
  abdomen: "trunk",
  pelvis: "trunk",
  back: "trunk",

  cardiovascular: "whole_body",
  respiratory: "whole_body",
  digestive: "whole_body",
  urogenital: "whole_body",
  nervous: "whole_body",
  lymphatic: "whole_body",
  integumentary: "whole_body",
  connective: "whole_body",

  "{side}_upper_limb": "whole_body",
  "{side}_shoulder": "{side}_upper_limb",
  "{side}_arm": "{side}_upper_limb",
  "{side}_elbow": "{side}_upper_limb",
  "{side}_forearm": "{side}_upper_limb",
  "{side}_wrist": "{side}_upper_limb",
  "{side}_hand": "{side}_upper_limb",

  "{side}_lower_limb": "whole_body",
  "{side}_hip": "{side}_lower_limb",
  "{side}_thigh": "{side}_lower_limb",
  "{side}_knee": "{side}_lower_limb",
  "{side}_leg": "{side}_lower_limb",
  "{side}_ankle": "{side}_lower_limb",
  "{side}_foot": "{side}_lower_limb",

  // Non-lateral limb roots — home for unsided structures (shared ligaments,
  // generic cartilage) that match a limb joint but carry no L_/R_ prefix.
  upper_limb: "whole_body",
  lower_limb: "whole_body",
};

// When a lateral rule matches a mesh with no side prefix, route it to the
// non-lateral limb root instead of a bogus X_ region.
const LATERAL_REGION_TO_LIMB: Record<string, string> = {
  "{side}_shoulder": "upper_limb",
  "{side}_arm": "upper_limb",
  "{side}_elbow": "upper_limb",
  "{side}_forearm": "upper_limb",
  "{side}_wrist": "upper_limb",
  "{side}_hand": "upper_limb",
  "{side}_hip": "lower_limb",
  "{side}_thigh": "lower_limb",
  "{side}_knee": "lower_limb",
  "{side}_leg": "lower_limb",
  "{side}_ankle": "lower_limb",
  "{side}_foot": "lower_limb",
  "{side}_ear": "head_neck",
};

// Ordered keyword rules: first match wins. Tested against the de-prefixed,
// lowercased stem. `lateral: true` means the region carries the mesh's side.
const RULES: Array<{ kw: string[]; region: string; lateral: boolean }> = [
  // foot toe-muscles first — "hallucis"/foot digitorum would otherwise be
  // captured by the forearm "extensor"/"flexor" rules below.
  { kw: ["hallucis", "digitorum_brevis", "extensor_digitorum_longus", "flexor_digitorum_longus", "digiti_minimi_foot", "digiti_minimi__foot"], region: "{side}_foot", lateral: true },
  // hand (before forearm/wrist)
  { kw: ["metacarpal", "phalange", "finger", "interossei", "lumbrical", "pollicis", "digiti_minimi", "palmaris", "palmar", "opponens", "adductor_pollicis", "abductor_pollicis", "flexor_retinaculum"], region: "{side}_hand", lateral: true },
  // wrist
  { kw: ["wrist", "carpi", "retinaculum", "ligaments_wrist"], region: "{side}_wrist", lateral: true },
  // forearm
  { kw: ["radius", "ulna", "extensor", "flexor_digitorum", "pronator", "supinator", "brachioradialis", "anconeus", "bicipital_aponeurosis"], region: "{side}_forearm", lateral: true },
  // elbow
  { kw: ["elbow"], region: "{side}_elbow", lateral: true },
  // arm
  { kw: ["humerus", "bicep_brachii", "biceps_brachii", "triceps", "brachialis"], region: "{side}_arm", lateral: true },
  // shoulder (rotator cuff + girdle)
  { kw: ["deltoit", "deltoid", "scapula", "clavicle", "supraspinatus", "infraspinatus", "teres_major", "teres_minor", "subscapularis", "subclavius", "ligaments_shoulder", "cartilage_shoulder"], region: "{side}_shoulder", lateral: true },

  // foot (before ankle/leg)
  { kw: ["metatarsal", "tarsal", "hallucis", "digitorum_brevis", "digitorum_longus_foot", "abductor_digiti_minimi_foot", "abductor_digiti_minimi__foot", "abductor_hallucis", "ligaments_foot", "ligaments_toes", "phalange"], region: "{side}_foot", lateral: true },
  // ankle
  { kw: ["talus", "calcaneum", "calcaneofibular", "achilles", "cartilage_ankle"], region: "{side}_ankle", lateral: true },
  // leg (lower leg)
  { kw: ["tibia", "fibula", "gastrocnemius", "soleus", "peroneus", "tibialis"], region: "{side}_leg", lateral: true },
  // knee
  { kw: ["patella", "ligaments_knee", "cartilage_knee"], region: "{side}_knee", lateral: true },
  // thigh
  { kw: ["femur", "vastus", "rectus_femoris", "sartorius", "gracilis", "adductor_longus", "adductor_magnus", "semitendinosus", "semimembranosus", "bicep_femoris", "biceps_femoris", "tensor_fasciae_latae", "pectineus", "ligaments_femur"], region: "{side}_thigh", lateral: true },
  // hip
  { kw: ["obturator", "gemellus", "iliacus", "quadratus_femoris", "piriformis", "cartilage_hip", "ligaments_ilium", "sacrotuberous"], region: "{side}_hip", lateral: true },

  // ear
  { kw: ["auricularis"], region: "{side}_ear", lateral: true },

  // pelvis (non-lateral floor + glutes + bony pelvis)
  { kw: ["gluteus", "levator_ani", "coccygeus", "puborectalis", "pubococcygeus", "ischiocavernosus", "bulbospongiosus", "pubic_symphysis", "ilium", "sacrotuberous_ligament"], region: "pelvis", lateral: false },

  // abdomen
  { kw: ["oblique", "rectus_abdominis", "transverse_abdominis", "psoas", "quadratus_lumborum", "diaphragm"], region: "abdomen", lateral: false },

  // thorax
  { kw: ["pectoralis", "serratus", "intercostal", "sternum", "thorax", "costal_cartilage", "rib"], region: "thorax", lateral: false },

  // back
  { kw: ["trapezius", "latissimus", "rhomboid", "levator_scapularis", "splenius"], region: "back", lateral: false },

  // spine
  { kw: ["spine", "vertebra", "intervertebral", "sacrum", "coccyx", "spinalis", "iliocostalis", "longissimus", "semispinalis"], region: "spine", lateral: false },

  // neck
  { kw: ["hyoid", "thyrohyoid", "sternocleidomastoid", "scalene", "omohyoid", "sternohyoid", "sternothyroid", "stylohyoid", "platysma", "digastric", "mylohyoid", "thyroid_cartilage", "cricoid", "arytenoid", "corniculate", "epiglottis"], region: "neck", lateral: false },

  // jaw
  { kw: ["jaw", "teeth", "masseter", "temporalis", "mentalis", "buccinator"], region: "jaw", lateral: false },

  // face (facial muscles + eye region)
  { kw: ["nose", "nasalis", "orbicularis", "zygomaticus", "risorius", "procerus", "corrugator", "depressor", "levator_labii", "levator_anguli_oris", "frontalis", "hyoglossus", "ligaments_nose", "eyebrow", "eyelash"], region: "face", lateral: false },

  // skull
  { kw: ["skull"], region: "skull", lateral: false },

  // generic / unlocalised connective tissue (no specific joint)
  { kw: ["cartilage_articular"], region: "connective", lateral: false },
];

// Direct mesh-name → region for the named-organ systems (non-muscular).
const SYSTEM_DEFAULT: Record<string, string> = {
  vascular: "cardiovascular",
  nervous: "nervous",
  lymphatic: "lymphatic",
  respiratory: "respiratory",
  digestive: "digestive",
  urogenital: "urogenital",
  skin: "integumentary",
};

function stripSide(name: string): { side: "L" | "R" | null; stem: string } {
  if (name.startsWith("L_")) return { side: "L", stem: name.slice(2) };
  if (name.startsWith("R_")) return { side: "R", stem: name.slice(2) };
  return { side: null, stem: name };
}

function resolveRegion(side: "L" | "R" | null, template: string): string {
  if (!template.includes("{side}")) return template;
  const s = side ?? "X"; // X = unsided mesh landed in a lateral region; flag for review
  return template.replace("{side}", s);
}

const regionMeshes: Record<string, string[]> = {};
const review: string[] = [];

function assign(region: string, mesh: string) {
  (regionMeshes[region] ??= []).push(mesh);
}

for (const [system, payload] of Object.entries(objects)) {
  const meshes = payload.objects ?? [];
  for (const mesh of meshes) {
    const { side, stem } = stripSide(mesh);
    const lc = stem.toLowerCase();

    // Named-organ systems route by system unless a muscular-style keyword wins.
    let matched = false;
    for (const rule of RULES) {
      if (rule.kw.some((k) => lc.includes(k))) {
        let region: string;
        if (rule.lateral && side === null) {
          // Unsided mesh in a lateral region → non-lateral limb root.
          region = LATERAL_REGION_TO_LIMB[rule.region] ?? "whole_body";
        } else {
          region = resolveRegion(rule.lateral ? side : null, rule.region);
        }
        assign(region, mesh);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const sysRegion = SYSTEM_DEFAULT[system];
    if (sysRegion) {
      assign(sysRegion, mesh);
      continue;
    }
    review.push(mesh);
  }
}

if (review.length) assign("__REVIEW__", review.join(", ") as unknown as string);

// Emit reviewable JSON (region -> {parent, meshes}).
const out: Record<string, { parent: string; meshes: string[] }> = {};
const allRegionIds = new Set(Object.keys(regionMeshes));
// Expand parent chains so intermediate regions exist even without direct meshes.
for (const id of allRegionIds) {
  let cur = id;
  while (cur && cur !== "__REVIEW__") {
    const template = cur.replace(/^[LR]_/, "{side}_");
    const parentTemplate = PARENTS[template] ?? PARENTS[cur];
    const side = cur.startsWith("L_") ? "L" : cur.startsWith("R_") ? "R" : null;
    const parent =
      parentTemplate === undefined
        ? "whole_body"
        : resolveRegion(side, parentTemplate);
    out[cur] ??= { parent, meshes: [] };
    if (regionMeshes[cur] && cur !== "__REVIEW__") out[cur].meshes = regionMeshes[cur];
    if (!parent) break;
    cur = parent;
  }
}
out["__REVIEW__"] = { parent: "whole_body", meshes: regionMeshes["__REVIEW__"] ?? [] };

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
process.stderr.write(`Regions: ${Object.keys(out).length}, review: ${review.length}\n`);
