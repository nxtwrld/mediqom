/**
 * Get Profile Data Tool
 *
 * Retrieves patient profile information including demographics, health data, and insurance
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import type { ProfileSummary } from "../base/types";
import { logger } from "$lib/logging/logger";
import { profiles } from "$lib/profiles";
import { get } from "svelte/store";
import type { Profile } from "$lib/types.d";

export class GetProfileDataTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "getProfileData",
      description:
        "Get patient profile information including demographics, health conditions, medications, allergies, and insurance details.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    };
  }

  async execute(params: any, profileId: string): Promise<MCPToolResult> {
    try {
      const profilesStore = get(profiles);
      const profile = profilesStore.find((p) => p.id === profileId) as Profile;

      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Profile not found",
            },
          ],
          isError: true,
        };
      }

      // Build profile summary
      const profileSummary: ProfileSummary = {
        demographics: {
          age: profile.birthDate
            ? this.calculateAge(profile.birthDate)
            : undefined,
          sex: profile.vcard?.gender,
          birthDate: profile.birthDate,
          language: profile.language,
        },
        conditions:
          profile.health?.chronicConditions?.map((condition: any) => ({
            name: condition,
            status: "active",
          })) || [],
        medications:
          profile.health?.currentMedications?.map((med: any) => ({
            name: med,
            status: "active" as const,
          })) || [],
        allergies:
          profile.health?.allergies?.map((allergy: any) => ({
            substance: allergy,
          })) || [],
        recentDocuments: 0, // This would be calculated from document store
        lastVisit: undefined, // This would be extracted from documents
      };

      // Sanitize profile data for AI consumption
      const profileData = {
        id: profile.id,
        fullName: profile.fullName,
        language: profile.language,
        birthDate: profile.birthDate,
        vcard: profile.vcard
          ? {
              firstName: profile.vcard.firstName,
              lastName: profile.vcard.lastName,
              gender: profile.vcard.gender,
              phone: profile.vcard.phone,
              email: profile.vcard.email,
            }
          : null,
        health: profile.health
          ? {
              bloodType: profile.health.bloodType,
              height: profile.health.height,
              weight: profile.health.weight,
              allergies: profile.health.allergies,
              chronicConditions: profile.health.chronicConditions,
              currentMedications: profile.health.currentMedications,
            }
          : null,
        insurance: profile.insurance
          ? {
              provider: profile.insurance.provider,
              planType: profile.insurance.planType,
            }
          : null,
      };

      // Build readable text summary
      let profileText = `**Patient Profile: ${profile.fullName}**\n\n`;

      if (profile.birthDate) {
        profileText += `Birth Date: ${profile.birthDate}`;
        if (profileSummary.demographics.age) {
          profileText += ` (Age: ${profileSummary.demographics.age})`;
        }
        profileText += "\n";
      }

      if (profile.vcard?.gender) {
        profileText += `Gender: ${profile.vcard.gender}\n`;
      }

      if (profile.health?.bloodType) {
        profileText += `Blood Type: ${profile.health.bloodType}\n`;
      }

      if (profile.health?.height) {
        profileText += `Height: ${profile.health.height} cm\n`;
      }

      if (profile.health?.weight) {
        profileText += `Weight: ${profile.health.weight} kg\n`;
      }

      if (profile.health?.allergies?.length) {
        profileText += `\n**Allergies:** ${profile.health.allergies.join(", ")}\n`;
      }

      if (profile.health?.chronicConditions?.length) {
        profileText += `\n**Chronic Conditions:** ${profile.health.chronicConditions.join(", ")}\n`;
      }

      if (profile.health?.currentMedications?.length) {
        profileText += `\n**Current Medications:** ${profile.health.currentMedications.join(", ")}\n`;
      }

      if (profile.insurance?.provider) {
        profileText += `\n**Insurance:** ${profile.insurance.provider}`;
        if (profile.insurance.planType) {
          profileText += ` (${profile.insurance.planType})`;
        }
        profileText += "\n";
      }

      return {
        content: [
          {
            type: "text",
            text: profileText,
          },
          {
            type: "resource",
            resource: profileData,
          },
        ],
      };
    } catch (error) {
      logger.namespace("Context")?.error("Failed to get profile data", {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Profile data access failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Calculate age from birth date
   */
  private calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }

    return age;
  }
}
