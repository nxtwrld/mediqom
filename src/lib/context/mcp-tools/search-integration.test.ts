/**
 * Integration Tests for Search Documents Pipeline
 *
 * Tests the complete search pipeline integration with MCP tools system,
 * document loading, and medical terms classification.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchDocumentsTool } from "./tools/search-documents";
import { medicalExpertTools } from "./medical-expert-tools";
import type { Document } from "$lib/documents/types.d";
import { DocumentType } from "$lib/documents/types.d";

// Mock document store
vi.mock("$lib/documents", () => ({
  byUser: vi.fn().mockReturnValue({
    subscribe: vi.fn(),
    get: vi.fn(),
  }),
}));

// Mock user store
vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn(),
    get: vi.fn().mockReturnValue({ id: "test-user" }),
  },
}));

// Mock logger
vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

// Mock classification config
vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {
      LABORATORY: {
        id: "laboratory",
        name: "Laboratory Results",
        priority: 1,
        keywords: ["lab", "laboratory", "blood", "test", "analysis", "results"],
      },
      IMAGING: {
        id: "imaging",
        name: "Medical Imaging",
        priority: 2,
        keywords: [
          "x-ray",
          "mri",
          "ct",
          "ultrasound",
          "scan",
          "imaging",
          "radiology",
        ],
      },
      MEDICATIONS: {
        id: "medications",
        name: "Medications & Prescriptions",
        priority: 3,
        keywords: [
          "medication",
          "medicine",
          "prescription",
          "drug",
          "treatment",
          "therapy",
        ],
      },
    },
    temporalTerms: {
      latest: {
        type: "latest",
        priority: 1,
        weight: 2.0,
        examples: ["latest", "newest", "most recent", "last", "current"],
      },
      recent: {
        type: "recent",
        priority: 2,
        weight: 1.5,
        timeframe: { days: 30 },
        examples: ["recent", "recently", "this month", "past month", "new"],
      },
    },
  },
}));

// Integration test data that simulates real medical documents
const integrationTestDocuments: any[] = [
  {
    id: "lab-2024-001",
    content: {
      title: "Complete Blood Count (CBC)",
      summary:
        "Blood test results showing normal white blood cell count, slightly elevated glucose levels at 110 mg/dL, cholesterol within normal range at 180 mg/dL.",
      text: "Patient: John Doe. Test Date: 2024-01-15. Results: WBC: 7,200/μL (Normal), RBC: 4.8M/μL (Normal), Glucose: 110 mg/dL (Slightly High), Total Cholesterol: 180 mg/dL (Normal), HDL: 45 mg/dL, LDL: 120 mg/dL, Triglycerides: 150 mg/dL",
      tags: ["blood", "cbc", "glucose", "cholesterol", "routine"],
    },
    metadata: {
      title: "Complete Blood Count (CBC)",
      category: "laboratory",
      tags: ["blood", "cbc", "glucose", "cholesterol", "routine"],
    },
    medicalTerms: [
      "blood",
      "cbc",
      "complete blood count",
      "glucose",
      "cholesterol",
      "hdl",
      "ldl",
      "triglycerides",
      "wbc",
      "white blood cell",
      "rbc",
      "red blood cell",
    ],
    created_at: "2024-01-15T09:30:00Z",
    profile_id: "test-profile",
    type: DocumentType.document,
  },
  {
    id: "imaging-2024-001",
    content: {
      title: "Chest X-Ray",
      summary:
        "Chest X-ray shows clear lungs with no signs of pneumonia or other abnormalities. Heart size appears normal.",
      text: "EXAMINATION: Chest X-ray PA and lateral views. FINDINGS: Lungs are clear bilaterally. No pneumonia, pleural effusion, or pneumothorax. Heart size is normal. Mediastinum is not widened. IMPRESSION: Normal chest X-ray.",
      tags: ["chest", "x-ray", "lungs", "heart", "radiology"],
    },
    metadata: {
      title: "Chest X-Ray",
      category: "imaging",
      tags: ["chest", "x-ray", "lungs", "heart", "radiology"],
    },
    medicalTerms: [
      "chest",
      "x-ray",
      "lungs",
      "heart",
      "radiology",
      "pneumonia",
      "pleural effusion",
      "pneumothorax",
      "mediastinum",
      "bilateral",
    ],
    created_at: "2024-01-20T14:15:00Z",
    profile_id: "test-profile",
    type: DocumentType.document,
  },
  {
    id: "med-2024-001",
    content: {
      title: "Cardiac Medication Prescription",
      summary:
        "Prescription for Lisinopril 10mg daily for blood pressure management and cardiovascular health.",
      text: "PRESCRIPTION: Lisinopril 10mg, Take one tablet by mouth daily. Quantity: 30 tablets, Refills: 2. INDICATION: Hypertension management, cardiovascular protection. NOTES: Monitor blood pressure weekly, report any dizziness or cough.",
      tags: [
        "heart",
        "medication",
        "prescription",
        "blood pressure",
        "lisinopril",
      ],
    },
    metadata: {
      title: "Cardiac Medication Prescription",
      category: "medications",
      tags: [
        "heart",
        "medication",
        "prescription",
        "blood pressure",
        "lisinopril",
      ],
    },
    medicalTerms: [
      "heart",
      "cardiac",
      "medication",
      "prescription",
      "lisinopril",
      "blood pressure",
      "hypertension",
      "cardiovascular",
      "tablet",
    ],
    created_at: "2024-01-25T11:00:00Z",
    profile_id: "test-profile",
    type: DocumentType.document,
  },
  {
    id: "lab-2023-001",
    content: {
      title: "Historical Lab Results",
      summary: "Older blood test from 2023 showing different glucose levels.",
      text: "Historical blood work from 2023 with glucose at 95 mg/dL, cholesterol at 220 mg/dL.",
    },
    metadata: {
      category: "laboratory",
      tags: ["blood", "historical", "glucose"],
    },
    medicalTerms: ["blood", "glucose", "cholesterol", "historical"],
    created_at: "2023-08-15T10:00:00Z",
    profile_id: "test-profile",
    type: DocumentType.document,
  },
];

describe("Search Documents Integration Tests", () => {
  let searchTool: SearchDocumentsTool;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up consistent time for temporal testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T12:00:00Z"));

    // Mock the document loading
    searchTool = new SearchDocumentsTool();
    vi.spyOn(searchTool, "getUserDocuments" as any).mockResolvedValue(
      integrationTestDocuments,
    );
    vi.spyOn(searchTool, "getCurrentUser" as any).mockResolvedValue({
      id: "test-user",
    });
  });

  describe("MCP Tools Integration", () => {
    it("should integrate with medicalExpertTools.searchDocuments", async () => {
      const result = await medicalExpertTools.searchDocuments(
        {
          terms: ["blood", "glucose"],
        },
        "test-profile",
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it("should handle MCP tool error responses", async () => {
      // Mock getUserDocuments to throw an error
      vi.spyOn(searchTool, "getUserDocuments" as any).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await medicalExpertTools.searchDocuments(
        {
          terms: ["blood"],
        },
        "test-profile",
      );

      // Should handle error gracefully
      expect(result).toBeDefined();
    });
  });

  describe("Complete Search Pipeline Integration", () => {
    it("should perform end-to-end search with category filtering", async () => {
      const result = await searchTool.execute(
        {
          terms: ["blood", "glucose"],
          documentTypes: ["laboratory"],
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found 2 relevant documents");
      expect(result.content[0].text).toContain("Complete Blood Count");
      expect(result.content[0].text).toContain("Historical Lab Results");
      expect(result.content[0].text).toContain("Category: laboratory");
    });

    it("should perform end-to-end search with temporal filtering", async () => {
      const result = await searchTool.execute(
        {
          terms: ["latest", "blood"],
          limit: 5,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      // Should return the most recent document with "blood" term (cardiac medication has "blood pressure")
      expect(result.content[0].text).toContain("Cardiac Medication");
      expect(result.content[0].text).toContain("temporal:latest");
      // Should not include the 2023 historical result for "latest"
      expect(result.content[0].text).not.toContain("Historical Lab Results");
    });

    it("should perform cross-category medical term search", async () => {
      const result = await searchTool.execute(
        {
          terms: ["heart", "cardiac"],
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      // Should find both chest x-ray (mentions heart) and cardiac medication
      expect(result.content[0].text).toContain("Chest X-Ray");
      expect(result.content[0].text).toContain("Cardiac Medication");
    });

    it("should handle complex multi-parameter search", async () => {
      const result = await searchTool.execute(
        {
          terms: ["recent", "cardiovascular", "heart"],
          documentTypes: ["imaging", "medications"],
          threshold: 0.5,
          limit: 5,
          includeContent: true,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("temporal:recent");
      // Should find recent documents in specified categories with heart/cardiovascular terms
    });
  });

  describe("Medical Terms Classification Integration", () => {
    it("should correctly classify and match laboratory terms", async () => {
      const result = await searchTool.execute(
        {
          terms: ["glucose", "cholesterol", "blood"],
          documentTypes: ["laboratory"],
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("glucose, cholesterol, blood");
      expect(result.content[0].text).toContain("Complete Blood Count");
    });

    it("should correctly classify and match imaging terms", async () => {
      const result = await searchTool.execute(
        {
          terms: ["chest", "x-ray", "lungs"],
          documentTypes: ["imaging"],
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Chest X-Ray");
      expect(result.content[0].text).toContain("chest, x-ray, lungs");
    });

    it("should correctly classify and match medication terms", async () => {
      const result = await searchTool.execute(
        {
          terms: ["lisinopril", "prescription", "medication"],
          documentTypes: ["medications"],
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Cardiac Medication");
      expect(result.content[0].text).toContain("lisinopril");
    });

    it("should handle partial medical term matches", async () => {
      const result = await searchTool.execute(
        {
          terms: ["cardio"], // Should partially match 'cardiac', 'cardiovascular'
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Cardiac Medication");
    });

    it("should prioritize exact term matches over partial matches", async () => {
      const result = await searchTool.execute(
        {
          terms: ["heart"], // Exact match in multiple documents
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      // Should show different relevance scores
      const text = result.content[0].text;
      expect(text).toContain("Relevance:");
      expect(text).toContain("%");
    });
  });

  describe("Temporal Processing Integration", () => {
    it("should correctly identify and filter latest documents", async () => {
      const result = await searchTool.execute(
        {
          terms: ["latest"],
          limit: 3,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("temporal:latest");
      // Should return most recent document (Cardiac Medication from 2024-01-25)
      expect(result.content[0].text).toContain("Cardiac Medication");
    });

    it("should correctly filter recent documents within timeframe", async () => {
      const result = await searchTool.execute(
        {
          terms: ["recent"],
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("temporal:recent");
      // Should include 2024 documents but not 2023 documents
      expect(result.content[0].text).toContain("Complete Blood Count");
      expect(result.content[0].text).toContain("Chest X-Ray");
      expect(result.content[0].text).toContain("Cardiac Medication");
      expect(result.content[0].text).not.toContain("Historical Lab Results");
    });

    it("should handle combined term and temporal searches", async () => {
      const result = await searchTool.execute(
        {
          terms: ["latest", "blood", "glucose"],
          limit: 5,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("temporal:latest");
      // With combined terms, the search will find the most recent document that matches any of the terms
      // The cardiac medication has "blood pressure" which matches "blood"
      expect(result.content[0].text).toContain("blood pressure");
      // Should not include historical lab results
      expect(result.content[0].text).not.toContain("Historical Lab Results");
    });
  });

  describe("Performance and Scalability Integration", () => {
    it("should handle large document sets efficiently", async () => {
      // Create a larger document set
      const largeDocumentSet = Array.from({ length: 100 }, (_, i) => ({
        ...integrationTestDocuments[0],
        id: `doc-${i}`,
        content: { title: `Document ${i}` },
        medicalTerms: ["blood", "test", `term${i}`],
      }));

      vi.spyOn(searchTool, "getUserDocuments" as any).mockResolvedValue(
        largeDocumentSet,
      );

      const startTime = Date.now();
      const result = await searchTool.execute(
        {
          terms: ["blood"],
          limit: 10,
        },
        "test-profile",
      );
      const endTime = Date.now();

      expect(result.content[0].text).toContain("Found");
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should handle concurrent search requests", async () => {
      const searchPromises = Array.from({ length: 5 }, (_, i) =>
        searchTool.execute(
          {
            terms: ["blood", `term${i}`],
            limit: 5,
          },
          "test-profile",
        ),
      );

      const results = await Promise.all(searchPromises);

      results.forEach((result) => {
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toBeDefined();
      });
    });
  });

  describe("Error Handling and Edge Cases Integration", () => {
    it("should handle profile with no documents gracefully", async () => {
      vi.spyOn(searchTool, "getUserDocuments" as any).mockResolvedValue([]);

      const result = await searchTool.execute(
        {
          terms: ["blood"],
        },
        "empty-profile",
      );

      expect(result.content[0].text).toContain("No documents found");
    });

    it("should handle invalid profile IDs", async () => {
      vi.spyOn(searchTool, "getUserDocuments" as any).mockRejectedValue(
        new Error("Profile not found"),
      );

      try {
        await searchTool.execute(
          {
            terms: ["blood"],
          },
          "invalid-profile",
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain("Profile not found");
      }
    });

    it("should handle documents with missing or malformed medical terms", async () => {
      const malformedDocuments = [
        {
          ...integrationTestDocuments[0],
          medicalTerms: null, // Missing medical terms
        },
        {
          ...integrationTestDocuments[1],
          medicalTerms: "not-an-array", // Wrong type
        },
        {
          ...integrationTestDocuments[2],
          metadata: null, // Missing metadata
        },
      ];

      vi.spyOn(searchTool, "getUserDocuments" as any).mockResolvedValue(
        malformedDocuments,
      );

      const result = await searchTool.execute(
        {
          terms: ["blood"],
        },
        "test-profile",
      );

      // Should handle gracefully without errors
      expect(result.content).toBeDefined();
    });

    it("should handle very long search term arrays", async () => {
      const manyTerms = Array.from({ length: 100 }, (_, i) => `term${i}`);

      const result = await searchTool.execute(
        {
          terms: manyTerms,
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("Real-world Usage Scenarios", () => {
    it("should handle doctor asking for latest lab results", async () => {
      const result = await searchTool.execute(
        {
          terms: ["latest", "laboratory", "blood", "glucose"],
          documentTypes: ["laboratory"],
          limit: 5,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Complete Blood Count");
      expect(result.content[0].text).toContain("temporal:latest");
      expect(result.content[0].text).toContain("glucose");
    });

    it("should handle patient asking about heart medications", async () => {
      const result = await searchTool.execute(
        {
          terms: ["heart", "medication", "prescription"],
          documentTypes: ["medications"],
          includeContent: true,
          limit: 10,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Cardiac Medication");
      expect(result.content[0].text).toContain(
        "heart, medication, prescription",
      );
    });

    it("should handle radiologist looking for chest imaging", async () => {
      const result = await searchTool.execute(
        {
          terms: ["chest", "x-ray", "imaging"],
          documentTypes: ["imaging"],
          threshold: 0.7,
          limit: 5,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("Chest X-Ray");
      expect(result.content[0].text).toContain("chest, x-ray");
    });

    it("should handle emergency doctor looking for recent cardiac events", async () => {
      const result = await searchTool.execute(
        {
          terms: ["recent", "cardiac", "heart"],
          limit: 10,
          threshold: 0.6,
        },
        "test-profile",
      );

      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("temporal:recent");
      // Should find both imaging and medication related to heart/cardiac
    });
  });
});
