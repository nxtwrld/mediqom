/**
 * Data Extraction Utilities
 *
 * Common utilities for extracting and formatting medical data from documents
 */

import type { Document } from "$lib/documents/types.d";
import type { MedicationData, TestResult, TimelineEvent } from "../base/types";

/**
 * Extract medication data from search results
 */
export function extractMedicationData(searchResults: any[]): MedicationData[] {
  const medications: MedicationData[] = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("medication") ||
      contentLower.includes("prescription") ||
      contentLower.includes("drug")
    ) {
      // Basic medication extraction
      // In a real implementation, this would use more sophisticated NLP
      const medicationMatch = content.match(
        /(?:prescribed|taking|medication)\s+([A-Za-z]+)/i,
      );
      if (medicationMatch) {
        medications.push({
          name: medicationMatch[1],
          status: "active",
          prescribedBy: result.metadata?.author,
          startDate: result.metadata?.date,
        });
      }
    }
  }

  return medications;
}

/**
 * Extract test results from search results
 */
export function extractTestResults(searchResults: any[]): TestResult[] {
  const testResults: TestResult[] = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("test") ||
      contentLower.includes("result") ||
      contentLower.includes("lab")
    ) {
      // Basic test result extraction
      testResults.push({
        name: result.metadata?.title || "Test Result",
        date: result.metadata?.date || new Date().toISOString(),
        category: result.metadata?.category || "lab-result",
        value: extractNumericValue(content),
      });
    }
  }

  return testResults;
}

/**
 * Extract timeline events from search results
 */
export function extractTimelineEvents(searchResults: any[]): TimelineEvent[] {
  return searchResults
    .filter((result) => result.metadata?.date)
    .map((result) => ({
      date: result.metadata.date,
      type: result.metadata.documentType || "medical-record",
      title: result.metadata.title || "Medical event",
      description: result.excerpt || result.metadata.summary || "",
      documentId: result.documentId,
      confidence: result.similarity || 0.8,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Extract conditions from search results
 */
export function extractConditionsFromSearchResults(
  searchResults: any[],
): Array<{
  name: string;
  date?: string;
  documentId?: string;
  severity?: string;
}> {
  const conditions: Array<{
    name: string;
    date?: string;
    documentId?: string;
    severity?: string;
  }> = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("diagnosis") ||
      contentLower.includes("condition") ||
      contentLower.includes("disease")
    ) {
      // Extract condition name from content
      const conditionMatch = content.match(
        /(?:diagnosis|diagnosed with|condition)\s*:?\s*([A-Za-z\s]+)/i,
      );
      if (conditionMatch) {
        conditions.push({
          name: conditionMatch[1].trim(),
          date: result.metadata?.date,
          documentId: result.documentId,
          severity: extractSeverity(content),
        });
      }
    }
  }

  return conditions;
}

/**
 * Extract procedures from search results
 */
export function extractProceduresFromSearchResults(
  searchResults: any[],
): Array<{
  name: string;
  date?: string;
  documentId?: string;
  outcome?: string;
}> {
  const procedures: Array<{
    name: string;
    date?: string;
    documentId?: string;
    outcome?: string;
  }> = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("procedure") ||
      contentLower.includes("surgery") ||
      contentLower.includes("operation")
    ) {
      procedures.push({
        name: result.metadata?.title || "Medical procedure",
        date: result.metadata?.date,
        documentId: result.documentId,
        outcome: extractOutcome(content),
      });
    }
  }

  return procedures;
}

/**
 * Extract allergies from search results
 */
export function extractAllergiesFromSearchResults(searchResults: any[]): Array<{
  substance: string;
  reaction?: string;
  severity?: string;
  date?: string;
}> {
  const allergies: Array<{
    substance: string;
    reaction?: string;
    severity?: string;
    date?: string;
  }> = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("allergy") ||
      contentLower.includes("allergic") ||
      contentLower.includes("reaction")
    ) {
      // Extract allergen from content
      const allergenMatch = content.match(
        /(?:allergic to|allergy to)\s+([A-Za-z\s]+)/i,
      );
      if (allergenMatch) {
        allergies.push({
          substance: allergenMatch[1].trim(),
          reaction: extractReaction(content),
          severity: extractSeverity(content),
          date: result.metadata?.date,
        });
      }
    }
  }

  return allergies;
}

