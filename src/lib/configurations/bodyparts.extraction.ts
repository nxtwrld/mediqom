import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";

/**
 * Body Parts Extraction Schema
 *
 * Focused node for extracting anatomical regions and body parts from medical documents.
 */
export default {
  name: "extract_body_parts",
  description: `Extract anatomical regions and body parts mentioned in medical documents including affected areas, examination sites, and procedural locations.

CRITICAL LATERALITY INSTRUCTIONS:
For paired anatomical structures (bones, joints, limbs), you MUST select the lateralized enum value based on the side mentioned in the medical text:

- If "left humerus" / "levý humerus" / "levá pažní kost" / "links humerus" → select "L_humerus"
- If "right femur" / "pravý femur" / "pravá stehenní kost" / "rechts femur" → select "R_femur"
- If "left knee" / "levé koleno" / "links knie" → select "L_patella" or "L_femur" (based on context)
- If bilateral or both sides mentioned → create TWO separate body part entries (one with L_ prefix, one with R_ prefix)
- For midline structures (heart, liver, stomach, brain, spine) → use the single enum value without L_/R_ prefix

DO NOT use generic names like "humerus", "femur", "patella", "tibia" when laterality is specified in the text.
ALWAYS use the L_/R_ prefixed enum value that matches the laterality in the medical document.

Laterality Detection Keywords:
- Left: "left", "levý", "levá", "levé", "links", "sinister", "l.", "lt"
- Right: "right", "pravý", "pravá", "pravé", "rechts", "dexter", "r.", "rt"
- Bilateral: "bilateral", "oboustranný", "oboustranná", "beidseitig", "both sides", "na obou stranách"

Examples:
✅ CORRECT:
  Medical text: "Fraktura levého humeru v oblasti diafýzy"
  Extract: { "identification": "L_humerus", "part": "shaft", "status": "fracture in shaft area" }

  Medical text: "Oboustranná gonartróza"
  Extract: [
    { "identification": "L_patella", "status": "gonarthrosis" },
    { "identification": "R_patella", "status": "gonarthrosis" }
  ]

  Medical text: "Poranění jater"
  Extract: { "identification": "liver_right", "status": "injured" }

❌ WRONG:
  Medical text: "Fraktura levého humeru"
  Extract: { "identification": "humerus", ... } ← WRONG - missing L_ prefix

  Medical text: "Bilateral knee swelling"
  Extract: { "identification": "patella", "laterality": "bilateral" } ← WRONG - create two entries instead

If laterality is unclear from the text, examine the full medical context. If still ambiguous, create entries for both sides and note "laterality uncertain" in the status field.`,
  parameters: {
    type: "object",
    properties: {
      bodyParts: coreBodyParts,

      // Processing metadata
      processingConfidence: {
        type: "number",
        description: "Overall confidence in body parts extraction (0.0 to 1.0)",
      },

      processingNotes: {
        type: "string",
        description:
          "Any notes about the body parts extraction process or anatomical ambiguities",
      },
    },
    required: ["bodyParts", "processingConfidence"],
  },
} as FunctionDefinition;
