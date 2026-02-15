import { error, json, type RequestHandler } from "@sveltejs/kit";
import { processMedicalImaging } from "$lib/langgraph/workflows/medical-imaging-workflow";
import {
  loadSubscription,
  updateSubscription,
} from "$lib/user/subscriptions.server.js";
import type { MedicalImagingState } from "$lib/langgraph/state-medical-imaging";

/**
 * Medical Imaging Analysis Endpoint
 *
 * Specialized endpoint for analyzing medical images (X-ray, MRI, CT, etc.)
 * This endpoint is called for images already classified as medical imaging
 * or for DICOM-extracted images that bypass initial classification.
 */
export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const subscription = await loadSubscription(user.id);
  if (!subscription) {
    error(404, { message: "Subscription not found" });
  }

  if (subscription.scans == 0) {
    error(403, { message: "Subscription limit reached" });
  }

  const data = await request.json();

  // Validate required fields
  if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
    error(400, { message: "No medical images provided" });
  }

  // Extract context information
  const isDicomExtracted = data.metadata?.isDicomExtracted || false;
  const dicomMetadata = data.metadata?.dicomMetadata;
  const language = data.language || "English";

  try {
    console.log(
      `🏥 Processing medical imaging analysis (DICOM: ${isDicomExtracted})`,
    );

    // Create state for medical imaging workflow
    const imagingState: MedicalImagingState = {
      images: data.images,
      language,
      metadata: {
        isDicomExtracted,
        dicomMetadata,
        imageSource: isDicomExtracted ? "dicom" : "medical_upload",
      },
      content:
        isDicomExtracted && dicomMetadata
          ? [
              {
                type: "text" as const,
                text: `
DICOM Context:
- Modality: ${dicomMetadata.modality || "Unknown"}
- Body Part: ${dicomMetadata.bodyPartExamined || "Unknown"}
- Study: ${dicomMetadata.studyDescription || "Not specified"}
- View Position: ${dicomMetadata.viewPosition || "Unknown"}
`,
              },
            ]
          : [{ type: "text" as const, text: "Medical imaging analysis" }],
      // Initialize medical imaging specific fields
      imagingMetadata: dicomMetadata
        ? {
            modality: dicomMetadata.modality || "Unknown",
            bodyPartExamined: dicomMetadata.bodyPartExamined || "Unknown",
            studyDescription: dicomMetadata.studyDescription,
            viewPosition: dicomMetadata.viewPosition || "Unknown",
            studyDate: dicomMetadata.studyDate,
            isDicomExtracted,
          }
        : undefined,
      detectedBodyParts: [],
      detectedAnomalies: [],
      measurements: [],
      urgentFindings: false,
      tokenUsage: { total: 0 },
    };

    // Execute the medical imaging workflow
    const workflowResult = await processMedicalImaging(imagingState);

    // Update subscription
    subscription.scans -= 1;
    await updateSubscription(subscription, user.id);

    console.log(`✅ Medical imaging analysis completed`);

    // Format result to match expected structure
    return json({
      pages: [
        {
          page: 1,
          text: "", // Medical images don't have meaningful text
          image: data.images[0], // First image
          thumbnail: data.images[0], // Could be resized later
        },
      ],
      documents: [
        {
          title: dicomMetadata?.studyDescription || "Medical Imaging Study",
          date:
            dicomMetadata?.studyDate || new Date().toISOString().split("T")[0],
          language: language.toLowerCase(),
          isMedical: true,
          isMedicalImaging: true,
          pages: [1],
        },
      ],
      // Include the comprehensive medical imaging analysis
      medicalImageAnalysis: {
        visualAnalysis: workflowResult.imageAnalysis,
        bodyParts: workflowResult.detectedBodyParts,
        anomalies: workflowResult.detectedAnomalies,
        measurements: workflowResult.measurements,
        primaryRegion: workflowResult.primaryAnatomicalRegion,
        urgentFindings: workflowResult.urgentFindings,
        imagingMetadata: workflowResult.imagingMetadata,
      },
      metadata: {
        processingType: "medical_imaging",
        isDicomExtracted,
        dicomMetadata,
        analysisTimestamp: new Date().toISOString(),
        workflowVersion: "1.0",
        nodesExecuted: [
          "visual-analysis",
          "body-parts-detection",
          "anomaly-detection",
          "measurement-extraction",
        ],
      },
      tokenUsage: {
        total: workflowResult.tokenUsage
          ? Object.values(workflowResult.tokenUsage).reduce(
              (sum: number, usage: any) => sum + (usage || 0),
              0,
            )
          : 0,
      },
    });
  } catch (analysisError: any) {
    console.error("❌ Medical imaging analysis failed:", analysisError);
    error(
      500,
      "Medical imaging analysis failed: " +
        (analysisError?.message || "Unknown error"),
    );
  }
};
