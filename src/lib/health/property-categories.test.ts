import { describe, it, expect } from "vitest";
import {
  getPropertyCategory,
  isEntryEditable,
  canAddEntries,
  STATIC_PROPERTIES,
  MANUAL_PROPERTIES,
} from "./property-categories";
import type { Signal } from "$lib/types.d";

function signal(partial: Partial<Signal>): Signal {
  return {
    signal: "height",
    value: 180,
    unit: "cm",
    date: "2026-01-01",
    ...partial,
  } as Signal;
}

describe("getPropertyCategory", () => {
  it("returns 'static' for every entry in STATIC_PROPERTIES", () => {
    for (const prop of STATIC_PROPERTIES) {
      expect(getPropertyCategory(prop)).toBe("static");
    }
  });

  it("returns 'manual' for MANUAL_PROPERTIES when no values are provided", () => {
    for (const prop of MANUAL_PROPERTIES) {
      expect(getPropertyCategory(prop)).toBe("manual");
    }
  });

  it("returns 'document' for unknown properties with no values", () => {
    expect(getPropertyCategory("cholesterol")).toBe("document");
    expect(getPropertyCategory("glucose", [])).toBe("document");
  });

  it("returns 'manual' when every value is user-input (source === 'input')", () => {
    const values = [signal({ source: "input" }), signal({ source: "input" })];
    expect(getPropertyCategory("height", values)).toBe("manual");
  });

  it("returns 'manual' when values have no refId (also counted as manual)", () => {
    const values = [signal({ source: "other" as any, refId: undefined })];
    expect(getPropertyCategory("height", values)).toBe("manual");
  });

  it("returns 'document' when every value comes from a document (has refId and non-input source)", () => {
    const values = [
      signal({ source: "document", refId: "doc-1" } as any),
      signal({ source: "document", refId: "doc-2" } as any),
    ];
    expect(getPropertyCategory("cholesterol", values)).toBe("document");
  });

  it("returns 'mixed' when values contain both manual and document sources", () => {
    const values = [
      signal({ source: "input" }),
      signal({ source: "document", refId: "doc-1" } as any),
    ];
    expect(getPropertyCategory("weight", values)).toBe("mixed");
  });

  it("static wins over values — even with conflicting source data", () => {
    const values = [signal({ source: "document", refId: "doc-1" } as any)];
    expect(getPropertyCategory("age", values)).toBe("static");
  });
});

describe("isEntryEditable", () => {
  it("returns true when source is 'input'", () => {
    expect(isEntryEditable(signal({ source: "input" }))).toBe(true);
  });
  it("returns true when refId is missing", () => {
    expect(
      isEntryEditable(signal({ source: "document" as any, refId: undefined })),
    ).toBe(true);
  });
  it("returns false when sourced from a document with a refId", () => {
    expect(
      isEntryEditable(signal({ source: "document" as any, refId: "doc-1" })),
    ).toBe(false);
  });
});

describe("canAddEntries", () => {
  it("allows adding for static/manual/mixed", () => {
    expect(canAddEntries("static")).toBe(true);
    expect(canAddEntries("manual")).toBe(true);
    expect(canAddEntries("mixed")).toBe(true);
  });
  it("disallows adding for document-only category", () => {
    expect(canAddEntries("document")).toBe(false);
  });
});
