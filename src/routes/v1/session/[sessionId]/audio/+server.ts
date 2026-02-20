import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  getSession,
  addTranscript,
  updateAnalysis,
  setAnalysisInProgress,
} from "$lib/session/manager";
import { transcribeAudioChunk } from "$lib/session/transport/realtime-transcription";
import type { PartialTranscript } from "$lib/session/manager";
import OpenAI from "openai";
import {
  OPENAI_API_KEY,
  OPENAI_MEDICAL_ASSISTANT_ID,
} from "$env/static/private";
import { getFeedbackForAI } from "$lib/ai/feedback.js";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// DEPRECATED ENDPOINT: This endpoint mixes transcription and analysis
// Use instead:
// - POST /v1/session/{sessionId}/transcribe - For audio transcription
// - GET /v1/session/{sessionId}/analyze - For medical analysis
// This endpoint is kept for backward compatibility but will be removed

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
  console.log(
    "⚠️ DEPRECATED: Audio endpoint used, use /transcribe instead for session:",
    sessionId,
  );

  try {
    const sessionData = getSession(sessionId);

    if (!sessionData) {
      error(404, { message: "Session not found" });
    }

    // Verify session belongs to user
    if (sessionData.userId !== user.id) {
      error(403, { message: "Access denied to this session" });
    }

    // Get form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const timestamp = formData.get("timestamp") as string;
    const chunkId = formData.get("chunkId") as string;

    if (!audioFile) {
      error(400, { message: "No audio file provided" });
    }

    console.log("🔄 SERVER: Processing audio file:", {
      chunkId: chunkId || "no-id",
      size: `${audioFile.size} bytes`,
      sessionId,
    });

    // Process transcription
    const transcript = await transcribeAudioChunk(
      audioFile,
      sessionData.language,
    );

    let response: any = {
      sessionId,
      processed: true,
      timestamp: Date.now(),
      hasTranscript: !!transcript,
      analysisTriggered: false,
    };

    if (transcript) {
      // Create partial transcript
      const partialTranscript: PartialTranscript = {
        id: generateTranscriptId(),
        text: transcript.text,
        confidence: transcript.confidence || 0.8,
        timestamp: Date.now(),
        is_final: transcript.is_final || true,
        speaker: transcript.speaker,
      };

      // Add to session (this triggers SSE update automatically)
      addTranscript(sessionId, partialTranscript);
      response.transcript = partialTranscript;

      console.log("✅ SERVER: Transcript generated:", {
        chunkId: chunkId || "no-id",
        text:
          partialTranscript.text.substring(0, 50) +
          (partialTranscript.text.length > 50 ? "..." : ""),
        confidence: partialTranscript.confidence,
      });

      // Analysis is now handled by separate /analyze endpoint
      // This endpoint only handles transcription for backward compatibility
      response.analysisTriggered = false;
    } else {
      console.log(
        "⚠️ SERVER: No transcript generated from audio chunk:",
        chunkId || "no-id",
      );
    }

    return json(response);
  } catch (err) {
    console.error("❌ Failed to process audio chunk:", err);
    error(500, { message: "Failed to process audio chunk" });
  }
};

// DEPRECATED: This endpoint is being phased out in favor of separate transcription and analysis endpoints
// New architecture:
// - POST /v1/session/{sessionId}/transcribe - For audio transcription only
// - GET /v1/session/{sessionId}/analyze - For medical analysis (SSE)

