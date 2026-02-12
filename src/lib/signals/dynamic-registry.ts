// Dynamic Signal Registry - Enhanced signal discovery and validation
// Extends existing static catalog with dynamic signal recognition

import type { SignalContext, SignalValidation } from "$lib/langgraph/state";
import type { SignalDefinition } from "./migration";
import propertiesDefinition from "$data/lab.properties.defaults.json";

export interface DynamicSignalCandidate {
  name: string;
  confidence: number;
  suggestedUnit: string;
  category: string;
  normalRange?: {
    min?: number;
    max?: number;
    reference: string;
  };
  synonyms: string[];
  reasoning: string[];
}

export interface SignalResolutionResult {
  definition: SignalDefinition;
  isKnown: boolean;
  confidence: number;
  alternatives: DynamicSignalCandidate[];
  warnings: string[];
}

export class DynamicSignalRegistry {
  private static instance: DynamicSignalRegistry;
  private knownSignals: Map<string, SignalDefinition>;
  private contextualMappings: Map<string, Map<string, SignalDefinition>>;
  private signalPatterns: Map<string, RegExp>;

  constructor() {
    this.knownSignals = new Map();
    this.contextualMappings = new Map();
    this.signalPatterns = new Map();
    this.loadStaticCatalog();
    this.initializePatterns();
  }

  static getInstance(): DynamicSignalRegistry {
    if (!this.instance) {
      this.instance = new DynamicSignalRegistry();
    }
    return this.instance;
  }

  /**
   * Resolve signal with dynamic discovery capabilities
   */
  async resolveSignal(
    rawName: string,
    context: SignalContext,
  ): Promise<SignalResolutionResult> {
    const normalizedName = this.normalizeSignalName(rawName);

    // 1. Check existing static catalog first (backwards compatibility)
    const existing = this.knownSignals.get(normalizedName);
    if (existing) {
      return {
        definition: existing,
        isKnown: true,
        confidence: 1.0,
        alternatives: [],
        warnings: [],
      };
    }

    // 2. Check for partial matches and synonyms
    const partialMatch = this.findPartialMatch(normalizedName);
    if (partialMatch) {
      return {
        definition: partialMatch,
        isKnown: true,
        confidence: 0.9,
        alternatives: [],
        warnings: [
          `Matched by synonym or partial name: ${rawName} -> ${partialMatch.name}`,
        ],
      };
    }

    // 3. Dynamic resolution for new signals
    const candidate = await this.createCandidateSignal(rawName, context);

    return {
      definition: this.candidateToDefinition(candidate),
      isKnown: false,
      confidence: candidate.confidence,
      alternatives: await this.findAlternatives(rawName, context),
      warnings: [`New signal detected: ${rawName}. Please validate accuracy.`],
    };
  }

  /**
   * Load existing static catalog as base knowledge
   */
  private loadStaticCatalog(): void {
    console.log("🔄 Loading static signal catalog...");

    for (const [signalName, definition] of Object.entries(
      propertiesDefinition as any,
    )) {
      const def = definition as any;
      const signalDef: SignalDefinition = {
        name: signalName,
        description: def.description || signalName,
        unit: def.unit || "",
        normalRange: {
          min: def.min,
          max: def.max,
          reference: def.reference || "",
        },
        category: def.category || "laboratory",
        synonyms: def.synonyms || [],
      };

      this.knownSignals.set(this.normalizeSignalName(signalName), signalDef);

      // Index synonyms
      if (def.synonyms) {
        def.synonyms.forEach((synonym: string) => {
          this.knownSignals.set(this.normalizeSignalName(synonym), signalDef);
        });
      }
    }

    console.log(`✅ Loaded ${this.knownSignals.size} known signals`);
  }

  /**
   * Initialize pattern recognition for common signal formats
   */
  private initializePatterns(): void {
    this.signalPatterns.set(
      "blood_count",
      /^(wbc|rbc|hgb|hct|plt|hemoglobin|hematocrit)/i,
    );
    this.signalPatterns.set(
      "chemistry",
      /^(glucose|creatinine|bun|sodium|potassium|chloride)/i,
    );
    this.signalPatterns.set("lipids", /^(cholesterol|hdl|ldl|triglycerides)/i);
    this.signalPatterns.set("enzymes", /^(alt|ast|alp|ggt|ck|ldh)/i);
    this.signalPatterns.set("hormones", /^(tsh|t3|t4|insulin|cortisol)/i);
    this.signalPatterns.set("vitamins", /^(vitamin|b12|folate|d3|d2)/i);
    this.signalPatterns.set("markers", /^(psa|cea|ca125|ca199|afp)/i);
  }

