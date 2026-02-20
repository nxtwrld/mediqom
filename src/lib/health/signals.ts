import { type Signal } from "$lib/types.d";
import { getDocument, updateDocument } from "$lib/documents";
import { type Document } from "$lib/documents/types.d";
import { profiles, updateProfile } from "$lib/profiles";
import { type Profile } from "$lib/types.d";
import { SignalDataMigration } from "$lib/signals/migration";
import {
  type MetaHistoryEntry,
  MetaHistoryEntryType,
} from "./meta-history-types";

/**
 * Enhanced getHealthDocument with automatic signal migration
 */
export async function getHealthDocument(profileId: string): Promise<Document> {
  const profile = (await profiles.get(profileId)) as Profile;
  if (!profile.healthDocumentId) {
    throw new Error(`Profile ${profileId} has no health document ID`);
  }
  let document = (await getDocument(profile.healthDocumentId)) as Document;

  // Check and perform signal migration if needed
  document = await SignalDataMigration.checkAndMigrate(document);

  return document;
}

/**
 * Process health data from imported documents, supporting both legacy Signal[] format
 * and new extracted document data with META_HISTORIES flat architecture
 *
 * @param data - Either Signal[] (legacy) or extracted document data (new format)
 * @param user_id - Patient/profile ID
 * @param refId - Reference document ID
 */
