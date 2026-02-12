/**
 * Imaging Processing Node
 *
 * Specialized processing for medical imaging reports including CT, MRI, X-ray,
 * ultrasound, and other imaging modalities.
 */

import type { DocumentProcessingState } from "../state";
import {
  BaseProcessingNode,
  type BaseProcessingNodeConfig,
  type ProcessingNodeResult,
} from "./_base-processing-node";

export class ImagingProcessingNode extends BaseProcessingNode {
  constructor() {
    const config: BaseProcessingNodeConfig = {
      nodeName: "imaging-processing",
      description: "Medical imaging analysis",
      schemaImportPath: "$lib/configurations/imaging",
      progressStages: [
        {
          stage: "imaging_schema_loading",
          progress: 10,
          message: "Loading imaging analysis schema",
        },
        {
          stage: "imaging_ai_processing",
          progress: 30,
          message: "Analyzing imaging findings with AI",
        },
        {
          stage: "imaging_validation",
          progress: 80,
          message: "Validating imaging data and measurements",
        },
      ],
      featureDetectionTriggers: ["hasImaging", "hasImagingFindings"],
    };
    super(config);
  }

  protected getSectionName(): string {
    return "imaging";
  }

  /**
   * Enhanced validation and processing for imaging data
   */
  protected async validateAndEnhance(
    aiResult: any,
    state: DocumentProcessingState,
  ): Promise<ProcessingNodeResult> {
    const processingTime = Date.now();
    const tokensUsed = state.tokenUsage?.[this.config.nodeName] || 0;

    // Validate imaging-specific fields
    const validatedData = this.validateImagingData(aiResult);

    // Enhance with imaging-specific metadata
    const enhancedData = this.enhanceImagingData(validatedData, state);

    return {
      data: enhancedData,
      metadata: {
        processingTime,
        tokensUsed,
        confidence: this.calculateImagingConfidence(enhancedData),
        provider: "enhanced-openai",
      },
    };
  }

  /**
   * Validate imaging-specific data structure
   */
  private validateImagingData(data: any): any {
    if (!data) return {};

    // Ensure required imaging fields exist
    const validatedData = {
      modality: data.modality || "unknown",
      bodyParts: Array.isArray(data.bodyParts) ? data.bodyParts : [],
      findings: Array.isArray(data.findings) ? data.findings : [],
      impression: data.impression || "",
      technique: data.technique || "",
      contrast: data.contrast || false,
      quality: data.quality || "adequate",
      ...data,
    };

    // Validate and normalize body parts
    if (validatedData.bodyParts.length > 0) {
      validatedData.bodyParts = validatedData.bodyParts.map((part: any) => ({
        name: part.name || part,
        findings: part.findings || [],
        measurements: Array.isArray(part.measurements) ? part.measurements : [],
        ...part,
      }));
    }

    // Validate findings structure
    if (validatedData.findings.length > 0) {
      validatedData.findings = validatedData.findings.map((finding: any) => ({
        description: finding.description || finding,
        location: finding.location || "",
        severity: finding.severity || "mild",
        measurements: Array.isArray(finding.measurements)
          ? finding.measurements
          : [],
        followUp: finding.followUp || false,
        ...finding,
      }));
    }

    return validatedData;
  }

  /**
   * Enhance imaging data with additional metadata and context
   */
  private enhanceImagingData(data: any, state: DocumentProcessingState): any {
    const enhanced = { ...data };

    // Add document context
    enhanced.documentContext = {
      documentType:
        state.featureDetectionResults?.documentType || "imaging_report",
      language: state.language || "English",
      extractedFrom: "AI analysis",
    };

    // Enhance modality detection if not provided
    if (!enhanced.modality || enhanced.modality === "unknown") {
      // Extract text from content array
      const contentText = state.content
        ?.map((c) => (c.type === "text" ? c.text : ""))
        .join(" ") || "";
      enhanced.modality = this.detectModalityFromContent(contentText);
    }

    // Add imaging urgency assessment
    enhanced.urgencyAssessment = this.assessImagingUrgency(enhanced);

    // Extract and standardize measurements
    enhanced.standardizedMeasurements = this.standardizeMeasurements(enhanced);

    // Add clinical significance assessment
    enhanced.clinicalSignificance = this.assessClinicalSignificance(enhanced);

    return enhanced;
  }

  /**
   * Detect imaging modality from document content
   */
  private detectModalityFromContent(content: string): string {
    const text = content.toLowerCase();

    const modalityPatterns = [
      { pattern: /\b(ct|computed tomography|cat scan)\b/i, modality: "CT" },
      { pattern: /\b(mri|magnetic resonance|mr imaging)\b/i, modality: "MRI" },
      { pattern: /\b(x-ray|xray|radiograph|plain film)\b/i, modality: "X-ray" },
      {
        pattern: /\b(ultrasound|sonography|doppler|echo)\b/i,
        modality: "Ultrasound",
      },
      { pattern: /\b(pet|positron emission)\b/i, modality: "PET" },
      {
        pattern: /\b(nuclear medicine|scintigraphy)\b/i,
        modality: "Nuclear Medicine",
      },
      { pattern: /\b(mammography|mammo)\b/i, modality: "Mammography" },
      { pattern: /\b(fluoroscopy|fluoro)\b/i, modality: "Fluoroscopy" },
    ];

    for (const { pattern, modality } of modalityPatterns) {
      if (pattern.test(text)) {
        return modality;
      }
    }

    return "unknown";
  }

