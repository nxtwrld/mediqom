import { describe, it, expect } from "vitest";
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
  ENHANCED_SIGNAL_PROCESSING,
  MULTI_PROVIDER_AI,
  EXTERNAL_VALIDATION,
  SPECIALIZED_UI,
  ENCRYPTED_IMPORT_CACHE,
} from "./feature-flags";

describe("FEATURE_FLAGS object", () => {
  it("has ENHANCED_SIGNAL_PROCESSING flag", () => {
    expect(typeof FEATURE_FLAGS.ENHANCED_SIGNAL_PROCESSING).toBe("boolean");
  });

  it("has MULTI_PROVIDER_AI flag", () => {
    expect(typeof FEATURE_FLAGS.MULTI_PROVIDER_AI).toBe("boolean");
  });

  it("has EXTERNAL_VALIDATION flag", () => {
    expect(typeof FEATURE_FLAGS.EXTERNAL_VALIDATION).toBe("boolean");
  });

  it("has SPECIALIZED_UI flag", () => {
    expect(typeof FEATURE_FLAGS.SPECIALIZED_UI).toBe("boolean");
  });

  it("has ENCRYPTED_IMPORT_CACHE flag (defaults to true when env is not 'false')", () => {
    // In test env, PUBLIC_ENABLE_ENCRYPTED_IMPORT_CACHE is not set, so !== 'false' → true
    expect(typeof FEATURE_FLAGS.ENCRYPTED_IMPORT_CACHE).toBe("boolean");
    expect(FEATURE_FLAGS.ENCRYPTED_IMPORT_CACHE).toBe(true);
  });
});

describe("isFeatureEnabled", () => {
  it("returns the flag value for ENHANCED_SIGNAL_PROCESSING", () => {
    expect(isFeatureEnabled("ENHANCED_SIGNAL_PROCESSING")).toBe(
      FEATURE_FLAGS.ENHANCED_SIGNAL_PROCESSING,
    );
  });

  it("returns the flag value for MULTI_PROVIDER_AI", () => {
    expect(isFeatureEnabled("MULTI_PROVIDER_AI")).toBe(
      FEATURE_FLAGS.MULTI_PROVIDER_AI,
    );
  });

  it("returns the flag value for EXTERNAL_VALIDATION", () => {
    expect(isFeatureEnabled("EXTERNAL_VALIDATION")).toBe(
      FEATURE_FLAGS.EXTERNAL_VALIDATION,
    );
  });

  it("returns the flag value for SPECIALIZED_UI", () => {
    expect(isFeatureEnabled("SPECIALIZED_UI")).toBe(
      FEATURE_FLAGS.SPECIALIZED_UI,
    );
  });

  it("returns true for ENCRYPTED_IMPORT_CACHE by default", () => {
    expect(isFeatureEnabled("ENCRYPTED_IMPORT_CACHE")).toBe(true);
  });
});

describe("named exports match FEATURE_FLAGS", () => {
  it("ENHANCED_SIGNAL_PROCESSING matches flag", () => {
    expect(ENHANCED_SIGNAL_PROCESSING).toBe(FEATURE_FLAGS.ENHANCED_SIGNAL_PROCESSING);
  });

  it("MULTI_PROVIDER_AI matches flag", () => {
    expect(MULTI_PROVIDER_AI).toBe(FEATURE_FLAGS.MULTI_PROVIDER_AI);
  });

  it("EXTERNAL_VALIDATION matches flag", () => {
    expect(EXTERNAL_VALIDATION).toBe(FEATURE_FLAGS.EXTERNAL_VALIDATION);
  });

  it("SPECIALIZED_UI matches flag", () => {
    expect(SPECIALIZED_UI).toBe(FEATURE_FLAGS.SPECIALIZED_UI);
  });

  it("ENCRYPTED_IMPORT_CACHE matches flag", () => {
    expect(ENCRYPTED_IMPORT_CACHE).toBe(FEATURE_FLAGS.ENCRYPTED_IMPORT_CACHE);
  });
});
