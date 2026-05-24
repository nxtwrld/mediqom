import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentProcessingState } from "../state";

const { mockFetchGpt, mockRecordStep } = vi.hoisted(() => ({
  mockFetchGpt: vi.fn(),
  mockRecordStep: vi.fn(),
}));

vi.mock("$lib/ai/providers/enhanced-abstraction", () => ({
  fetchGptEnhanced: mockFetchGpt,
}));

vi.mock("$lib/logging/logger", () => ({
  log: {
    analysis: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock("$lib/config/logging-config", () => ({
  isStateTransitionDebuggingEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("$lib/debug/workflow-recorder", () => ({
  recordWorkflowStep: mockRecordStep,
}));

vi.mock("$lib/ai/schema", () => ({
  updateLanguage: vi.fn().mockImplementation((schema: any) => schema),
}));

vi.mock("$lib/configurations/feature-detection", () => ({
  default: {
    name: "feature_detection",
    parameters: {
      type: "object",
      properties: {
        tags: { items: { enum: [] } },
      },
    },
  },
}));

vi.mock("$lib/configurations/tags", () => ({
  default: ["blood", "liver", "heart"],
}));

import { featureDetectionNode } from "./feature-detection";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(
  overrides: Partial<DocumentProcessingState> = {},
): DocumentProcessingState {
  return {
    content: [{ type: "text", text: "Sample report" }],
    language: "English",
    tokenUsage: { total: 0 },
    errors: [],
    ...overrides,
  } as unknown as DocumentProcessingState;
}

function makeAIResult(overrides: Record<string, any> = {}) {
  return {
    isMedical: true,
    documentType: "clinical_report",
    tags: [],
    ...overrides,
  };
}

describe("featureDetectionNode", () => {
  beforeEach(() => {
    mockFetchGpt.mockReset();
    mockRecordStep.mockReset();
  });

  it("returns featureDetectionResults with isMedical from AI", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({ isMedical: true }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.isMedical).toBe(true);
  });

  it("maps notMedical=true to isMedical=false", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({ notMedical: true }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.isMedical).toBe(false);
  });

  it("sets documentType from AI response", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({ documentType: "laboratory_results" }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.documentType).toBe("laboratory_results");
  });

  it("falls back to category when documentType is absent", async () => {
    mockFetchGpt.mockResolvedValue({ category: "report", isMedical: true, tags: [] });

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.documentType).toBe("report");
  });

  it("records a workflow step after successful detection", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult());

    await featureDetectionNode(makeState());

    expect(mockRecordStep).toHaveBeenCalledWith(
      "feature_detection",
      expect.any(Object),
      expect.any(Object),
      expect.any(Number),
      expect.any(Array),
      expect.any(Array),
      expect.any(Object),
    );
  });

  // ── Safety overrides ──────────────────────────────────────────────────────

  it("forces hasSignals=true when documentType=laboratory_results", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "laboratory_results",
      hasSignals: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasSignals).toBe(true);
  });

  it("forces hasImaging=true when documentType=imaging_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "imaging_report",
      hasImaging: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasImaging).toBe(true);
  });

  it("forces hasImaging=true when documentType=radiology_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "radiology_report",
      hasImaging: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasImaging).toBe(true);
  });

  it("forces hasMicroscopic+hasSpecimens=true when documentType=pathology_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "pathology_report",
      hasMicroscopic: false,
      hasSpecimens: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasMicroscopic).toBe(true);
    expect(result.featureDetectionResults?.hasSpecimens).toBe(true);
  });

  it("forces hasPrescriptions=true when documentType=prescription", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "prescription",
      hasPrescriptions: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasPrescriptions).toBe(true);
  });

  it("forces hasAdmission=true when documentType=discharge_summary", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "discharge_summary",
      hasAdmission: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasAdmission).toBe(true);
  });

  it("forces hasProcedures=true when documentType=surgical_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "surgical_report",
      hasProcedures: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasProcedures).toBe(true);
  });

  it("forces hasImmunizations=true when documentType=immunization_record", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "immunization_record",
      hasImmunizations: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasImmunizations).toBe(true);
  });

  it("forces hasDental=true when documentType=dental_record", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "dental_record",
      hasDental: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasDental).toBe(true);
  });

  it("forces hasMolecular=true when documentType=genetic_analysis", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "genetic_analysis",
      hasMolecular: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasMolecular).toBe(true);
  });

  it("forces hasTumorCharacteristics=true when documentType=oncology_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "oncology_report",
      hasTumorCharacteristics: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasTumorCharacteristics).toBe(true);
  });

  it("forces hasTriage=true when documentType=emergency_report", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "emergency_report",
      hasTriage: false,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasTriage).toBe(true);
  });

  it("does NOT apply overrides when flags are already true", async () => {
    mockFetchGpt.mockResolvedValue(makeAIResult({
      documentType: "laboratory_results",
      hasSignals: true,
    }));

    const result = await featureDetectionNode(makeState());

    expect(result.featureDetectionResults?.hasSignals).toBe(true);
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it("returns errors array when AI call throws", async () => {
    mockFetchGpt.mockRejectedValue(new Error("AI timeout"));

    const result = await featureDetectionNode(makeState());

    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].node).toBe("feature_detection");
    expect(result.errors![0].error).toContain("AI timeout");
  });

  it("preserves existing errors when appending new error", async () => {
    mockFetchGpt.mockRejectedValue(new Error("new error"));

    const stateWithError = makeState({
      errors: [{ node: "previous_node", error: "earlier error", timestamp: "" }],
    });

    const result = await featureDetectionNode(stateWithError);

    expect(result.errors).toHaveLength(2);
  });

  it("records a failed workflow step on error", async () => {
    mockFetchGpt.mockRejectedValue(new Error("fail"));

    await featureDetectionNode(makeState());

    const recordCall = mockRecordStep.mock.calls[0];
    expect(recordCall[6]?.failed).toBe(true);
  });
});
