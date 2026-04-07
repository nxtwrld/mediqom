import type { ImportJob, ImportJobStatus } from "../../src/lib/import/types";

/** Create a mock ImportJob with sensible defaults */
export function createMockJob(
  overrides: Partial<ImportJob> = {},
): ImportJob {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "test-job-001",
    user_id: "test-user-001",
    status: "created" as ImportJobStatus,
    stage: null,
    progress: 0,
    message: null,
    error: null,
    scan_deducted: false,
    processing_started_at: null,
    file_count: 1,
    file_manifest: [
      {
        name: "test-document.pdf",
        type: "application/pdf",
        size: 12345,
        taskType: "application/pdf",
        processedImages: [],
      },
    ],
    language: "en",
    extraction_result: null,
    analysis_results: [],
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export interface SSEEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
}

/** Build an SSE response body from an array of events */
export function buildSSEBody(events: SSEEvent[]): string {
  return events
    .map(
      (e) =>
        `data: ${JSON.stringify({ ...e, timestamp: Date.now() })}\n\n`,
    )
    .join("");
}

/** Create SSE events for a successful processing flow */
export function createSuccessSSEEvents(): SSEEvent[] {
  return [
    { type: "progress", stage: "extraction", progress: 10, message: "Starting extraction..." },
    { type: "progress", stage: "extraction", progress: 30, message: "Extracting text..." },
    { type: "progress", stage: "extraction", progress: 50, message: "Extraction complete" },
    { type: "progress", stage: "analysis", progress: 60, message: "Starting analysis..." },
    { type: "progress", stage: "analysis", progress: 80, message: "Analyzing content..." },
    { type: "progress", stage: "analysis", progress: 95, message: "Finalizing..." },
    {
      type: "complete",
      stage: "done",
      progress: 100,
      message: "Processing complete",
      data: createMockJob({ status: "completed", progress: 100 }),
    },
  ];
}

/** Create SSE events that end in an error */
export function createErrorSSEEvents(
  errorMessage = "AI provider returned an error",
): SSEEvent[] {
  return [
    { type: "progress", stage: "extraction", progress: 10, message: "Starting extraction..." },
    { type: "progress", stage: "extraction", progress: 30, message: "Extracting text..." },
    { type: "error", stage: "extraction", progress: 30, message: errorMessage },
  ];
}

/** Create SSE events that stall (never complete — for delete/cancel tests) */
export function createStallingSSEEvents(): SSEEvent[] {
  return [
    { type: "progress", stage: "extraction", progress: 10, message: "Starting extraction..." },
    { type: "progress", stage: "extraction", progress: 20, message: "Processing..." },
  ];
}

/** Create a mock extraction result */
export function createMockExtractionResult() {
  return [
    {
      pages: [
        {
          page: 1,
          language: "en",
          text: "Blood test results from Jan 2026",
          images: [],
        },
      ],
      documents: [
        {
          title: "Blood Test Results",
          date: "2026-01-15",
          language: "en",
          isMedical: true,
          pages: [1],
        },
      ],
      tokenUsage: { prompt: 100, completion: 50, total: 150 },
    },
  ];
}

/** Create a mock analysis result */
export function createMockAnalysisResult() {
  return [
    {
      type: "laboratory",
      fhirType: "DiagnosticReport",
      fhir: {},
      category: "laboratory",
      isMedical: true,
      tags: ["blood-test"],
      hasPrescription: false,
      hasImmunization: false,
      hasLabOrVitals: true,
      text: "Blood test results",
      title: "Blood Test Results",
      summary: "Standard blood panel",
      results: [
        { test: "Hemoglobin", value: "14.5", unit: "g/dL", reference: "12-17" },
      ],
      tokenUsage: { prompt: 200, completion: 100, total: 300 },
    },
  ];
}
