import { describe, it, expect } from "vitest";
import { getSortForEnum, sortbyProperty, float32Flatten } from "./array";

describe("getSortForEnum", () => {
  enum Status {
    Pending = "pending",
    Active = "active",
    Done = "done",
  }

  it("sorts primitive values by enum declaration order", () => {
    const input = ["done", "pending", "active"];
    const sorted = [...input].sort(getSortForEnum(Status));
    expect(sorted).toEqual(["pending", "active", "done"]);
  });

  it("sorts objects by a property against enum order", () => {
    const input = [
      { id: 1, status: "done" },
      { id: 2, status: "pending" },
      { id: 3, status: "active" },
    ];
    const sorted = [...input].sort(getSortForEnum(Status, "status"));
    expect(sorted.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("treats equal values as equal (stable comparator returns 0)", () => {
    const cmp = getSortForEnum(Status);
    expect(cmp("pending", "pending")).toBe(0);
  });
});

describe("sortbyProperty", () => {
  it("sorts objects ascending by a numeric property", () => {
    const input = [{ n: 3 }, { n: 1 }, { n: 2 }];
    const sorted = [...input].sort(sortbyProperty("n"));
    expect(sorted.map((x) => x.n)).toEqual([1, 2, 3]);
  });

  it("returns 0 when properties are equal", () => {
    const cmp = sortbyProperty("n");
    expect(cmp({ n: 2 }, { n: 2 })).toBe(0);
  });
});

describe("float32Flatten", () => {
  it("concatenates multiple Float32Array chunks in order", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5]);
    const c = new Float32Array([6]);
    const result = float32Flatten([a, b, c]);

    expect(result).toBeInstanceOf(Float32Array);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns an empty Float32Array when given an empty list", () => {
    const result = float32Flatten([]);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(0);
  });

  it("handles chunks with zero-length entries", () => {
    const result = float32Flatten([
      new Float32Array([]),
      new Float32Array([1, 2]),
      new Float32Array([]),
    ]);
    expect(Array.from(result)).toEqual([1, 2]);
  });
});