// Determine if we should trigger analysis using hybrid approach
function shouldTriggerAnalysis(sessionData: any): boolean {
  // DEPRECATED: This analysis logic is moved to separate analyze endpoint
  console.log("⚠️ DEPRECATED: Analysis logic moved to /analyze endpoint");
  return false;

  // Get unprocessed content since last analysis
  const lastProcessedIndex =
    sessionData.analysisState?.lastProcessedTranscriptIndex || 0;
  const unprocessedTranscripts =
    sessionData.transcripts.slice(lastProcessedIndex);
  const unprocessedText = unprocessedTranscripts
    .filter((t: any) => t.is_final)
    .map((t: any) => t.text)
    .join(" ");

  // Hybrid approach thresholds
  const INTERVAL_THRESHOLD = 30000; // 30 seconds
  const MIN_CHARACTERS = 200; // Minimum meaningful content
  const MAX_CHARACTERS = 500; // Maximum before forcing analysis
  const MIN_EXCHANGES = 2; // Minimum conversational exchanges

  const unprocessedLength = unprocessedText.length;
  const timeSinceLastAnalysis =
    Date.now() - (sessionData.analysisState?.lastAnalysisTime || 0);

  // Primary trigger: 30-second intervals
  const intervalReached = timeSinceLastAnalysis >= INTERVAL_THRESHOLD;

  // Secondary conditions
  const hasMinimalContent = unprocessedLength >= MIN_CHARACTERS;
  const hasSignificantContent = unprocessedLength >= MAX_CHARACTERS;

  // Speaker change detection (both parties contributing)
  const speakers = [
    ...new Set(
      unprocessedTranscripts.map((t: any) => t.speaker).filter(Boolean),
    ),
  ];
  const hasSpeakerChanges = speakers.length >= 2;

  // Content quality checks
  const hasEnoughExchanges = unprocessedTranscripts.length >= MIN_EXCHANGES;
  const avgTranscriptLength =
    unprocessedLength / Math.max(unprocessedTranscripts.length, 1);
  const hasSubstantialExchanges = avgTranscriptLength >= 20; // Average 20+ chars per exchange

  // Skip conditions
  const onlyShortResponses =
    avgTranscriptLength < 10 && unprocessedLength < 100;
  const onlyFillerWords = isFillerContent(unprocessedText);
  const singleSpeakerDominating =
    !hasSpeakerChanges && unprocessedTranscripts.length >= 3;

  // Skip analysis if content is not meaningful
  if (onlyShortResponses || onlyFillerWords || singleSpeakerDominating) {
    console.log("🚫 Skipping analysis - low quality content:", {
      onlyShortResponses,
      onlyFillerWords,
      singleSpeakerDominating,
      avgTranscriptLength,
      speakers: speakers.length,
    });
    return false;
  }

  // Trigger conditions (in order of priority)
  const shouldTrigger =
    hasSignificantContent || // Force if too much content accumulated
    (intervalReached && hasMinimalContent && hasSpeakerChanges) || // Ideal: 30s + content + speakers
    (intervalReached &&
      hasMinimalContent &&
      hasEnoughExchanges &&
      hasSubstantialExchanges); // Fallback: 30s + quality content

  console.log("🤔 Hybrid analysis decision:", {
    unprocessedTranscripts: unprocessedTranscripts.length,
    unprocessedLength,
    timeSinceLastAnalysis: Math.round(timeSinceLastAnalysis / 1000) + "s",
    speakers: speakers.length,
    speakerList: speakers,
    avgTranscriptLength: Math.round(avgTranscriptLength),
    conditions: {
      intervalReached: `${Math.round(timeSinceLastAnalysis / 1000)}s >= ${INTERVAL_THRESHOLD / 1000}s`,
      hasMinimalContent: `${unprocessedLength} >= ${MIN_CHARACTERS}`,
      hasSignificantContent: `${unprocessedLength} >= ${MAX_CHARACTERS}`,
      hasSpeakerChanges: `${speakers.length} >= 2`,
      hasEnoughExchanges: `${unprocessedTranscripts.length} >= ${MIN_EXCHANGES}`,
      hasSubstantialExchanges: `${Math.round(avgTranscriptLength)} >= 20`,
    },
    skipConditions: {
      onlyShortResponses,
      onlyFillerWords,
      singleSpeakerDominating,
    },
    willTrigger: shouldTrigger,
    unprocessedText:
      unprocessedText.substring(0, 100) +
      (unprocessedText.length > 100 ? "..." : ""),
  });

  return shouldTrigger;
}

// Helper function to detect filler content
function isFillerContent(text: string): boolean {
  const fillerPatterns = [
    /^(yes|no|ok|okay|mm-?hmm?|uh-?huh|yeah|right|sure|exactly|indeed|i see|got it|understood|alright)[\s.!?]*$/i,
    /^(ano|ne|dobře|jasně|rozumím|chápu|aha|mhm|hmm|přesně|souhlasím|v pořádku)[\s.!?]*$/i, // Czech equivalents
    /^[\s.!?]*$/, // Only punctuation/whitespace
    /^(.)\1{3,}$/, // Repeated characters (aaa, ...)
  ];

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return true;

  const fillerSentences = sentences.filter((sentence) =>
    fillerPatterns.some((pattern) => pattern.test(sentence.trim())),
  );

  // Consider it filler if 80% or more sentences are filler
  const fillerRatio = fillerSentences.length / sentences.length;
  return fillerRatio >= 0.8;
}

