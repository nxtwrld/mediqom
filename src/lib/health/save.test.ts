import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetHealthDocument,
  mockUpdateDocument,
  mockProfilesGet,
  mockUpdateProfile,
} = vi.hoisted(() => ({
  mockGetHealthDocument: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockProfilesGet: vi.fn(),
  mockUpdateProfile: vi.fn(),
}));

vi.mock("./signals", () => ({
  getHealthDocument: mockGetHealthDocument,
}));

vi.mock("$lib/documents", () => ({
  updateDocument: mockUpdateDocument,
}));

vi.mock("$lib/profiles", () => ({
  profiles: { get: mockProfilesGet, subscribe: vi.fn() },
  updateProfile: mockUpdateProfile,
}));

vi.mock("$lib/logging/logger", () => ({
  log: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("./definitions.json", () => ({
  default: [
    {
      key: "weight",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "weight", type: "number", unit: "kg" },
      ],
    },
    {
      key: "height",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "height", type: "number", unit: "cm" },
      ],
    },
    {
      key: "bloodPressure",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "systolic", type: "number", unit: "mmHg" },
        { key: "diastolic", type: "number", unit: "mmHg" },
      ],
    },
    {
      key: "heartRate",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "heartRate", type: "number", unit: "bpm" },
      ],
    },
    {
      key: "temperature",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "temperature", type: "number", unit: "°C" },
      ],
    },
    {
      key: "oxygenSaturation",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "oxygenSaturation", type: "number", unit: "%" },
      ],
    },
    {
      key: "bloodSugar",
      type: "time-series",
      items: [
        { key: "date", type: "date" },
        { key: "bloodSugar", type: "number", unit: "mg/dL" },
      ],
    },
  ],
}));