  /**
   * Normalize signal name for consistent matching
   */
  private normalizeSignalName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  /**
   * Find partial matches in known signals
   */
  private findPartialMatch(normalizedName: string): SignalDefinition | null {
    // Exact match first
    if (this.knownSignals.has(normalizedName)) {
      return this.knownSignals.get(normalizedName)!;
    }

    // Partial match - find signals that contain the search term
    for (const [key, definition] of this.knownSignals.entries()) {
      if (key.includes(normalizedName) || normalizedName.includes(key)) {
        return definition;
      }
    }

    // Pattern-based matching
    for (const [category, pattern] of this.signalPatterns.entries()) {
      if (pattern.test(normalizedName)) {
        // Find a representative signal from this category
        for (const [key, definition] of this.knownSignals.entries()) {
          if (definition.category === category) {
            return definition;
          }
        }
      }
    }

    return null;
  }

  /**
   * Create candidate signal for unknown signals
   */
  private async createCandidateSignal(
    rawName: string,
    context: SignalContext,
  ): Promise<DynamicSignalCandidate> {
    const normalizedName = this.normalizeSignalName(rawName);
    let confidence = 0.6; // Base confidence for unknown signals
    let suggestedUnit = "";
    let category = "laboratory";
    const reasoning: string[] = [];

    // Infer category from patterns
    for (const [cat, pattern] of this.signalPatterns.entries()) {
      if (pattern.test(normalizedName)) {
        category = cat;
        confidence += 0.2;
        reasoning.push(`Matched pattern for ${cat} category`);
        break;
      }
    }

    // Infer unit from name patterns
    suggestedUnit = this.inferUnit(rawName, context);
    if (suggestedUnit) {
      confidence += 0.1;
      reasoning.push(`Inferred unit: ${suggestedUnit}`);
    }

    // Context-based adjustments
    if (context.documentType === "laboratory") {
      confidence += 0.1;
      reasoning.push("Document type supports lab values");
    }

    if (context.specimen === "blood") {
      confidence += 0.05;
      reasoning.push("Blood specimen context");
    }

    return {
      name: rawName,
      confidence: Math.min(confidence, 0.95), // Cap at 95% for unknowns
      suggestedUnit,
      category,
      synonyms: this.generateSynonyms(rawName),
      reasoning,
    };
  }

  /**
   * Infer likely unit from signal name and context
   */
  private inferUnit(signalName: string, context: SignalContext): string {
    const name = signalName.toLowerCase();

    // Common unit patterns
    if (name.includes("glucose") || name.includes("cholesterol")) {
      return "mg/dL";
    }
    if (name.includes("hemoglobin") || name.includes("hgb")) {
      return "g/dL";
    }
    if (name.includes("hematocrit") || name.includes("hct")) {
      return "%";
    }
    if (
      name.includes("sodium") ||
      name.includes("potassium") ||
      name.includes("chloride")
    ) {
      return "mEq/L";
    }
    if (name.includes("creatinine")) {
      return "mg/dL";
    }
    if (name.includes("bun")) {
      return "mg/dL";
    }
    if (name.includes("wbc") || name.includes("white")) {
      return "K/μL";
    }
    if (name.includes("rbc") || name.includes("red")) {
      return "M/μL";
    }
    if (name.includes("platelet") || name.includes("plt")) {
      return "K/μL";
    }
    if (name.includes("vitamin") && name.includes("d")) {
      return "ng/mL";
    }
    if (name.includes("b12")) {
      return "pg/mL";
    }
    if (name.includes("tsh")) {
      return "μIU/mL";
    }

    // Default based on specimen type
    if (context.specimen === "blood") {
      return "mg/dL"; // Common blood unit
    }
    if (context.specimen === "urine") {
      return "mg/dL"; // Common urine unit
    }

    return ""; // Unknown
  }

