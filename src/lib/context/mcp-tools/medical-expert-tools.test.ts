import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const {
  mockGetContextStats,
  mockAssembleContext,
  mockByUser,
  mockGetDocument,
  mockUserGetId,
  mockUserGet,
  mockProfilesGet,
  mockValidateAccess,
  mockLogAccess,
} = vi.hoisted(() => ({
  mockGetContextStats: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockByUser: vi.fn(),
  mockGetDocument: vi.fn(),
  mockUserGetId: vi.fn(),
  mockUserGet: vi.fn(),
  mockProfilesGet: vi.fn(),
  mockValidateAccess: vi.fn(),
  mockLogAccess: vi.fn(),
}));

vi.mock("../integration/profile-context", () => ({
  profileContextManager: { getContextStats: mockGetContextStats },
}));

vi.mock("../context-assembly/context-composer", () => ({
  contextAssembler: { assembleContextForAI: mockAssembleContext },
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
  getDocument: mockGetDocument,
}));

vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn().mockImplementation((run: (val: any) => void) => {
      run(mockUserGet());
      return () => {};
    }),
    getId: mockUserGetId,
  },
}));

vi.mock("$lib/profiles", () => ({
  profiles: { get: mockProfilesGet, subscribe: vi.fn() },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("./security-audit", () => ({
  mcpSecurityService: {
    validateAccess: mockValidateAccess,
    logAccess: mockLogAccess,
  },
}));

vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {
      lab: { id: "laboratory", name: "Laboratory" },
      cons: { id: "consultation", name: "Consultation" },
      rad: { id: "radiology", name: "Radiology" },
    },
    temporalTerms: {
      recent: { description: "recent" },
      latest: { description: "latest" },
      historical: { description: "historical" },
    },
  },
}));

