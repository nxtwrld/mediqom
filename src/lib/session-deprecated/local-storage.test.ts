import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { logMock } = vi.hoisted(() => {
  const makeNs = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  });
  return {
    logMock: {
      log: {
        storage: makeNs(),
        session: makeNs(),
        audio: makeNs(),
        analysis: makeNs(),
        transcript: makeNs(),
        sse: makeNs(),
        ui: makeNs(),
        api: makeNs(),
        test: makeNs(),
        documents: makeNs(),
        namespace: vi.fn(),
        config: vi.fn(),
        setLevel: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
      },
    },
  };
});

vi.mock("$lib/logging/logger", () => logMock);

// ── localStorage mock ─────────────────────────────────────────────────────────
const mockStorage: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((k: string) => mockStorage[k] ?? null),
  setItem: vi.fn((k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: vi.fn((k: string) => {
    delete mockStorage[k];
  }),
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
  get length() {
    return Object.keys(mockStorage).length;
  },
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }),
};

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  SessionLocalStorage,
  type StoredSessionData,
  type SessionStorageOptions,
} from "./local-storage";

// ── Helpers ───────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "mediqom_session_";
const STORAGE_INDEX_KEY = "mediqom_session_index";

function makeSession(overrides: Partial<StoredSessionData> = {}): StoredSessionData {
  return {
    sessionId: "test-session-1",
    analysisData: {},
    transcripts: [],
    realtimeTranscripts: [],
    texts: [],
    view: "start",
    timestamp: Date.now(),
    lastUpdated: Date.now(),
    models: [],
    language: "en",
    ...overrides,
  };
}

function seedStorage(sessionId: string, data: Partial<StoredSessionData> = {}) {
  const full = makeSession({ sessionId, ...data });
  mockStorage[`${STORAGE_PREFIX}${sessionId}`] = JSON.stringify(full);
  return full;
}

function seedIndex(sessionIds: string[]) {
  mockStorage[STORAGE_INDEX_KEY] = JSON.stringify({
    sessions: sessionIds,
    lastUpdated: Date.now(),
  });
}

