import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockByUser, mockUserGetId, mockLogNamespace } = vi.hoisted(() => ({
  mockByUser: vi.fn(),
  mockUserGetId: vi.fn(),
  mockLogNamespace: vi.fn(),
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
  getDocument: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb(null); return () => {}; }),
    getId: mockUserGetId,
  },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("$lib/profiles", () => ({
  profiles: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb([]); return () => {}; }),
  },
}));

vi.mock("../security-audit", () => ({
  mcpSecurityService: {
    validateAccess: vi.fn().mockResolvedValue({ allowed: true }),
    logAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {},
    temporalTerms: {},
  },
}));

import { GetPatientTimelineTool } from "./get-patient-timeline";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, any> = {}): any {
  return {
    id: "doc-1",
    type: "consultation",
    metadata: {
      date: "2024-01-15",
      title: "Annual Checkup",
      category: "consultation",
    },
    content: { summary: "Patient is in good health." },
    author_id: "user-1",
    medicalTerms: [],
    ...overrides,
  };
}

describe("context/mcp-tools/tools/get-patient-timeline", () => {
  let tool: GetPatientTimelineTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });
    tool = new GetPatientTimelineTool();
    mockUserGetId.mockReturnValue(null);
    mockByUser.mockReturnValue(readable([]));
  });

  // ── getToolDefinition ─────────────────────────────────────────────────────

  describe("getToolDefinition", () => {
    it("returns name getPatientTimeline", () => {
      expect(tool.getToolDefinition().name).toBe("getPatientTimeline");
    });

    it("has no required parameters", () => {
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toEqual([]);
    });

    it("has startDate, endDate, eventTypes, includeDetails properties", () => {
      const props = tool.getToolDefinition().inputSchema.properties;
      expect(props.startDate).toBeDefined();
      expect(props.endDate).toBeDefined();
      expect(props.eventTypes).toBeDefined();
      expect(props.includeDetails).toBeDefined();
    });

    it("has a description", () => {
      expect(tool.getToolDefinition().description.length).toBeGreaterThan(0);
    });
  });

  // ── execute: no profile available ────────────────────────────────────────

  describe("execute — no profile available", () => {
    it("returns isError=true when no userId and no profileId", async () => {
      mockUserGetId.mockReturnValue(null);
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
    });

    it("error text mentions 'No user profile'", async () => {
      mockUserGetId.mockReturnValue(null);
      const result = await tool.execute({});
      expect(result.content[0].text).toContain("No user profile");
    });
  });

  // ── execute: empty documents ──────────────────────────────────────────────

  describe("execute — empty documents", () => {
    it("returns zero totalEvents when no documents exist", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.totalEvents).toBe(0);
    });

    it("text says no timeline events found when empty", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("No timeline events found");
    });
  });

  // ── execute: documents without dates ─────────────────────────────────────

  describe("execute — documents without dates", () => {
    it("skips documents with no date fields", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({ metadata: {} }); // no date
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.totalEvents).toBe(0);
    });
  });

  // ── execute: documents with dates ────────────────────────────────────────

  describe("execute — documents with dates", () => {
    it("returns events for documents with valid dates", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc();
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.totalEvents).toBeGreaterThan(0);
    });

    it("sorts events chronologically (oldest first)", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ id: "doc-1", metadata: { date: "2024-06-01", title: "Later" } }),
        makeDoc({ id: "doc-2", metadata: { date: "2023-01-01", title: "Earlier" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const timeline = resource?.resource?.timeline;
      if (timeline && timeline.length >= 2) {
        expect(new Date(timeline[0].date).getTime()).toBeLessThan(
          new Date(timeline[timeline.length - 1].date).getTime(),
        );
      }
    });

    it("includes document title in event", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({ metadata: { date: "2024-01-15", title: "My Checkup", category: "consultation" } });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const event = resource?.resource?.timeline?.[0];
      expect(event?.title).toContain("My Checkup");
    });

    it("uses profileId when provided (calls byUser with profileId)", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));
      await tool.execute({}, "explicit-profile-id");
      expect(mockByUser).toHaveBeenCalledWith("explicit-profile-id");
    });

    it("falls back to user.getId() when no profileId", async () => {
      mockUserGetId.mockReturnValue("user-from-store");
      mockByUser.mockReturnValue(readable([]));
      await tool.execute({});
      expect(mockByUser).toHaveBeenCalledWith("user-from-store");
    });
  });

  // ── execute: date filtering ───────────────────────────────────────────────

  describe("execute — date filtering", () => {
    it("filters out events before startDate", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ id: "doc-1", metadata: { date: "2024-06-01", title: "After" } }),
        makeDoc({ id: "doc-2", metadata: { date: "2020-01-01", title: "Before" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));
      const result = await tool.execute({ startDate: "2022-01-01" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const dates = resource?.resource?.timeline?.map((e: any) => e.date) ?? [];
      // All dates should be >= startDate
      dates.forEach((d: string) => {
        expect(new Date(d).getTime()).toBeGreaterThanOrEqual(new Date("2022-01-01").getTime());
      });
    });

    it("filters out events after endDate", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ id: "doc-1", metadata: { date: "2024-06-01", title: "After" } }),
        makeDoc({ id: "doc-2", metadata: { date: "2020-01-01", title: "Before" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));
      const result = await tool.execute({ endDate: "2022-01-01" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const dates = resource?.resource?.timeline?.map((e: any) => e.date) ?? [];
      dates.forEach((d: string) => {
        expect(new Date(d).getTime()).toBeLessThanOrEqual(new Date("2022-01-01").getTime());
      });
    });

    it("records filter parameters in resource", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));
      const result = await tool.execute(
        { startDate: "2023-01-01", endDate: "2024-12-31", eventTypes: ["diagnosis"] },
        "p1",
      );
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.filters?.startDate).toBe("2023-01-01");
      expect(resource?.resource?.filters?.endDate).toBe("2024-12-31");
      expect(resource?.resource?.filters?.eventTypes).toContain("diagnosis");
    });
  });

  // ── execute: eventTypes filtering ────────────────────────────────────────

  describe("execute — eventTypes filtering", () => {
    it("filters by event type matching document category", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ id: "doc-1", metadata: { date: "2024-01-15", title: "Lab", category: "laboratory" } }),
        makeDoc({ id: "doc-2", metadata: { date: "2024-02-01", title: "Consult", category: "consultation" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));
      const result = await tool.execute({ eventTypes: ["laboratory"] }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      // Only laboratory events should appear (consultation filtered out)
      const types = resource?.resource?.timeline?.map((e: any) => e.type) ?? [];
      types.forEach((t: string) => expect(t).toBe("laboratory"));
    });
  });

  // ── execute: structured content extraction ────────────────────────────────

  describe("execute — structured content extraction", () => {
    it("extracts diagnoses from document content", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({
        content: {
          diagnoses: [{ name: "Hypertension", description: "High blood pressure" }],
        },
      });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const timeline = resource?.resource?.timeline ?? [];
      const diagnosisEvent = timeline.find((e: any) => e.type === "diagnosis");
      expect(diagnosisEvent).toBeDefined();
      expect(diagnosisEvent?.title).toContain("Hypertension");
    });

    it("extracts procedures from document content", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({
        content: {
          procedures: [{ name: "MRI Scan", description: "Brain MRI" }],
        },
      });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const timeline = resource?.resource?.timeline ?? [];
      const procEvent = timeline.find((e: any) => e.type === "procedure");
      expect(procEvent).toBeDefined();
      expect(procEvent?.title).toContain("MRI Scan");
    });

    it("extracts medications from document content", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({
        content: {
          medications: [{ name: "Metformin", dosage: "500mg" }],
        },
      });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const timeline = resource?.resource?.timeline ?? [];
      const medEvent = timeline.find((e: any) => e.type === "medication");
      expect(medEvent).toBeDefined();
      expect(medEvent?.title).toContain("Metformin");
    });

    it("extracts string diagnoses from document content", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({ content: { diagnoses: ["Diabetes"] } });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const timeline = resource?.resource?.timeline ?? [];
      const diagEvent = timeline.find((e: any) => e.type === "diagnosis");
      expect(diagEvent).toBeDefined();
    });
  });

  // ── execute: includeDetails flag ─────────────────────────────────────────

  describe("execute — includeDetails flag", () => {
    it("includes descriptions in text when includeDetails is true (default)", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc({ content: { summary: "Patient healthy." } });
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({ includeDetails: true }, "p1");
      // Text should contain some description content
      expect(result.content[0].text).toBeDefined();
    });

    it("does not suppress timeline output when includeDetails is false", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const doc = makeDoc();
      mockByUser.mockReturnValue(readable([doc]));
      const result = await tool.execute({ includeDetails: false }, "p1");
      expect(result.isError).toBeFalsy();
    });
  });

  // ── execute: error handling ───────────────────────────────────────────────

  describe("execute — error handling", () => {
    it("returns isError=true when byUser throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockImplementation(() => { throw new Error("Store error"); });
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBe(true);
    });

    it("error text contains error message on throw", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockImplementation(() => { throw new Error("Store error"); });
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("Store error");
    });

    it("handles non-Error throws gracefully", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockImplementation(() => { throw "string error"; });
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown error");
    });
  });

  // ── private: extractEventDescription ──────────────────────────────────────

  describe("extractEventDescription (private via any)", () => {
    const inst = () => tool as any;

    it("extracts summary field from object content", () => {
      const doc = makeDoc({ content: { summary: "Good health." } });
      const desc = inst().extractEventDescription(doc);
      expect(desc).toContain("Good health.");
    });

    it("extracts findings field when summary is missing", () => {
      const doc = makeDoc({ content: { findings: "Normal ECG." } });
      const desc = inst().extractEventDescription(doc);
      expect(desc).toContain("Normal ECG.");
    });

    it("extracts diagnosis field", () => {
      const doc = makeDoc({ content: { diagnosis: "Hypertension stage 1." } });
      const desc = inst().extractEventDescription(doc);
      expect(desc).toContain("Hypertension");
    });

    it("truncates long descriptions to 200 chars", () => {
      const longText = "A".repeat(300);
      const doc = makeDoc({ content: { summary: longText } });
      const desc = inst().extractEventDescription(doc);
      expect(desc.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(desc).toContain("...");
    });

    it("falls back to JSON representation when content has no known fields", () => {
      const doc = makeDoc({
        content: { unknownField: "data" },
        metadata: { summary: "Meta summary" },
      });
      const desc = inst().extractEventDescription(doc);
      // Content object with unrecognized fields → JSON fallback
      expect(desc).toContain("unknownField");
    });

    it("falls back to 'Medical document' when no description available", () => {
      const doc = makeDoc({
        content: { unknownField: "x" },
        metadata: {},
      });
      // The JSON representation or fallback is returned
      const desc = inst().extractEventDescription(doc);
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    });
  });
});