// Incremental analysis using ChatGPT thread
async function triggerIncrementalAnalysis(
  sessionId: string,
  newStatement: string,
) {
  console.log("🔬 triggerIncrementalAnalysis called", {
    sessionId,
    newStatement,
  });

  const sessionData = getSession(sessionId);
  if (!sessionData) {
    console.error("❌ No session data in triggerIncrementalAnalysis");
    return;
  }

  console.log("🔬 Session data for analysis:", {
    hasOpenAIThread: !!sessionData.openaiThreadId,
    openaiThreadId: sessionData.openaiThreadId,
    transcriptCount: sessionData.transcripts?.length || 0,
    analysisInProgress: sessionData.analysisState?.analysisInProgress,
  });

  // Mark analysis as in progress
  console.log("🔬 Setting analysis in progress...");
  setAnalysisInProgress(sessionId, true);

  try {
    if (sessionData.openaiThreadId) {
      console.log(
        "🤖 Using ChatGPT analysis with thread:",
        sessionData.openaiThreadId,
      );
      await runChatGPTAnalysis(
        sessionId,
        sessionData.openaiThreadId,
        newStatement,
      );
    } else {
      console.log("🔄 No OpenAI thread, using fallback analysis...");
      await runFallbackAnalysis(sessionId);
    }
    console.log("✅ Analysis completed successfully");
  } catch (error) {
    console.error("❌ Analysis failed:", error);
  } finally {
    // Mark analysis as complete
    console.log("🔬 Setting analysis complete...");
    setAnalysisInProgress(sessionId, false);
  }
}

// ChatGPT thread-based analysis
async function runChatGPTAnalysis(
  sessionId: string,
  threadId: string,
  newStatement: string,
) {
  console.log("🤖 Running ChatGPT incremental analysis...");

  try {
    // Add new statement to thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: `New patient statement: "${newStatement}"`,
    });

    // Check if we have a valid assistant ID
    const assistantId = OPENAI_MEDICAL_ASSISTANT_ID;
    if (!assistantId || assistantId === "asst_default") {
      console.log(
        "⚠️ No valid ChatGPT assistant configured, falling back to traditional analysis",
      );
      await runFallbackAnalysis(sessionId);
      return;
    }

    console.log("🤖 Using ChatGPT assistant:", assistantId);

    // Get doctor feedback context for AI learning
    const feedbackContext = getFeedbackForAI();

    // Run analysis with streaming
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      instructions: `
                Analyze this new patient statement in the context of our ongoing conversation.
                Provide ONLY INCREMENTAL UPDATES to your previous analysis.
                Focus on: diagnosis updates, treatment modifications, new medication suggestions, follow-up changes.
                Return updates in JSON format with fields: diagnosis, treatment, medication, followUp, clarifyingQuestions, doctorRecommendations.
                Be concise and only mention changes or new insights.
                
                IMPORTANT: Consider the following doctor feedback patterns when making suggestions:
                ${feedbackContext}
                
                Adapt your suggestions to align with patterns that doctors have previously approved and avoid patterns they have rejected.
                Mark AI-generated suggestions with "origin": "suggestion" to enable doctor feedback collection.
            `,
      stream: true,
    });

    let analysisContent = "";

    // Process streaming response
    for await (const chunk of run) {
      if (chunk.event === "thread.message.delta") {
        const deltaContent = chunk.data.delta.content?.[0];
        if (deltaContent?.type === "text") {
          analysisContent += deltaContent.text?.value || "";
        }
      }

      if (chunk.event === "thread.run.completed") {
        console.log("✅ ChatGPT analysis completed");
        break;
      }
    }

    // Parse and update analysis
    if (analysisContent) {
      const analysis = parseAnalysisResponse(analysisContent);
      updateAnalysis(sessionId, analysis);

      // Update processed transcript index
      const session = getSession(sessionId);
      if (session) {
        session.analysisState.lastProcessedTranscriptIndex =
          session.transcripts?.length || 0;
      }
    }
  } catch (error) {
    console.error("❌ ChatGPT analysis error:", error);
    console.log(
      "🔄 Falling back to traditional analysis due to ChatGPT error...",
    );
    // Fallback to traditional analysis
    await runFallbackAnalysis(sessionId);
  }
}