  /**
   * Assess urgency of imaging findings
   */
  private assessImagingUrgency(data: any): any {
    let maxUrgency = 1;
    const urgentFindings: string[] = [];

    // Check for urgent imaging findings
    const urgentKeywords = [
      {
        pattern: /\b(hemorrhage|bleeding|hematoma)\b/i,
        urgency: 5,
        description: "Active bleeding detected",
      },
      {
        pattern: /\b(pneumothorax|collapsed lung)\b/i,
        urgency: 5,
        description: "Pneumothorax detected",
      },
      {
        pattern: /\b(aortic dissection|aortic rupture)\b/i,
        urgency: 5,
        description: "Aortic emergency",
      },
      {
        pattern: /\b(stroke|infarct|acute)\b/i,
        urgency: 4,
        description: "Acute finding",
      },
      {
        pattern: /\b(mass|tumor|malignancy)\b/i,
        urgency: 3,
        description: "Mass or tumor detected",
      },
      {
        pattern: /\b(fracture|break|broken)\b/i,
        urgency: 3,
        description: "Fracture detected",
      },
    ];

    const allText =
      `${data.impression} ${JSON.stringify(data.findings)}`.toLowerCase();

    for (const { pattern, urgency, description } of urgentKeywords) {
      if (pattern.test(allText)) {
        if (urgency > maxUrgency) {
          maxUrgency = urgency;
        }
        urgentFindings.push(description);
      }
    }

    return {
      level: maxUrgency,
      findings: urgentFindings,
      requiresFollowUp: maxUrgency > 2,
      timeframe:
        maxUrgency >= 4 ? "immediate" : maxUrgency >= 3 ? "urgent" : "routine",
    };
  }

  /**
   * Standardize measurements from imaging findings
   */
  private standardizeMeasurements(data: any): any[] {
    const measurements: any[] = [];

    // Extract measurements from findings
    if (data.findings) {
      for (const finding of data.findings) {
        if (finding.measurements) {
          for (const measurement of finding.measurements) {
            measurements.push({
              type: "imaging_measurement",
              description: measurement.description || measurement,
              value: measurement.value,
              unit: measurement.unit || "mm",
              location: finding.location || measurement.location,
              finding: finding.description,
              ...measurement,
            });
          }
        }
      }
    }

    // Extract measurements from body parts
    if (data.bodyParts) {
      for (const bodyPart of data.bodyParts) {
        if (bodyPart.measurements) {
          for (const measurement of bodyPart.measurements) {
            measurements.push({
              type: "anatomical_measurement",
              description: measurement.description || measurement,
              value: measurement.value,
              unit: measurement.unit || "mm",
              bodyPart: bodyPart.name,
              ...measurement,
            });
          }
        }
      }
    }

    return measurements;
  }

  /**
   * Assess clinical significance of imaging findings
   */
  private assessClinicalSignificance(data: any): any {
    const significance = {
      level: "low",
      score: 0,
      keyFindings: [] as string[],
      recommendations: [] as string[],
    };

    // Analyze findings for clinical significance
    if (data.findings && data.findings.length > 0) {
      let totalScore = 0;

      for (const finding of data.findings) {
        let findingScore = 1; // Base score

        // Increase score based on severity
        if (finding.severity === "severe" || finding.severity === "critical") {
          findingScore += 3;
        } else if (finding.severity === "moderate") {
          findingScore += 2;
        } else if (finding.severity === "mild") {
          findingScore += 1;
        }

        // Increase score if follow-up is needed
        if (finding.followUp) {
          findingScore += 1;
        }

        totalScore += findingScore;

        if (findingScore >= 3) {
          significance.keyFindings.push(finding.description);
        }
      }

      // Determine overall significance level
      const averageScore = totalScore / data.findings.length;
      if (averageScore >= 4) {
        significance.level = "high";
        significance.recommendations.push(
          "Immediate clinical correlation recommended",
        );
      } else if (averageScore >= 3) {
        significance.level = "moderate";
        significance.recommendations.push("Clinical follow-up recommended");
      } else {
        significance.level = "low";
        significance.recommendations.push(
          "Routine follow-up as clinically indicated",
        );
      }

      significance.score = Math.round(averageScore * 10) / 10;
    }

    return significance;
  }

  /**
   * Calculate confidence specifically for imaging data
   */
  protected calculateImagingConfidence(data: any): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on data completeness
    if (data.modality && data.modality !== "unknown") confidence += 0.1;
    if (data.impression && data.impression.length > 10) confidence += 0.1;
    if (data.findings && data.findings.length > 0) confidence += 0.1;
    if (data.bodyParts && data.bodyParts.length > 0) confidence += 0.1;

    // Increase confidence if we have structured findings
    if (data.findings) {
      const structuredFindings = data.findings.filter(
        (f: any) => f.description && f.location && f.severity,
      );
      if (structuredFindings.length === data.findings.length) {
        confidence += 0.1;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check for required imaging fields
   */
  protected hasRequiredFields(data: any): boolean {
    return !!(
      data.modality &&
      (data.impression || (data.findings && data.findings.length > 0))
    );
  }
}

/**
 * Export the node function for use in the workflow
 */
export const imagingProcessingNode = async (
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> => {
  const node = new ImagingProcessingNode();
  return node.process(state);
};
