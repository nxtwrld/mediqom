import { describe, it, expect } from "vitest";
import { DEFAULT_SIGNAL_REFERENCES } from "./references";

describe("DEFAULT_SIGNAL_REFERENCES", () => {
  it("is a non-empty record", () => {
    expect(typeof DEFAULT_SIGNAL_REFERENCES).toBe("object");
    expect(Object.keys(DEFAULT_SIGNAL_REFERENCES).length).toBeGreaterThan(0);
  });

  it("each value contains a dash separating low and high", () => {
    for (const [key, range] of Object.entries(DEFAULT_SIGNAL_REFERENCES)) {
      expect(range, `for ${key}`).toContain("-");
    }
  });

  it("excludes degenerate ranges where low === high after split", () => {
    for (const range of Object.values(DEFAULT_SIGNAL_REFERENCES)) {
      const parts = range.split("-");
      if (parts.length === 2) {
        // Only enforce when it's a simple two-part split (no negative numbers).
        expect(parts[0]).not.toBe(parts[1]);
      }
    }
  });
});
