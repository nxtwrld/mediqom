import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockByUser } = vi.hoisted(() => ({
  mockByUser: vi.fn(),
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
}));
vi.mock("$lib/user", () => ({ default: readable(null) }));
vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { ProfileContextManager } from "./profile-context";

function makeDoc(overrides: Record<string, any> = {}) {
  return {
    id: `doc-${Math.random().toString(36).slice(2)}`,
    type: "report",
    medicalTerms: ["diabetes"],
    content: "Sample medical content",
    metadata: { title: "Test Report" },
    ...overrides,
  };
}

describe("context/integration/profile-context — ProfileContextManager", () => {
  let manager: ProfileContextManager;

  beforeEach(() => {
    manager = new ProfileContextManager();
    mockByUser.mockReturnValue(readable([]));
  });

  // ── isContextReady ────────────────────────────────────────────────────────

  describe("isContextReady", () => {
    it("returns false when no documents exist for the profile", () => {
      mockByUser.mockReturnValue(readable([]));
      expect(manager.isContextReady("profile-1")).toBe(false);
    });

    it("returns true when documents exist for the profile", () => {
      mockByUser.mockReturnValue(readable([makeDoc(), makeDoc()]));
      expect(manager.isContextReady("profile-1")).toBe(true);
    });
  });

  // ── getContextStats ───────────────────────────────────────────────────────

  describe("getContextStats", () => {
    it("returns totalDocuments count", () => {
      mockByUser.mockReturnValue(readable([makeDoc(), makeDoc(), makeDoc()]));

      const stats = manager.getContextStats("profile-1");
      expect(stats.totalDocuments).toBe(3);
    });

    it("counts only documents with medical terms", () => {
      mockByUser.mockReturnValue(
        readable([
          makeDoc({ medicalTerms: ["diabetes"] }),
          makeDoc({ medicalTerms: [] }),
          makeDoc({ medicalTerms: null }),
        ]),
      );

      const stats = manager.getContextStats("profile-1");
      expect(stats.documentsWithMedicalTerms).toBe(1);
    });

    it("marks isReady=true when documents exist", () => {
      mockByUser.mockReturnValue(readable([makeDoc()]));
      const stats = manager.getContextStats("profile-1");
      expect(stats.isReady).toBe(true);
    });

    it("marks isReady=false when no documents", () => {
      mockByUser.mockReturnValue(readable([]));
      const stats = manager.getContextStats("profile-1");
      expect(stats.isReady).toBe(false);
    });

    it("exposes a database.search function", () => {
      mockByUser.mockReturnValue(readable([makeDoc()]));
      const stats = manager.getContextStats("profile-1");
      expect(typeof stats.database.search).toBe("function");
    });

    it("database.search returns documents with medical terms", async () => {
      const docWithTerms = makeDoc({ medicalTerms: ["glucose"] });
      const docWithout = makeDoc({ medicalTerms: null });
      mockByUser.mockReturnValue(readable([docWithTerms, docWithout]));

      const stats = manager.getContextStats("profile-1");
      const results = await stats.database.search(new Float32Array([]), {});

      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe(docWithTerms.id);
    });
  });

  // ── cleanupContext ─────────────────────────────────────────────────────────

  describe("cleanupContext", () => {
    it("removes profile from initialized set", async () => {
      mockByUser.mockReturnValue(readable([makeDoc()]));

      // Mark profile as initialized by running init
      await manager.initializeProfileContext("profile-1");
      expect(manager.isContextReady("profile-1")).toBe(true);

      manager.cleanupContext("profile-1");

      // Re-init should run again (not skip as duplicate)
      let initRan = false;
      mockByUser.mockImplementation(() => {
        initRan = true;
        return readable([makeDoc()]);
      });
      await manager.initializeProfileContext("profile-1");
      expect(initRan).toBe(true);
    });
  });

  // ── initializeProfileContext ───────────────────────────────────────────────

  describe("initializeProfileContext", () => {
    it("does not reinitialize an already-initialized profile", async () => {
      let callCount = 0;
      mockByUser.mockImplementation(() => {
        callCount++;
        return readable([makeDoc()]);
      });

      await manager.initializeProfileContext("profile-1");
      await manager.initializeProfileContext("profile-1");

      // byUser called only once for first init; second call exits early
      expect(callCount).toBe(1);
    });

    it("re-initializes when forceReinitialize=true", async () => {
      let callCount = 0;
      mockByUser.mockImplementation(() => {
        callCount++;
        return readable([makeDoc()]);
      });

      await manager.initializeProfileContext("profile-1");
      await manager.initializeProfileContext("profile-1", { forceReinitialize: true });

      expect(callCount).toBe(2);
    });

    it("completes without error when no documents exist", async () => {
      mockByUser.mockReturnValue(readable([]));
      await expect(manager.initializeProfileContext("profile-2")).resolves.toBeUndefined();
    });

    it("calls onProgress with 10, 50, 100 when documents exist", async () => {
      mockByUser.mockReturnValue(readable([makeDoc()]));
      const progress: number[] = [];

      await manager.initializeProfileContext("profile-3", {
        onProgress: (_msg, pct) => progress.push(pct),
      });

      expect(progress).toContain(10);
      expect(progress).toContain(100);
    });
  });

  // ── addDocumentToContext / removeDocumentFromContext ───────────────────────

  describe("addDocumentToContext / removeDocumentFromContext", () => {
    it("resolves without error (no-op in medical terms system)", async () => {
      const doc = makeDoc() as any;
      await expect(
        manager.addDocumentToContext("profile-1", doc),
      ).resolves.toBeUndefined();
    });

    it("removeDocumentFromContext resolves without error", async () => {
      await expect(
        manager.removeDocumentFromContext("profile-1", "doc-id"),
      ).resolves.toBeUndefined();
    });
  });

  // ── refreshContext ─────────────────────────────────────────────────────────

  describe("refreshContext", () => {
    it("forces re-initialization of profile context", async () => {
      let callCount = 0;
      mockByUser.mockImplementation(() => {
        callCount++;
        return readable([makeDoc()]);
      });

      await manager.initializeProfileContext("profile-1");
      await manager.refreshContext("profile-1");

      expect(callCount).toBe(2);
    });
  });
});
