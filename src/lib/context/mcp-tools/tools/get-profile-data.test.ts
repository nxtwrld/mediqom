import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockProfilesStore, mockLogNamespace } = vi.hoisted(() => ({
  mockProfilesStore: vi.fn(),
  mockLogNamespace: vi.fn(),
}));

vi.mock("$lib/profiles", () => ({
  profiles: {
    subscribe: vi.fn((cb: (v: any) => void) => {
      cb(mockProfilesStore());
      return () => {};
    }),
  },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// BaseMedicalTool peer imports
vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb(null); return () => {}; }),
    getId: vi.fn(() => null),
  },
}));

vi.mock("$lib/documents", () => ({
  byUser: vi.fn(() => readable([])),
  getDocument: vi.fn().mockResolvedValue(null),
}));

vi.mock("../security-audit", () => ({
  mcpSecurityService: {
    validateAccess: vi.fn().mockResolvedValue({ allowed: true }),
    logAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {},
    temporalTerms: {},
  },
}));

import { GetProfileDataTool } from "./get-profile-data";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, any> = {}): any {
  return {
    id: "p1",
    fullName: "Jane Doe",
    language: "en",
    birthDate: "1990-05-15",
    vcard: {
      firstName: "Jane",
      lastName: "Doe",
      gender: "female",
      phone: "+1234567890",
      email: "jane@example.com",
    },
    health: {
      bloodType: "B+",
      height: 165,
      weight: 60,
      allergies: ["penicillin"],
      chronicConditions: ["asthma"],
      currentMedications: ["salbutamol"],
    },
    insurance: {
      provider: "MedCorp",
      planType: "HMO",
    },
    ...overrides,
  };
}

describe("context/mcp-tools/tools/get-profile-data", () => {
  let tool: GetProfileDataTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });
    tool = new GetProfileDataTool();
    // Default: empty profiles list
    mockProfilesStore.mockReturnValue([]);
  });

  // ── getToolDefinition ─────────────────────────────────────────────────────

  describe("getToolDefinition", () => {
    it("returns name getProfileData", () => {
      expect(tool.getToolDefinition().name).toBe("getProfileData");
    });

    it("has no required parameters", () => {
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toEqual([]);
    });

    it("has a description", () => {
      expect(tool.getToolDefinition().description.length).toBeGreaterThan(0);
    });

    it("inputSchema type is object", () => {
      expect(tool.getToolDefinition().inputSchema.type).toBe("object");
    });
  });

  // ── execute: profile not found ────────────────────────────────────────────

  describe("execute — profile not found", () => {
    it("returns isError=true when profile not in list", async () => {
      mockProfilesStore.mockReturnValue([]);
      const result = await tool.execute({}, "unknown-profile");
      expect(result.isError).toBe(true);
    });

    it("error text mentions 'Profile not found'", async () => {
      mockProfilesStore.mockReturnValue([]);
      const result = await tool.execute({}, "unknown-profile");
      expect(result.content[0].text).toContain("Profile not found");
    });
  });

  // ── execute: profile found ────────────────────────────────────────────────

  describe("execute — profile found", () => {
    it("returns isError falsy when profile exists", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("text contains patient full name", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("Jane Doe");
    });

    it("text contains birth date", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("1990-05-15");
    });

    it("text contains age calculated from birth date", async () => {
      const profile = makeProfile({ birthDate: "1990-05-15" });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      // Age should be 35 or 34 depending on current date
      expect(result.content[0].text).toMatch(/Age: \d+/);
    });

    it("text contains gender", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("female");
    });

    it("text contains blood type", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("B+");
    });

    it("text contains height", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("165");
    });

    it("text contains weight", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("60");
    });

    it("text contains allergies", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("penicillin");
    });

    it("text contains chronic conditions", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("asthma");
    });

    it("text contains current medications", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("salbutamol");
    });

    it("text contains insurance provider", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("MedCorp");
    });

    it("text contains insurance plan type", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("HMO");
    });

    it("includes a resource content item", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });

    it("resource contains profile id", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.id).toBe("p1");
    });

    it("resource contains vcard data", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.vcard?.firstName).toBe("Jane");
    });

    it("resource contains health data", async () => {
      const profile = makeProfile();
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.health?.bloodType).toBe("B+");
    });

    it("handles profile without health data", async () => {
      const profile = makeProfile({ health: null, vcard: null, insurance: null });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Jane Doe");
    });

    it("handles profile without birth date (no age shown)", async () => {
      const profile = makeProfile({ birthDate: undefined });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).not.toContain("Age:");
    });

    it("handles profile without insurance", async () => {
      const profile = makeProfile({ insurance: null });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("resource health is null when no health data", async () => {
      const profile = makeProfile({ health: null });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.health).toBeNull();
    });

    it("resource insurance is null when no insurance data", async () => {
      const profile = makeProfile({ insurance: null });
      mockProfilesStore.mockReturnValue([profile]);
      const result = await tool.execute({}, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.insurance).toBeNull();
    });
  });

  // ── execute: error handling ───────────────────────────────────────────────

  describe("execute — error handling", () => {
    it("returns isError=true when an exception is thrown", async () => {
      mockProfilesStore.mockImplementation(() => {
        throw new Error("Store failure");
      });
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBe(true);
    });

    it("error text contains error message", async () => {
      mockProfilesStore.mockImplementation(() => {
        throw new Error("Store failure");
      });
      const result = await tool.execute({}, "p1");
      expect(result.content[0].text).toContain("Store failure");
    });

    it("handles non-Error throws gracefully", async () => {
      mockProfilesStore.mockImplementation(() => { throw "string error"; });
      const result = await tool.execute({}, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown error");
    });
  });

  // ── private: calculateAge ─────────────────────────────────────────────────

  describe("calculateAge (private via any)", () => {
    const inst = () => tool as any;

    it("calculates age correctly for past birth date", () => {
      const age = inst().calculateAge("1990-01-01");
      expect(age).toBeGreaterThan(30);
      expect(age).toBeLessThan(60);
    });

    it("returns numeric age", () => {
      const age = inst().calculateAge("2000-06-15");
      expect(typeof age).toBe("number");
      expect(Number.isInteger(age)).toBe(true);
    });

    it("accounts for birthday not yet passed this year", () => {
      // Use a future month to ensure birthday hasn't passed yet
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const birthDate = `1990-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-15`;
      const age = inst().calculateAge(birthDate);
      const currentYear = new Date().getFullYear();
      expect(age).toBe(currentYear - 1990 - 1);
    });
  });
});