  /**
   * Generate potential synonyms for unknown signals
   */
  private generateSynonyms(signalName: string): string[] {
    const synonyms: string[] = [];
    const name = signalName.toLowerCase();

    // Common abbreviation patterns
    if (name.includes("hemoglobin")) {
      synonyms.push("hgb", "hb");
    }
    if (name.includes("hematocrit")) {
      synonyms.push("hct");
    }
    if (name.includes("white blood cell")) {
      synonyms.push("wbc", "leukocyte");
    }
    if (name.includes("red blood cell")) {
      synonyms.push("rbc", "erythrocyte");
    }
    if (name.includes("platelet")) {
      synonyms.push("plt", "thrombocyte");
    }

    return synonyms;
  }

  /**
   * Find alternative interpretations for ambiguous signals
   */
  private async findAlternatives(
    rawName: string,
    context: SignalContext,
  ): Promise<DynamicSignalCandidate[]> {
    const alternatives: DynamicSignalCandidate[] = [];
    const normalizedName = this.normalizeSignalName(rawName);

    // Find similar signals in catalog
    for (const [key, definition] of this.knownSignals.entries()) {
      const similarity = this.calculateSimilarity(normalizedName, key);
      if (similarity > 0.6 && similarity < 1.0) {
        alternatives.push({
          name: definition.name,
          confidence: similarity,
          suggestedUnit: definition.unit,
          category: definition.category,
          normalRange: definition.normalRange,
          synonyms: definition.synonyms,
          reasoning: [
            `Similar to known signal (${(similarity * 100).toFixed(1)}% match)`,
          ],
        });
      }
    }

    // Sort by confidence and limit
    return alternatives.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  /**
   * Calculate string similarity between two signal names
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Convert candidate to full signal definition
   */
  private candidateToDefinition(
    candidate: DynamicSignalCandidate,
  ): SignalDefinition {
    return {
      name: candidate.name,
      description: `Dynamically discovered signal: ${candidate.name}`,
      unit: candidate.suggestedUnit,
      normalRange: candidate.normalRange || {
        reference: "Unknown - requires validation",
      },
      category: candidate.category,
      synonyms: candidate.synonyms,
    };
  }

  /**
   * Validate signal value against known patterns
   */
  validateSignalValue(
    signalName: string,
    value: any,
    unit: string,
    context: SignalContext,
  ): SignalValidation {
    const normalizedName = this.normalizeSignalName(signalName);
    const known = this.knownSignals.get(normalizedName);

    let status: "validated" | "unvalidated" | "suspicious" | "invalid" =
      "unvalidated";
    let confidence = 0.5;
    const warnings: string[] = [];
    const validationSources: string[] = [];

    if (known) {
      validationSources.push("static_catalog");

      // Check if value is within normal range
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue) && known.normalRange) {
        if (
          known.normalRange.min !== undefined &&
          numericValue < known.normalRange.min
        ) {
          status = "suspicious";
          warnings.push(
            `Value ${value} below normal range (min: ${known.normalRange.min})`,
          );
          confidence = 0.3;
        } else if (
          known.normalRange.max !== undefined &&
          numericValue > known.normalRange.max
        ) {
          status = "suspicious";
          warnings.push(
            `Value ${value} above normal range (max: ${known.normalRange.max})`,
          );
          confidence = 0.3;
        } else {
          status = "validated";
          confidence = 0.9;
        }
      } else {
        status = "validated";
        confidence = 0.8;
      }

      // Check unit consistency
      if (known.unit && unit && known.unit !== unit) {
        warnings.push(`Unit mismatch: expected ${known.unit}, got ${unit}`);
        confidence -= 0.2;
      }
    } else {
      // Unknown signal
      status = "unvalidated";
      confidence = 0.4;
      warnings.push("Signal not found in known catalog");
    }

    return {
      status,
      confidence: Math.max(0, Math.min(1, confidence)),
      validationSources,
      warnings,
    };
  }

  /**
   * Get signal statistics for monitoring
   */
  getRegistryStats(): {
    knownSignalsCount: number;
    categoryCounts: Record<string, number>;
    topCategories: string[];
  } {
    const categoryCounts: Record<string, number> = {};

    for (const definition of this.knownSignals.values()) {
      categoryCounts[definition.category] =
        (categoryCounts[definition.category] || 0) + 1;
    }

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category]) => category);

    return {
      knownSignalsCount: this.knownSignals.size,
      categoryCounts,
      topCategories,
    };
  }
}