import { saveHealthProfile } from "./save";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHealthDoc(content: Record<string, any> = {}) {
  return {
    id: "health-doc-1",
    content: {
      signals: {},
      ...content,
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("health/save - saveHealthProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue(undefined);
    mockProfilesGet.mockResolvedValue(null);
    mockUpdateProfile.mockReturnValue(undefined);
  });

  // ── guard clauses ─────────────────────────────────────────────────────────

  it("returns error when profileId is missing", async () => {
    const result = await saveHealthProfile({ profileId: "", formData: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("returns error when formData is missing", async () => {
    const result = await saveHealthProfile({
      profileId: "p1",
      formData: null as any,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("returns error when health document not found", async () => {
    mockGetHealthDocument.mockResolvedValue(null);

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 80 },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // ── static fields ─────────────────────────────────────────────────────────

  it("saves static field birthDate to document content", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { birthDate: "1990-05-01" },
    });

    expect(doc.content.birthDate).toBe("1990-05-01");
    expect(mockUpdateDocument).toHaveBeenCalledOnce();
  });

  it("saves static field biologicalSex to document content", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { biologicalSex: "female" },
    });

    expect(doc.content.biologicalSex).toBe("female");
  });

  it("saves multiple static fields in one call", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: {
        bloodType: "A+",
        smokingStatus: "never",
        alcoholConsumption: "none",
        physicalActivity: "moderate",
        diet: "mediterranean",
      },
    });

    expect(doc.content.bloodType).toBe("A+");
    expect(doc.content.smokingStatus).toBe("never");
    expect(doc.content.physicalActivity).toBe("moderate");
  });

  it("does not set static field when value is undefined", async () => {
    const doc = makeHealthDoc({ birthDate: "1980-01-01" });
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: {},
    });

    // Original value preserved
    expect(doc.content.birthDate).toBe("1980-01-01");
  });

  // ── array fields ──────────────────────────────────────────────────────────

  it("replaces array field allergies with form data", async () => {
    const doc = makeHealthDoc({ allergies: [{ allergen: "peanuts" }] });
    mockGetHealthDocument.mockResolvedValue(doc);

    const newAllergies = [{ allergen: "shellfish" }, { allergen: "dairy" }];
    await saveHealthProfile({
      profileId: "p1",
      formData: { allergies: newAllergies },
    });

    expect(doc.content.allergies).toEqual(newAllergies);
  });

  it("replaces vaccinations array with form data", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    const vaccinations = [{ vaccine: "COVID-19", dateOfApplication: "2021-05-01" }];
    await saveHealthProfile({
      profileId: "p1",
      formData: { vaccinations },
    });

    expect(doc.content.vaccinations).toEqual(vaccinations);
  });

  it("ignores non-array value for array field", async () => {
    const doc = makeHealthDoc({ allergies: [{ allergen: "peanuts" }] });
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { allergies: "not-an-array" as any },
    });

    // Should remain unchanged — not-an-array fails Array.isArray check
    expect(doc.content.allergies).toEqual([{ allergen: "peanuts" }]);
  });

  // ── time-series simple fields ─────────────────────────────────────────────

  it("adds numeric weight to signals.weight.values", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 75 },
    });

    expect(doc.content.signals.weight.values).toHaveLength(1);
    expect(doc.content.signals.weight.values[0].value).toBe(75);
    expect(doc.content.signals.weight.values[0].signal).toBe("weight");
  });

  it("assigns correct unit from definitions for weight", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 75 },
    });

    expect(doc.content.signals.weight.values[0].unit).toBe("kg");
  });

  it("assigns correct unit for height", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { height: 180 },
    });

    expect(doc.content.signals.height.values[0].unit).toBe("cm");
  });

  it("sets source to 'input' for time-series entry", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70 },
    });

    expect(doc.content.signals.weight.values[0].source).toBe("input");
  });

  it("accepts string numeric value for time-series field", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { heartRate: "72" },
    });

    expect(doc.content.signals.heartRate.values[0].value).toBe(72);
  });

  it("accepts object with field key for time-series field", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: { weight: 80 } },
    });

    expect(doc.content.signals.weight.values[0].value).toBe(80);
  });

  it("skips time-series field when value is empty string", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: "" },
    });

    expect(doc.content.signals.weight).toBeUndefined();
  });

  it("skips time-series field when value is null", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: null },
    });

    expect(doc.content.signals.weight).toBeUndefined();
  });

  it("skips time-series field when value is NaN string", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: "not-a-number" },
    });

    expect(doc.content.signals.weight?.values ?? []).toHaveLength(0);
  });

  it("initializes signal structure when signal is new", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { temperature: 36.6 },
    });

    expect(doc.content.signals.temperature).toMatchObject({
      log: "full",
      history: [],
    });
  });

  it("prepends new entry to existing values, sorted newest first", async () => {
    const existingEntry = {
      signal: "weight",
      value: 70,
      unit: "kg",
      date: "2023-01-01",
      source: "input",
      refId: "",
    };
    const doc = makeHealthDoc({
      signals: {
        weight: { log: "full", history: [], values: [existingEntry] },
      },
    });
    mockGetHealthDocument.mockResolvedValue(doc);

    // Simulate today being after the existing entry
    vi.setSystemTime(new Date("2024-06-01"));
    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 75 },
    });
    vi.useRealTimers();

    const values = doc.content.signals.weight.values;
    expect(values).toHaveLength(2);
    expect(new Date(values[0].date).getTime()).toBeGreaterThanOrEqual(
      new Date(values[1].date).getTime(),
    );
  });

  // ── compound time-series (bloodPressure) ──────────────────────────────────

  it("adds compound bloodPressure entry when subfields have values", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { bloodPressure: { systolic: 120, diastolic: 80 } },
    });

    expect(doc.content.signals.bloodPressure.values).toHaveLength(1);
    expect(doc.content.signals.bloodPressure.values[0].value).toEqual({
      systolic: 120,
      diastolic: 80,
    });
  });

  it("skips compound bloodPressure entry when all subfields are empty", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { bloodPressure: { systolic: "", diastolic: "" } },
    });

    // Signal structure is initialized but no entry is added (values stays empty)
    expect(doc.content.signals.bloodPressure?.values ?? []).toHaveLength(0);
  });

  it("skips compound bloodPressure entry when value is not an object", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    await saveHealthProfile({
      profileId: "p1",
      formData: { bloodPressure: 120 },
    });

    // Signal structure is initialized but no entry is added (values stays empty)
    expect(doc.content.signals.bloodPressure?.values ?? []).toHaveLength(0);
  });

  // ── document update ───────────────────────────────────────────────────────

  it("calls updateDocument after processing all fields", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { birthDate: "1990-01-01", weight: 70 },
    });

    expect(result.success).toBe(true);
    expect(mockUpdateDocument).toHaveBeenCalledOnce();
    expect(mockUpdateDocument).toHaveBeenCalledWith(doc);
  });

  // ── profile store update ──────────────────────────────────────────────────

  it("updates profile in store when profile is found", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);
    const profile = { id: "p1", health: {} };
    mockProfilesGet.mockResolvedValue(profile);

    await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70 },
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
    );
  });

  it("does not call updateProfile when profile is not found", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);
    mockProfilesGet.mockResolvedValue(null);

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70 },
    });

    expect(result.success).toBe(true);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("merges health data from document into profile", async () => {
    const doc = makeHealthDoc({ birthDate: "1990-01-01" });
    mockGetHealthDocument.mockResolvedValue(doc);
    const profile = { id: "p1", health: { birthDate: "1980-01-01" } };
    mockProfilesGet.mockResolvedValue(profile);

    await saveHealthProfile({
      profileId: "p1",
      formData: {},
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        health: expect.objectContaining({ birthDate: "1990-01-01" }),
      }),
    );
  });

  // ── error handling ────────────────────────────────────────────────────────

  it("returns error and does not throw when getHealthDocument rejects", async () => {
    mockGetHealthDocument.mockRejectedValue(new Error("DB error"));

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("DB error");
  });

  it("returns error and does not throw when updateDocument rejects", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);
    mockUpdateDocument.mockRejectedValue(new Error("Write failed"));

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Write failed");
  });

  it("returns success: true on happy path", async () => {
    const doc = makeHealthDoc();
    mockGetHealthDocument.mockResolvedValue(doc);

    const result = await saveHealthProfile({
      profileId: "p1",
      formData: { weight: 70, birthDate: "1990-01-01" },
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
