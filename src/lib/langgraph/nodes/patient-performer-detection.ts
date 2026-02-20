/**
 * Patient and Performer Detection Node
 *
 * Processes DICOM metadata to extract patient information, medical performers,
 * and technical imaging parameters. Runs on metadata only (no image data needed).
 *
 * Uses unified workflow pattern - returns multiple properties that get merged into state.
 */

import type { MedicalImagingState } from "../state-medical-imaging";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import { log } from "$lib/logging/logger";
import { recordWorkflowStep } from "$lib/debug/workflow-recorder";

/**
 * Validate detection data structure
 */
function validateDetectionData(data: any): any {
  if (!data) return {};

  return {
    patient: data.patient || {},
    performers: Array.isArray(data.performers) ? data.performers : [],
    technical: data.technical || {},
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
  };
}

/**
 * Validate patient information using core.patient structure
 */
function validatePatient(patient: any): any {
  if (!patient) return {};

  return {
    fullName: patient.fullName || patient.name || "Unknown Patient",
    biologicalSex: ["male", "female"].includes(patient.biologicalSex)
      ? patient.biologicalSex
      : undefined,
    identifier: patient.identifier || patient.patientId || "unknown",
    birthDate: patient.birthDate || patient.dateOfBirth || undefined,
    insurance: patient.insurance
      ? {
          provider: patient.insurance.provider || undefined,
          number: patient.insurance.number || undefined,
        }
      : undefined,
  };
}

/**
 * Validate performers array using core.performer structure
 */
function validatePerformers(performers: any[]): any[] {
  return performers.map((performer) => ({
    role: performer.role || "other_specialist",
    name: performer.name || "Unknown",
    title: performer.title || undefined,
    specialty: performer.specialty || undefined,
    licenseNumber: performer.licenseNumber || undefined,
    institution: performer.institution
      ? {
          name: performer.institution.name || undefined,
          department: performer.institution.department || undefined,
          address: performer.institution.address || undefined,
          phone: performer.institution.phone || undefined,
          email: performer.institution.email || undefined,
        }
      : undefined,
    signature: performer.signature || undefined,
    datePerformed: performer.datePerformed || undefined,
    isPrimary: Boolean(performer.isPrimary),
  }));
}

/**
 * Validate technical metadata
 */
function validateTechnical(technical: any): any {
  return {
    study: {
      modality: technical.study?.modality || "Unknown",
      bodyPartExamined: technical.study?.bodyPartExamined || "Unknown",
      viewPosition: technical.study?.viewPosition || undefined,
      studyDescription: technical.study?.studyDescription || undefined,
      studyDate: technical.study?.studyDate || undefined,
    },
    device: {
      manufacturer: technical.device?.manufacturer || undefined,
      modelName: technical.device?.modelName || undefined,
      stationName: technical.device?.stationName || undefined,
      institutionName: technical.device?.institutionName || undefined,
    },
    imageParameters: {
      pixelSpacing: Array.isArray(technical.imageParameters?.pixelSpacing)
        ? technical.imageParameters.pixelSpacing
        : undefined,
      windowCenter: Array.isArray(technical.imageParameters?.windowCenter)
        ? technical.imageParameters.windowCenter
        : undefined,
      windowWidth: Array.isArray(technical.imageParameters?.windowWidth)
        ? technical.imageParameters.windowWidth
        : undefined,
    },
  };
}

/**
 * Export the node function for use in the workflow - unified workflow pattern
 */