// Fallback analysis using existing system
async function runFallbackAnalysis(sessionId: string) {
  console.log("🔄 Running fallback analysis...");

  try {
    const sessionData = getSession(sessionId);
    if (!sessionData) {
      console.error("❌ No session data found for fallback analysis");
      return;
    }

    // Get all final transcripts
    const finalTranscripts =
      sessionData.transcripts?.filter((t) => t.is_final) || [];
    const fullText = finalTranscripts.map((t) => t.text).join(" ");

    console.log("📝 Fallback analysis input:", {
      transcriptCount: finalTranscripts.length,
      textLength: fullText.length,
      text: fullText.substring(0, 200) + (fullText.length > 200 ? "..." : ""),
    });

    if (fullText.length < 20) {
      console.log("⚠️ Not enough content for analysis (need >20 chars)");
      return;
    }

    // Use existing analysis system
    console.log("🔍 Importing realtime analysis module...");
    const { analyzeTranscriptionRealtime } = await import(
      "$lib/session-deprecated/realtime-analysis"
    );

    // Get doctor feedback context for AI learning
    const feedbackContext = getFeedbackForAI();

    console.log("🔍 Calling analyzeTranscriptionRealtime...");
    const analysis = await analyzeTranscriptionRealtime(
      fullText,
      sessionData.language,
      sessionData.models,
      feedbackContext,
    );

    console.log("📊 Fallback analysis result:", {
      hasResult: !!analysis,
      isMedical: analysis?.isMedicalConversation,
      diagnosisCount: analysis?.diagnosis?.length || 0,
      treatmentCount: analysis?.treatment?.length || 0,
      medicationCount: analysis?.medication?.length || 0,
      followUpCount: analysis?.followUp?.length || 0,
    });

    if (analysis && analysis.isMedicalConversation !== false) {
      console.log("✅ Updating analysis with fallback results...");

      // Ensure we have arrays even if empty
      const structuredAnalysis = {
        diagnosis: analysis.diagnosis || [],
        treatment: analysis.treatment || [],
        medication: analysis.medication || [],
        followUp: analysis.followUp || [],
        source: "fallback_analysis",
        timestamp: Date.now(),
      };

      console.log("📤 Sending structured analysis update:", structuredAnalysis);
      updateAnalysis(sessionId, structuredAnalysis);

      // Update processed transcript index
      const session = getSession(sessionId);
      if (session) {
        session.analysisState.lastProcessedTranscriptIndex =
          session.transcripts?.length || 0;
        console.log(
          "✅ Updated lastProcessedTranscriptIndex to:",
          session.analysisState.lastProcessedTranscriptIndex,
        );
      }
    } else {
      console.log(
        "❌ Analysis indicated non-medical conversation or no results",
      );
    }
  } catch (error) {
    console.error("❌ Fallback analysis error:", error);
  }
}

// Parse ChatGPT analysis response
function parseAnalysisResponse(content: string) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: create structured response from text
    return {
      diagnosis: extractItems(content, /diagnosis|diagnose/i),
      treatment: extractItems(content, /treatment|treat/i),
      medication: extractItems(content, /medication|medicine|drug/i),
      followUp: extractItems(content, /follow.?up|next.?step/i),
    };
  } catch (error) {
    console.error("❌ Error parsing analysis response:", error);
    return { notes: content };
  }
}

// Helper to extract items from text
function extractItems(text: string, pattern: RegExp) {
  const matches = text.split("\n").filter((line) => pattern.test(line));
  return matches.map((match, index) => ({
    id: `item_${Date.now()}_${index}`,
    description: match.trim(),
    confidence: 0.8,
    source: "chatgpt",
  }));
}

function generateTranscriptId(): string {
  return `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
