import { error, json, type RequestHandler } from "@sveltejs/kit";
import { generateSessionId, createSession } from "$lib/session/manager";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "$env/static/private";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const data = await request.json();
  const { language, models = ["GP"], translate = false } = data;

  // Use provided language, or fallback to 'en' if not provided
  // The client should now pass the correct locale from getLocale()
  const sessionLanguage = language || "en";

  console.log("🚀 Creating session:", {
    language: sessionLanguage,
    models: models.join(","),
    translate: translate ? "enabled" : "disabled",
  });

  try {
    // Generate unique session ID
    const sessionId = generateSessionId();

    // Create OpenAI conversation thread for persistent context
    let openaiThreadId: string | undefined;

    try {
      console.log("🤖 Creating OpenAI conversation thread...");
      const thread = await openai.beta.threads.create({
        metadata: {
          sessionId,
          userId: user.id,
          purpose: "medical_analysis",
          language,
          models: models.join(","),
          created_at: new Date().toISOString(),
        },
      });

      openaiThreadId = thread.id;
      console.log("✅ OpenAI thread created:", openaiThreadId);

      // Add initial system message to set context
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `
Starting a new medical consultation session.
Language: ${language}
Active analysis models: ${models.join(", ")}
Session context: This will be a doctor-patient conversation with real-time audio transcription.
Please analyze each new statement incrementally and provide updated medical insights.
`.trim(),
      });
    } catch (openaiError) {
      console.error(
        "⚠️ Failed to create OpenAI thread, continuing without it:",
        openaiError,
      );
      // Continue without OpenAI thread - fallback to traditional analysis
    }

    // Initialize session with ChatGPT thread context
    await createSession(sessionId, {
      userId: user.id,
      language: sessionLanguage,
      models,
      translate,
      startTime: new Date().toISOString(),
      status: "active",
      openaiThreadId,
    });

    const response = {
      sessionId,
      status: "success",
      sseUrl: `/v1/session/${sessionId}/stream`,
      audioUrl: `/v1/session/${sessionId}/audio`,
      features: {
        realTimeStreaming: true,
        incrementalAnalysis: !!openaiThreadId,
        chatGPTIntegration: !!openaiThreadId,
        voiceActivityDetection: true,
      },
      config: {
        language,
        models,
        hasOpenAIThread: !!openaiThreadId,
      },
    };

    console.log("✅ Session created successfully:", {
      sessionId,
      hasOpenAIThread: !!openaiThreadId,
      sseUrl: response.sseUrl,
      audioUrl: response.audioUrl,
    });

    return json(response);
  } catch (err) {
    console.error("❌ Failed to create session:", err);
    error(500, { message: "Failed to create session" });
  }
};