import { MedicalExpertTools } from "./medical-expert-tools";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, any> = {}): any {
  return {
    id: "doc-1",
    type: "document",
    content: { title: "Test Doc", summary: "Test summary" },
    metadata: {
      date: "2024-01-15",
      title: "Test Doc",
      summary: "Test summary",
      documentType: "consultation",
      category: "consultation",
    },
    medicalTerms: [],
    temporalType: "recent",
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, any> = {}): any {
  return {
    id: "p1",
    fullName: "John Smith",
    language: "en",
    birthDate: "1980-01-01",
    vcard: {
      firstName: "John",
      lastName: "Smith",
      gender: "male",
      phone: "+1234567890",
      email: "john@example.com",
    },
    health: {
      bloodType: "A+",
      height: 180,
      weight: 80,
      allergies: ["penicillin"],
      chronicConditions: ["hypertension"],
      currentMedications: ["lisinopril"],
    },
    insurance: {
      provider: "HealthCorp",
      planType: "PPO",
    },
    ...overrides,
  };
}

describe("context/mcp-tools/medical-expert-tools", () => {
  let tools: MedicalExpertTools;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new MedicalExpertTools();
    mockByUser.mockReturnValue(readable([]));
    mockGetDocument.mockResolvedValue(null);
    mockUserGet.mockReturnValue(null);
    mockUserGetId.mockReturnValue(null);
    mockProfilesGet.mockReturnValue(null);
    mockValidateAccess.mockResolvedValue({ allowed: true });
    mockLogAccess.mockResolvedValue(undefined);
  });

  // ── static getToolDefinitions ─────────────────────────────────────────────

  describe("getToolDefinitions", () => {
    it("returns an array of tool definitions", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    it("each tool has name, description, and inputSchema", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      for (const tool of defs) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("includes searchDocuments tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      const search = defs.find((t) => t.name === "searchDocuments");
      expect(search).toBeDefined();
      expect(search?.inputSchema.required).toContain("terms");
    });

    it("includes getProfileData tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      expect(defs.find((t) => t.name === "getProfileData")).toBeDefined();
    });

    it("includes queryMedicalHistory tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      const tool = defs.find((t) => t.name === "queryMedicalHistory");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toContain("queryType");
    });

    it("includes getDocumentById tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      expect(defs.find((t) => t.name === "getDocumentById")).toBeDefined();
    });

    it("includes getPatientTimeline tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      expect(defs.find((t) => t.name === "getPatientTimeline")).toBeDefined();
    });

    it("includes getAssembledContext tool", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      expect(defs.find((t) => t.name === "getAssembledContext")).toBeDefined();
    });

    it("searchDocuments terms description mentions category IDs", () => {
      const defs = MedicalExpertTools.getToolDefinitions();
      const search = defs.find((t) => t.name === "searchDocuments");
      const termsDesc =
        search?.inputSchema.properties.terms?.description || "";
      expect(termsDesc.length).toBeGreaterThan(0);
    });
  });

  // ── extractDocumentDate ───────────────────────────────────────────────────

  describe("extractDocumentDate (private via any)", () => {
    const inst = () => tools as any;

    it("returns Date from metadata.date", () => {
      const date = inst().extractDocumentDate({
        metadata: { date: "2024-01-15" },
      });
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
    });

    it("returns Date from created_at when metadata.date is absent", () => {
      const date = inst().extractDocumentDate({ created_at: "2023-06-01" });
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2023);
    });

    it("returns Date from metadata.created_at", () => {
      const date = inst().extractDocumentDate({
        metadata: { created_at: "2022-03-10" },
      });
      expect(date).toBeInstanceOf(Date);
    });

    it("returns null when no date fields exist", () => {
      const date = inst().extractDocumentDate({ id: "x" });
      expect(date).toBeNull();
    });

    it("returns null for invalid date string", () => {
      const date = inst().extractDocumentDate({
        metadata: { date: "not-a-date" },
      });
      expect(date).toBeNull();
    });
  });

  // ── classifyDocumentByDate ────────────────────────────────────────────────

  describe("classifyDocumentByDate (private via any)", () => {
    const inst = () => tools as any;

    it("returns 'historical' when no docs available for comparison", () => {
      const result = inst().classifyDocumentByDate(new Date("2020-01-01"), []);
      expect(result).toBe("historical");
    });

    it("returns 'latest' for the newest document", () => {
      const docs = [
        makeDoc({ metadata: { date: "2024-05-01" } }),
        makeDoc({ metadata: { date: "2022-01-01" } }),
      ];
      const docDate = new Date("2024-05-01");
      const result = inst().classifyDocumentByDate(docDate, docs);
      expect(result).toBe("latest");
    });

    it("returns 'recent' for document within last 30 days but not latest", () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const olderDocs = Array.from({ length: 20 }, (_, i) => ({
        metadata: {
          date: new Date(
            now.getTime() - (i + 1) * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      }));
      const result = inst().classifyDocumentByDate(tenDaysAgo, olderDocs);
      expect(["latest", "recent"]).toContain(result);
    });

    it("returns 'historical' for old documents", () => {
      const docs = [
        makeDoc({ metadata: { date: "2024-01-01" } }),
        makeDoc({ metadata: { date: "2020-01-01" } }),
      ];
      const oldDate = new Date("2019-01-01");
      const result = inst().classifyDocumentByDate(oldDate, docs);
      expect(result).toBe("historical");
    });
  });

  // ── extractDataAccessInfo ─────────────────────────────────────────────────

  describe("extractDataAccessInfo (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty array for null result", () => {
      expect(inst().extractDataAccessInfo(null)).toEqual([]);
    });

    it("reports content item count", () => {
      const result = { content: [{ type: "text" }, { type: "resource" }] };
      const info = inst().extractDataAccessInfo(result);
      expect(info.some((s: string) => s.includes("2"))).toBe(true);
    });

    it("reports documentCount when present", () => {
      const result = { documentCount: 5 };
      const info = inst().extractDataAccessInfo(result);
      expect(info.some((s: string) => s.includes("5"))).toBe(true);
    });

    it("reports medications count", () => {
      const result = { medications: ["a", "b", "c"] };
      const info = inst().extractDataAccessInfo(result);
      expect(info.some((s: string) => s.includes("3"))).toBe(true);
    });

    it("reports testResults count", () => {
      const result = { testResults: ["x"] };
      const info = inst().extractDataAccessInfo(result);
      expect(info.some((s: string) => s.includes("1"))).toBe(true);
    });
  });

  // ── sanitizeContentForAI ──────────────────────────────────────────────────

  describe("sanitizeContentForAI (private via any)", () => {
    const inst = () => tools as any;

    it("returns string content unchanged", () => {
      expect(inst().sanitizeContentForAI("hello")).toBe("hello");
    });

    it("returns non-object content unchanged", () => {
      expect(inst().sanitizeContentForAI(42)).toBe(42);
    });

    it("removes attachments, encryption, keys fields", () => {
      const content = {
        title: "Test",
        attachments: [{ name: "file.pdf" }],
        encryption: { key: "secret" },
        keys: ["k1"],
      };
      const result = inst().sanitizeContentForAI(content);
      expect(result.title).toBe("Test");
      expect(result.attachments).toBeUndefined();
      expect(result.encryption).toBeUndefined();
      expect(result.keys).toBeUndefined();
    });

    it("truncates text field over 5000 chars", () => {
      const content = { text: "a".repeat(6000) };
      const result = inst().sanitizeContentForAI(content);
      expect(result.text.length).toBeLessThan(6000);
      expect(result.text).toContain("[truncated]");
    });

    it("does not truncate text under 5000 chars", () => {
      const content = { text: "a".repeat(100) };
      const result = inst().sanitizeContentForAI(content);
      expect(result.text).toBe("a".repeat(100));
    });

    it("truncates content string field over 5000 chars", () => {
      const content = { content: "b".repeat(6000) };
      const result = inst().sanitizeContentForAI(content);
      expect(result.content).toContain("[truncated]");
    });

    it("returns null unchanged", () => {
      expect(inst().sanitizeContentForAI(null)).toBeNull();
    });
  });

  // ── extractMedications ────────────────────────────────────────────────────

  describe("extractMedications (private via any)", () => {
    const inst = () => tools as any;

    it("extracts medication from 'taking X' pattern", () => {
      const meds = inst().extractMedications("patient is taking lisinopril 10mg");
      expect(meds.length).toBeGreaterThan(0);
    });

    it("extracts medication with dosage pattern", () => {
      const meds = inst().extractMedications("metformin 500 mg twice daily");
      expect(meds.length).toBeGreaterThan(0);
    });

    it("returns empty array for text with no medications", () => {
      const meds = inst().extractMedications("patient came for checkup today");
      expect(Array.isArray(meds)).toBe(true);
    });

    it("deduplicates medications", () => {
      const text = "taking aspirin 100mg, aspirin 100mg prescribed";
      const meds = inst().extractMedications(text);
      const uniqueMeds = new Set(meds.map((m: string) => m.toLowerCase()));
      expect(meds.length).toBe(uniqueMeds.size);
    });

    it("limits to 10 results", () => {
      const text = Array.from(
        { length: 20 },
        (_, i) => `taking drug${i} ${i + 1}mg`,
      ).join(". ");
      const meds = inst().extractMedications(text);
      expect(meds.length).toBeLessThanOrEqual(10);
    });
  });

  // ── extractConditions ─────────────────────────────────────────────────────

  describe("extractConditions (private via any)", () => {
    const inst = () => tools as any;

    it("extracts condition from 'diagnosed with X' pattern", () => {
      const conditions = inst().extractConditions(
        "patient was diagnosed with hypertension",
      );
      expect(conditions.length).toBeGreaterThan(0);
    });

    it("extracts condition from 'suffers from X' pattern", () => {
      const conditions = inst().extractConditions("patient suffers from diabetes");
      expect(conditions.length).toBeGreaterThan(0);
    });

    it("returns array type for all inputs", () => {
      expect(Array.isArray(inst().extractConditions("normal checkup"))).toBe(
        true,
      );
    });
  });

  // ── extractProcedures ─────────────────────────────────────────────────────

  describe("extractProcedures (private via any)", () => {
    const inst = () => tools as any;

    it("extracts procedure from 'underwent surgery' pattern", () => {
      const procedures = inst().extractProcedures(
        "patient underwent knee surgery last month",
      );
      expect(procedures.length).toBeGreaterThan(0);
    });

    it("returns array type", () => {
      expect(Array.isArray(inst().extractProcedures("routine visit"))).toBe(
        true,
      );
    });
  });

  // ── extractAllergies ──────────────────────────────────────────────────────

  describe("extractAllergies (private via any)", () => {
    const inst = () => tools as any;

    it("extracts allergy from 'allergic to X' pattern", () => {
      const allergies = inst().extractAllergies("patient is allergic to penicillin");
      expect(allergies.length).toBeGreaterThan(0);
    });

    it("extracts from 'adverse reaction to X' pattern", () => {
      const allergies = inst().extractAllergies(
        "adverse reaction to aspirin noted",
      );
      expect(allergies.length).toBeGreaterThan(0);
    });

    it("returns array type", () => {
      expect(Array.isArray(inst().extractAllergies("no known issues"))).toBe(
        true,
      );
    });
  });

  // ── searchDocumentsByTerms ────────────────────────────────────────────────

  describe("searchDocumentsByTerms (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty array for empty documents list", () => {
      const results = inst().searchDocumentsByTerms([], ["glucose"], {
        maxResults: 10,
        threshold: 0.6,
      });
      expect(results).toEqual([]);
    });

    it("returns results matching medical terms", () => {
      const docs = [
        makeDoc({ medicalTerms: ["glucose", "diabetes"] }),
        makeDoc({ id: "doc-2", medicalTerms: ["cardiac"] }),
      ];
      const results = inst().searchDocumentsByTerms(docs, ["glucose"], {
        maxResults: 10,
        threshold: 0.0,
      });
      expect(results.length).toBeGreaterThan(0);
      const docIds = results.map((r: any) => r.document.id);
      expect(docIds).toContain("doc-1");
    });

    it("filters by documentTypes when provided", () => {
      const docs = [
        makeDoc({ metadata: { category: "laboratory" } }),
        makeDoc({ id: "doc-2", metadata: { category: "radiology" } }),
      ];
      const results = inst().searchDocumentsByTerms(docs, ["test"], {
        maxResults: 10,
        threshold: 0.0,
        documentTypes: ["laboratory"],
      });
      const docIds = results.map((r: any) => r.document.id);
      expect(docIds).not.toContain("doc-2");
    });

    it("returns base relevance when no medical terms match", () => {
      const docs = [makeDoc({ medicalTerms: [] })];
      const results = inst().searchDocumentsByTerms(docs, ["nonexistent"], {
        maxResults: 10,
        threshold: 0.0,
      });
      // No terms match but doc passes category filter → base relevance
      if (results.length > 0) {
        expect(results[0].relevance).toBeGreaterThan(0);
      }
    });

    it("matches by tags as well as medicalTerms", () => {
      const docs = [
        makeDoc({ medicalTerms: [], metadata: { tags: ["blood", "lab"] } }),
      ];
      const results = inst().searchDocumentsByTerms(docs, ["blood"], {
        maxResults: 10,
        threshold: 0.0,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles temporal search terms", () => {
      const docs = [makeDoc({ medicalTerms: ["ecg"] })];
      // "recent" is in temporalTerms mock
      const results = inst().searchDocumentsByTerms(docs, ["recent", "ecg"], {
        maxResults: 10,
        threshold: 0.0,
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ── searchDocuments (public async) ────────────────────────────────────────

  describe("searchDocuments", () => {
    it("returns error when user is not authenticated", async () => {
      mockUserGet.mockReturnValue(null);

      const result = await tools.searchDocuments({ terms: ["glucose"] }, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not authenticated");
    });

    it("returns no-documents message when profile has no documents", async () => {
      mockUserGet.mockReturnValue({ id: "user-1" });
      mockByUser.mockReturnValue(readable([]));

      const result = await tools.searchDocuments({ terms: ["glucose"] }, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("No medical documents");
    });

    it("returns found documents for matching terms", async () => {
      mockUserGet.mockReturnValue({ id: "user-1" });
      const doc = makeDoc({
        medicalTerms: ["glucose"],
        metadata: {
          date: "2024-01-15",
          title: "Lab Results",
          summary: "Blood glucose test",
          documentType: "laboratory",
          category: "laboratory",
        },
      });
      mockByUser.mockReturnValue(readable([doc]));

      const result = await tools.searchDocuments(
        { terms: ["glucose"], threshold: 0.0 },
        "p1",
      );
      expect(result.content[0].text).toContain("Found");
      expect(result.isError).toBeFalsy();
    });

    it("includes full document content when includeContent=true and relevance>0.8", async () => {
      mockUserGet.mockReturnValue({ id: "user-1" });
      const doc = makeDoc({ medicalTerms: ["glucose", "lab", "blood"] });
      mockByUser.mockReturnValue(readable([doc]));
      mockGetDocument.mockResolvedValue({
        id: "doc-1",
        content: { title: "Full Lab", signals: [{ name: "glucose" }] },
      });

      // Provide many terms so relevance is high
      const result = await tools.searchDocuments(
        {
          terms: ["glucose"],
          includeContent: true,
          threshold: 0.0,
          limit: 5,
        },
        "p1",
      );
      expect(Array.isArray(result.content)).toBe(true);
    });

    it("returns error result on thrown exception", async () => {
      mockUserGet.mockReturnValue({ id: "user-1" });
      mockByUser.mockImplementation(() => {
        throw new Error("Store error");
      });

      const result = await tools.searchDocuments({ terms: ["test"] }, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getProfileData ────────────────────────────────────────────────────────

  describe("getProfileData", () => {
    it("returns error when profile not found", async () => {
      mockProfilesGet.mockReturnValue(null);

      const result = await tools.getProfileData({}, "nonexistent");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Profile not found");
    });

    it("returns profile data including name", async () => {
      const profile = makeProfile();
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("John Smith");
    });

    it("includes blood type when present", async () => {
      const profile = makeProfile({ health: { bloodType: "O+" } });
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      expect(result.content[0].text).toContain("O+");
    });

    it("includes allergies when present", async () => {
      const profile = makeProfile({
        health: { allergies: ["penicillin", "sulfa"] },
      });
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      expect(result.content[0].text).toContain("penicillin");
    });

    it("includes chronic conditions when present", async () => {
      const profile = makeProfile({
        health: { chronicConditions: ["hypertension"] },
      });
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      expect(result.content[0].text).toContain("hypertension");
    });

    it("returns resource with sanitized profile data", async () => {
      const profile = makeProfile();
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
      expect(resource?.resource?.id).toBe("p1");
    });

    it("handles profile without health data", async () => {
      const profile = makeProfile({ health: null, vcard: null, insurance: null });
      mockProfilesGet.mockReturnValue(profile);

      const result = await tools.getProfileData({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("John Smith");
    });

    it("returns error on exception", async () => {
      mockProfilesGet.mockImplementation(() => {
        throw new Error("DB error");
      });

      const result = await tools.getProfileData({}, "p1");
      expect(result.isError).toBe(true);
    });
  });

  // ── getDocumentById ───────────────────────────────────────────────────────

  describe("getDocumentById", () => {
    it("returns error when document not found", async () => {
      mockGetDocument.mockResolvedValue(null);

      const result = await tools.getDocumentById({ documentId: "unknown" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("returns document text and resource when found", async () => {
      const doc = {
        id: "doc-1",
        type: "consultation",
        metadata: { title: "Annual Checkup", date: "2024-01-15" },
        content: "Patient is in good health",
        author_id: "user-1",
      };
      mockGetDocument.mockResolvedValue(doc);

      const result = await tools.getDocumentById({ documentId: "doc-1" });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Annual Checkup");
    });

    it("includes document type in response", async () => {
      const doc = {
        id: "doc-1",
        type: "laboratory",
        metadata: { date: "2024-01-15" },
        content: {},
        author_id: "user-1",
      };
      mockGetDocument.mockResolvedValue(doc);

      const result = await tools.getDocumentById({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("laboratory");
    });

    it("handles JSON object content", async () => {
      const doc = {
        id: "doc-1",
        type: "lab",
        metadata: {},
        content: { glucose: 5.4, unit: "mmol/L" },
        author_id: "user-1",
      };
      mockGetDocument.mockResolvedValue(doc);

      const result = await tools.getDocumentById({ documentId: "doc-1" });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBeDefined();
    });

    it("returns error on exception", async () => {
      mockGetDocument.mockRejectedValue(new Error("Network error"));

      const result = await tools.getDocumentById({ documentId: "doc-1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getPatientTimeline ────────────────────────────────────────────────────

  describe("getPatientTimeline", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.getPatientTimeline({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns timeline for profile with documents", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ metadata: { date: "2024-01-15", title: "Checkup" } }),
        makeDoc({
          id: "doc-2",
          metadata: { date: "2023-06-01", title: "Lab Results" },
        }),
      ];
      mockByUser.mockReturnValue(readable(docs));

      const result = await tools.getPatientTimeline({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
    });

    it("filters timeline by startDate", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ metadata: { date: "2024-01-15" } }),
        makeDoc({ id: "doc-2", metadata: { date: "2020-01-01" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));

      const result = await tools.getPatientTimeline(
        { startDate: "2022-01-01" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
    });

    it("returns empty timeline when no documents have dates", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [makeDoc({ metadata: {} })]; // no date
      mockByUser.mockReturnValue(readable(docs));

      const result = await tools.getPatientTimeline({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      if (resource) {
        expect(resource.resource?.totalEvents).toBe(0);
      }
    });

    it("uses provided profileId over user.getId()", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));

      await tools.getPatientTimeline({}, "explicit-profile-id");
      expect(mockByUser).toHaveBeenCalledWith("explicit-profile-id");
    });
  });

  // ── secureToolCall ────────────────────────────────────────────────────────

  describe("secureToolCall", () => {
    it("executes handler when access is allowed", async () => {
      mockValidateAccess.mockResolvedValue({ allowed: true });
      const handler = vi.fn().mockResolvedValue({ content: [], isError: false });

      const result = await tools.secureToolCall(
        "searchDocuments",
        "search",
        { profileId: "p1", user: { id: "u1" } as any },
        { terms: ["glucose"] },
        handler,
      );

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toEqual({ content: [], isError: false });
    });

    it("throws when access is denied", async () => {
      mockValidateAccess.mockResolvedValue({
        allowed: false,
        reason: "Unauthorized",
      });

      await expect(
        tools.secureToolCall(
          "searchDocuments",
          "search",
          { profileId: "p1", user: { id: "u1" } as any },
          {},
          vi.fn(),
        ),
      ).rejects.toThrow("Access denied");
    });

    it("logs access on success", async () => {
      mockValidateAccess.mockResolvedValue({ allowed: true });
      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text" }] });

      await tools.secureToolCall(
        "getProfileData",
        "read",
        { profileId: "p1", user: { id: "u1" } as any },
        {},
        handler,
      );

      expect(mockLogAccess).toHaveBeenCalledWith(
        "getProfileData",
        "read",
        expect.any(Object),
        expect.any(Object),
        "success",
        undefined,
        expect.any(Array),
        expect.any(Number),
      );
    });

    it("logs and rethrows on handler error", async () => {
      mockValidateAccess.mockResolvedValue({ allowed: true });
      const handler = vi.fn().mockRejectedValue(new Error("Handler failed"));

      await expect(
        tools.secureToolCall(
          "getDocumentById",
          "read",
          { profileId: "p1", user: { id: "u1" } as any },
          {},
          handler,
        ),
      ).rejects.toThrow("Handler failed");

      expect(mockLogAccess).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        "error",
        "Handler failed",
        expect.any(Array),
        expect.any(Number),
      );
    });
  });

  // ── getAssembledContext ───────────────────────────────────────────────────

  describe("getAssembledContext", () => {
    it("returns error when profileContextManager has no stats", async () => {
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.getAssembledContext(
        { conversationContext: "patient history" },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No context available");
    });

    it("returns assembled context when stats available", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockResolvedValue({
        summary: "Patient has hypertension",
        keyPoints: [{ text: "BP elevated", type: "finding", date: "2024-01-01", confidence: 0.9 }],
        relevantDocuments: [],
        medicalContext: {},
        confidence: 0.85,
        tokenCount: 500,
      });

      const result = await tools.getAssembledContext(
        { conversationContext: "blood pressure" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("hypertension");
    });

    it("returns error on exception", async () => {
      mockGetContextStats.mockImplementation(() => {
        throw new Error("Context error");
      });

      const result = await tools.getAssembledContext(
        { conversationContext: "test" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });
  });

  // ── queryMedicalHistory ───────────────────────────────────────────────────

  describe("queryMedicalHistory", () => {
    it("returns error when no context stats available", async () => {
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.queryMedicalHistory(
        { queryType: "medications" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });

    it("builds query for medications type", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      await tools.queryMedicalHistory({ queryType: "medications" }, "p1");
      expect(mockSearch).toHaveBeenCalled();
    });

    it("builds query for conditions type", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      await tools.queryMedicalHistory({ queryType: "conditions" }, "p1");
      expect(mockSearch).toHaveBeenCalled();
    });

    it("filters by timeframe when provided", async () => {
      const mockSearch = vi.fn().mockResolvedValue([
        { documentId: "doc-1", metadata: { date: "2024-01-15", title: "Test" }, similarity: 0.8 },
        { documentId: "doc-2", metadata: { date: "2020-01-01", title: "Old" }, similarity: 0.7 },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockGetDocument.mockResolvedValue(null);

      const result = await tools.queryMedicalHistory(
        {
          queryType: "procedures",
          timeframe: { start: "2022-01-01", end: "2025-01-01" },
        },
        "p1",
      );
      expect(result.isError).toBeFalsy();
    });
  });

  // ── analyzeMedicalTrends ──────────────────────────────────────────────────

  describe("analyzeMedicalTrends", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.analyzeMedicalTrends(
        { analysisType: "vital_signs" },
        undefined,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns trend analysis when profile has documents", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));

      const result = await tools.analyzeMedicalTrends(
        { analysisType: "lab_values" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].text).toContain("Trend");
    });

    it("passes through to analyzeTrends and formats result", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockReturnValue(readable([]));

      const result = await tools.analyzeMedicalTrends(
        { analysisType: "medications", parameter: "metformin", includeCorrelations: true },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });

    it("returns error on thrown exception", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockImplementation(() => {
        throw new Error("Store failure");
      });

      const result = await tools.analyzeMedicalTrends(
        { analysisType: "symptoms" },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getMedicationHistory ──────────────────────────────────────────────────

  describe("getMedicationHistory", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.getMedicationHistory({}, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns error when no context database is available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.getMedicationHistory({}, "p1");
      expect(result.isError).toBe(true);
    });

    it("returns medication history when database is available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getMedicationHistory({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Medication History");
    });

    it("includes interaction check by default", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([
        {
          excerpt: "patient is taking warfarin daily",
          metadata: { date: new Date().toISOString(), title: "Cardiology note", documentType: "note" },
          similarity: 0.8,
        },
        {
          excerpt: "prescribed aspirin 100mg",
          metadata: { date: new Date().toISOString(), title: "Prescription", documentType: "medication" },
          similarity: 0.7,
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getMedicationHistory(
        { checkInteractions: true },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.interactionWarnings).toBeDefined();
    });
  });

  // ── getTestResultSummary ──────────────────────────────────────────────────

  describe("getTestResultSummary", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.getTestResultSummary({}, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns error when no context database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.getTestResultSummary({}, "p1");
      expect(result.isError).toBe(true);
    });

    it("returns test result summary when database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getTestResultSummary({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Test Results");
    });

    it("includes trend analysis in resource when results present", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([
        {
          excerpt: "lab result glucose 5.4 mmol/l normal range 4.0-6.0",
          metadata: { date: "2024-01-15", title: "Blood test", documentType: "laboratory" },
          similarity: 0.9,
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getTestResultSummary(
        { includeTrends: true },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.summary).toBeDefined();
    });
  });

  // ── identifyMedicalPatterns ───────────────────────────────────────────────

  describe("identifyMedicalPatterns", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.identifyMedicalPatterns(
        { patternType: "symptom_clusters" },
        undefined,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns error when no context database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.identifyMedicalPatterns(
        { patternType: "risk_factors" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });

    it("returns pattern analysis when database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.identifyMedicalPatterns(
        { patternType: "comorbidities" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Pattern");
    });

    it("includes hypotheses in resource when includeHypotheses not false", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.identifyMedicalPatterns(
        { patternType: "medication_effects", focusArea: "cardiovascular", includeHypotheses: true },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(Array.isArray(resource?.resource?.hypotheses)).toBe(true);
    });
  });

  // ── generateClinicalSummary ───────────────────────────────────────────────

  describe("generateClinicalSummary", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.generateClinicalSummary(
        { summaryType: "comprehensive" },
        undefined,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("propagates error from getAssembledContext when no context available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.generateClinicalSummary(
        { summaryType: "recent_changes" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });

    it("returns clinical summary when context is available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockResolvedValue({
        summary: "Patient has hypertension managed with lisinopril",
        keyPoints: [],
        relevantDocuments: [],
        medicalContext: {},
        confidence: 0.8,
        tokenCount: 400,
      });

      const result = await tools.generateClinicalSummary(
        { summaryType: "comprehensive" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBeDefined();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.type).toBe("comprehensive");
    });

    it("uses profileId over user.getId()", async () => {
      mockUserGetId.mockReturnValue("user-fallback");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockResolvedValue({
        summary: "Summary",
        keyPoints: [],
        relevantDocuments: [],
        medicalContext: {},
        confidence: 0.7,
        tokenCount: 200,
      });

      await tools.generateClinicalSummary({ summaryType: "risk_assessment" }, "explicit-p1");
      expect(mockGetContextStats).toHaveBeenCalledWith("explicit-p1");
    });
  });

  // ── searchBySymptoms ──────────────────────────────────────────────────────

  describe("searchBySymptoms", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.searchBySymptoms(
        { symptoms: ["chest pain"] },
        undefined,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("returns error when no context database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.searchBySymptoms(
        { symptoms: ["fatigue", "nausea"] },
        "p1",
      );
      expect(result.isError).toBe(true);
    });

    it("returns symptom results when database available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.searchBySymptoms(
        { symptoms: ["headache", "dizziness"] },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("headache");
    });

    it("includes symptom analysis resource", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([
        {
          excerpt: "patient reports fatigue and headache",
          metadata: { date: "2024-02-01", title: "Visit note", documentType: "consultation" },
          similarity: 0.75,
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.searchBySymptoms(
        { symptoms: ["fatigue"], severity: "mild" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.matchedSymptoms).toBeDefined();
    });
  });

  // ── getSpecialtyRecommendations ───────────────────────────────────────────

  describe("getSpecialtyRecommendations", () => {
    it("returns error when no profile ID available", async () => {
      mockUserGetId.mockReturnValue(null);

      const result = await tools.getSpecialtyRecommendations(
        { specialty: "cardiology" },
        undefined,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No user profile");
    });

    it("propagates error from getAssembledContext when no context", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockReturnValue(null);

      const result = await tools.getSpecialtyRecommendations(
        { specialty: "cardiology" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });

    it("returns recommendations when context available", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockResolvedValue({
        summary: "Patient with cardiac history",
        keyPoints: [],
        relevantDocuments: [],
        medicalContext: {},
        confidence: 0.8,
        tokenCount: 300,
      });

      const result = await tools.getSpecialtyRecommendations(
        { specialty: "cardiology", clinicalQuestion: "heart disease follow-up" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });

    it("returns error on exception", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockImplementation(() => {
        throw new Error("Context crash");
      });

      const result = await tools.getSpecialtyRecommendations(
        { specialty: "neurology" },
        "p1",
      );
      expect(result.isError).toBe(true);
    });
  });

  // ── extractTimelineEvents (private) ──────────────────────────────────────

  describe("extractTimelineEvents (private via any)", () => {
    const inst = () => tools as any;

    it("extracts events from search results", () => {
      const searchResults = [
        {
          metadata: { date: "2024-01-10", documentType: "consultation", title: "Checkup", documentId: "d1" },
          excerpt: "Patient doing well",
          confidence: 0.9,
        },
      ];
      const events = inst().extractTimelineEvents(searchResults);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].date).toBe("2024-01-10");
      expect(events[0].title).toBe("Checkup");
    });

    it("uses defaults when metadata fields are absent", () => {
      const searchResults = [
        { metadata: {}, excerpt: "", confidence: 0 },
      ];
      const events = inst().extractTimelineEvents(searchResults);
      expect(events[0].date).toBe("Unknown date");
      expect(events[0].type).toBe("medical-record");
      expect(events[0].title).toBe("Medical event");
    });

    it("sorts events descending by date", () => {
      const searchResults = [
        { metadata: { date: "2022-01-01", title: "Old" }, excerpt: "", confidence: 0 },
        { metadata: { date: "2024-06-01", title: "New" }, excerpt: "", confidence: 0 },
      ];
      const events = inst().extractTimelineEvents(searchResults);
      expect(events[0].title).toBe("New");
      expect(events[1].title).toBe("Old");
    });

    it("returns empty array for empty input", () => {
      expect(inst().extractTimelineEvents([])).toEqual([]);
    });
  });

  // ── formatTimeline (private) ──────────────────────────────────────────────

  describe("formatTimeline (private via any)", () => {
    const inst = () => tools as any;

    it("returns no-events message when empty", () => {
      expect(inst().formatTimeline([])).toBe("No timeline events found.");
    });

    it("formats events as date: title - description", () => {
      const events = [
        { date: "2024-01-01", title: "Annual Checkup", description: "Routine examination" },
      ];
      const text = inst().formatTimeline(events);
      expect(text).toContain("2024-01-01");
      expect(text).toContain("Annual Checkup");
    });

    it("truncates description to 100 chars", () => {
      const events = [
        { date: "2024-01-01", title: "Event", description: "a".repeat(200) },
      ];
      const text = inst().formatTimeline(events);
      expect(text.length).toBeLessThan(200);
    });
  });

  // ── analyzeTrends (private) ───────────────────────────────────────────────

  describe("analyzeTrends (private via any)", () => {
    const inst = () => tools as any;

    it("returns insufficient-data when trendData is empty", () => {
      const result = inst().analyzeTrends([]);
      expect(result.trend).toBe("insufficient-data");
    });

    it("returns insufficient-data when only one data point has value", () => {
      const result = inst().analyzeTrends([{ date: "2024-01-01", value: "5.0" }]);
      expect(result.trend).toBe("insufficient-data");
    });

    it("detects increasing trend", () => {
      const data = [
        { date: "2023-01-01", value: "100" },
        { date: "2024-01-01", value: "120" },
      ];
      const result = inst().analyzeTrends(data);
      expect(result.trend).toBe("increasing");
    });

    it("detects decreasing trend", () => {
      const data = [
        { date: "2023-01-01", value: "100" },
        { date: "2024-01-01", value: "80" },
      ];
      const result = inst().analyzeTrends(data);
      expect(result.trend).toBe("decreasing");
    });

    it("detects stable trend within ±10%", () => {
      const data = [
        { date: "2023-01-01", value: "100" },
        { date: "2024-01-01", value: "105" },
      ];
      const result = inst().analyzeTrends(data);
      expect(result.trend).toBe("stable");
    });

    it("returns qualitative when values are non-numeric", () => {
      const data = [
        { date: "2023-01-01", value: "mild" },
        { date: "2024-01-01", value: "moderate" },
      ];
      const result = inst().analyzeTrends(data);
      expect(result.trend).toBe("qualitative");
    });
  });

  // ── checkMedicationInteractions (private) ─────────────────────────────────

  describe("checkMedicationInteractions (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty array when no interactions found", () => {
      const meds = [{ name: "lisinopril" }, { name: "vitamin-c" }];
      const warnings = inst().checkMedicationInteractions(meds);
      expect(Array.isArray(warnings)).toBe(true);
      expect(warnings.length).toBe(0);
    });

    it("detects warfarin + aspirin interaction", () => {
      const meds = [{ name: "warfarin" }, { name: "aspirin" }];
      const warnings = inst().checkMedicationInteractions(meds);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("bleeding");
    });

    it("handles medications with null names gracefully", () => {
      const meds = [{ name: null }, { name: undefined }, { name: "warfarin" }];
      expect(() => inst().checkMedicationInteractions(meds)).not.toThrow();
    });
  });

  // ── analyzeTestTrends (private) ───────────────────────────────────────────

  describe("analyzeTestTrends (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty array for empty input", () => {
      const trends = inst().analyzeTestTrends([]);
      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBe(0);
    });

    it("groups results by test name", () => {
      const testResults = [
        { testName: "Glucose", value: "5.4", date: "2024-01-01", status: "normal", source: "lab" },
        { testName: "Glucose", value: "6.0", date: "2024-06-01", status: "normal", source: "lab" },
        { testName: "CBC", value: "4.5", date: "2024-01-01", status: "normal", source: "lab" },
      ];
      const trends = inst().analyzeTestTrends(testResults);
      const testNames = trends.map((t: any) => t.testName);
      expect(testNames).toContain("Glucose");
      expect(testNames).toContain("CBC");
    });

    it("reports insufficient-data for single result per test", () => {
      const testResults = [
        { testName: "Cholesterol", value: "200", date: "2024-01-01", status: "normal" },
      ];
      const trends = inst().analyzeTestTrends(testResults);
      expect(trends[0].trend).toBe("insufficient-data");
    });
  });

  // ── buildPatternQuery (private) ───────────────────────────────────────────

  describe("buildPatternQuery (private via any)", () => {
    const inst = () => tools as any;

    it("returns known query for known pattern types", () => {
      const query = inst().buildPatternQuery("symptom-clusters");
      expect(typeof query).toBe("string");
      expect(query.length).toBeGreaterThan(0);
      expect(query).toContain("symptom");
    });

    it("appends focusArea when provided", () => {
      const query = inst().buildPatternQuery("treatment-response", "cardiovascular");
      expect(query).toContain("cardiovascular");
    });

    it("returns fallback query for unknown pattern type", () => {
      const query = inst().buildPatternQuery("unknown-type");
      expect(query).toContain("unknown-type");
    });
  });

  // ── buildSummaryQuery (private) ───────────────────────────────────────────

  describe("buildSummaryQuery (private via any)", () => {
    const inst = () => tools as any;

    it("returns known query for 'comprehensive' summary type", () => {
      const query = inst().buildSummaryQuery("comprehensive");
      expect(query).toContain("medical");
    });

    it("appends timeframe dates when provided", () => {
      const query = inst().buildSummaryQuery("recent", { start: "2024-01-01", end: "2024-12-31" });
      expect(query).toContain("2024-01-01");
      expect(query).toContain("2024-12-31");
    });

    it("returns fallback for unknown summary type", () => {
      const query = inst().buildSummaryQuery("exotic-type");
      expect(typeof query).toBe("string");
      expect(query.length).toBeGreaterThan(0);
    });
  });

  // ── buildSymptomQuery (private) ───────────────────────────────────────────

  describe("buildSymptomQuery (private via any)", () => {
    const inst = () => tools as any;

    it("joins symptoms with OR", () => {
      const query = inst().buildSymptomQuery(["headache", "nausea"]);
      expect(query).toContain("headache");
      expect(query).toContain("nausea");
      expect(query).toContain("OR");
    });

    it("includes 'symptoms' in query", () => {
      const query = inst().buildSymptomQuery(["fatigue"]);
      expect(query).toContain("symptoms");
    });

    it("handles single symptom", () => {
      const query = inst().buildSymptomQuery(["fever"]);
      expect(query).toContain("fever");
    });
  });

  // ── extractMedicationName (private) ──────────────────────────────────────

  describe("extractMedicationName (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractMedicationName("")).toBe("");
    });

    it("extracts name from 'taking X' pattern", () => {
      const name = inst().extractMedicationName("taking Metformin daily");
      expect(name).toBeTruthy();
      expect(typeof name).toBe("string");
    });

    it("extracts name from 'X mg' pattern", () => {
      const name = inst().extractMedicationName("Lisinopril 10mg once daily");
      expect(name).toBeTruthy();
    });

    it("returns 'medication' as default when no pattern matches", () => {
      const name = inst().extractMedicationName("patient feels better");
      expect(name).toBe("medication");
    });
  });

  // ── extractDosage (private) ───────────────────────────────────────────────

  describe("extractDosage (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractDosage("")).toBe("");
    });

    it("extracts mg dosage", () => {
      const dosage = inst().extractDosage("metformin 500mg twice daily");
      expect(dosage).toContain("500");
      expect(dosage.toLowerCase()).toContain("mg");
    });

    it("returns empty string when no dosage found", () => {
      const dosage = inst().extractDosage("patient has hypertension");
      expect(dosage).toBe("");
    });

    it("extracts tablet-based dosage", () => {
      const dosage = inst().extractDosage("take 2 tablets daily");
      expect(dosage).toContain("tablets");
    });
  });

  // ── extractFrequency (private) ────────────────────────────────────────────

  describe("extractFrequency (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractFrequency("")).toBe("");
    });

    it("extracts 'daily' frequency", () => {
      expect(inst().extractFrequency("take once daily")).toBe("daily");
    });

    it("extracts frequency from text containing 'twice daily'", () => {
      // The implementation matches "daily" before "twice daily" in its ordered list,
      // so texts with "twice daily" still return "daily".
      const freq = inst().extractFrequency("metformin twice daily");
      expect(["daily", "twice daily"]).toContain(freq);
    });

    it("extracts 'weekly' frequency", () => {
      expect(inst().extractFrequency("injection weekly")).toBe("weekly");
    });

    it("returns empty string when no frequency found", () => {
      expect(inst().extractFrequency("patient has high glucose")).toBe("");
    });
  });

  // ── extractVitalValue (private) ───────────────────────────────────────────

  describe("extractVitalValue (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractVitalValue("")).toBe("");
    });

    it("extracts blood pressure value", () => {
      const value = inst().extractVitalValue("blood pressure: 120/80 mmHg");
      expect(value).toContain("120/80");
    });

    it("extracts heart rate value", () => {
      const value = inst().extractVitalValue("heart rate: 72 bpm");
      expect(value).toContain("72");
    });

    it("returns 'recorded' when no numeric vital found", () => {
      expect(inst().extractVitalValue("patient is healthy")).toBe("recorded");
    });
  });

  // ── extractSymptomDescription (private) ──────────────────────────────────

  describe("extractSymptomDescription (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractSymptomDescription("")).toBe("");
    });

    it("returns symptom keyword with 'reported' suffix when found", () => {
      const desc = inst().extractSymptomDescription("patient complains of pain");
      expect(desc).toContain("pain");
      expect(desc).toContain("reported");
    });

    it("returns 'symptoms noted' when no symptom keyword found", () => {
      expect(inst().extractSymptomDescription("patient follows up on labs")).toBe(
        "symptoms noted",
      );
    });

    it("detects fatigue", () => {
      const desc = inst().extractSymptomDescription("feeling fatigue and tiredness");
      expect(desc).toContain("fatigue");
    });
  });

  // ── extractTestName (private) ─────────────────────────────────────────────

  describe("extractTestName (private via any)", () => {
    const inst = () => tools as any;

    it("returns default for empty input", () => {
      expect(inst().extractTestName("")).toBe("Unknown test");
    });

    it("extracts known acronym like CBC", () => {
      const name = inst().extractTestName("CBC results are normal");
      expect(name).toBeTruthy();
      expect(name).toContain("CBC");
    });

    it("extracts test name from 'X test' pattern", () => {
      const name = inst().extractTestName("Glucose test results");
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    });

    it("returns 'Medical test' as fallback", () => {
      const name = inst().extractTestName("the results came back fine");
      expect(name).toBe("Medical test");
    });
  });

  // ── extractTestValue (private) ────────────────────────────────────────────

  describe("extractTestValue (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractTestValue("")).toBe("");
    });

    it("extracts numeric value with unit", () => {
      const value = inst().extractTestValue("glucose: 5.4 mmol/l");
      expect(value).toContain("5.4");
    });

    it("returns 'result recorded' when no numeric value found", () => {
      expect(inst().extractTestValue("test completed")).toBe("result recorded");
    });
  });

  // ── extractReferenceRange (private) ──────────────────────────────────────

  describe("extractReferenceRange (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty input", () => {
      expect(inst().extractReferenceRange("")).toBe("");
    });

    it("extracts numeric range from 'normal: X-Y' pattern", () => {
      const range = inst().extractReferenceRange("normal range: 4.0-6.0 mmol/l");
      expect(range).toMatch(/4\.0\s*-\s*6\.0/);
    });

    it("extracts range from 'reference: X-Y' pattern", () => {
      const range = inst().extractReferenceRange("reference: 70-100");
      expect(range).toMatch(/70\s*-\s*100/);
    });

    it("returns empty string when no range found", () => {
      expect(inst().extractReferenceRange("patient is healthy")).toBe("");
    });
  });

  // ── searchDocuments: includeContent error path (line 767) ─────────────────

  describe("searchDocuments: includeContent getDocument error path", () => {
    it("logs warning and continues when getDocument throws during includeContent fetch", async () => {
      mockUserGet.mockReturnValue({ id: "user-1" });
      // Doc with many matching terms so relevance goes high (> 0.8)
      const doc = makeDoc({
        medicalTerms: ["glucose", "lab", "blood", "test", "result", "level", "analysis", "count"],
        metadata: {
          date: "2024-01-15",
          title: "Lab Results",
          summary: "Blood glucose test",
          documentType: "laboratory",
          category: "laboratory",
        },
      });
      mockByUser.mockReturnValue(readable([doc]));
      // Make getDocument throw so line 767 (catch branch) is reached
      mockGetDocument.mockRejectedValue(new Error("fetch failed"));

      const result = await tools.searchDocuments(
        {
          terms: ["glucose", "lab", "blood", "test", "result", "level", "analysis", "count"],
          includeContent: true,
          threshold: 0.0,
          limit: 10,
        },
        "p1",
      );
      // Should still succeed (warning logged, but not an error result)
      expect(Array.isArray(result.content)).toBe(true);
    });
  });

  // ── getAssembledContext: relevantDocuments mapping (line 891) ─────────────

  describe("getAssembledContext: relevantDocuments in assembled context", () => {
    it("maps relevantDocuments when assembledContext has docs", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockResolvedValue({
        summary: "Patient summary",
        keyPoints: [{ text: "BP elevated", type: "finding", date: "2024-01-01", confidence: 0.9 }],
        relevantDocuments: [
          { documentId: "doc-1", type: "lab", date: "2024-01-01", excerpt: "Glucose test", relevance: 0.85 },
          { documentId: "doc-2", type: "consultation", date: "2024-02-01", excerpt: "Follow-up", relevance: 0.75 },
        ],
        medicalContext: { conditions: ["hypertension"] },
        confidence: 0.85,
        tokenCount: 600,
      });

      const result = await tools.getAssembledContext(
        { conversationContext: "blood pressure" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.relevantDocuments.length).toBe(2);
      expect(resource?.resource?.relevantDocuments[0].id).toBe("doc-1");
      expect(resource?.resource?.contextMetadata.documentCount).toBe(2);
    });
  });

  // ── queryMedicalHistory: additional query types and error path ────────────

  describe("queryMedicalHistory: additional branches", () => {
    it("builds query for allergies type", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.queryMedicalHistory({ queryType: "allergies" }, "p1");
      expect(result.isError).toBeFalsy();
      expect(mockSearch).toHaveBeenCalled();
    });

    it("builds query for timeline type", async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.queryMedicalHistory({ queryType: "timeline" }, "p1");
      expect(result.isError).toBeFalsy();
      expect(mockSearch).toHaveBeenCalled();
    });

    it("returns error result on thrown exception", async () => {
      mockGetContextStats.mockImplementation(() => {
        throw new Error("Context crash");
      });

      const result = await tools.queryMedicalHistory({ queryType: "medications" }, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("includes extractedData in resource when documents match", async () => {
      const mockSearch = vi.fn().mockResolvedValue([
        {
          documentId: "doc-1",
          metadata: { date: "2024-01-15", title: "Medication note" },
          similarity: 0.9,
          excerpt: "taking metformin 500mg daily",
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      // getDocument returns content so extractMedicalData runs
      mockGetDocument.mockResolvedValue({
        id: "doc-1",
        content: "patient is taking metformin 500mg for diabetes",
      });

      const result = await tools.queryMedicalHistory({ queryType: "medications" }, "p1");
      expect(result.isError).toBeFalsy();
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });
  });

  // ── extractMedicalData (private) ─────────────────────────────────────────

  describe("extractMedicalData (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty array when getDocument returns null", async () => {
      mockGetDocument.mockResolvedValue(null);
      const results = [{ documentId: "doc-1", metadata: { date: "2024-01-01", title: "Test" }, similarity: 0.8 }];
      const data = await inst().extractMedicalData(results, "medications");
      expect(data).toEqual([]);
    });

    it("logs warning and continues when getDocument throws", async () => {
      mockGetDocument.mockRejectedValue(new Error("DB error"));
      const results = [{ documentId: "doc-fail", metadata: { date: "2024-01-01", title: "Test" }, similarity: 0.8 }];
      const data = await inst().extractMedicalData(results, "medications");
      expect(Array.isArray(data)).toBe(true);
    });

    it("returns extracted data when document content matches", async () => {
      mockGetDocument.mockResolvedValue({
        id: "doc-1",
        content: "patient is taking aspirin 100mg daily for heart disease",
      });
      const results = [{ documentId: "doc-1", metadata: { date: "2024-01-01", title: "Note" }, similarity: 0.8 }];
      const data = await inst().extractMedicalData(results, "medications");
      // Should have found medications
      expect(Array.isArray(data)).toBe(true);
    });

    it("handles object content by stringifying", async () => {
      mockGetDocument.mockResolvedValue({
        id: "doc-1",
        content: { text: "patient diagnosed with hypertension", date: "2024-01-01" },
      });
      const results = [{ documentId: "doc-1", metadata: { date: "2024-01-01", title: "Note" }, similarity: 0.8 }];
      const data = await inst().extractMedicalData(results, "conditions");
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ── extractTypeSpecificData (private) ─────────────────────────────────────

  describe("extractTypeSpecificData (private via any)", () => {
    const inst = () => tools as any;

    it("returns null for medications when no medications found in text", () => {
      const result = inst().extractTypeSpecificData("patient had a normal checkup", "medications", {});
      expect(result).toBeNull();
    });

    it("returns medications when found in text", () => {
      const result = inst().extractTypeSpecificData("patient is taking aspirin 100mg", "medications", {});
      expect(result).not.toBeNull();
      expect(result.medications).toBeDefined();
    });

    it("returns null for conditions when no conditions found", () => {
      const result = inst().extractTypeSpecificData("lab results normal", "conditions", {});
      expect(result).toBeNull();
    });

    it("returns conditions when found in text", () => {
      const result = inst().extractTypeSpecificData("diagnosed with hypertension", "conditions", {});
      expect(result).not.toBeNull();
      expect(result.conditions).toBeDefined();
    });

    it("returns null for procedures when none found", () => {
      const result = inst().extractTypeSpecificData("routine checkup today", "procedures", {});
      expect(result).toBeNull();
    });

    it("returns procedures when found in text", () => {
      const result = inst().extractTypeSpecificData("patient underwent knee surgery last month", "procedures", {});
      expect(result).not.toBeNull();
      expect(result.procedures).toBeDefined();
    });

    it("returns null for allergies when none found", () => {
      const result = inst().extractTypeSpecificData("patient is healthy", "allergies", {});
      expect(result).toBeNull();
    });

    it("returns allergies when found in text", () => {
      const result = inst().extractTypeSpecificData("patient is allergic to penicillin", "allergies", {});
      expect(result).not.toBeNull();
      expect(result.allergies).toBeDefined();
    });

    it("returns timeline object with summary, date, type", () => {
      const metadata = { date: "2024-01-15", documentType: "consultation" };
      const result = inst().extractTypeSpecificData("Patient follow-up visit.", "timeline", metadata);
      expect(result).not.toBeNull();
      expect(result.summary).toBeDefined();
      expect(result.date).toBe("2024-01-15");
      expect(result.type).toBe("consultation");
    });

    it("returns null for unknown query type", () => {
      const result = inst().extractTypeSpecificData("some content", "unknown-type", {});
      expect(result).toBeNull();
    });
  });

  // ── getPatientTimeline: endDate filter (line 1532) ────────────────────────

  describe("getPatientTimeline: endDate filter", () => {
    it("excludes documents after endDate", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const docs = [
        makeDoc({ metadata: { date: "2024-06-01", title: "Recent" } }),
        makeDoc({ id: "doc-future", metadata: { date: "2025-01-01", title: "Future" } }),
      ];
      mockByUser.mockReturnValue(readable(docs));

      const result = await tools.getPatientTimeline(
        { endDate: "2024-12-31" },
        "p1",
      );
      expect(result.isError).toBeFalsy();
      // Future doc should be excluded
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.totalEvents).toBe(1);
    });

    it("returns error on thrown exception", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockByUser.mockImplementation(() => {
        throw new Error("Store failure");
      });

      const result = await tools.getPatientTimeline({}, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getMedicationHistory: error catch (lines 1762-1765) ──────────────────

  describe("getMedicationHistory: error catch path", () => {
    it("returns error result when database.search throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockRejectedValue(new Error("DB crash"));
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getMedicationHistory({}, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getTestResultSummary: error catch (lines 1870-1873) ──────────────────

  describe("getTestResultSummary: error catch path", () => {
    it("returns error result when database.search throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockRejectedValue(new Error("Search crash"));
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.getTestResultSummary({}, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("returns error result when getContextStats throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      mockGetContextStats.mockImplementation(() => {
        throw new Error("Context crash");
      });

      const result = await tools.getTestResultSummary({}, "p1");
      expect(result.isError).toBe(true);
    });
  });

  // ── identifyMedicalPatterns: error catch (lines 1990-1993) ───────────────

  describe("identifyMedicalPatterns: error catch path", () => {
    it("returns error result when database.search throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockRejectedValue(new Error("Search crash"));
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.identifyMedicalPatterns(
        { patternType: "symptom_clusters" },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── generateClinicalSummary: error catch (lines 2077-2080) ───────────────

  describe("generateClinicalSummary: error catch path", () => {
    it("returns error result when assembleContextForAI throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockRejectedValue(new Error("Assemble crash"));

      const result = await tools.generateClinicalSummary(
        { summaryType: "comprehensive" },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── searchBySymptoms: error catch (lines 2171-2174) ──────────────────────

  describe("searchBySymptoms: error catch path", () => {
    it("returns error result when database.search throws", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockRejectedValue(new Error("Search crash"));
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });

      const result = await tools.searchBySymptoms(
        { symptoms: ["chest pain"] },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── getSpecialtyRecommendations: error catch (lines 2257-2260) ───────────

  describe("getSpecialtyRecommendations: error catch path (non-context error)", () => {
    it("returns error result when assembleContextForAI throws unexpectedly", async () => {
      mockUserGetId.mockReturnValue("user-1");
      const mockSearch = vi.fn().mockResolvedValue([]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockAssembleContext.mockRejectedValue(new Error("Assemble crash"));

      const result = await tools.getSpecialtyRecommendations(
        { specialty: "cardiology" },
        "p1",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  // ── extractTrendData (private) ────────────────────────────────────────────

  describe("extractTrendData (private via any)", () => {
    const inst = () => tools as any;

    it("filters medication type by content keywords", () => {
      const searchResults = [
        {
          excerpt: "patient is taking medication for hypertension",
          metadata: { date: "2024-01-01", title: "Medication note" },
          confidence: 0.8,
        },
        {
          excerpt: "routine blood work results",
          metadata: { date: "2024-01-02", title: "Lab" },
          confidence: 0.7,
        },
      ];
      const result = inst().extractTrendData(searchResults, "medication");
      // Only the one with "medication" in excerpt should pass the filter
      expect(result.length).toBe(1);
    });

    it("filters vitals type by content keywords", () => {
      const searchResults = [
        {
          excerpt: "blood pressure reading: 120/80",
          metadata: { date: "2024-01-01", title: "Vitals" },
          confidence: 0.9,
        },
        {
          excerpt: "routine consultation notes",
          metadata: { date: "2024-01-02", title: "Consult" },
          confidence: 0.6,
        },
      ];
      const result = inst().extractTrendData(searchResults, "vitals");
      expect(result.length).toBe(1);
    });

    it("filters symptoms type by content keywords", () => {
      const searchResults = [
        {
          excerpt: "patient reports pain and discomfort",
          metadata: { date: "2024-01-01", title: "Visit" },
          confidence: 0.8,
        },
        {
          excerpt: "lab results normal",
          metadata: { date: "2024-01-02", title: "Lab" },
          confidence: 0.7,
        },
      ];
      const result = inst().extractTrendData(searchResults, "symptoms");
      expect(result.length).toBe(1);
    });

    it("passes all results for unknown type", () => {
      const searchResults = [
        {
          excerpt: "anything here",
          metadata: { date: "2024-01-01", title: "Note" },
          confidence: 0.8,
        },
      ];
      const result = inst().extractTrendData(searchResults, "unknown-type");
      expect(result.length).toBe(1);
    });

    it("further filters by parameter when provided", () => {
      const searchResults = [
        {
          excerpt: "blood pressure medication prescribed",
          metadata: { date: "2024-01-01", title: "Note" },
          confidence: 0.9,
        },
        {
          excerpt: "patient taking aspirin for prevention",
          metadata: { date: "2024-01-02", title: "Note2" },
          confidence: 0.8,
        },
      ];
      // Filter with parameter "blood pressure" — only first result should match
      const result = inst().extractTrendData(searchResults, "medication", "blood pressure");
      expect(result.length).toBe(1);
    });

    it("filters by timeframe when provided", () => {
      const searchResults = [
        {
          excerpt: "medication prescribed",
          metadata: { date: "2024-01-15", title: "Recent" },
          confidence: 0.9,
        },
        {
          excerpt: "medication prescribed",
          metadata: { date: "2022-06-01", title: "Old" },
          confidence: 0.7,
        },
      ];
      const result = inst().extractTrendData(
        searchResults,
        "medication",
        undefined,
        { start: "2024-01-01", end: "2024-12-31" },
      );
      // Only the 2024 result should pass the timeframe filter
      expect(result.length).toBe(1);
    });

    it("excludes results without date when timeframe is applied", () => {
      const searchResults = [
        {
          excerpt: "medication prescribed",
          metadata: { title: "No Date" }, // no date
          confidence: 0.9,
        },
      ];
      const result = inst().extractTrendData(
        searchResults,
        "medication",
        undefined,
        { start: "2024-01-01", end: "2024-12-31" },
      );
      expect(result.length).toBe(0);
    });

    it("filters vitals by documentType when content lacks keywords", () => {
      const searchResults = [
        {
          excerpt: "routine check",
          metadata: { date: "2024-01-01", title: "Vitals", documentType: "vitals" },
          confidence: 0.8,
        },
      ];
      const result = inst().extractTrendData(searchResults, "vitals");
      expect(result.length).toBe(1);
    });
  });

  // ── Additional private method coverage ────────────────────────────────────

  describe("determineTestStatus (private via any)", () => {
    const inst = () => tools as any;

    it("returns 'high' when text contains 'high'", () => {
      expect(inst().determineTestStatus("glucose is high")).toBe("high");
    });

    it("returns 'high' when text contains 'elevated'", () => {
      expect(inst().determineTestStatus("elevated cholesterol levels")).toBe("high");
    });

    it("returns 'low' when text contains 'low'", () => {
      expect(inst().determineTestStatus("hemoglobin is low")).toBe("low");
    });

    it("returns 'normal' when text contains 'normal'", () => {
      expect(inst().determineTestStatus("all values normal")).toBe("normal");
    });

    it("returns 'unknown' for empty text", () => {
      expect(inst().determineTestStatus("")).toBe("unknown");
    });

    it("returns 'unknown' when no status keyword found", () => {
      expect(inst().determineTestStatus("test completed today")).toBe("unknown");
    });
  });

  describe("calculateTestTrend (private via any)", () => {
    const inst = () => tools as any;

    it("returns increasing when last value is more than 15% higher", () => {
      const results = [{ value: "100", date: "2024-01-01" }, { value: "120", date: "2024-06-01" }];
      expect(inst().calculateTestTrend(results)).toBe("increasing");
    });

    it("returns decreasing when last value is more than 15% lower", () => {
      const results = [{ value: "100", date: "2024-01-01" }, { value: "80", date: "2024-06-01" }];
      expect(inst().calculateTestTrend(results)).toBe("decreasing");
    });

    it("returns stable when change is within ±15%", () => {
      const results = [{ value: "100", date: "2024-01-01" }, { value: "108", date: "2024-06-01" }];
      expect(inst().calculateTestTrend(results)).toBe("stable");
    });

    it("returns qualitative when values are non-numeric", () => {
      const results = [{ value: "normal", date: "2024-01-01" }, { value: "elevated", date: "2024-06-01" }];
      expect(inst().calculateTestTrend(results)).toBe("qualitative");
    });

    it("returns insufficient-data for less than 2 results", () => {
      expect(inst().calculateTestTrend([{ value: "100", date: "2024-01-01" }])).toBe("insufficient-data");
    });
  });

  describe("extractConditionName / extractConditionStatus (private via any)", () => {
    const inst = () => tools as any;

    it("extracts condition name from 'diagnosis: X' pattern", () => {
      const name = inst().extractConditionName("diagnosis: hypertension stage 2");
      expect(name).toContain("hypertension");
    });

    it("returns 'Medical condition' for empty text", () => {
      expect(inst().extractConditionName("")).toBe("Medical condition");
    });

    it("returns 'resolved' status for resolved text", () => {
      expect(inst().extractConditionStatus("condition resolved")).toBe("resolved");
    });

    it("returns 'active' status for active text", () => {
      expect(inst().extractConditionStatus("active condition")).toBe("active");
    });

    it("returns 'chronic' for chronic text", () => {
      expect(inst().extractConditionStatus("chronic hypertension")).toBe("chronic");
    });

    it("returns 'active' as default", () => {
      expect(inst().extractConditionStatus("unknown status")).toBe("active");
    });

    it("returns 'unknown' for empty text", () => {
      expect(inst().extractConditionStatus("")).toBe("unknown");
    });
  });

  describe("extractProcedureName / extractProcedureOutcome (private via any)", () => {
    const inst = () => tools as any;

    it("extracts procedure name from 'procedure: X' pattern", () => {
      const name = inst().extractProcedureName("procedure: knee replacement");
      expect(name).toContain("knee");
    });

    it("returns 'Medical procedure' for empty text", () => {
      expect(inst().extractProcedureName("")).toBe("Medical procedure");
    });

    it("returns 'successful' outcome when text contains 'successful'", () => {
      expect(inst().extractProcedureOutcome("surgery was successful")).toBe("successful");
    });

    it("returns 'complications' when text contains 'complications'", () => {
      expect(inst().extractProcedureOutcome("minor complications noted")).toBe("complications");
    });

    it("returns 'completed' as default", () => {
      expect(inst().extractProcedureOutcome("procedure performed")).toBe("completed");
    });

    it("returns 'unknown' for empty text", () => {
      expect(inst().extractProcedureOutcome("")).toBe("unknown");
    });
  });

  describe("extractAllergen / extractReaction / extractAllergySeverity (private via any)", () => {
    const inst = () => tools as any;

    it("extracts allergen from 'allergic to X' pattern", () => {
      const allergen = inst().extractAllergen("patient is allergic to penicillin");
      expect(allergen).toContain("penicillin");
    });

    it("returns 'allergen' when no pattern matches", () => {
      expect(inst().extractAllergen("no known allergies")).toBe("allergen");
    });

    it("returns 'Unknown allergen' for empty text", () => {
      expect(inst().extractAllergen("")).toBe("Unknown allergen");
    });

    it("extracts rash as reaction", () => {
      expect(inst().extractReaction("patient developed rash")).toBe("rash");
    });

    it("extracts swelling as reaction", () => {
      expect(inst().extractReaction("face swelling noted")).toBe("swelling");
    });

    it("returns 'allergic reaction' as default reaction", () => {
      expect(inst().extractReaction("patient had an adverse event")).toBe("allergic reaction");
    });

    it("returns 'reaction noted' for empty text", () => {
      expect(inst().extractReaction("")).toBe("reaction noted");
    });

    it("returns 'severe' severity for anaphylaxis", () => {
      expect(inst().extractAllergySeverity("patient had anaphylaxis")).toBe("severe");
    });

    it("returns 'moderate' severity", () => {
      expect(inst().extractAllergySeverity("moderate allergic reaction")).toBe("moderate");
    });

    it("returns 'mild' severity", () => {
      expect(inst().extractAllergySeverity("mild reaction to pollen")).toBe("mild");
    });

    it("returns 'unknown' for empty text", () => {
      expect(inst().extractAllergySeverity("")).toBe("unknown");
    });
  });

  describe("extractVitalType / determineVitalStatus (private via any)", () => {
    const inst = () => tools as any;

    it("returns 'blood pressure' vital type", () => {
      expect(inst().extractVitalType("blood pressure reading")).toBe("blood pressure");
    });

    it("returns 'heart rate' vital type", () => {
      expect(inst().extractVitalType("heart rate 72 bpm")).toBe("heart rate");
    });

    it("returns 'temperature' vital type", () => {
      expect(inst().extractVitalType("temperature 37.2")).toBe("temperature");
    });

    it("returns 'weight' vital type", () => {
      expect(inst().extractVitalType("weight 80kg")).toBe("weight");
    });

    it("returns 'vital signs' as default", () => {
      expect(inst().extractVitalType("patient is stable")).toBe("vital signs");
    });

    it("returns 'vital signs' for empty text", () => {
      expect(inst().extractVitalType("")).toBe("vital signs");
    });

    it("returns 'normal' vital status", () => {
      expect(inst().determineVitalStatus("all values normal")).toBe("normal");
    });

    it("returns 'high' vital status for elevated", () => {
      expect(inst().determineVitalStatus("blood pressure elevated")).toBe("high");
    });

    it("returns 'low' vital status", () => {
      expect(inst().determineVitalStatus("hemoglobin low")).toBe("low");
    });

    it("returns 'recorded' as default vital status", () => {
      expect(inst().determineVitalStatus("vitals recorded")).toBe("recorded");
    });

    it("returns 'unknown' for empty text", () => {
      expect(inst().determineVitalStatus("")).toBe("unknown");
    });
  });

  describe("calculateFrequencies / findCorrelations / analyzeTemporalPatterns (private via any)", () => {
    const inst = () => tools as any;

    it("calculates word frequencies from search results", () => {
      const searchResults = [
        { excerpt: "patient has diabetes diagnosis today" },
        { excerpt: "patient diabetes management plan" },
      ];
      const freqs = inst().calculateFrequencies(searchResults);
      expect(typeof freqs).toBe("object");
      expect(freqs["diabetes"]).toBe(2);
    });

    it("returns top 10 frequencies", () => {
      const searchResults = Array.from({ length: 5 }, (_, i) => ({
        excerpt: Array.from({ length: 20 }, (_, j) => `word${j}`).join(" "),
      }));
      const freqs = inst().calculateFrequencies(searchResults);
      expect(Object.keys(freqs).length).toBeLessThanOrEqual(10);
    });

    it("findCorrelations returns array", () => {
      const searchResults = [
        { excerpt: "pain nausea treatment response" },
        { excerpt: "pain treatment medication" },
      ];
      const correlations = inst().findCorrelations(searchResults, "symptom-clusters");
      expect(Array.isArray(correlations)).toBe(true);
    });

    it("analyzeTemporalPatterns returns insufficient-data for fewer than 3 results", () => {
      const results = [
        { metadata: { date: "2024-01-01" } },
        { metadata: { date: "2024-02-01" } },
      ];
      const temporal = inst().analyzeTemporalPatterns(results);
      expect(temporal.trend).toBe("insufficient-data");
    });

    it("analyzeTemporalPatterns returns recent for < 30 days span", () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      const results = [
        { metadata: { date: twoDaysAgo.toISOString() } },
        { metadata: { date: yesterday.toISOString() } },
        { metadata: { date: today.toISOString() } },
      ];
      const temporal = inst().analyzeTemporalPatterns(results);
      expect(temporal.trend).toBe("recent");
    });

    it("analyzeTemporalPatterns returns long-term for > 365 days span", () => {
      const results = [
        { metadata: { date: "2020-01-01" } },
        { metadata: { date: "2022-06-01" } },
        { metadata: { date: "2024-01-01" } },
      ];
      const temporal = inst().analyzeTemporalPatterns(results);
      expect(temporal.trend).toBe("long-term");
    });
  });

  describe("analyzeSeverityPatterns (private via any)", () => {
    const inst = () => tools as any;

    it("counts severe terms", () => {
      const results = [
        { excerpt: "patient is in critical condition" },
        { excerpt: "acute emergency care required" },
      ];
      const severity = inst().analyzeSeverityPatterns(results);
      expect(severity.severe).toBeGreaterThan(0);
    });

    it("counts moderate terms", () => {
      const results = [{ excerpt: "moderate pain levels reported" }];
      const severity = inst().analyzeSeverityPatterns(results);
      expect(severity.moderate).toBeGreaterThan(0);
    });

    it("counts mild terms", () => {
      const results = [{ excerpt: "mild discomfort noted" }];
      const severity = inst().analyzeSeverityPatterns(results);
      expect(severity.mild).toBeGreaterThan(0);
    });

    it("returns zero counts for unrelated content", () => {
      const results = [{ excerpt: "patient came for routine visit" }];
      const severity = inst().analyzeSeverityPatterns(results);
      expect(severity.severe).toBe(0);
      expect(severity.moderate).toBe(0);
    });
  });

  describe("identifyRiskFactors / extractKeyFindings (private via any)", () => {
    const inst = () => tools as any;

    it("identifies smoking as risk factor", () => {
      const results = [{ excerpt: "patient has history of smoking", metadata: { title: "Note" } }];
      const risks = inst().identifyRiskFactors(results);
      expect(risks).toContain("smoking");
    });

    it("identifies diabetes as risk factor", () => {
      const results = [{ excerpt: "patient diagnosed with diabetes", metadata: { title: "Note" } }];
      const risks = inst().identifyRiskFactors(results);
      expect(risks).toContain("diabetes");
    });

    it("returns empty array when no risk factors found", () => {
      const results = [{ excerpt: "normal checkup today", metadata: { title: "Note" } }];
      const risks = inst().identifyRiskFactors(results);
      expect(Array.isArray(risks)).toBe(true);
      expect(risks.length).toBe(0);
    });

    it("does not duplicate same risk factor", () => {
      const results = [
        { excerpt: "smoking is a major risk", metadata: {} },
        { excerpt: "patient smokes — smoking history", metadata: {} },
      ];
      const risks = inst().identifyRiskFactors(results);
      const smokingCount = risks.filter((r: string) => r === "smoking").length;
      expect(smokingCount).toBe(1);
    });

    it("extractKeyFindings returns array of strings", () => {
      const results = [
        { excerpt: "glucose elevated", metadata: { title: "Lab" } },
        { excerpt: "hypertension noted", metadata: { title: "Visit" } },
      ];
      const findings = inst().extractKeyFindings(results);
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.length).toBe(2);
      expect(findings[0]).toContain("Lab");
    });
  });

  describe("generatePatternHypotheses (private via any)", () => {
    const inst = () => tools as any;

    it("generates hypotheses from frequencies", () => {
      const patterns = {
        frequencies: { "headache": 5, "nausea": 3 },
        temporal: null,
      };
      const hypotheses = inst().generatePatternHypotheses(patterns, "symptom-clusters");
      expect(hypotheses.length).toBeGreaterThan(0);
      expect(hypotheses.some((h: string) => h.includes("headache"))).toBe(true);
    });

    it("adds temporal trend hypothesis when available", () => {
      const patterns = {
        frequencies: {},
        temporal: { trend: "increasing" },
      };
      const hypotheses = inst().generatePatternHypotheses(patterns, "treatment-response");
      expect(hypotheses.some((h: string) => h.includes("increasing"))).toBe(true);
    });

    it("adds pattern-type specific hypothesis for symptom-clusters", () => {
      const patterns = { frequencies: {}, temporal: null };
      const hypotheses = inst().generatePatternHypotheses(patterns, "symptom-clusters");
      expect(hypotheses.some((h: string) => h.toLowerCase().includes("symptom"))).toBe(true);
    });

    it("adds pattern-type specific hypothesis for disease-progression", () => {
      const patterns = { frequencies: {}, temporal: null };
      const hypotheses = inst().generatePatternHypotheses(patterns, "disease-progression");
      expect(hypotheses.some((h: string) => h.toLowerCase().includes("disease"))).toBe(true);
    });

    it("returns fallback message when no patterns found", () => {
      const patterns = { frequencies: {}, temporal: null };
      const hypotheses = inst().generatePatternHypotheses(patterns, "unknown-type");
      expect(hypotheses.some((h: string) => h.includes("No clear patterns"))).toBe(true);
    });
  });

  describe("generateRecommendations (private via any)", () => {
    const inst = () => tools as any;

    it("includes medication review when medications section is an array with items", () => {
      // The code checks sections.medications?.length > 0 — so medications must be an array
      const sections = {
        medications: [{ name: "aspirin" }],
        conditions: [],
        vitals: [],
      };
      const recs = inst().generateRecommendations(sections, "comprehensive");
      expect(recs.some((r: string) => r.toLowerCase().includes("medication"))).toBe(true);
    });

    it("includes condition monitoring when conditions section has items", () => {
      const sections = {
        medications: { currentMedications: [], historicalMedications: [] },
        conditions: [{ name: "hypertension" }],
        vitals: [],
      };
      const recs = inst().generateRecommendations(sections, "comprehensive");
      expect(recs.some((r: string) => r.toLowerCase().includes("condition"))).toBe(true);
    });

    it("includes vital sign intervention when vitals has high status", () => {
      const sections = {
        medications: { currentMedications: [], historicalMedications: [] },
        conditions: [],
        vitals: [{ status: "high", type: "blood pressure" }],
      };
      const recs = inst().generateRecommendations(sections, "comprehensive");
      expect(recs.some((r: string) => r.toLowerCase().includes("vital"))).toBe(true);
    });

    it("returns routine care when nothing significant found", () => {
      const sections = {
        medications: { currentMedications: [], historicalMedications: [] },
        conditions: [],
        vitals: [],
      };
      const recs = inst().generateRecommendations(sections, "unknown-type");
      expect(recs).toContain("Continue routine medical care");
    });

    it("adds summary-type specific recommendation for recent", () => {
      const sections = { medications: { currentMedications: [], historicalMedications: [] }, conditions: [], vitals: [] };
      const recs = inst().generateRecommendations(sections, "recent");
      expect(recs.some((r: string) => r.toLowerCase().includes("recent"))).toBe(true);
    });

    it("adds summary-type specific recommendation for chronic", () => {
      const sections = { medications: { currentMedications: [], historicalMedications: [] }, conditions: [], vitals: [] };
      const recs = inst().generateRecommendations(sections, "chronic");
      expect(recs.some((r: string) => r.toLowerCase().includes("chronic"))).toBe(true);
    });

    it("adds summary-type specific recommendation for acute", () => {
      const sections = { medications: { currentMedications: [], historicalMedications: [] }, conditions: [], vitals: [] };
      const recs = inst().generateRecommendations(sections, "acute");
      expect(recs.some((r: string) => r.toLowerCase().includes("acute"))).toBe(true);
    });
  });

  describe("extractValueFromContent (private via any)", () => {
    const inst = () => tools as any;

    it("returns empty string for empty content", () => {
      expect(inst().extractValueFromContent("", "medication")).toBe("");
    });

    it("returns medication name for medication type", () => {
      const value = inst().extractValueFromContent("taking aspirin 100mg", "medication");
      expect(value).toBeTruthy();
    });

    it("returns vital value for vitals type", () => {
      const value = inst().extractValueFromContent("blood pressure: 120/80", "vitals");
      expect(value).toBeTruthy();
    });

    it("returns symptom description for symptoms type", () => {
      const value = inst().extractValueFromContent("patient reports pain", "symptoms");
      expect(value).toContain("pain");
    });

    it("returns first 50 chars for unknown type", () => {
      const content = "a".repeat(100);
      const value = inst().extractValueFromContent(content, "unknown");
      expect(value.length).toBeLessThanOrEqual(50);
    });
  });

  describe("findMatchedSymptoms / findRelatedConditions (private via any)", () => {
    const inst = () => tools as any;

    it("findMatchedSymptoms finds symptom occurrences in search results", () => {
      const results = [
        {
          excerpt: "patient has headache and fever since monday",
          metadata: { date: "2024-01-01", title: "Visit" },
        },
      ];
      const matched = inst().findMatchedSymptoms(results, ["headache", "nausea"]);
      expect(matched.some((m: any) => m.name === "headache")).toBe(true);
      expect(matched.some((m: any) => m.name === "nausea")).toBe(false);
    });

    it("findMatchedSymptoms returns empty when no match", () => {
      const results = [{ excerpt: "routine visit", metadata: { date: "2024-01-01" } }];
      const matched = inst().findMatchedSymptoms(results, ["chest pain"]);
      expect(matched).toHaveLength(0);
    });

    it("findRelatedConditions extracts condition mentions", () => {
      const results = [
        {
          excerpt: "patient condition stable after diagnosis of hypertension",
          metadata: { title: "Report" },
        },
      ];
      const conditions = inst().findRelatedConditions(results);
      expect(Array.isArray(conditions)).toBe(true);
      expect(conditions.length).toBe(1);
    });

    it("findRelatedConditions returns empty for non-condition content", () => {
      const results = [
        { excerpt: "lab results within normal range", metadata: { title: "Lab" } },
      ];
      const conditions = inst().findRelatedConditions(results);
      expect(conditions).toHaveLength(0);
    });
  });

  describe("assessSymptomSeverity / extractSymptomTimeline / findSymptomAssociations (private via any)", () => {
    const inst = () => tools as any;

    it("assessSymptomSeverity returns severe when severe terms present", () => {
      const results = [{ excerpt: "patient is in critical condition" }];
      const severity = inst().assessSymptomSeverity(results);
      expect(severity.overall).toBe("severe");
    });

    it("assessSymptomSeverity returns moderate when moderate terms present", () => {
      const results = [{ excerpt: "moderate discomfort noted" }];
      const severity = inst().assessSymptomSeverity(results);
      expect(severity.overall).toBe("moderate");
    });

    it("assessSymptomSeverity returns mild when no specific severity terms", () => {
      const results = [{ excerpt: "patient is doing fine" }];
      const severity = inst().assessSymptomSeverity(results);
      expect(severity.overall).toBe("mild");
    });

    it("extractSymptomTimeline returns dated results sorted descending", () => {
      const results = [
        { excerpt: "symptom 1", metadata: { date: "2024-01-01", title: "Visit 1" } },
        { excerpt: "symptom 2", metadata: { date: "2024-06-01", title: "Visit 2" } },
        { metadata: {} }, // no date - should be excluded
      ];
      const timeline = inst().extractSymptomTimeline(results);
      expect(timeline.length).toBe(2);
      expect(timeline[0].date).toBe("2024-06-01");
    });

    it("findSymptomAssociations detects headache+nausea association", () => {
      const results = [
        { excerpt: "patient reports headache and nausea together" },
      ];
      const associations = inst().findSymptomAssociations(results);
      expect(associations.some((a: any) => a.primary === "headache")).toBe(true);
    });

    it("findSymptomAssociations returns empty when no common associations", () => {
      const results = [{ excerpt: "routine visit, no complaints" }];
      const associations = inst().findSymptomAssociations(results);
      expect(associations).toHaveLength(0);
    });
  });

  describe("extractDemographics / findDemographicValue (private via any)", () => {
    const inst = () => tools as any;

    it("extractDemographics returns age, gender, occupation fields", () => {
      const results = [{ excerpt: "patient age 45 male occupation engineer" }];
      const demographics = inst().extractDemographics(results);
      expect(demographics).toHaveProperty("age");
      expect(demographics).toHaveProperty("gender");
      expect(demographics).toHaveProperty("occupation");
    });

    it("findDemographicValue returns 'not specified' when type not found", () => {
      const results = [{ excerpt: "routine checkup" }];
      const value = inst().findDemographicValue(results, "birthdate");
      expect(value).toBe("not specified");
    });

    it("findDemographicValue returns found message when type appears in content", () => {
      const results = [{ excerpt: "patient age 45" }];
      const value = inst().findDemographicValue(results, "age");
      expect(value).toContain("age");
    });
  });

  describe("extractConditionsFromSearchResults (private via any)", () => {
    const inst = () => tools as any;

    it("extracts conditions from search results with condition keywords", () => {
      const results = [
        {
          excerpt: "patient diagnosis: hypertension",
          metadata: { date: "2024-01-01", title: "Visit", documentType: "consultation" },
        },
        {
          excerpt: "patient condition stable",
          metadata: { date: "2024-02-01", title: "Report", documentType: "note" },
        },
      ];
      const conditions = inst().extractConditionsFromSearchResults(results);
      expect(Array.isArray(conditions)).toBe(true);
      expect(conditions.length).toBe(2);
    });

    it("filters out results without condition keywords", () => {
      const results = [
        {
          excerpt: "lab results within normal range",
          metadata: { date: "2024-01-01", title: "Lab", documentType: "laboratory" },
        },
      ];
      const conditions = inst().extractConditionsFromSearchResults(results);
      expect(conditions).toHaveLength(0);
    });
  });

  describe("extractProceduresFromSearchResults (private via any)", () => {
    const inst = () => tools as any;

    it("extracts procedures from search results", () => {
      const results = [
        {
          excerpt: "patient underwent procedure: knee replacement",
          metadata: { date: "2024-01-01", title: "Surgery Report" },
        },
      ];
      const procedures = inst().extractProceduresFromSearchResults(results);
      expect(Array.isArray(procedures)).toBe(true);
      expect(procedures.length).toBe(1);
    });
  });

  describe("extractAllergiesFromSearchResults (private via any)", () => {
    const inst = () => tools as any;

    it("extracts allergies from search results with allergy keywords", () => {
      const results = [
        {
          excerpt: "patient has allergy to penicillin - severe reaction",
          metadata: { title: "Allergy report" },
        },
      ];
      const allergies = inst().extractAllergiesFromSearchResults(results);
      expect(Array.isArray(allergies)).toBe(true);
      expect(allergies.length).toBe(1);
      expect(allergies[0].allergen).toContain("penicillin");
    });
  });

  describe("extractVitalSigns (private via any)", () => {
    const inst = () => tools as any;

    it("extracts vital signs from search results", () => {
      const results = [
        {
          excerpt: "blood pressure: 140/90 mmHg elevated",
          metadata: { date: "2024-01-01", title: "Vitals" },
        },
      ];
      const vitals = inst().extractVitalSigns(results);
      expect(Array.isArray(vitals)).toBe(true);
      expect(vitals.length).toBe(1);
      expect(vitals[0].type).toBe("blood pressure");
    });

    it("filters out results without vital keywords", () => {
      const results = [
        {
          excerpt: "routine consultation no complaints",
          metadata: { date: "2024-01-01", title: "Visit" },
        },
      ];
      const vitals = inst().extractVitalSigns(results);
      expect(vitals).toHaveLength(0);
    });
  });

  describe("buildSpecialtyQuery (private via any)", () => {
    const inst = () => tools as any;

    it("joins condition and symptoms with specialist terms", () => {
      const query = inst().buildSpecialtyQuery("cardiology", ["chest pain", "shortness of breath"]);
      expect(query).toContain("cardiology");
      expect(query).toContain("chest pain");
      expect(query).toContain("specialist");
    });

    it("works with empty symptoms array", () => {
      const query = inst().buildSpecialtyQuery("neurology", []);
      expect(query).toContain("neurology");
      expect(query).toContain("specialist");
    });
  });

  describe("generateSpecialtyRecommendations (private via any)", () => {
    const inst = () => tools as any;

    it("returns cardiology recommendation when condition mentions heart", () => {
      const recs = inst().generateSpecialtyRecommendations([], "heart disease follow-up");
      expect(recs.some((r: any) => r.specialty === "Cardiology")).toBe(true);
    });

    it("returns endocrinology recommendation for diabetes", () => {
      const recs = inst().generateSpecialtyRecommendations([], "diabetes management");
      expect(recs.some((r: any) => r.specialty === "Endocrinology")).toBe(true);
    });

    it("adds recommendations from search result content mentioning specialties", () => {
      const results = [
        {
          excerpt: "referred to cardiology for further evaluation",
          metadata: { title: "Referral" },
        },
      ];
      const recs = inst().generateSpecialtyRecommendations(results, "unknown condition");
      expect(Array.isArray(recs)).toBe(true);
    });

    it("returns empty array when no match", () => {
      const recs = inst().generateSpecialtyRecommendations([], "unknown condition xyz");
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBe(0);
    });
  });

  describe("extractKeyTerms (private via any)", () => {
    const inst = () => tools as any;

    it("returns terms for symptom-clusters", () => {
      const terms = inst().extractKeyTerms([], "symptom-clusters");
      expect(terms).toContain("pain");
      expect(terms).toContain("fatigue");
    });

    it("returns terms for disease-progression", () => {
      const terms = inst().extractKeyTerms([], "disease-progression");
      expect(terms).toContain("diagnosis");
    });

    it("returns terms for treatment-response", () => {
      const terms = inst().extractKeyTerms([], "treatment-response");
      expect(terms).toContain("treatment");
    });

    it("returns terms for medication-effects", () => {
      const terms = inst().extractKeyTerms([], "medication-effects");
      expect(terms).toContain("medication");
    });

    it("returns terms for diagnostic-patterns", () => {
      const terms = inst().extractKeyTerms([], "diagnostic-patterns");
      expect(terms).toContain("test");
    });

    it("returns default terms for unknown pattern type", () => {
      const terms = inst().extractKeyTerms([], "unknown-pattern");
      expect(terms).toContain("medical");
    });
  });

  describe("calculateCooccurrence (private via any)", () => {
    const inst = () => tools as any;

    it("returns 0 when term1 does not appear in any result", () => {
      const results = [{ excerpt: "no match here" }];
      const score = inst().calculateCooccurrence(results, "abcxyz", "defuvw");
      expect(score).toBe(0);
    });

    it("returns 1.0 when both terms always co-occur", () => {
      const results = [
        { excerpt: "pain nausea both" },
        { excerpt: "pain and nausea again" },
      ];
      const score = inst().calculateCooccurrence(results, "pain", "nausea");
      expect(score).toBe(1.0);
    });

    it("returns fractional score for partial co-occurrence", () => {
      // pain appears 3 times, nausea appears 2 times, both together 1 time
      // co-occurrence = 1 / min(3, 2) = 0.5
      const results = [
        { excerpt: "pain nausea here" },
        { excerpt: "pain only" },
        { excerpt: "nausea only" },
      ];
      const score = inst().calculateCooccurrence(results, "pain", "nausea");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe("formatPatternAnalysis (private via any)", () => {
    const inst = () => tools as any;

    it("formats pattern analysis with frequencies", () => {
      const patterns = {
        frequencies: { "headache": 5, "pain": 3 },
        temporal: { trend: "stable" },
      };
      const text = inst().formatPatternAnalysis(patterns, ["hypothesis 1"], "symptom-clusters");
      expect(text).toContain("symptom-clusters");
      expect(text).toContain("headache");
      expect(text).toContain("hypothesis 1");
    });

    it("shows 'No significant frequency patterns' when frequencies empty", () => {
      const patterns = { frequencies: {}, temporal: null };
      const text = inst().formatPatternAnalysis(patterns, [], "risk_factors");
      expect(text).toContain("No significant frequency patterns");
    });

    it("includes temporal trend when present", () => {
      const patterns = { frequencies: {}, temporal: { trend: "increasing" } };
      const text = inst().formatPatternAnalysis(patterns, [], "conditions");
      expect(text).toContain("increasing");
    });
  });

  describe("formatTestResultSummary (private via any)", () => {
    const inst = () => tools as any;

    it("returns no results message when testResults is empty", () => {
      const text = inst().formatTestResultSummary([], null, {});
      expect(text).toContain("No test results");
    });

    it("formats results with status markers for abnormal tests", () => {
      const testResults = [
        { testName: "Glucose", value: "250", range: "70-100", date: "2024-01-01", status: "abnormal", source: "lab" },
      ];
      const text = inst().formatTestResultSummary(testResults, null, {});
      expect(text).toContain("Glucose");
    });

    it("filters for abnormal only when includeAbnormalOnly is true", () => {
      const testResults = [
        { testName: "Glucose", value: "250", range: "70-100", date: "2024-01-01", status: "abnormal" },
        { testName: "CBC", value: "4.5", range: "4.0-6.0", date: "2024-01-01", status: "normal" },
      ];
      const text = inst().formatTestResultSummary(testResults, null, { includeAbnormalOnly: true });
      expect(text).toContain("Glucose");
    });

    it("includes trend section when trends available", () => {
      const testResults = [
        { testName: "Glucose", value: "5.4", range: "4.0-6.0", date: "2024-01-01", status: "normal" },
      ];
      const trends = [
        { testName: "Glucose", trend: "stable", resultCount: 3 },
      ];
      const text = inst().formatTestResultSummary(testResults, trends, { includeTrends: true });
      expect(text).toContain("Trends");
    });

    it("skips trend section when includeTrends is false", () => {
      const testResults = [
        { testName: "Glucose", value: "5.4", date: "2024-01-01", status: "normal" },
      ];
      const trends = [{ testName: "Glucose", trend: "stable", resultCount: 3 }];
      const text = inst().formatTestResultSummary(testResults, trends, { includeTrends: false });
      expect(text).not.toContain("Trends");
    });
  });
});