export async function processHealthData(
  data: Signal[] | any, // Support both legacy and new formats
  user_id: string,
  refId: string = "input",
) {
  // 1. get users health profile document with migration
  let document = await getHealthDocument(user_id);
  let contentSignals = document.content.signals || {};

  // Check if this is legacy Signal[] format or new extracted data
  if (Array.isArray(data) && data.length > 0 && "signal" in data[0]) {
    // Legacy Signal[] format - maintain backward compatibility
    const signals = data as Signal[];
    signals.forEach((signal) => {
      signal.refId = signal.refId || refId;
      if (!contentSignals[signal.signal]) {
        contentSignals[signal.signal] = {
          log: "full",
          history: [],
          values: [],
        };
      }
      contentSignals[signal.signal].values = [
        ...contentSignals[signal.signal].values,
        {
          ...signal,
        },
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  } else {
    // New extracted document format - convert to META_HISTORIES entries
    const extractedData = data;
    const metaEntries = convertExtractedDataToMetaEntries(
      extractedData,
      user_id,
      refId,
    );

    // Insert META_HISTORIES entries
    await insertMetaHistoryEntries(metaEntries);

    // Sync current medications and allergies with profile storage (separate from META_HISTORIES)
    await syncCurrentMedicationsAndAllergies(extractedData, user_id);

    // Also maintain legacy signals for backward compatibility
    if (extractedData.signals) {
      // Handle both legacy array format and new wrapped format
      let legacySignals: Signal[] = [];

      if (Array.isArray(extractedData.signals)) {
        legacySignals = extractedData.signals;
      } else if (
        extractedData.signals.signals &&
        Array.isArray(extractedData.signals.signals)
      ) {
        legacySignals = extractedData.signals.signals;
      } else {
        console.warn(
          "Signals data is not in expected array format:",
          extractedData.signals,
        );
      }

      legacySignals.forEach((signal) => {
        signal.refId = signal.refId || refId;
        if (!contentSignals[signal.signal]) {
          contentSignals[signal.signal] = {
            log: "full",
            history: [],
            values: [],
          };
        }
        contentSignals[signal.signal].values = [
          ...contentSignals[signal.signal].values,
          {
            ...signal,
          },
        ].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      });
    }
  }

  console.log("contentSignals", contentSignals);
  document.content.signals = contentSignals;
  console.log("document", document);

  // 3. update document
  await updateDocument(document);

  // 4. update profile
  const profile = (await profiles.get(user_id)) as Profile;
  profile.health.signals = contentSignals;
  updateProfile(profile);
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use processHealthData instead
 */
export const updateSignals = processHealthData;

/**
 * Convert extracted document data to META_HISTORIES flat entries
 */
function convertExtractedDataToMetaEntries(
  extractedData: any,
  patientId: string,
  sourceDocumentId: string,
): MetaHistoryEntry[] {
  const entries: MetaHistoryEntry[] = [];
  const timestamp = new Date().toISOString();

  // Convert medications - handle new schema structure with separate arrays
  if (extractedData.medications) {
    const medications = extractedData.medications;

    // Process newPrescriptions (new Rx from this document)
    if (
      medications.newPrescriptions &&
      Array.isArray(medications.newPrescriptions)
    ) {
      for (const med of medications.newPrescriptions) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.MEDICATION_CURRENT,
          timestamp: med.prescriptionDate || med.date || timestamp,
          data: med,
          tags: generateMedicationTags(med),
          category: "medication",
          subcategory: "prescription",
          clinicalSignificance: determineClinicalSignificance(med),
          confidence: med.confidence || 0.8,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${med.medicationName || med.genericName || ""} ${med.dosage || ""} ${med.instructions?.frequency || ""}`.trim(),
        });

        // Handle adverse reactions
        if (med.adverseReactions || med.sideEffects) {
          entries.push({
            entryId: crypto.randomUUID(),
            patientId,
            entryType: MetaHistoryEntryType.ADVERSE_REACTION,
            timestamp: med.prescriptionDate || timestamp,
            data: {
              medication: med.medicationName || med.genericName,
              reaction: med.adverseReactions || med.sideEffects,
              severity: med.reactionSeverity || "mild",
            },
            tags: ["adverse_reaction", "medication", "safety"],
            category: "safety",
            subcategory: "adverse_reaction",
            clinicalSignificance:
              med.reactionSeverity === "severe" ? "critical" : "medium",
            confidence: med.confidence || 0.7,
            relatedEntries: [entries[entries.length - 1].entryId],
            sourceDocumentIds: [sourceDocumentId],
            searchableText:
              `${med.medicationName} adverse reaction ${med.adverseReactions || med.sideEffects}`.trim(),
          });
        }
      }
    }

    // Process currentMedications (patient's ongoing meds mentioned in document)
    if (
      medications.currentMedications &&
      Array.isArray(medications.currentMedications)
    ) {
      for (const med of medications.currentMedications) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.MEDICATION_CURRENT,
          timestamp: med.startDate || med.date || timestamp,
          data: med,
          tags: generateMedicationTags(med),
          category: "medication",
          subcategory: "current_medication",
          clinicalSignificance: determineClinicalSignificance(med),
          confidence: med.confidence || 0.8,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${med.medicationName || med.genericName || ""} ${med.dosage || ""} ${med.frequency?.schedule || ""}`.trim(),
        });
      }
    }

    // Process discontinuedMedications
    if (
      medications.discontinuedMedications &&
      Array.isArray(medications.discontinuedMedications)
    ) {
      for (const med of medications.discontinuedMedications) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.MEDICATION_HISTORICAL,
          timestamp: med.discontinuedDate || med.date || timestamp,
          data: med,
          tags: [...generateMedicationTags(med), "discontinued"],
          category: "medication",
          subcategory: "discontinued",
          clinicalSignificance: "low",
          confidence: med.confidence || 0.7,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${med.medicationName || med.genericName || ""} discontinued ${med.discontinuedReason || ""}`.trim(),
        });
      }
    }

    // Process medicationChanges
    if (
      medications.medicationChanges &&
      Array.isArray(medications.medicationChanges)
    ) {
      for (const change of medications.medicationChanges) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.MEDICATION_CURRENT,
          timestamp: change.changeDate || timestamp,
          data: change,
          tags: [...generateMedicationTags(change), "change"],
          category: "medication",
          subcategory: "medication_change",
          clinicalSignificance: "medium",
          confidence: change.confidence || 0.7,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${change.medicationName} change ${change.changeType} ${change.changeReason || ""}`.trim(),
        });
      }
    }
  }

  // Convert lab results (now treated as measurements)
  if (extractedData.labResults) {
    for (const lab of extractedData.labResults) {
      entries.push({
        entryId: crypto.randomUUID(),
        patientId,
        entryType: MetaHistoryEntryType.MEASUREMENT_LAB,
        timestamp: lab.date || timestamp,
        data: lab,
        tags: generateLabTags(lab),
        category: "measurement",
        subcategory: "laboratory",
        clinicalSignificance: determineClinicalSignificance(lab),
        confidence: lab.confidence || 0.9,
        sourceDocumentIds: [sourceDocumentId],
        searchableText:
          `${lab.test} ${lab.value} ${lab.unit || ""} ${lab.referenceRange || ""}`.trim(),
      });
    }
  }

  // Convert vital signs (unified as measurements)
  if (extractedData.vitalSigns) {
    for (const vital of extractedData.vitalSigns) {
      entries.push({
        entryId: crypto.randomUUID(),
        patientId,
        entryType: MetaHistoryEntryType.MEASUREMENT_VITAL,
        timestamp: vital.date || timestamp,
        data: vital,
        tags: generateVitalTags(vital),
        category: "measurement",
        subcategory: "vital_signs",
        clinicalSignificance: determineClinicalSignificance(vital),
        confidence: vital.confidence || 0.9,
        sourceDocumentIds: [sourceDocumentId],
        searchableText:
          `${vital.type} ${vital.value} ${vital.unit || ""}`.trim(),
      });
    }
  }

  // Convert diagnosis - handle both singular and plural field names
  const diagnosisData = extractedData.diagnosis || extractedData.diagnoses;
  if (diagnosisData) {
    // Ensure it's an array
    const diagnosisArray = Array.isArray(diagnosisData)
      ? diagnosisData
      : [diagnosisData];

    for (const diagnosis of diagnosisArray) {
      entries.push({
        entryId: crypto.randomUUID(),
        patientId,
        entryType: MetaHistoryEntryType.DIAGNOSIS,
        timestamp: diagnosis.date || timestamp,
        data: diagnosis,
        tags: generateDiagnosisTags(diagnosis),
        category: "clinical",
        subcategory: "diagnosis",
        clinicalSignificance: determineClinicalSignificance(diagnosis),
        confidence: diagnosis.confidence || 0.8,
        sourceDocumentIds: [sourceDocumentId],
        searchableText:
          `${diagnosis.condition || diagnosis.description || ""} ${diagnosis.code || diagnosis.icd10 || ""} ${diagnosis.notes || ""}`.trim(),
      });
    }
  }

  // Convert allergies - handle structured schema format
  if (extractedData.allergies) {
    // Handle both legacy array format and new structured object format
    const allergiesData = extractedData.allergies;
    const allergiesArray = Array.isArray(allergiesData)
      ? allergiesData
      : allergiesData.allergies || [];

    for (const allergy of allergiesArray) {
      // Use onsetDate or lastReactionDate as timestamp
      const allergyTimestamp =
        allergy.onsetDate ||
        allergy.lastReactionDate ||
        allergy.date ||
        timestamp;

      entries.push({
        entryId: crypto.randomUUID(),
        patientId,
        entryType: MetaHistoryEntryType.ALLERGY,
        timestamp: allergyTimestamp,
        data: allergy,
        tags: generateAllergyTags(allergy),
        category: "safety",
        subcategory: "allergy",
        clinicalSignificance:
          allergy.severity === "severe" ||
          allergy.severity === "life_threatening"
            ? "critical"
            : "high",
        confidence: allergy.confidence || 0.9,
        sourceDocumentIds: [sourceDocumentId],
        searchableText:
          `${allergy.allergen} ${allergy.reactionType || allergy.reaction || ""} ${allergy.severity || ""}`.trim(),
      });
    }

    // Also process drug intolerances if present in structured format
    if (
      !Array.isArray(allergiesData) &&
      allergiesData.drugIntolerances &&
      Array.isArray(allergiesData.drugIntolerances)
    ) {
      for (const intolerance of allergiesData.drugIntolerances) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.ALLERGY,
          timestamp: timestamp,
          data: { ...intolerance, type: "intolerance" },
          tags: ["drug_intolerance", "medication", "safety"],
          category: "safety",
          subcategory: "intolerance",
          clinicalSignificance: "medium",
          confidence: 0.8,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${intolerance.medication} intolerance ${intolerance.reaction}`.trim(),
        });
      }
    }

    // Process environmental sensitivities if present
    if (
      !Array.isArray(allergiesData) &&
      allergiesData.environmentalSensitivities &&
      Array.isArray(allergiesData.environmentalSensitivities)
    ) {
      for (const sensitivity of allergiesData.environmentalSensitivities) {
        entries.push({
          entryId: crypto.randomUUID(),
          patientId,
          entryType: MetaHistoryEntryType.ALLERGY,
          timestamp: timestamp,
          data: { ...sensitivity, type: "environmental" },
          tags: ["environmental_sensitivity", "allergy", "safety"],
          category: "safety",
          subcategory: "environmental_allergy",
          clinicalSignificance:
            sensitivity.severity === "severe" ? "high" : "medium",
          confidence: 0.7,
          sourceDocumentIds: [sourceDocumentId],
          searchableText:
            `${sensitivity.trigger} ${sensitivity.reaction} ${sensitivity.seasonal ? "seasonal" : ""}`.trim(),
        });
      }
    }
  }

  // Convert procedures - handle structured schema format
  if (extractedData.procedures) {
    // Handle both legacy array format and new structured object format
    const proceduresData = extractedData.procedures;
    const proceduresArray = Array.isArray(proceduresData)
      ? proceduresData
      : proceduresData.procedures || [];

    for (const procedure of proceduresArray) {
      entries.push({
        entryId: crypto.randomUUID(),
        patientId,
        entryType: MetaHistoryEntryType.PROCEDURE,
        timestamp: procedure.date || procedure.startTime || timestamp,
        data: procedure,
        tags: generateProcedureTags(procedure),
        category: "clinical",
        subcategory: "procedure",
        clinicalSignificance: determineClinicalSignificance(procedure),
        confidence: procedure.confidence || 0.8,
        sourceDocumentIds: [sourceDocumentId],
        searchableText:
          `${procedure.name} ${procedure.cptCode || procedure.cpt || ""} ${procedure.findings || procedure.description || ""}`.trim(),
      });
    }

    // Also process surgical team if present in structured format
    if (
      !Array.isArray(proceduresData) &&
      proceduresData.surgicalTeam &&
      Array.isArray(proceduresData.surgicalTeam)
    ) {
      // Store surgical team information with the procedures
      // This could be used for provider tracking
    }
  }

  return entries;
}

// Helper functions for tag generation
function generateMedicationTags(med: any): string[] {
  const tags = ["medication"];
  if (med.type) tags.push(med.type);
  if (med.category) tags.push(med.category);
  if (med.status) tags.push(med.status);
  return tags;
}

function generateLabTags(lab: any): string[] {
  const tags = ["laboratory", "measurement"];
  if (lab.category) tags.push(lab.category);
  if (lab.abnormal) tags.push("abnormal");
  return tags;
}

function generateVitalTags(vital: any): string[] {
  const tags = ["vital_signs", "measurement"];
  if (vital.type) tags.push(vital.type.toLowerCase().replace(/\s+/g, "_"));
  return tags;
}

function generateDiagnosisTags(diagnosis: any): string[] {
  const tags = ["diagnosis", "clinical"];
  if (diagnosis.type) tags.push(diagnosis.type);
  if (diagnosis.status) tags.push(diagnosis.status);
  return tags;
}

function generateAllergyTags(allergy: any): string[] {
  const tags = ["allergy", "safety"];
  if (allergy.type) tags.push(allergy.type);
  if (allergy.severity) tags.push(allergy.severity);
  return tags;
}

function generateProcedureTags(procedure: any): string[] {
  const tags = ["procedure", "clinical"];
  if (procedure.type) tags.push(procedure.type);
  if (procedure.category) tags.push(procedure.category);
  return tags;
}

// Helper function for clinical significance determination
function determineClinicalSignificance(
  item: any,
): "critical" | "high" | "medium" | "low" {
  // Basic logic - can be enhanced with medical knowledge
  if (item.severity === "severe" || item.critical) return "critical";
  if (item.severity === "moderate" || item.abnormal) return "high";
  if (item.severity === "mild") return "medium";
  return "low";
}

/**
 * Sync current medications and allergies with profile storage
 * This keeps medications/allergies easily accessible while events go to META_HISTORIES
 */
async function syncCurrentMedicationsAndAllergies(
  extractedData: any,
  userId: string,
): Promise<void> {
  const profile = (await profiles.get(userId)) as Profile;

  // Update current medications in profile
  if (extractedData.medications) {
    const medications = extractedData.medications;
    const currentMedications: any[] = [];

    // Combine newPrescriptions and currentMedications
    if (
      medications.newPrescriptions &&
      Array.isArray(medications.newPrescriptions)
    ) {
      currentMedications.push(
        ...medications.newPrescriptions.map((med: any) => ({
          name: med.medicationName || med.genericName,
          dosage: med.dosage || med.strength,
          frequency: med.instructions?.frequency || med.frequency?.schedule,
          prescriber: med.prescriber?.name,
          startDate: med.prescriptionDate || med.date,
          indication: med.indication,
        })),
      );
    }

    if (
      medications.currentMedications &&
      Array.isArray(medications.currentMedications)
    ) {
      currentMedications.push(
        ...medications.currentMedications.map((med: any) => ({
          name: med.medicationName || med.genericName,
          dosage: med.dosage || med.strength,
          frequency: med.frequency?.schedule,
          prescriber: med.prescriber?.name,
          startDate: med.startDate || med.date,
          indication: med.indication,
        })),
      );
    }

    // Merge with existing medications, avoiding duplicates
    const existingMeds = profile.health?.medications || [];
    const mergedMeds = [...existingMeds];

    currentMedications.forEach((newMed: any) => {
      const exists = existingMeds.some(
        (existing: any) =>
          existing.name?.toLowerCase() === newMed.name?.toLowerCase(),
      );
      if (!exists) {
        mergedMeds.push(newMed);
      }
    });

    if (!profile.health) profile.health = {};
    profile.health.medications = mergedMeds;
  }

  // Update current allergies in profile
  if (extractedData.allergies) {
    const allergiesData = extractedData.allergies;
    const currentAllergies: any[] = [];

    // Handle both legacy array format and new structured object format
    const allergiesArray = Array.isArray(allergiesData)
      ? allergiesData
      : allergiesData.allergies || [];

    // Map allergies to profile format
    allergiesArray.forEach((allergy: any) => {
      // Only include active allergies in profile
      if (
        !allergy.status ||
        allergy.status === "active" ||
        allergy.clinicalStatus === "active"
      ) {
        currentAllergies.push({
          allergen: allergy.allergen,
          reaction:
            allergy.reactionType ||
            allergy.reaction ||
            (allergy.reactions &&
            Array.isArray(allergy.reactions) &&
            allergy.reactions.length > 0
              ? allergy.reactions.map((r: any) => r.symptom).join(", ")
              : ""),
          severity: allergy.severity,
          confirmedDate:
            allergy.onsetDate || allergy.lastReactionDate || allergy.date,
        });
      }
    });

    // Merge with existing allergies, avoiding duplicates
    const existingAllergies = profile.health?.allergies || [];
    const mergedAllergies = [...existingAllergies];

    currentAllergies.forEach((newAllergy: any) => {
      const exists = existingAllergies.some(
        (existing: any) =>
          existing.allergen?.toLowerCase() ===
          newAllergy.allergen?.toLowerCase(),
      );
      if (!exists) {
        mergedAllergies.push(newAllergy);
      }
    });

    profile.health.allergies = mergedAllergies;
  }

  // Update profile
  await updateProfile(profile);
}

// Use the hybrid storage system with encrypted documents
async function insertMetaHistoryEntries(
  entries: MetaHistoryEntry[],
): Promise<void> {
  const { insertMetaHistoryEntries: storeEntries } = await import(
    "./meta-history-storage"
  );
  await storeEntries(entries);
}

/**
 * Enhanced dashboard data access that combines legacy signals with META_HISTORIES insights
 * This provides ProfileDashboard with unified access to both systems
 */
export async function getDashboardData(profileId: string) {
  const profile = (await profiles.get(profileId)) as Profile;
  const healthDoc = await getHealthDocument(profileId);

  return {
    // Direct access to current medications/allergies (not from META_HISTORIES)
    currentMedications: profile.health?.medications || [],
    activeAllergies: profile.health?.allergies || [],

    // Legacy signals (maintain existing functionality)
    signals: healthDoc.content.signals || {},

    // META_HISTORIES insights (placeholder for future implementation)
    recentMedicationEvents: (await getRecentMedicationEvents(profileId)) || [],
    clinicalTrends: (await getClinicalTrends(profileId)) || [],
    significantChanges: (await getSignificantChanges(profileId)) || [],
  };
}

// META_HISTORIES querying functions using encrypted document storage
async function getRecentMedicationEvents(profileId: string): Promise<any[]> {
  const { queryMetaHistory } = await import("./meta-history-storage");

  const medicationEvents = await queryMetaHistory({
    patientId: profileId,
    entryTypes: [
      MetaHistoryEntryType.MEDICATION_CURRENT,
      MetaHistoryEntryType.MEDICATION_HISTORICAL,
      MetaHistoryEntryType.ADVERSE_REACTION,
      MetaHistoryEntryType.MEDICATION_EFFECTIVENESS,
    ],
    limit: 20,
    orderBy: "timestamp",
    orderDirection: "desc",
  });

  return medicationEvents;
}

async function getClinicalTrends(profileId: string): Promise<any[]> {
  const { queryMetaHistory } = await import("./meta-history-storage");

  const trends = await queryMetaHistory({
    patientId: profileId,
    entryTypes: [
      MetaHistoryEntryType.MEASUREMENT_VITAL,
      MetaHistoryEntryType.MEASUREMENT_LAB,
    ],
    timeRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
      end: new Date().toISOString(),
    },
    orderBy: "timestamp",
    orderDirection: "desc",
  });

  return trends;
}

async function getSignificantChanges(profileId: string): Promise<any[]> {
  const { queryMetaHistory } = await import("./meta-history-storage");

  const significantChanges = await queryMetaHistory({
    patientId: profileId,
    clinicalSignificance: ["critical", "high"],
    limit: 10,
    orderBy: "timestamp",
    orderDirection: "desc",
  });

  return significantChanges;
}
