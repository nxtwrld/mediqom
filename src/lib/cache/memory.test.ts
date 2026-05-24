import { describe, it, expect, beforeEach } from "vitest";
import {
  getMemory,
  getMemoryEntry,
  setMemory,
  setMemoryStale,
  invalidateMemory,
  invalidateMemoryPattern,
  clearMemory,
  memoryKeys,
} from "./memory";

describe("cache/memory", () => {
  beforeEach(() => {
    clearMemory();
  });

  describe("setMemory / getMemory", () => {
    it("stores and retrieves a value", () => {
      setMemory("key1", { name: "test" });
      expect(getMemory("key1")).toEqual({ name: "test" });
    });

    it("returns null for missing key", () => {
      expect(getMemory("nonexistent")).toBeNull();
    });

    it("overwrites existing value", () => {
      setMemory("key1", "first");
      setMemory("key1", "second");
      expect(getMemory("key1")).toBe("second");
    });

    it("stores primitives", () => {
      setMemory("num", 42);
      setMemory("bool", true);
      setMemory("str", "hello");
      expect(getMemory("num")).toBe(42);
      expect(getMemory("bool")).toBe(true);
      expect(getMemory("str")).toBe("hello");
    });

    it("stores arrays", () => {
      setMemory("arr", [1, 2, 3]);
      expect(getMemory("arr")).toEqual([1, 2, 3]);
    });
  });

  describe("getMemoryEntry", () => {
    it("returns entry with fetchedAt timestamp", () => {
      const before = Date.now();
      setMemory("key1", "data");
      const entry = getMemoryEntry("key1");
      expect(entry).not.toBeNull();
      expect(entry!.data).toBe("data");
      expect(entry!.fetchedAt).toBeGreaterThanOrEqual(before);
    });

    it("returns null for missing key", () => {
      expect(getMemoryEntry("missing")).toBeNull();
    });
  });

  describe("setMemoryStale", () => {
    it("stores data with fetchedAt = 0", () => {
      setMemoryStale("stale", "old-data");
      const entry = getMemoryEntry("stale");
      expect(entry).not.toBeNull();
      expect(entry!.data).toBe("old-data");
      expect(entry!.fetchedAt).toBe(0);
    });

    it("value is still retrievable via getMemory", () => {
      setMemoryStale("stale", { x: 1 });
      expect(getMemory("stale")).toEqual({ x: 1 });
    });
  });

  describe("invalidateMemory", () => {
    it("removes a specific key", () => {
      setMemory("a", 1);
      setMemory("b", 2);
      invalidateMemory("a");
      expect(getMemory("a")).toBeNull();
      expect(getMemory("b")).toBe(2);
    });

    it("does nothing for missing key", () => {
      invalidateMemory("nonexistent");
      expect(memoryKeys()).toEqual([]);
    });
  });

  describe("invalidateMemoryPattern", () => {
    it("removes keys matching prefix", () => {
      setMemory("user:1", "alice");
      setMemory("user:2", "bob");
      setMemory("doc:1", "report");
      invalidateMemoryPattern("user:");
      expect(getMemory("user:1")).toBeNull();
      expect(getMemory("user:2")).toBeNull();
      expect(getMemory("doc:1")).toBe("report");
    });

    it("removes nothing when no keys match", () => {
      setMemory("a", 1);
      invalidateMemoryPattern("zzz");
      expect(memoryKeys()).toEqual(["a"]);
    });

    it("removes all keys when prefix is empty string", () => {
      setMemory("a", 1);
      setMemory("b", 2);
      invalidateMemoryPattern("");
      expect(memoryKeys()).toEqual([]);
    });
  });

  describe("clearMemory", () => {
    it("removes all keys", () => {
      setMemory("a", 1);
      setMemory("b", 2);
      setMemory("c", 3);
      clearMemory();
      expect(memoryKeys()).toEqual([]);
    });

    it("is safe to call on empty store", () => {
      clearMemory();
      expect(memoryKeys()).toEqual([]);
    });
  });

  describe("memoryKeys", () => {
    it("returns empty array when empty", () => {
      expect(memoryKeys()).toEqual([]);
    });

    it("returns all stored keys", () => {
      setMemory("x", 1);
      setMemory("y", 2);
      const keys = memoryKeys();
      expect(keys).toContain("x");
      expect(keys).toContain("y");
      expect(keys.length).toBe(2);
    });
  });
});
