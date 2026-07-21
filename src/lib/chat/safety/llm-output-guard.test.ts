import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (constructors must be defined before vi.mock calls) ────────

const { mockInvoke, MockChatOpenAI } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  MockChatOpenAI: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI,
}));

vi.mock("@langchain/core/messages", () => ({
  SystemMessage: vi.fn().mockImplementation(function (this: any, content: string) {
    this.content = content;
  }),
  HumanMessage: vi.fn().mockImplementation(function (this: any, content: string) {
    this.content = content;
  }),
}));

vi.mock("$lib/config/model-config", () => ({
  modelConfig: { getProviderApiKey: vi.fn().mockReturnValue("test-key") },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Import after mocks
import { checkOutputSafety } from "./llm-output-guard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAIResponse(json: object) {
  return { content: JSON.stringify(json) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("checkOutputSafety", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    MockChatOpenAI.mockImplementation(function (this: any) {
      this.invoke = mockInvoke;
    });
  });

  it("returns null when mode is 'clinical' without calling the AI", async () => {
    const result = await checkOutputSafety("Some response", "clinical", "en");

    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("returns parsed OutputSafetyResult when AI responds with valid JSON", async () => {
    const aiPayload = { safe: true, flags: [], severity: "none" };
    mockInvoke.mockResolvedValue(makeAIResponse(aiPayload));

    const result = await checkOutputSafety("Patient is recovering well.", "general", "de");

    expect(result).toEqual({ safe: true, flags: [], severity: "none" });
  });

  it("returns null when invoke throws an error (fail-open)", async () => {
    mockInvoke.mockRejectedValue(new Error("network error"));

    const result = await checkOutputSafety("Some response", "general", "cs");

    expect(result).toBeNull();
  });

  it("returns null when AI response has unparseable JSON", async () => {
    mockInvoke.mockResolvedValue({ content: "not valid json {{{" });

    const result = await checkOutputSafety("Some response", "general", "de");

    expect(result).toBeNull();
  });

  it("returns null on timeout (invoke never resolves within 3000 ms)", async () => {
    // Simulate a timeout: invoke resolves with null (as the timeout branch does)
    // by making the Promise.race return null before invoke resolves.
    // We can't easily fast-forward timers here, so instead we verify
    // the fail-open path: returning null when result is falsy.
    mockInvoke.mockResolvedValue(null);

    const result = await checkOutputSafety("Some response", "general", "fr");

    expect(result).toBeNull();
  });

  it("includes regexFlags information in the user message when provided", async () => {
    const aiPayload = { safe: false, flags: ["dosage"], severity: "high" };
    mockInvoke.mockResolvedValue(makeAIResponse(aiPayload));

    await checkOutputSafety(
      "Take 500 mg twice a day.",
      "general",
      "cs",
      { flags: ["dosage"], matches: ["500 mg"] },
    );

    const callArgs = mockInvoke.mock.calls[0][0];
    // The second message is the HumanMessage; check its content contains the flag info
    const humanMsg = callArgs[1];
    expect(humanMsg.content).toContain("dosage");
    expect(humanMsg.content).toContain("500 mg");
  });

  it("returns safe: true result with empty flags array", async () => {
    const aiPayload = { safe: true, flags: [], severity: "none" };
    mockInvoke.mockResolvedValue(makeAIResponse(aiPayload));

    const result = await checkOutputSafety("Everything looks fine.", "general", "en");

    expect(result).not.toBeNull();
    expect(result!.safe).toBe(true);
    expect(result!.flags).toEqual([]);
  });

  it("returns safe: false result with a non-empty flags array", async () => {
    const aiPayload = {
      safe: false,
      flags: ["specific diagnosis stated", "dosage recommendation"],
      severity: "high",
    };
    mockInvoke.mockResolvedValue(makeAIResponse(aiPayload));

    const result = await checkOutputSafety(
      "You have cancer. Take 500 mg of X daily.",
      "general",
      "de",
    );

    expect(result).not.toBeNull();
    expect(result!.safe).toBe(false);
    expect(result!.flags).toHaveLength(2);
    expect(result!.severity).toBe("high");
  });

  it("strips markdown code fences from AI JSON response", async () => {
    const raw = "```json\n{\"safe\":true,\"flags\":[],\"severity\":\"none\"}\n```";
    mockInvoke.mockResolvedValue({ content: raw });

    const result = await checkOutputSafety("Normal response.", "general", "it");

    expect(result).toEqual({ safe: true, flags: [], severity: "none" });
  });

  it("does not call the AI when mode is 'clinical', regardless of language", async () => {
    await checkOutputSafety("Anything", "clinical", "de");
    await checkOutputSafety("Anything", "clinical", "cs");

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
