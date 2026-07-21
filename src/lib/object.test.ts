import { describe, it, expect } from "vitest";
import { isEmpty } from "./object";

describe("isEmpty", () => {
  it("returns true for an empty object literal", () => {
    expect(isEmpty({})).toBe(true);
  });

  it("returns false for an object with own enumerable properties", () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  // Note: JSON.stringify drops undefined values, so { a: undefined } → "{}".
  // This reflects the implementation's actual behavior — documenting it.
  it("considers { a: undefined } empty because JSON.stringify drops undefined", () => {
    expect(isEmpty({ a: undefined })).toBe(true);
  });

  it("returns false for an object with nested empty object (non-empty outer)", () => {
    expect(isEmpty({ nested: {} })).toBe(false);
  });

  it("arrays serialize to [], not {}, so isEmpty returns false for arrays", () => {
    expect(isEmpty([])).toBe(false);
    expect(isEmpty([1, 2, 3])).toBe(false);
  });
});
