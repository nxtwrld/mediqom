import { error, json, type RequestHandler } from "@sveltejs/kit";
import { transcriptionProvider } from "$lib/ai/providers/transcription-abstraction";
import { getSession } from "$lib/session/manager";
import {
  type AudioChunkMetadata,
  type TranscriptionSegment,
} from "$lib/audio/overlap-processor";
import { configs } from "virtual:configs";

// Load audio transcription config from build-time virtual module
const audioTranscriptionConfig = configs.transcription || {};

export const POST: RequestHandler = async ({
  params,
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const sessionId = params.sessionId!;
  console.log("🎯 TRANSCRIBE: Audio chunk received for session:", sessionId);

  // Retrieve session data to get language and other settings
  const sessionData = getSession(sessionId);
  if (!sessionData) {
    console.error("❌ TRANSCRIBE: Session not found:", sessionId);
    error(404, { message: "Session not found" });
  }

  try {
    // Use session language for transcription with fallback to English
    let instructions = {
      lang: sessionData.language || "en",
      translate: sessionData.translate || false,
    };

    const formData = await request.formData();
    const uploadedFile = formData.get("audio") as File;
    const chunkId = formData.get("chunkId") as string;
    const sequenceNumber = formData.get("sequenceNumber") as string;
    const timestamp = formData.get("timestamp") as string;
    const instructionsExtend = formData.get("instructions") as string;

    // Extract overlap processing metadata if available
    const chunkMetadata = formData.get("metadata") as string;
    let audioMetadata: AudioChunkMetadata | undefined;

    if (chunkMetadata) {
      try {
        audioMetadata = JSON.parse(chunkMetadata) as AudioChunkMetadata;
      } catch (e) {
        console.warn("Failed to parse audio chunk metadata:", e);
      }
    }

    // Parse custom instructions if provided
    if (instructionsExtend) {
      try {
        instructions = Object.assign(
          instructions,
          JSON.parse(instructionsExtend),
        );
      } catch (e) {
        console.warn("Failed to parse transcription instructions:", e);
      }
    }

    // Validate required fields
    if (!uploadedFile) {
      error(400, { message: "No audio file provided" });
    }
    if (!(uploadedFile instanceof File)) {
      error(400, { message: "Invalid file format" });
    }
    if (!uploadedFile.type.includes("audio")) {
      error(400, { message: "Invalid file type - must be audio" });
    }
    if (!chunkId) {
      error(400, { message: "Missing chunkId" });
    }

    console.log("🔄 TRANSCRIBE: Processing", {
      sessionId: sessionId.substring(0, 8) + "...",
      chunkId: chunkId.substring(0, 8) + "...",
      language: instructions.lang,
      translate: instructions.translate,
      size: `${Math.round(uploadedFile.size / 1024)}KB`,
      hasMetadata: !!audioMetadata,
      sequenceNumber: audioMetadata?.sequenceNumber,
      isTimeoutForced: audioMetadata?.isTimeoutForced,
      overlapDuration: audioMetadata?.overlapDurationMs,
    });

    // Initialize transcription provider and transcribe
    await transcriptionProvider.initialize();
    const transcriptionResult =
      await transcriptionProvider.transcribeAudioCompatible(
        uploadedFile,
        instructions,
      );

    // Create transcription segment for overlap processing
    const transcriptionSegment: TranscriptionSegment = {
      text: transcriptionResult.text || "",
      confidence: (transcriptionResult as any).confidence || 0.8,
      timestamp:
        audioMetadata?.timestamp || parseInt(timestamp, 10) || Date.now(),
      chunkMetadata: audioMetadata || {
        sequenceNumber: parseInt(sequenceNumber, 10) || 0,
        timestamp: parseInt(timestamp, 10) || Date.now(),
        isTimeoutForced: false,
        overlapDurationMs: 0,
        energyLevel: 0,
      },
      processed: false,
    };

    // Process overlaps if enabled and multiple segments available
    let processedTranscription = transcriptionSegment;
    const overlapConfig = (audioTranscriptionConfig as any)
      .transcriptionSettings?.overlapProcessing;

    if (
      overlapConfig?.enabled &&
      audioMetadata?.sequenceNumber &&
      audioMetadata.sequenceNumber > 1
    ) {
      // In a real implementation, you would maintain a session-based segment buffer
      // For now, we'll just log that overlap processing is available
      console.log(
        "🔄 OVERLAP: Overlap processing enabled for sequence",
        audioMetadata.sequenceNumber,
      );

      // Here you would:
      // 1. Retrieve previous segments for this session
      // 2. Add current segment to the buffer
      // 3. Run overlap detection and merging
      // 4. Update the session's transcript buffer
      //
      // Example:
      // const sessionSegments = getSessionSegments(sessionId);
      // sessionSegments.push(transcriptionSegment);
      // const mergedResult = overlapProcessor.mergeSegments(sessionSegments);
      // updateSessionTranscript(sessionId, mergedResult);
    }

    // Enhanced response format for session-based transcription with overlap metadata
    const response = {
      success: true,
      sessionId,
      chunkId,
      sequenceNumber: sequenceNumber ? parseInt(sequenceNumber, 10) : undefined,
      timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
      transcription: {
        text: processedTranscription.text,
        confidence: processedTranscription.confidence,
        language: instructions.lang,
        duration: (transcriptionResult as any).duration || 0,
        processed: processedTranscription.processed,
      },
      chunkMetadata: audioMetadata,
      overlapProcessing: {
        enabled: overlapConfig?.enabled || false,
        canProcess: !!audioMetadata && audioMetadata.sequenceNumber > 1,
        sequenceNumber: audioMetadata?.sequenceNumber,
        isTimeoutChunk: audioMetadata?.isTimeoutForced || false,
      },
      processing: {
        provider: "whisper", // transcriptionProvider info
        processingTime:
          Date.now() - (timestamp ? parseInt(timestamp, 10) : Date.now()),
        energyLevel: audioMetadata?.energyLevel,
        overlapDuration: audioMetadata?.overlapDurationMs,
      },
    };

    console.log("✅ TRANSCRIBE: Completed", {
      sessionId: sessionId.substring(0, 8) + "...",
      chunkId: chunkId.substring(0, 8) + "...",
      chars: response.transcription.text.length,
      preview:
        response.transcription.text.substring(0, 30) +
        (response.transcription.text.length > 30 ? "..." : ""),
      sequenceNumber: audioMetadata?.sequenceNumber,
      isTimeoutForced: audioMetadata?.isTimeoutForced,
      overlapEnabled: overlapConfig?.enabled,
      confidence: response.transcription.confidence,
    });

    return json(response);
  } catch (err) {
    console.error("❌ TRANSCRIBE: Failed to process audio chunk:", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    error(500, { message: "Failed to transcribe audio chunk" });
  }
};
