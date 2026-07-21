import { describe, it, expect } from "vitest";
import Errors from "./Errors";

describe("Errors enum", () => {
  it("has Unauthorized value", () => {
    expect(Errors.Unauthorized).toBe("Unauthorized");
  });

  it("has Unauthenticated value", () => {
    expect(Errors.Unauthenticated).toBe("Unauthenticated");
  });

  it("has PublicKeyNotFound value", () => {
    expect(Errors.PublicKeyNotFound).toBe("Public key not found");
  });

  it("has PrivateKeyNotFound value", () => {
    expect(Errors.PrivateKeyNotFound).toBe("Private key not found");
  });

  it("has ProfileNotFound value", () => {
    expect(Errors.ProfileNotFound).toBe("Profile not found");
  });

  it("has DocumentNotFound value", () => {
    expect(Errors.DocumentNotFound).toBe("Document not found");
  });

  it("has NetworkError value", () => {
    expect(Errors.NetworkError).toBe("Network error");
  });
});
