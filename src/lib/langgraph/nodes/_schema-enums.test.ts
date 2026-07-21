import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$data/objects.json", () => ({
  default: {
    head: { objects: ["skull", "jaw"] },
    torso: { objects: ["heart", "lung", "liver"] },
  },
}));

vi.mock("$data/signal-catalog", () => ({
  getCatalog: () => ({
    glucose: {},
    cholesterol: {},
    hba1c: {},
    weight: {},
    height: {},
  }),
}));

vi.mock("$data/anatomy-regions", () => ({
  regionIds: () => ["R_knee", "cardiovascular"],
  WHOLE_BODY: "whole_body",
}));

vi.mock("$lib/health/property-categories", () => ({
  STATIC_PROPERTIES: ["weight", "height"],
}));

vi.mock("$lib/logging/logger", () => ({
  log: { analysis: { debug: vi.fn() } },
}));

import { populateSchemaEnums } from "./_schema-enums";

describe("populateSchemaEnums", () => {
  it("fills identification.enum when empty", () => {
    const schema = {
      properties: {
        identification: { type: "string", enum: [] },
      },
    };
    populateSchemaEnums(schema);
    expect(schema.properties.identification.enum).toEqual(
      expect.arrayContaining([
        "skull",
        "jaw",
        "heart",
        "lung",
        "liver",
        // region ids and whole_body are first-class anchors in the enum
        "R_knee",
        "cardiovascular",
        "whole_body",
      ]),
    );
    expect(schema.properties.identification.enum.length).toBe(8);
  });

  it("fills signal.enum with catalog keys minus static properties", () => {
    const schema = {
      properties: {
        signal: { type: "string", enum: [] },
      },
    };
    populateSchemaEnums(schema);
    expect(schema.properties.signal.enum).toEqual(
      expect.arrayContaining(["glucose", "cholesterol", "hba1c"]),
    );
    expect(schema.properties.signal.enum).not.toContain("weight");
    expect(schema.properties.signal.enum).not.toContain("height");
  });

  it("is idempotent — existing enums are not overwritten", () => {
    const schema = {
      properties: {
        identification: { type: "string", enum: ["already-populated"] },
        signal: { type: "string", enum: ["existing-signal"] },
      },
    };
    populateSchemaEnums(schema);
    expect(schema.properties.identification.enum).toEqual(["already-populated"]);
    expect(schema.properties.signal.enum).toEqual(["existing-signal"]);
  });

  it("does not re-populate after first call", () => {
    const schema = {
      properties: {
        identification: { type: "string", enum: [] },
      },
    };
    populateSchemaEnums(schema);
    const firstResult = [...schema.properties.identification.enum];
    populateSchemaEnums(schema);
    expect(schema.properties.identification.enum).toEqual(firstResult);
  });

  it("is safe on circular schemas (no infinite loop)", () => {
    const schema: any = {
      properties: {
        signal: { type: "string", enum: [] },
      },
    };
    schema.self = schema;
    expect(() => populateSchemaEnums(schema)).not.toThrow();
    expect(schema.properties.signal.enum.length).toBeGreaterThan(0);
  });

  it("populates enums nested at arbitrary depth", () => {
    const schema = {
      properties: {
        outer: {
          type: "object",
          properties: {
            inner: {
              type: "object",
              properties: {
                identification: { type: "string", enum: [] },
              },
            },
          },
        },
      },
    };
    populateSchemaEnums(schema);
    expect(
      (schema as any).properties.outer.properties.inner.properties
        .identification.enum.length,
    ).toBeGreaterThan(0);
  });

  it("populates enums inside array items", () => {
    const schema = {
      type: "array",
      items: [
        {
          properties: {
            signal: { type: "string", enum: [] },
          },
        },
      ],
    };
    populateSchemaEnums(schema);
    expect((schema.items[0] as any).properties.signal.enum.length).toBeGreaterThan(0);
  });

  it("handles null gracefully", () => {
    expect(() => populateSchemaEnums(null)).not.toThrow();
  });

  it("handles non-object schema gracefully", () => {
    expect(() => populateSchemaEnums("string")).not.toThrow();
    expect(() => populateSchemaEnums(42)).not.toThrow();
  });

  it("does not touch properties without an enum array", () => {
    const schema = {
      properties: {
        identification: { type: "string" },
        signal: { type: "number", minimum: 0 },
      },
    };
    populateSchemaEnums(schema);
    expect((schema.properties.identification as any).enum).toBeUndefined();
  });

  it("fills multiple slots in a single schema", () => {
    const schema = {
      properties: {
        identification: { type: "string", enum: [] },
        signal: { type: "string", enum: [] },
      },
    };
    populateSchemaEnums(schema);
    expect(schema.properties.identification.enum.length).toBeGreaterThan(0);
    expect(schema.properties.signal.enum.length).toBeGreaterThan(0);
  });
});
