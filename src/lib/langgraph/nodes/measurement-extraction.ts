/**
 * Measurement Extraction Node
 *
 * Extracts quantitative measurements from medical images including
 * distances, sizes, angles, areas, and other measurable parameters.
 */

import type { MedicalImagingState } from "../state-medical-imaging";
import {
  BaseProcessingNode,
  type BaseProcessingNodeConfig,
  type ProcessingNodeResult,
} from "./_base-processing-node";

export class MeasurementExtractionNode extends BaseProcessingNode {
  constructor() {
    const config: BaseProcessingNodeConfig = {
      nodeName: "measurement-extraction",
      description: "Extract quantitative measurements from medical images",
      schemaImportPath: "$lib/configurations/measurement-extraction",
      progressStages: [
        {
          stage: "measurement_extraction_init",
          progress: 10,
          message: "Initializing measurement extraction",
        },
        {
          stage: "measurement_extraction_scanning",
          progress: 30,
          message: "Scanning for measurable structures",
        },
        {
          stage: "measurement_extraction_calculating",
          progress: 60,
          message: "Calculating measurements",
        },
        {
          stage: "measurement_extraction_complete",
          progress: 90,
          message: "Completing measurement extraction",
        },
      ],
      featureDetectionTriggers: ["isMedicalImaging"],
    };
    super(config);
  }

  protected getSectionName(): string {
    return "measurementExtraction";
  }

  /**
   * Validate and enhance measurement extraction results
   */
  protected async validateAndEnhance(
    aiResult: any,
    state: MedicalImagingState,
  ): Promise<ProcessingNodeResult> {
    const processingTime = Date.now();
    const tokensUsed = state.tokenUsage?.[this.config.nodeName] || 0;

    // Validate the AI result
    const validatedData = this.validateMeasurementData(aiResult);

    // Process measurements
    const processedMeasurements = this.processMeasurements(
      validatedData.measurements || [],
    );
    const clinicallyRelevant = this.processClinicalMeasurements(
      validatedData.clinicallyRelevantMeasurements || [],
    );

    return {
      data: {
        measurements: processedMeasurements,
        clinicallyRelevantMeasurements: clinicallyRelevant,
        measurementQuality: validatedData.measurementQuality || "approximate",
        summary: this.generateMeasurementSummary(processedMeasurements),
      },
      metadata: {
        processingTime,
        tokensUsed,
        confidence: this.calculateMeasurementConfidence(validatedData),
        provider: "enhanced-openai",
      },
    };
  }

  /**
   * Validate measurement data
   */
  private validateMeasurementData(data: any): any {
    if (!data) return { measurements: [], measurementQuality: "approximate" };

    return {
      measurements: Array.isArray(data.measurements) ? data.measurements : [],
      clinicallyRelevantMeasurements: Array.isArray(
        data.clinicallyRelevantMeasurements,
      )
        ? data.clinicallyRelevantMeasurements
        : [],
      measurementQuality: data.measurementQuality || "approximate",
    };
  }

  /**
   * Process and structure measurements
   */
  private processMeasurements(measurements: any[]): any[] {
    return measurements.map((measurement) => ({
      id: this.generateMeasurementId(measurement),
      type: measurement.type || "distance",
      description: measurement.description || "Measurement",
      value: measurement.value || 0,
      unit: measurement.unit || "relative",
      location: measurement.location || "Unknown location",
      isEstimated: measurement.isEstimated !== false, // Default to true
      confidence: measurement.confidence || 0.5,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Process clinically relevant measurements
   */
  private processClinicalMeasurements(clinicalMeasurements: any[]): any[] {
    return clinicalMeasurements.map((cm) => ({
      measurement: cm.measurement || "Unknown measurement",
      clinicalSignificance: cm.clinicalSignificance || "Not specified",
      isAbnormal: cm.isAbnormal || false,
    }));
  }

  /**
   * Generate a unique ID for a measurement
   */
  private generateMeasurementId(measurement: any): string {
    const type = measurement.type || "unknown";
    const description = (measurement.description || "measurement").slice(0, 20);
    return `${type}_${description}_${Date.now()}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_");
  }

  /**
   * Generate a summary of measurements
   */
  private generateMeasurementSummary(measurements: any[]): string {
    if (measurements.length === 0) {
      return "No measurable structures detected in the image.";
    }

    const measurementTypes = measurements.reduce(
      (acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const typeList = Object.entries(measurementTypes)
      .map(
        ([type, count]) =>
          `${count as number} ${type}${(count as number) > 1 ? "s" : ""}`,
      )
      .join(", ");

    return `Extracted ${measurements.length} measurement${measurements.length > 1 ? "s" : ""}: ${typeList}.`;
  }

  /**
   * Calculate confidence for measurement extraction
   */
  private calculateMeasurementConfidence(data: any): number {
    let confidence = 0.5;

    const measurements = data.measurements || [];

    if (measurements.length === 0) {
      // No measurements might be correct for some images
      confidence = 0.7;
    } else {
      // Average confidence of individual measurements
      const avgConfidence =
        measurements.reduce(
          (sum: number, m: any) => sum + (m.confidence || 0.5),
          0,
        ) / measurements.length;
      confidence = avgConfidence;

      // Adjust based on measurement quality
      switch (data.measurementQuality) {
        case "precise":
          confidence += 0.2;
          break;
        case "good":
          confidence += 0.1;
          break;
        case "approximate":
          // No adjustment
          break;
        case "rough_estimate":
          confidence -= 0.1;
          break;
      }

      // Adjust based on clinically relevant measurements
      if (
        data.clinicallyRelevantMeasurements &&
        data.clinicallyRelevantMeasurements.length > 0
      ) {
        confidence += 0.1;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if required fields are present
   */
  protected hasRequiredFields(data: any): boolean {
    return !!(data.measurements !== undefined && data.measurementQuality);
  }

  /**
   * Calculate confidence for the node result
   */
  protected calculateConfidence(data: any): number {
    return this.calculateMeasurementConfidence(data);
  }
}

/**
 * Export the node function for use in the workflow
 */
export const measurementExtractionNode = async (
  state: MedicalImagingState,
): Promise<Partial<MedicalImagingState>> => {
  const node = new MeasurementExtractionNode();
  const result = await node.process(state);

  // Map the result to the state structure
  return {
    measurements: result.measurementExtraction?.measurements?.map(
      (measurement: any) => ({
        id: measurement.id,
        type: measurement.type,
        description: measurement.description,
        value: measurement.value,
        unit: measurement.unit,
        location: measurement.location,
        isEstimated: measurement.isEstimated,
        confidence: measurement.confidence,
      }),
    ),
  };
};