function makeBrowserInstance(options: SessionStorageOptions = {}) {
  // Stub browser globals before constructing so isBrowser becomes true
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
  return new SessionLocalStorage(options);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionLocalStorage", () => {
  beforeEach(() => {
    // Clear backing store and reset all mock call counts
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates instance without errors in non-browser environment (default)", () => {
      // No window/localStorage stubs → isBrowser = false
      const instance = new SessionLocalStorage();
      expect(instance).toBeInstanceOf(SessionLocalStorage);
    });

    it("does not call performMaintenanceCleanup when not in browser", () => {
      new SessionLocalStorage({ cleanupOnLoad: true });
      // No localStorage interaction expected
      expect(localStorageMock.getItem).not.toHaveBeenCalled();
    });

    it("creates browser instance and calls performMaintenanceCleanup when cleanupOnLoad is true", () => {
      // Seed index so cleanup has something to iterate
      seedIndex(["s1"]);
      seedStorage("s1");
      makeBrowserInstance({ cleanupOnLoad: true });
      // getItem called at least for the index key during cleanup
      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_INDEX_KEY);
    });

    it("skips maintenance cleanup when cleanupOnLoad is false", () => {
      makeBrowserInstance({ cleanupOnLoad: false });
      expect(localStorageMock.getItem).not.toHaveBeenCalledWith(STORAGE_INDEX_KEY);
    });

    it("sets up window.addEventListener when in browser", () => {
      const windowMock = { addEventListener: vi.fn() };
      vi.stubGlobal("window", windowMock);
      vi.stubGlobal("localStorage", localStorageMock);
      vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
      new SessionLocalStorage({ cleanupOnLoad: false });
      expect(windowMock.addEventListener).toHaveBeenCalledWith(
        "beforeunload",
        expect.any(Function),
      );
    });

    it("merges options with defaults", () => {
      const instance = new SessionLocalStorage({ maxAge: 9999 });
      // Indirectly verify via loadSession expiry check
      expect(instance).toBeInstanceOf(SessionLocalStorage);
    });
  });

  // ── saveSession ─────────────────────────────────────────────────────────────

  describe("saveSession", () => {
    it("logs warning and returns early when not in browser", () => {
      const instance = new SessionLocalStorage();
      instance.saveSession("s1", {});
      expect(logMock.log.storage.warn).toHaveBeenCalledWith(
        expect.stringContaining("not running in browser"),
      );
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("serialises session data to localStorage with correct key", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("abc", { language: "de" });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        `${STORAGE_PREFIX}abc`,
        expect.stringContaining('"sessionId":"abc"'),
      );
    });

    it("fills in defaults for missing fields", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("s2", {});

      const raw = mockStorage[`${STORAGE_PREFIX}s2`];
      const saved = JSON.parse(raw);
      expect(saved.analysisData).toEqual({});
      expect(saved.transcripts).toEqual([]);
      expect(saved.realtimeTranscripts).toEqual([]);
      expect(saved.texts).toEqual([]);
      expect(saved.view).toBe("start");
      expect(saved.models).toEqual([]);
      expect(saved.language).toBe("en");
      expect(typeof saved.timestamp).toBe("number");
      expect(typeof saved.lastUpdated).toBe("number");
    });

    it("preserves provided fields", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("s3", {
        language: "cs",
        view: "analysis",
        transcripts: ["t1", "t2"] as any,
      });

      const saved = JSON.parse(mockStorage[`${STORAGE_PREFIX}s3`]);
      expect(saved.language).toBe("cs");
      expect(saved.view).toBe("analysis");
      expect(saved.transcripts).toEqual(["t1", "t2"]);
    });

    it("updates the session index on save", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("idx-test", {});

      const index = JSON.parse(mockStorage[STORAGE_INDEX_KEY]);
      expect(index.sessions).toContain("idx-test");
    });

    it("does not duplicate sessionId in index on multiple saves", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("dup", {});
      instance.saveSession("dup", {});

      const index = JSON.parse(mockStorage[STORAGE_INDEX_KEY]);
      const count = index.sessions.filter((id: string) => id === "dup").length;
      expect(count).toBe(1);
    });

    it("logs info after successful save", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("s-info", {});
      expect(logMock.log.storage.info).toHaveBeenCalledWith(
        "Session data saved locally",
        expect.objectContaining({ sessionId: "s-info" }),
      );
    });
  });

  // ── loadSession ─────────────────────────────────────────────────────────────

  describe("loadSession", () => {
    it("returns null and logs warning when not in browser", () => {
      const instance = new SessionLocalStorage();
      const result = instance.loadSession("s1");
      expect(result).toBeNull();
      expect(logMock.log.storage.warn).toHaveBeenCalledWith(
        expect.stringContaining("not running in browser"),
      );
    });

    it("returns null when key does not exist in storage", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      const result = instance.loadSession("nonexistent");
      expect(result).toBeNull();
    });

    it("returns parsed session data for a valid non-expired entry", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      const session = seedStorage("valid-session");
      const result = instance.loadSession("valid-session");
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("valid-session");
      expect(result!.language).toBe(session.language);
    });

    it("returns null and removes session when data is expired", () => {
      const instance = makeBrowserInstance({
        cleanupOnLoad: false,
        maxAge: 1000, // 1 second
      });
      seedStorage("old-session", {
        lastUpdated: Date.now() - 5000, // 5 seconds ago
      });
      seedIndex(["old-session"]);

      const result = instance.loadSession("old-session");
      expect(result).toBeNull();
      expect(mockStorage[`${STORAGE_PREFIX}old-session`]).toBeUndefined();
    });

    it("returns null and logs error when stored JSON is invalid", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      mockStorage[`${STORAGE_PREFIX}bad-json`] = "not valid json {{";

      const result = instance.loadSession("bad-json");
      expect(result).toBeNull();
      expect(logMock.log.storage.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load"),
        expect.anything(),
      );
    });

    it("logs info when session is loaded successfully", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("info-test");
      instance.loadSession("info-test");
      expect(logMock.log.storage.info).toHaveBeenCalledWith(
        "Session data loaded from local storage",
        expect.objectContaining({ sessionId: "info-test" }),
      );
    });
  });

  // ── removeSession ──────────────────────────────────────────────────────────

  describe("removeSession", () => {
    it("logs warning and returns early when not in browser", () => {
      const instance = new SessionLocalStorage();
      instance.removeSession("s1");
      expect(logMock.log.storage.warn).toHaveBeenCalledWith(
        expect.stringContaining("not running in browser"),
      );
    });

    it("removes the session key from localStorage", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("to-remove");
      seedIndex(["to-remove"]);

      instance.removeSession("to-remove");

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        `${STORAGE_PREFIX}to-remove`,
      );
      expect(mockStorage[`${STORAGE_PREFIX}to-remove`]).toBeUndefined();
    });

    it("removes sessionId from the index", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("indexed");
      seedIndex(["indexed", "other"]);

      instance.removeSession("indexed");

      const index = JSON.parse(mockStorage[STORAGE_INDEX_KEY]);
      expect(index.sessions).not.toContain("indexed");
      expect(index.sessions).toContain("other");
    });

    it("logs info after successful removal", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("remove-info");
      seedIndex(["remove-info"]);

      instance.removeSession("remove-info");
      expect(logMock.log.storage.info).toHaveBeenCalledWith(
        expect.stringContaining("removed from local storage"),
        "remove-info",
      );
    });
  });

  // ── getStoredSessions ───────────────────────────────────────────────────────

  describe("getStoredSessions", () => {
    it("returns empty array when not in browser", () => {
      const instance = new SessionLocalStorage();
      expect(instance.getStoredSessions()).toEqual([]);
    });

    it("returns empty array when index key is absent", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      expect(instance.getStoredSessions()).toEqual([]);
    });

    it("returns session IDs from the index", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedIndex(["s1", "s2", "s3"]);

      expect(instance.getStoredSessions()).toEqual(["s1", "s2", "s3"]);
    });

    it("returns empty array and logs error on corrupt index JSON", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      mockStorage[STORAGE_INDEX_KEY] = "{bad json";

      const result = instance.getStoredSessions();
      expect(result).toEqual([]);
      expect(logMock.log.storage.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get stored sessions"),
        expect.anything(),
      );
    });
  });

  // ── clearAllSessions ────────────────────────────────────────────────────────

  describe("clearAllSessions", () => {
    it("logs warning and returns early when not in browser", () => {
      const instance = new SessionLocalStorage();
      instance.clearAllSessions();
      expect(logMock.log.storage.warn).toHaveBeenCalledWith(
        expect.stringContaining("not running in browser"),
      );
    });

    it("removes all session data and the index key", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("c1");
      seedStorage("c2");
      seedIndex(["c1", "c2"]);

      instance.clearAllSessions();

      expect(mockStorage[`${STORAGE_PREFIX}c1`]).toBeUndefined();
      expect(mockStorage[`${STORAGE_PREFIX}c2`]).toBeUndefined();
      expect(mockStorage[STORAGE_INDEX_KEY]).toBeUndefined();
    });

    it("logs info after clearing", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedIndex([]);

      instance.clearAllSessions();
      expect(logMock.log.storage.info).toHaveBeenCalledWith(
        "All session data cleared from local storage",
      );
    });

    it("handles empty session list gracefully", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      // No index or sessions seeded
      expect(() => instance.clearAllSessions()).not.toThrow();
    });
  });

  // ── hasStoredData ───────────────────────────────────────────────────────────

  describe("hasStoredData", () => {
    it("returns false when not in browser", () => {
      const instance = new SessionLocalStorage();
      expect(instance.hasStoredData("s1")).toBe(false);
    });

    it("returns false when session key is absent", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      expect(instance.hasStoredData("missing")).toBe(false);
    });

    it("returns true when session key exists", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedStorage("present");
      expect(instance.hasStoredData("present")).toBe(true);
    });
  });

  // ── setupAutoSave ───────────────────────────────────────────────────────────

  describe("setupAutoSave", () => {
    it("returns a no-op cleanup function when not in browser", () => {
      const instance = new SessionLocalStorage();
      const cleanup = instance.setupAutoSave("s1", () => ({}));
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    });

    it("returns a no-op cleanup function when autoSave is false", () => {
      const instance = makeBrowserInstance({
        cleanupOnLoad: false,
        autoSave: false,
      });
      const cleanup = instance.setupAutoSave("s1", () => ({}));
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    });

    it("returns a cleanup function that clears the interval", () => {
      vi.useFakeTimers();
      const instance = makeBrowserInstance({ cleanupOnLoad: false, autoSave: true });
      const dataGetter = vi.fn(() => ({ language: "en" }));

      const cleanup = instance.setupAutoSave("auto-s", dataGetter);
      expect(typeof cleanup).toBe("function");
      cleanup();
      // Advancing timer after cleanup should NOT trigger the dataGetter
      vi.advanceTimersByTime(10000);
      expect(dataGetter).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("auto-saves data on interval tick", () => {
      vi.useFakeTimers();
      const instance = makeBrowserInstance({ cleanupOnLoad: false, autoSave: true });
      const dataGetter = vi.fn(() => ({ language: "cs" }));

      const cleanup = instance.setupAutoSave("tick-s", dataGetter);
      vi.advanceTimersByTime(5000);
      expect(dataGetter).toHaveBeenCalled();
      cleanup();
      vi.useRealTimers();
    });
  });

  // ── forceSaveCurrentSession ─────────────────────────────────────────────────

  describe("forceSaveCurrentSession", () => {
    it("does nothing when not in browser", () => {
      const instance = new SessionLocalStorage();
      const getter = vi.fn(() => ({}));
      instance.forceSaveCurrentSession(getter);
      expect(getter).not.toHaveBeenCalled();
    });

    it("does nothing when no current session is set", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      const getter = vi.fn(() => ({}));
      instance.forceSaveCurrentSession(getter);
      expect(getter).not.toHaveBeenCalled();
    });

    it("saves using the current session ID after setupAutoSave", () => {
      vi.useFakeTimers();
      const instance = makeBrowserInstance({ cleanupOnLoad: false, autoSave: true });
      const cleanup = instance.setupAutoSave("force-s", () => ({}));

      const getter = vi.fn(() => ({ language: "pl" }));
      instance.forceSaveCurrentSession(getter);

      expect(getter).toHaveBeenCalled();
      const raw = mockStorage[`${STORAGE_PREFIX}force-s`];
      expect(raw).toBeDefined();
      const saved = JSON.parse(raw);
      expect(saved.language).toBe("pl");

      cleanup();
      vi.useRealTimers();
    });
  });

  // ── performMaintenanceCleanup ───────────────────────────────────────────────

  describe("performMaintenanceCleanup", () => {
    it("is a no-op when not in browser", () => {
      const instance = new SessionLocalStorage();
      expect(() => instance.performMaintenanceCleanup()).not.toThrow();
      expect(localStorageMock.getItem).not.toHaveBeenCalled();
    });

    it("removes expired sessions during cleanup", () => {
      const instance = makeBrowserInstance({
        cleanupOnLoad: false,
        maxAge: 1000,
      });
      seedStorage("expired-m", { lastUpdated: Date.now() - 5000 });
      seedStorage("fresh-m");
      seedIndex(["expired-m", "fresh-m"]);

      instance.performMaintenanceCleanup();

      expect(mockStorage[`${STORAGE_PREFIX}expired-m`]).toBeUndefined();
      expect(mockStorage[`${STORAGE_PREFIX}fresh-m`]).toBeDefined();
    });

    it("removes orphaned localStorage keys not in index", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      // Orphan key: exists in storage but not in index
      mockStorage[`${STORAGE_PREFIX}orphan`] = JSON.stringify(makeSession({ sessionId: "orphan" }));
      seedIndex([]); // empty index

      instance.performMaintenanceCleanup();

      expect(mockStorage[`${STORAGE_PREFIX}orphan`]).toBeUndefined();
    });

    it("logs completion info", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedIndex([]);
      instance.performMaintenanceCleanup();
      expect(logMock.log.storage.info).toHaveBeenCalledWith(
        expect.stringContaining("Maintenance cleanup complete"),
      );
    });
  });

  // ── Session index management (private via public API) ──────────────────────

  describe("session index management", () => {
    it("creates index if it does not exist on first saveSession", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      instance.saveSession("first", {});

      expect(mockStorage[STORAGE_INDEX_KEY]).toBeDefined();
      const index = JSON.parse(mockStorage[STORAGE_INDEX_KEY]);
      expect(index.sessions).toContain("first");
    });

    it("removeSession on unknown id does not crash", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      seedIndex(["other"]);
      expect(() => instance.removeSession("ghost")).not.toThrow();
    });

    it("removeFromIndex leaves other sessions untouched when index key missing", () => {
      const instance = makeBrowserInstance({ cleanupOnLoad: false });
      // No index seeded
      expect(() => instance.removeSession("none")).not.toThrow();
    });
  });

  // ── Utility / exported functions ────────────────────────────────────────────

  describe("exported utility functions", () => {
    // These thin wrappers delegate to the default sessionStorage instance which
    // was constructed at module-load time without browser globals. They should
    // all return early (non-browser path) without throwing.
    it("saveSessionData does not throw", async () => {
      const { saveSessionData } = await import("./local-storage");
      expect(() => saveSessionData("s1", {})).not.toThrow();
    });

    it("loadSessionData returns null", async () => {
      const { loadSessionData } = await import("./local-storage");
      expect(loadSessionData("s1")).toBeNull();
    });

    it("removeSessionData does not throw", async () => {
      const { removeSessionData } = await import("./local-storage");
      expect(() => removeSessionData("s1")).not.toThrow();
    });

    it("hasStoredSessionData returns false", async () => {
      const { hasStoredSessionData } = await import("./local-storage");
      expect(hasStoredSessionData("s1")).toBe(false);
    });

    it("clearAllSessionData does not throw", async () => {
      const { clearAllSessionData } = await import("./local-storage");
      expect(() => clearAllSessionData()).not.toThrow();
    });
  });
});
