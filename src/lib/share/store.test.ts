import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ui module
vi.mock("$lib/ui", () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
  },
}));

// Need to mock crypto for the add function
const mockUUID = "test-uuid-1234";
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => mockUUID },
  configurable: true,
});

import shareStore from "./store";
import { get } from "svelte/store";
import type { ShareRecord } from "./types.d";

function makeShareRecord(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    uid: overrides.uid || "share-1",
    title: "Test Share",
    href: "/share/1",
    url: "https://example.com/share/1",
    contact: "contact-1",
    password: undefined,
    publicKey: undefined,
    created: "2024-01-01",
    links: [],
    ...overrides,
  };
}

describe("share/store", () => {
  beforeEach(() => {
    shareStore.set([]);
  });

  it("starts with empty array", () => {
    let value: ShareRecord[] = [];
    shareStore.subscribe((v) => (value = v))();
    expect(value).toEqual([]);
  });

  it("adds a share record", () => {
    const record = makeShareRecord({ uid: "" });
    const added = shareStore.add(record);
    expect(added.uid).toBeDefined();

    let value: ShareRecord[] = [];
    shareStore.subscribe((v) => (value = v))();
    expect(value.length).toBe(1);
  });

  it("generates uuid when uid is empty", () => {
    const record = makeShareRecord({ uid: "" });
    const added = shareStore.add(record);
    expect(added.uid).toBe(mockUUID);
  });

  it("preserves existing uid on add", () => {
    const record = makeShareRecord({ uid: "existing-uid" });
    const added = shareStore.add(record);
    expect(added.uid).toBe("existing-uid");
  });

  it("gets a share by uid", () => {
    shareStore.add(makeShareRecord({ uid: "s1", title: "First" }));
    shareStore.add(makeShareRecord({ uid: "s2", title: "Second" }));
    const found = shareStore.get("s1");
    expect(found?.title).toBe("First");
  });

  it("returns undefined for unknown uid", () => {
    expect(shareStore.get("nonexistent")).toBeUndefined();
  });

  it("removes a share by uid", () => {
    shareStore.add(makeShareRecord({ uid: "s1" }));
    shareStore.add(makeShareRecord({ uid: "s2" }));
    shareStore.remove("s1");

    let value: ShareRecord[] = [];
    shareStore.subscribe((v) => (value = v))();
    expect(value.length).toBe(1);
    expect(value[0].uid).toBe("s2");
  });

  it("does nothing when removing unknown uid", () => {
    shareStore.add(makeShareRecord({ uid: "s1" }));
    shareStore.remove("nonexistent");

    let value: ShareRecord[] = [];
    shareStore.subscribe((v) => (value = v))();
    expect(value.length).toBe(1);
  });

  it("updates an existing share", () => {
    shareStore.add(makeShareRecord({ uid: "s1", title: "Original" }));
    shareStore.update(makeShareRecord({ uid: "s1", title: "Updated" }));

    const found = shareStore.get("s1");
    expect(found?.title).toBe("Updated");
  });

  it("does nothing when updating unknown uid", () => {
    shareStore.add(makeShareRecord({ uid: "s1" }));
    shareStore.update(makeShareRecord({ uid: "nonexistent", title: "New" }));
    expect(shareStore.get("nonexistent")).toBeUndefined();
  });
});
