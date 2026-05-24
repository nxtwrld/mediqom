import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must come before module import) ────────────────────────────────

vi.mock("./session-data-store-instance", () => ({
  createSessionDataStoreInstance: vi.fn().mockReturnValue({
    actions: { loadSession: vi.fn(), clearSession: vi.fn() },
    cleanup: vi.fn(),
  }),
}));

vi.mock("./session-viewer-store-instance", () => ({
  createSessionViewerStoreInstance: vi.fn().mockReturnValue({
    cleanup: vi.fn(),
  }),
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("./session-data-store", () => {
  const mod = {
    sessionData: { subscribe: vi.fn() },
    sessionDataActions: { clearSession: vi.fn() },
  };
  return { ...mod, default: mod };
});

vi.mock("./session-viewer-store", () => {
  const mod = {
    sessionViewerStore: { subscribe: vi.fn() },
    sessionViewerActions: {},
  };
  return { ...mod, default: mod };
});

vi.mock("./unified-session-store", () => {
  const mod = {
    unifiedSessionStore: { subscribe: vi.fn() },
    unifiedSessionActions: { resetSession: vi.fn() },
  };
  return { ...mod, default: mod };
});

// Import after mocks
import {
  createDocumentStoreInstance,
  getGlobalStoreInstance,
  cleanupInstance,
  cleanupAllInstances,
  getActiveInstances,
  hasInstance,
  getInstanceCount,
} from "./session-store-manager";

import { createSessionDataStoreInstance } from "./session-data-store-instance";

describe("session-store-manager", () => {
  beforeEach(() => {
    cleanupAllInstances();
    vi.clearAllMocks();

    // Re-apply default mock implementations after clearAllMocks
    vi.mocked(createSessionDataStoreInstance).mockReturnValue({
      actions: { loadSession: vi.fn(), clearSession: vi.fn() },
      cleanup: vi.fn(),
    } as any);
  });

  describe("createDocumentStoreInstance", () => {
    it("creates an instance and registers it", () => {
      const instance = createDocumentStoreInstance();

      expect(instance).toBeDefined();
      expect(instance.type).toBe("document");
      expect(instance.id).toMatch(/^document_/);
      expect(hasInstance(instance.id)).toBe(true);
    });

    it("increments instance count after creation", () => {
      createDocumentStoreInstance();
      createDocumentStoreInstance();

      expect(getInstanceCount()).toBe(2);
    });

    it("calls loadSession when sessionData is provided", () => {
      const mockLoadSession = vi.fn();
      vi.mocked(createSessionDataStoreInstance).mockReturnValue({
        actions: { loadSession: mockLoadSession, clearSession: vi.fn() },
        cleanup: vi.fn(),
      } as any);

      const sessionData = { id: "test-session" } as any;
      createDocumentStoreInstance(sessionData);

      expect(mockLoadSession).toHaveBeenCalledWith(sessionData);
    });

    it("does not call loadSession when no sessionData is provided", () => {
      const mockLoadSession = vi.fn();
      vi.mocked(createSessionDataStoreInstance).mockReturnValue({
        actions: { loadSession: mockLoadSession, clearSession: vi.fn() },
        cleanup: vi.fn(),
      } as any);

      createDocumentStoreInstance();

      expect(mockLoadSession).not.toHaveBeenCalled();
    });

    it("exposes dataStore and viewerStore on the instance", () => {
      const instance = createDocumentStoreInstance();

      expect(instance.dataStore).toBeDefined();
      expect(instance.viewerStore).toBeDefined();
    });
  });

  describe("cleanupInstance", () => {
    it("calls cleanup and removes from registry", () => {
      const instance = createDocumentStoreInstance();
      const id = instance.id;

      expect(hasInstance(id)).toBe(true);

      const result = cleanupInstance(id);

      expect(result).toBe(true);
      expect(hasInstance(id)).toBe(false);
    });

    it("returns false for a nonexistent id", () => {
      const result = cleanupInstance("nonexistent-id");

      expect(result).toBe(false);
    });
  });

  describe("cleanupAllInstances", () => {
    it("cleans up all instances and returns the count", () => {
      createDocumentStoreInstance();
      createDocumentStoreInstance();
      createDocumentStoreInstance();

      const count = cleanupAllInstances();

      expect(count).toBe(3);
      expect(getInstanceCount()).toBe(0);
    });

    it("returns 0 when there are no instances", () => {
      const count = cleanupAllInstances();
      expect(count).toBe(0);
    });
  });

  describe("getActiveInstances", () => {
    it("returns array with id and type for each instance", () => {
      const a = createDocumentStoreInstance();
      const b = createDocumentStoreInstance();

      const instances = getActiveInstances();

      expect(instances).toHaveLength(2);
      expect(instances).toContainEqual({ id: a.id, type: "document" });
      expect(instances).toContainEqual({ id: b.id, type: "document" });
    });

    it("returns empty array when no instances exist", () => {
      expect(getActiveInstances()).toEqual([]);
    });
  });

  describe("hasInstance", () => {
    it("returns true for a registered instance", () => {
      const instance = createDocumentStoreInstance();
      expect(hasInstance(instance.id)).toBe(true);
    });

    it("returns false for an unknown id", () => {
      expect(hasInstance("unknown-id")).toBe(false);
    });
  });

  describe("getInstanceCount", () => {
    it("returns the correct count of active instances", () => {
      expect(getInstanceCount()).toBe(0);

      createDocumentStoreInstance();
      expect(getInstanceCount()).toBe(1);

      createDocumentStoreInstance();
      expect(getInstanceCount()).toBe(2);
    });

    it("decrements after cleanup", () => {
      const instance = createDocumentStoreInstance();
      expect(getInstanceCount()).toBe(1);

      cleanupInstance(instance.id);
      expect(getInstanceCount()).toBe(0);
    });
  });

  describe("getGlobalStoreInstance", () => {
    it("returns an object with type global", () => {
      const global = getGlobalStoreInstance();

      expect(global.type).toBe("global");
      expect(global.id).toBe("global");
    });

    it("returns dataStore, viewerStore, and unifiedStore", () => {
      const global = getGlobalStoreInstance();

      expect(global.dataStore).toBeDefined();
      expect(global.viewerStore).toBeDefined();
      expect(global.unifiedStore).toBeDefined();
    });

    it("exposes a cleanup function", () => {
      const global = getGlobalStoreInstance();
      expect(typeof global.cleanup).toBe("function");
    });
  });
});