export const patientPerformerDetectionNode = async (
  state: MedicalImagingState,
): Promise<Partial<MedicalImagingState>> => {
  const stepStartTime = Date.now();

  console.log("🚀 PATIENT/PERFORMER DETECTION NODE - Starting execution", {
    hasFeatureDetectionResults: !!state.featureDetectionResults,
    featureDetectionResults: state.featureDetectionResults,
    hasImages: !!state.images?.length,
    imageCount: state.images?.length || 0,
    hasMetadata: !!state.metadata,
    hasDicomMetadata: !!state.metadata?.dicomMetadata,
    dicomKeys: state.metadata?.dicomMetadata
      ? Object.keys(state.metadata.dicomMetadata)
      : [],
  });

  // Debug: Log the complete state metadata structure
  console.log(
    "🔍 COMPLETE STATE METADATA:",
    JSON.stringify(state.metadata, null, 2),
  );
  console.log("🔍 COMPLETE STATE KEYS:", Object.keys(state));
  console.log(
    "🔍 IMAGING METADATA:",
    JSON.stringify(state.imagingMetadata, null, 2),
  );

  try {
    console.log(
      "✅ Patient/performer detection executing - in dedicated medical imaging workflow",
    );

    // Progress tracking
    const emitProgress = (stage: string, progress: number, message: string) => {
      if (state.progressCallback) {
        state.progressCallback({
          type: "progress",
          stage,
          progress,
          message,
          timestamp: Date.now(),
        });
      }
      state.emitProgress?.(stage, progress, message);
    };

    // Initialize progress
    emitProgress(
      "patient_performer_detection",
      10,
      "Initializing metadata extraction",
    );

    // Load schema for patient/performer detection
    let schema: FunctionDefinition;
    try {
      const schemaModule = await import(
        "../../configurations/patient-performer-detection"
      );
      schema = schemaModule.default;
      if (!schema) {
        throw new Error("Schema module does not export a default export");
      }
      console.log("✅ Successfully loaded patient-performer-detection schema");
    } catch (error) {
      console.error("❌ Failed to load schema:", error);
      throw new Error(`Failed to load schema: ${error}`);
    }

    emitProgress(
      "patient_performer_detection",
      30,
      "Extracting patient information",
    );

    // Build content for AI processing (metadata only - no images needed)
    const content = [];
    if (state.text) {
      content.push({ type: "text" as const, text: state.text });
    }

    // Add DICOM metadata context with clear instructions
    // Check both possible locations for DICOM metadata - prefer the full metadata
    const dicomData = state.metadata?.dicomMetadata || state.imagingMetadata;
    console.log("🔍 DICOM DATA CHECK:", {
      hasMetadataDicom: !!state.metadata?.dicomMetadata,
      hasImagingMetadata: !!state.imagingMetadata,
      selectedData:
        dicomData === state.metadata?.dicomMetadata
          ? "metadata.dicomMetadata"
          : "imagingMetadata",
      keyCount: dicomData ? Object.keys(dicomData).length : 0,
    });

    if (dicomData && Object.keys(dicomData).length > 0) {
      let metadataText = `Please extract patient information, medical performers, and technical parameters from this DICOM metadata:

PATIENT INFORMATION:
- Look for patient name, ID, birth date, sex/gender
- Common DICOM tags: PatientName, PatientID, PatientBirthDate, PatientSex

MEDICAL PERFORMERS:
- Look for referring physician, performing physician, radiologist names
- Common DICOM tags: ReferringPhysicianName, PerformingPhysicianName, OperatorName

TECHNICAL STUDY INFORMATION:
- Modality: ${dicomData.modality || "Unknown"}
- Body Part: ${dicomData.bodyPartExamined || "Unknown"}  
- Study Description: ${dicomData.studyDescription || "Not specified"}
- Study Date: ${dicomData.studyDate || "Unknown"}

DEVICE INFORMATION:
- Manufacturer: ${(dicomData as any).manufacturer || "Unknown"}
- Model: ${(dicomData as any).modelName || "Unknown"}
- Station: ${(dicomData as any).stationName || "Unknown"}
- Institution: ${(dicomData as any).institutionName || "Unknown"}

MEDICAL PERSONNEL:
- Referring Physician: ${(dicomData as any).referringPhysician || "Unknown"}
- Performing Physician: ${(dicomData as any).performingPhysician || "Unknown"}

PATIENT DETAILS:  
- Patient Name: ${(dicomData as any).patientName || "Unknown"}
- Patient ID: ${(dicomData as any).patientId || "Unknown"}
- Birth Date: ${(dicomData as any).patientBirthDate || "Unknown"}
- Sex: ${(dicomData as any).patientSex || "Unknown"}

RAW DICOM METADATA:
${JSON.stringify(dicomData, null, 2)}`;

      content.push({
        type: "text" as const,
        text: metadataText,
      });
    } else {
      // Fallback if no DICOM metadata
      content.push({
        type: "text" as const,
        text: "No DICOM metadata available. Please return empty/default values for patient, performers, and technical information.",
      });
    }

    const finalContent = content.length > 0 ? content : state.content || [];

    // Initialize token usage
    const tokenUsage = { ...state.tokenUsage };

    emitProgress("patient_performer_detection", 50, "Processing with AI");

    console.log("🤖 PATIENT/PERFORMER DETECTION - Sending to AI:", {
      contentLength: finalContent.length,
      hasText: finalContent.some((c) => c.type === "text"),
      firstTextLength:
        finalContent.find((c) => c.type === "text")?.text?.length || 0,
    });

    // Log complete input data being sent to AI
    console.log("🔍 COMPLETE INPUT TO AI:");
    finalContent.forEach((content, index) => {
      if (content.type === "text") {
        const text = content.text;
        if (text && text.length > 2000) {
          // For long text, show first 1000 chars, indication of truncation, and last 500 chars
          console.log(
            `📝 Content[${index}] (truncated ${text.length} chars):`,
            text.substring(0, 1000) +
              "\n... [TRUNCATED] ...\n" +
              text.substring(text.length - 500),
          );
        } else {
          console.log(`📝 Content[${index}]:`, text || "");
        }
      } else {
        console.log(`📝 Content[${index}]:`, content);
      }
    });

    // Call AI for patient/performer extraction
    const aiResult = await fetchGptEnhanced(
      finalContent,
      schema,
      tokenUsage,
      state.language || "English",
      "extraction",
      (stage, progress, message) => {
        const nodeProgress = 50 + (progress / 100) * 40; // Map 0-100% to 50-90%
        emitProgress(
          `patient_performer_detection_ai_${stage}`,
          nodeProgress,
          `AI: ${message}`,
        );
      },
    );

    emitProgress(
      "patient_performer_detection",
      90,
      "Validating and enhancing results",
    );

    console.log("🤖 PATIENT/PERFORMER DETECTION - AI Result:", {
      hasResult: !!aiResult,
      resultKeys: aiResult ? Object.keys(aiResult) : [],
      hasPatient: !!aiResult?.patient,
      patientKeys: aiResult?.patient ? Object.keys(aiResult.patient) : [],
      hasPerformers: !!aiResult?.performers?.length,
      performersCount: aiResult?.performers?.length || 0,
    });

    // Log complete AI response as JSON
    console.log("🔍 COMPLETE AI RESPONSE:");
    if (aiResult) {
      try {
        const aiResultJson = JSON.stringify(aiResult, null, 2);
        if (aiResultJson.length > 3000) {
          console.log(
            "📦 AI Result (truncated):",
            aiResultJson.substring(0, 3000) + "\n... [TRUNCATED]",
          );
        } else {
          console.log("📦 AI Result:", aiResultJson);
        }
      } catch (err) {
        console.log("📦 AI Result (non-serializable):", aiResult);
      }
    } else {
      console.log("📦 AI Result: null/undefined");
    }

    // Validate and process the AI result
    const validatedData = validateDetectionData(aiResult);

    console.log("🔄 VALIDATION PROCESS:");
    console.log(
      "📥 Raw AI patient data:",
      JSON.stringify(aiResult?.patient || {}, null, 2),
    );
    console.log(
      "📥 Raw AI performers data:",
      JSON.stringify(aiResult?.performers || [], null, 2),
    );
    console.log(
      "📥 Raw AI technical data:",
      JSON.stringify(aiResult?.technical || {}, null, 2),
    );

    // Create detection result
    const patientResult = validatePatient(validatedData.patient);
    const performersResult = validatePerformers(validatedData.performers || []);
    const technicalResult = validateTechnical(validatedData.technical || {});

    console.log(
      "📤 Validated patient data:",
      JSON.stringify(patientResult, null, 2),
    );
    console.log(
      "📤 Validated performers data:",
      JSON.stringify(performersResult, null, 2),
    );
    console.log(
      "📤 Validated technical data:",
      JSON.stringify(technicalResult, null, 2),
    );

    const detectionResult = {
      // Patient information (using core.patient structure)
      patient: patientResult,

      // Performers information (using core.performer structure)
      performers: performersResult,

      // Technical metadata
      technical: technicalResult,

      // Processing metadata
      confidence: validatedData.confidence || 0.7,
      extractedAt: new Date().toISOString(),
      dataSource: "dicom_metadata",
    };

    console.log("✅ PATIENT/PERFORMER DETECTION NODE - Completed execution", {
      hasPatient: !!detectionResult.patient,
      performersCount: detectionResult.performers?.length || 0,
      hasTechnical: !!detectionResult.technical,
      confidence: detectionResult.confidence,
    });

    // Record workflow step for debugging
    const stepDuration = Date.now() - stepStartTime;
    recordWorkflowStep(
      "patient-performer-detection",
      state,
      {
        ...state,
        medicalPerformers: detectionResult.performers,
        patientPerformerDetection: detectionResult,
      } as any,
      stepDuration,
      [],
      [],
      {
        provider: "enhanced-openai",
        flowType: "patient-performer-detection",
        confidence: detectionResult.confidence,
      },
    );

    // Return using unified workflow additive pattern
    return {
      // Update patient information
      patientInfo: detectionResult.patient,

      // Update performers
      medicalPerformers: detectionResult.performers || [],

      // Enhance imaging metadata with technical parameters
      imagingMetadata: {
        ...state.imagingMetadata,
        ...detectionResult.technical.study,
        deviceInfo: detectionResult.technical.device,
        imageParameters: detectionResult.technical.imageParameters,
      },

      // Store comprehensive detection result
      patientPerformerDetection: detectionResult,

      // Update token usage
      tokenUsage,
    };
  } catch (error) {
    log.analysis.error("Patient/performer detection error:", error);
    console.error("❌ PATIENT/PERFORMER DETECTION NODE - Error:", error);

    // Record failed step
    const stepDuration = Date.now() - stepStartTime;
    recordWorkflowStep(
      "patient-performer-detection",
      state,
      { ...state },
      stepDuration,
      [],
      [error instanceof Error ? error.message : String(error)],
      {
        provider: "unknown",
        flowType: "patient-performer-detection",
        failed: true,
      },
    );

    return {
      errors: [
        ...(state.errors || []),
        {
          node: "patient-performer-detection",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
};