/**
 * Extract vital signs from search results
 */
export function extractVitalSigns(searchResults: any[]): Array<{
  type: string;
  value: string | number;
  unit?: string;
  date?: string;
  normal?: boolean;
}> {
  const vitals: Array<{
    type: string;
    value: string | number;
    unit?: string;
    date?: string;
    normal?: boolean;
  }> = [];

  for (const result of searchResults) {
    const content = result.excerpt || result.metadata?.summary || "";
    const contentLower = content.toLowerCase();

    // Extract blood pressure
    const bpMatch = content.match(/blood pressure[:\s]*(\d+\/\d+)/i);
    if (bpMatch) {
      vitals.push({
        type: "blood_pressure",
        value: bpMatch[1],
        unit: "mmHg",
        date: result.metadata?.date,
        normal: this.isBloodPressureNormal(bpMatch[1]),
      });
    }

    // Extract heart rate
    const hrMatch = content.match(/heart rate[:\s]*(\d+)/i);
    if (hrMatch) {
      vitals.push({
        type: "heart_rate",
        value: parseInt(hrMatch[1]),
        unit: "bpm",
        date: result.metadata?.date,
        normal: this.isHeartRateNormal(parseInt(hrMatch[1])),
      });
    }

    // Extract temperature
    const tempMatch = content.match(/temperature[:\s]*(\d+\.?\d*)/i);
    if (tempMatch) {
      vitals.push({
        type: "temperature",
        value: parseFloat(tempMatch[1]),
        unit: "°C",
        date: result.metadata?.date,
        normal: this.isTemperatureNormal(parseFloat(tempMatch[1])),
      });
    }
  }

  return vitals;
}

/**
 * Extract key findings from search results
 */
export function extractKeyFindings(searchResults: any[]): string[] {
  return searchResults.slice(0, 5).map((result) => {
    const title = result.metadata?.title || "Medical finding";
    const excerpt = result.excerpt || "";
    return `${title}: ${excerpt.substring(0, 100)}...`;
  });
}

/**
 * Identify risk factors from search results
 */
export function identifyRiskFactors(searchResults: any[]): string[] {
  const riskKeywords = [
    "smoking",
    "diabetes",
    "hypertension",
    "obesity",
    "family history",
    "high cholesterol",
    "sedentary",
    "alcohol",
    "stress",
  ];

  const riskFactors = new Set<string>();

  for (const result of searchResults) {
    const content = (result.excerpt || "").toLowerCase();
    riskKeywords.forEach((keyword) => {
      if (content.includes(keyword)) {
        riskFactors.add(keyword);
      }
    });
  }

  return Array.from(riskFactors);
}

// Helper functions

function extractNumericValue(content: string): string | undefined {
  const numMatch = content.match(/(\d+\.?\d*)/);
  return numMatch ? numMatch[1] : undefined;
}

function extractSeverity(content: string): string | undefined {
  const severityTerms = ["mild", "moderate", "severe", "critical"];
  const contentLower = content.toLowerCase();

  for (const term of severityTerms) {
    if (contentLower.includes(term)) {
      return term;
    }
  }

  return undefined;
}

function extractReaction(content: string): string | undefined {
  const reactionMatch = content.match(/reaction[:\s]*([^\.]+)/i);
  return reactionMatch ? reactionMatch[1].trim() : undefined;
}

function extractOutcome(content: string): string | undefined {
  const outcomeTerms = ["successful", "completed", "failed", "complications"];
  const contentLower = content.toLowerCase();

  for (const term of outcomeTerms) {
    if (contentLower.includes(term)) {
      return term;
    }
  }

  return undefined;
}

function isBloodPressureNormal(bp: string): boolean {
  const [systolic, diastolic] = bp.split("/").map(Number);
  return (
    systolic >= 90 && systolic <= 140 && diastolic >= 60 && diastolic <= 90
  );
}

function isHeartRateNormal(hr: number): boolean {
  return hr >= 60 && hr <= 100;
}

function isTemperatureNormal(temp: number): boolean {
  return temp >= 36.1 && temp <= 37.2;
}
