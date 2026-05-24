import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must come before the module under test
vi.mock("./encryption", () => ({
  generateJobKey: vi.fn().mockResolvedValue("test-key-string"),
  storeJobKey: vi.fn().mockResolvedValue(undefined),
  getJobKey: vi.fn().mockResolvedValue("test-key-string"),
  clearJobKey: vi.fn().mockResolvedValue(undefined),
  encryptFile: vi.fn().mockResolvedValue("encrypted-base64"),
  decryptFile: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));

vi.mock("$lib/encryption/aes", () => ({
  importKey: vi.fn().mockResolvedValue({}),
}));

import {
  generateJobKey,
  storeJobKey,
  getJobKey,
  clearJobKey,
  encryptFile,
  decryptFile,
} from "./encryption";
import { importKey } from "$lib/encryption/aes";
import { cacheFiles, getFiles, hasFiles, clearFiles } from "./file-cache";

// ---------------------------------------------------------------------------
// IndexedDB mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock IDB request that auto-fires onsuccess (via setter) when it is
 * assigned, using the given `result`. This removes the need to manually
 * orchestrate callback timing.
 */
function makeAutoRequest(result: unknown = undefined, error: DOMException | null = null) {
  const req: Record<string, unknown> = {
    result,
    error,
    onerror: null,
  };
  // onsuccess auto-fires asynchronously when assigned
  Object.defineProperty(req, "onsuccess", {
    set(handler: ((e: Event) => void) | null) {
      if (handler && error === null) {
        Promise.resolve().then(() => handler(new Event("success")));
      }
    },
    get() {
      return null;
    },
    configurable: true,
  });
  return req as unknown as IDBRequest;
}

/**
 * Create a mock IDB request that auto-fires onerror when onsuccess is assigned.
 */
function makeErrorRequest(error: DOMException) {
  const req: Record<string, unknown> = {
    result: undefined,
    error,
    onsuccess: null,
  };
  Object.defineProperty(req, "onerror", {
    set(handler: ((e: Event) => void) | null) {
      if (handler) {
        Promise.resolve().then(() => handler(new Event("error")));
      }
    },
    get() {
      return null;
    },
    configurable: true,
  });
  return req as unknown as IDBRequest;
}

let mockStore: {
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getKey: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let mockTx: {
  objectStore: ReturnType<typeof vi.fn>;
  oncomplete: (() => void) | null;
};

let mockDb: {
  transaction: ReturnType<typeof vi.fn>;
  objectStoreNames: { contains: ReturnType<typeof vi.fn> };
  createObjectStore: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

let mockOpenRequest: {
  result: unknown;
  error: DOMException | null;
  onsuccess: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  onupgradeneeded: ((e: IDBVersionChangeEvent) => void) | null;
};

beforeEach(() => {
  vi.clearAllMocks();

  mockStore = {
    put: vi.fn().mockReturnValue(makeAutoRequest()),
    get: vi.fn().mockReturnValue(makeAutoRequest(undefined)),
    getKey: vi.fn().mockReturnValue(makeAutoRequest(undefined)),
    delete: vi.fn().mockReturnValue(makeAutoRequest()),
  };

  mockTx = {
    objectStore: vi.fn().mockReturnValue(mockStore),
    oncomplete: null,
  };

  mockDb = {
    transaction: vi.fn().mockReturnValue(mockTx),
    objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
    createObjectStore: vi.fn(),
    close: vi.fn(),
  };

  // Use a property-based open request that auto-fires onsuccess
  mockOpenRequest = {
    result: mockDb,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };

  // Auto-fire onsuccess when assigned
  const _openRequest = {
    result: mockDb,
    error: null as DOMException | null,
    onerror: null as ((e: Event) => void) | null,
    onupgradeneeded: null as ((e: IDBVersionChangeEvent) => void) | null,
  };
  Object.defineProperty(_openRequest, "onsuccess", {
    set(handler: ((e: Event) => void) | null) {
      if (handler) {
        Promise.resolve().then(() => handler(new Event("success")));
      }
    },
    get() {
      return null;
    },
    configurable: true,
  });
  mockOpenRequest = _openRequest as typeof mockOpenRequest;

  global.indexedDB = {
    open: vi.fn().mockReturnValue(mockOpenRequest),
  } as unknown as IDBFactory;

  // Reset mocked module functions
  (generateJobKey as ReturnType<typeof vi.fn>).mockResolvedValue("test-key-string");
  (storeJobKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (getJobKey as ReturnType<typeof vi.fn>).mockResolvedValue("test-key-string");
  (clearJobKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (encryptFile as ReturnType<typeof vi.fn>).mockResolvedValue("encrypted-base64");
  (decryptFile as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(8));
  (importKey as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// cacheFiles
// ---------------------------------------------------------------------------

describe("cacheFiles", () => {
  it("calls generateJobKey, storeJobKey, importKey, encryptFile for each file", async () => {
    const files = [
      new File(["hello"], "a.txt", { type: "text/plain" }),
      new File(["world"], "b.txt", { type: "text/plain" }),
    ];

    await cacheFiles("job-1", files);

    expect(generateJobKey).toHaveBeenCalledWith("job-1");
    expect(storeJobKey).toHaveBeenCalledWith("job-1", "test-key-string");
    expect(importKey).toHaveBeenCalledWith("test-key-string");
    expect(encryptFile).toHaveBeenCalledTimes(2);
  });

  it("calls db.transaction with 'readwrite'", async () => {
    const files = [new File(["data"], "f.txt", { type: "text/plain" })];

    await cacheFiles("job-2", files);

    expect(mockDb.transaction).toHaveBeenCalledWith("files", "readwrite");
  });

  it("calls store.put with an entry containing jobId and files array", async () => {
    const files = [new File(["content"], "doc.pdf", { type: "application/pdf" })];

    await cacheFiles("job-3", files);

    expect(mockStore.put).toHaveBeenCalledTimes(1);
    const stored = (mockStore.put as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.jobId).toBe("job-3");
    expect(Array.isArray(stored.files)).toBe(true);
    expect(stored.files).toHaveLength(1);
    expect(stored.files[0].name).toBe("doc.pdf");
    expect(stored.files[0].data).toBe("encrypted-base64");
  });

  it("throws when generateJobKey throws", async () => {
    (generateJobKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("key generation failed"),
    );

    const files = [new File(["x"], "x.txt", { type: "text/plain" })];
    await expect(cacheFiles("job-err", files)).rejects.toThrow(
      "key generation failed",
    );
  });
});

// ---------------------------------------------------------------------------
// getFiles
// ---------------------------------------------------------------------------

describe("getFiles", () => {
  it("returns null when no entry found in DB", async () => {
    mockStore.get.mockReturnValue(makeAutoRequest(undefined));

    const result = await getFiles("job-missing");
    expect(result).toBeNull();
  });

  it("returns decrypted File objects when encryption key exists", async () => {
    const cachedEntry = {
      jobId: "job-enc",
      files: [{ name: "report.pdf", type: "application/pdf", data: "encrypted-base64" }],
      createdAt: Date.now(),
    };
    mockStore.get.mockReturnValue(makeAutoRequest(cachedEntry));
    (getJobKey as ReturnType<typeof vi.fn>).mockResolvedValue("test-key-string");

    const files = await getFiles("job-enc");

    expect(files).not.toBeNull();
    expect(files).toHaveLength(1);
    expect(files![0]).toBeInstanceOf(File);
    expect(files![0].name).toBe("report.pdf");
    expect(importKey).toHaveBeenCalledWith("test-key-string");
    expect(decryptFile).toHaveBeenCalledWith("encrypted-base64", expect.anything());
  });

  it("returns base64-decoded files when no encryption key (getJobKey returns null)", async () => {
    // "aGk=" is valid base64 for "hi"
    const cachedEntry = {
      jobId: "job-plain",
      files: [{ name: "note.txt", type: "text/plain", data: "aGk=" }],
      createdAt: Date.now(),
    };
    mockStore.get.mockReturnValue(makeAutoRequest(cachedEntry));
    (getJobKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const files = await getFiles("job-plain");

    expect(files).not.toBeNull();
    expect(files).toHaveLength(1);
    expect(files![0]).toBeInstanceOf(File);
    expect(files![0].name).toBe("note.txt");
    expect(decryptFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hasFiles
// ---------------------------------------------------------------------------

describe("hasFiles", () => {
  it("returns true when getKey finds a result", async () => {
    mockStore.getKey.mockReturnValue(makeAutoRequest("job-exists"));

    const result = await hasFiles("job-exists");
    expect(result).toBe(true);
  });

  it("returns false when getKey result is undefined", async () => {
    mockStore.getKey.mockReturnValue(makeAutoRequest(undefined));

    const result = await hasFiles("job-none");
    expect(result).toBe(false);
  });

  it("returns false on error (try/catch → false)", async () => {
    // Make openDB reject by returning an auto-error open request
    const failOpenRequest: Record<string, unknown> = {
      result: null,
      error: new DOMException("DB error"),
      onsuccess: null,
      onupgradeneeded: null,
    };
    Object.defineProperty(failOpenRequest, "onerror", {
      set(handler: ((e: Event) => void) | null) {
        if (handler) {
          Promise.resolve().then(() => handler(new Event("error")));
        }
      },
      get() {
        return null;
      },
      configurable: true,
    });
    (global.indexedDB.open as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      failOpenRequest,
    );

    const result = await hasFiles("job-err");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearFiles
// ---------------------------------------------------------------------------

describe("clearFiles", () => {
  it("calls clearJobKey and store.delete", async () => {
    await clearFiles("job-del");

    expect(clearJobKey).toHaveBeenCalledWith("job-del");
    expect(mockStore.delete).toHaveBeenCalledWith("job-del");
  });

  it("does not throw on error (try/catch ignores cleanup errors)", async () => {
    (clearJobKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("cleanup error"),
    );

    await expect(clearFiles("job-broken")).resolves.toBeUndefined();
  });
});
