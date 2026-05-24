import { describe, it, expect } from "vitest";
import { validateExtractorSchema } from "./textract";

describe("validateExtractorSchema", () => {
  it("returns true for valid schema", () => {
    expect(
      validateExtractorSchema({
        name: "extractor",
        description: "Test extractor",
        parameters: {
          type: "object",
          properties: { field: { type: "string" } },
        },
      }),
    ).toBe(true);
  });

  it("throws for null (typeof null === 'object')", () => {
    expect(() => validateExtractorSchema(null)).toThrow();
  });

  it("returns false for non-object", () => {
    expect(validateExtractorSchema("string")).toBe(false);
  });

  it("returns false when name is missing", () => {
    expect(
      validateExtractorSchema({
        description: "desc",
        parameters: { type: "object", properties: {} },
      }),
    ).toBe(false);
  });

  it("returns false when description is missing", () => {
    expect(
      validateExtractorSchema({
        name: "test",
        parameters: { type: "object", properties: {} },
      }),
    ).toBe(false);
  });

  it("returns false when parameters is missing", () => {
    expect(
      validateExtractorSchema({
        name: "test",
        description: "desc",
      }),
    ).toBe(false);
  });

  it("returns false when parameters.type is not object", () => {
    expect(
      validateExtractorSchema({
        name: "test",
        description: "desc",
        parameters: { type: "array", properties: {} },
      }),
    ).toBe(false);
  });

  it("returns false when properties is not an object", () => {
    expect(
      validateExtractorSchema({
        name: "test",
        description: "desc",
        parameters: { type: "object", properties: "invalid" },
      }),
    ).toBe(false);
  });

  it("returns true with optional required field", () => {
    expect(
      validateExtractorSchema({
        name: "test",
        description: "desc",
        parameters: {
          type: "object",
          properties: { a: {} },
          required: ["a"],
        },
      }),
    ).toBe(true);
  });
});
