import type { BodyPartReference, AnatomySuggestion } from "./types.d";
import anatomyObjects from "$components/anatomy/objects.json";
import { chatActions } from "./store";
import ui from "$lib/ui";
import focused from "$lib/focused";
import {
  ANATOMY_REGIONS,
  isKnownAnatomyId,
  regionMeshes,
} from "$data/anatomy-regions";

// Natural-language synonym → anatomy registry id(s) (region ids or mesh names).
// Single source of anatomy names: the values are resolved through the region
// registry below, so this stays aligned with extraction and Care Plan painting
// (build row 7s). Each value is a region id or a mesh name; lateral regions are
// listed per side.
const NL_TO_REGION: Record<string, string[]> = {
  // Joints / skeletal regions
  knee: ["L_knee", "R_knee"],
  back: ["back", "spine"],
  spine: ["spine"],
  shoulder: ["L_shoulder", "R_shoulder"],
  hip: ["L_hip", "R_hip"],
  ankle: ["L_ankle", "R_ankle"],
  wrist: ["L_wrist", "R_wrist"],
  elbow: ["L_elbow", "R_elbow"],

  // Organs / systems
  heart: ["heart", "vascular_system"],
  lungs: ["lungs", "bronchi"],
  liver: ["liver_left", "liver_right", "liver_ligament"],
  kidney: ["kidneys", "ureter"],
  brain: ["brain"],
  stomach: ["stomach"],
  bladder: ["bladder", "urethra"],

  // Soft-tissue regions
  chest: ["thorax"],
  arm: ["L_arm", "R_arm"],
  leg: ["L_leg", "R_leg", "L_thigh", "R_thigh"],
  abdominal: ["abdomen"],

  // Limb extremities
  foot: ["L_foot", "R_foot"],
  hand: ["L_hand", "R_hand"],
  head: ["skull", "brain"],
  neck: ["neck"],
  pelvis: ["pelvis"],
};

/**
 * Expand each NL synonym to concrete, registry-valid mesh ids. A region id
 * expands to its meshes; a mesh id resolves to itself. Unknown ids are dropped
 * (and would be caught by the registry integrity test, not silently shipped).
 */
const bodyPartMappings: Record<string, string[]> = Object.fromEntries(
  Object.entries(NL_TO_REGION).map(([name, ids]) => {
    const meshes = new Set<string>();
    for (const id of ids) {
      if (id in ANATOMY_REGIONS) {
        for (const m of regionMeshes(id)) meshes.add(m);
      } else if (isKnownAnatomyId(id)) {
        meshes.add(id);
      }
    }
    return [name, [...meshes]];
  }),
);

export class AnatomyIntegration {
  /**
   * Detect body part references in text
   */
  static detectBodyParts(text: string): BodyPartReference[] {
    const lowercaseText = text.toLowerCase();
    const references: BodyPartReference[] = [];

    for (const [commonName, anatomyIds] of Object.entries(bodyPartMappings)) {
      // Check for exact word matches
      const regex = new RegExp(`\\b${commonName}\\b`, "gi");
      const matches = lowercaseText.match(regex);

      if (matches) {
        // Get the first matching anatomy ID for primary reference
        const primaryId = anatomyIds[0];

        references.push({
          text: commonName,
          bodyPartId: primaryId,
          confidence: this.calculateConfidence(commonName, text),
        });
      }
    }

    // Also check for direct anatomy object names
    Object.entries(anatomyObjects).forEach(([system, config]) => {
      config.objects.forEach((objectName) => {
        if (lowercaseText.includes(objectName.toLowerCase())) {
          references.push({
            text: objectName,
            bodyPartId: objectName,
            confidence: 0.9,
          });
        }
      });
    });

    // Remove duplicates and sort by confidence
    const uniqueReferences = references.filter(
      (ref, index, self) =>
        index === self.findIndex((r) => r.bodyPartId === ref.bodyPartId),
    );

    return uniqueReferences.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate confidence score for body part detection
   */
  private static calculateConfidence(term: string, fullText: string): number {
    const baseConfidence = 0.7;
    const medicalTerms = [
      "pain",
      "ache",
      "surgery",
      "injury",
      "condition",
      "problem",
    ];
    const contextBonus = medicalTerms.some((term) =>
      fullText.toLowerCase().includes(term),
    )
      ? 0.2
      : 0;

    return Math.min(baseConfidence + contextBonus, 1.0);
  }

  /**
   * Generate anatomy visualization suggestions
   */
  static suggestAnatomyView(
    bodyParts: BodyPartReference[],
  ): AnatomySuggestion | null {
    if (bodyParts.length === 0) return null;

    const primaryPart = bodyParts[0];
    const system = this.getAnatomySystem(primaryPart.bodyPartId);

    return {
      bodyParts,
      suggestion: `I can show you the ${primaryPart.text} on our 3D anatomy model to help you understand better.`,
      actionText: `Show ${primaryPart.text} on 3D model`,
    };
  }

  /**
   * Get anatomy system for a body part
   */
  private static getAnatomySystem(bodyPartId: string): string {
    for (const [system, config] of Object.entries(anatomyObjects)) {
      if (config.objects.includes(bodyPartId)) {
        return system;
      }
    }
    return "unknown";
  }

  /**
   * Open and focus anatomy model on specific body part
   */
  static async openAndFocus(bodyPartId: string): Promise<void> {
    try {
      // Set focused body part
      focused.set({ object: bodyPartId });

      // Update chat state
      chatActions.setFocusedBodyPart(bodyPartId);
      chatActions.toggleAnatomyModel();

      // Emit viewer event to open anatomy model
      ui.emit("viewer", { object: bodyPartId });

      console.log(`Anatomy model focused on: ${bodyPartId}`);
    } catch (error) {
      console.error("Failed to focus anatomy model:", error);
    }
  }

  /**
   * Sync chat with anatomy model state
   */
  static syncWithChat(anatomyState: any): void {
    if (anatomyState.focused) {
      chatActions.setFocusedBodyPart(anatomyState.focused);
    }
  }

  /**
   * Get related body parts for comprehensive visualization
   */
  static getRelatedBodyParts(bodyPartId: string): string[] {
    // Find which mapping contains this body part
    for (const [commonName, anatomyIds] of Object.entries(bodyPartMappings)) {
      if (anatomyIds.includes(bodyPartId)) {
        return anatomyIds.filter((id) => id !== bodyPartId);
      }
    }
    return [];
  }

  /**
   * Check if body part is valid in anatomy model
   */
  static isValidBodyPart(bodyPartId: string): boolean {
    return Object.values(anatomyObjects).some((config) =>
      config.objects.includes(bodyPartId),
    );
  }

  /**
   * Get anatomy context for AI chat
   */
  static getAnatomyContext(bodyParts: string[]): any {
    return {
      focusedBodyParts: bodyParts,
      availableSystems: Object.keys(anatomyObjects),
      relatedParts: bodyParts.flatMap((part) => this.getRelatedBodyParts(part)),
    };
  }
}

export default AnatomyIntegration;
