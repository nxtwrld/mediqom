import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUpdateDocument,
  mockProfilesGet,
  mockUpdateProfile,
  mockReconstructFullName,
  mockHasNameComponents,
  mockSaveHealthProfile,
  mockApiFetch,
  mockGetDocument,
} = vi.hoisted(() => ({
  mockUpdateDocument: vi.fn(),
  mockProfilesGet: vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockReconstructFullName: vi.fn(),
  mockHasNameComponents: vi.fn(),
  mockSaveHealthProfile: vi.fn(),
  mockApiFetch: vi.fn(),
  mockGetDocument: vi.fn(),
}));

vi.mock("$lib/documents", () => ({
  updateDocument: mockUpdateDocument,
  getDocument: mockGetDocument,
}));

vi.mock("$lib/profiles", () => ({
  profiles: { get: mockProfilesGet, subscribe: vi.fn() },
  updateProfile: mockUpdateProfile,
}));

vi.mock("$lib/contact/name-utils", () => ({
  reconstructFullName: mockReconstructFullName,
  hasNameComponents: mockHasNameComponents,
}));

vi.mock("$lib/health/save", () => ({
  saveHealthProfile: mockSaveHealthProfile,
}));

vi.mock("$lib/api/client", () => ({
  apiFetch: mockApiFetch,
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

import {
  saveProfileDocument,
  saveProfileChanges,
  prepareProfileForEditing,
} from "./save";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, any> = {}) {
  return {
    id: "p1",
    profileDocumentId: "doc-1",
    fullName: "Jane Doe",
    vcard: { fn: "Jane Doe" },
    insurance: { provider: "ACME", number: "123" },
    health: {},
    ...overrides,
  };
}

function makeDocument(content: Record<string, any> = {}) {
  return {
    id: "doc-1",
    content: {
      vcard: { fn: "Jane Doe" },
      insurance: { provider: "ACME", number: "123" },
      ...content,
    },
  };
}

// ── saveProfileDocument ───────────────────────────────────────────────────────

describe("profiles/save - saveProfileDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue(undefined);
    mockUpdateProfile.mockReturnValue(undefined);
    mockHasNameComponents.mockReturnValue(false);
    mockReconstructFullName.mockReturnValue("");
    // Mock the dynamic import of $lib/documents
    mockGetDocument.mockResolvedValue(makeDocument());
  });

  it("returns error when profileId is missing", async () => {
    const result = await saveProfileDocument({ profileId: "" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing profileId");
  });

  it("returns error when profile not found in store", async () => {
    mockProfilesGet.mockReturnValue(null);

    const result = await saveProfileDocument({ profileId: "p1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Profile not found");
  });

  it("returns error when profile has no profileDocumentId", async () => {
    mockProfilesGet.mockReturnValue(makeProfile({ profileDocumentId: undefined }));

    const result = await saveProfileDocument({ profileId: "p1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Profile document not found");
  });

  it("returns error when document not found in store", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    mockGetDocument.mockResolvedValue(null);

    const result = await saveProfileDocument({ profileId: "p1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Profile document not found in store");
  });

  it("saves vcard to document content", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument();
    mockGetDocument.mockResolvedValue(doc);
    const newVcard = { fn: "Dr. John Smith", n: { givenName: "John", familyName: "Smith" } };

    await saveProfileDocument({ profileId: "p1", vcard: newVcard });

    expect(doc.content.vcard).toEqual(newVcard);
    expect(mockUpdateDocument).toHaveBeenCalledOnce();
  });

  it("saves insurance to document content", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument();
    mockGetDocument.mockResolvedValue(doc);
    const newInsurance = { provider: "NewCo", number: "999" };

    await saveProfileDocument({ profileId: "p1", insurance: newInsurance });

    expect(doc.content.insurance).toEqual(newInsurance);
  });

  it("does not overwrite vcard when vcard is not passed", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument({ vcard: { fn: "Original Name" } });
    mockGetDocument.mockResolvedValue(doc);

    await saveProfileDocument({ profileId: "p1", insurance: { provider: "X", number: "1" } });

    expect(doc.content.vcard.fn).toBe("Original Name");
  });

  it("reconstructs fn from name components when hasNameComponents is true", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument();
    mockGetDocument.mockResolvedValue(doc);
    mockHasNameComponents.mockReturnValue(true);
    mockReconstructFullName.mockReturnValue("Dr. Jane Smith");

    const vcard = {
      fn: "Jane",
      n: { honorificPrefix: "Dr.", givenName: "Jane", familyName: "Smith" },
    };
    await saveProfileDocument({ profileId: "p1", vcard });

    expect(doc.content.vcard.fn).toBe("Dr. Jane Smith");
  });

  it("does not overwrite fn when hasNameComponents is false", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument();
    mockGetDocument.mockResolvedValue(doc);
    mockHasNameComponents.mockReturnValue(false);

    const vcard = { fn: "Explicit Name" };
    await saveProfileDocument({ profileId: "p1", vcard });

    expect(doc.content.vcard.fn).toBe("Explicit Name");
    expect(mockReconstructFullName).not.toHaveBeenCalled();
  });

  it("updates profile in store after saving", async () => {
    const profile = makeProfile();
    mockProfilesGet.mockReturnValue(profile);
    const doc = makeDocument({ vcard: { fn: "Updated Name" } });
    mockGetDocument.mockResolvedValue(doc);

    await saveProfileDocument({ profileId: "p1" });

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
    );
  });

  it("returns fullName from vcard.fn", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    const doc = makeDocument({ vcard: { fn: "Jane Doe" } });
    mockGetDocument.mockResolvedValue(doc);

    const result = await saveProfileDocument({ profileId: "p1" });

    expect(result.success).toBe(true);
    expect(result.fullName).toBe("Jane Doe");
  });

  it("falls back to profile.fullName when vcard.fn is absent", async () => {
    const profile = makeProfile({ fullName: "Fallback Name" });
    mockProfilesGet.mockReturnValue(profile);
    const doc = makeDocument({ vcard: {} });
    mockGetDocument.mockResolvedValue(doc);

    const result = await saveProfileDocument({ profileId: "p1" });

    expect(result.fullName).toBe("Fallback Name");
  });

  it("returns error and does not throw when updateDocument rejects", async () => {
    mockProfilesGet.mockReturnValue(makeProfile());
    mockGetDocument.mockResolvedValue(makeDocument());
    mockUpdateDocument.mockRejectedValue(new Error("Write failed"));

    const result = await saveProfileDocument({ profileId: "p1", vcard: { fn: "X" } });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Write failed");
  });
});

// ── saveProfileChanges ────────────────────────────────────────────────────────

describe("profiles/save - saveProfileChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue(undefined);
    mockUpdateProfile.mockReturnValue(undefined);
    mockHasNameComponents.mockReturnValue(false);
    mockReconstructFullName.mockReturnValue("");
    mockSaveHealthProfile.mockResolvedValue({ success: true });
    mockGetDocument.mockResolvedValue(makeDocument());
  });

  it("returns error when editingProfile has no id", async () => {
    const result = await saveProfileChanges({}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing profile id");
  });

  it("returns success without saving when nothing changed", async () => {
    const profile = makeProfile();
    const result = await saveProfileChanges(profile, profile);

    expect(result.success).toBe(true);
    expect(mockUpdateDocument).not.toHaveBeenCalled();
    expect(mockSaveHealthProfile).not.toHaveBeenCalled();
  });

  it("calls saveProfileDocument when vcard changed", async () => {
    const original = makeProfile({ vcard: { fn: "Old Name" } });
    const edited = makeProfile({ vcard: { fn: "New Name" } });
    mockProfilesGet.mockReturnValue(edited);

    const mockResponse = { json: vi.fn().mockResolvedValue({ fullName: "New Name" }) };
    mockApiFetch.mockResolvedValue(mockResponse);

    await saveProfileChanges(edited, original);

    expect(mockUpdateDocument).toHaveBeenCalled();
  });

  it("calls saveProfileDocument when insurance changed", async () => {
    const original = makeProfile({ insurance: { provider: "Old", number: "0" } });
    const edited = makeProfile({ insurance: { provider: "New", number: "1" } });
    mockProfilesGet.mockReturnValue(edited);

    const mockResponse = { json: vi.fn().mockResolvedValue({}) };
    mockApiFetch.mockResolvedValue(mockResponse);

    await saveProfileChanges(edited, original);

    expect(mockUpdateDocument).toHaveBeenCalled();
  });

  it("calls saveHealthProfile when health changed", async () => {
    const original = makeProfile({ health: { weight: 70 } });
    const edited = makeProfile({ health: { weight: 75 } });

    const result = await saveProfileChanges(edited, original);

    expect(mockSaveHealthProfile).toHaveBeenCalledWith({
      profileId: "p1",
      formData: { weight: 75 },
    });
    expect(result.success).toBe(true);
  });

  it("does not call saveHealthProfile when health unchanged", async () => {
    const original = makeProfile({ health: { weight: 70 }, vcard: { fn: "Old" } });
    const edited = makeProfile({ health: { weight: 70 }, vcard: { fn: "New" } });
    mockProfilesGet.mockReturnValue(edited);

    const mockResponse = { json: vi.fn().mockResolvedValue({}) };
    mockApiFetch.mockResolvedValue(mockResponse);

    await saveProfileChanges(edited, original);

    expect(mockSaveHealthProfile).not.toHaveBeenCalled();
  });

  it("does not call saveHealthProfile when health is undefined", async () => {
    const original = makeProfile({ health: { weight: 70 } });
    const edited = makeProfile({ health: undefined });

    const result = await saveProfileChanges(edited, original);

    // health is undefined so saveHealthProfile should not be called
    expect(mockSaveHealthProfile).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("syncs fullName to database via PATCH when fullName is returned", async () => {
    const original = makeProfile({ vcard: { fn: "Old" } });
    const edited = makeProfile({ vcard: { fn: "New Name" } });
    mockProfilesGet.mockReturnValue(edited);

    const mockResponse = { json: vi.fn().mockResolvedValue({ fullName: "New Name" }) };
    mockApiFetch.mockResolvedValue(mockResponse);

    await saveProfileChanges(edited, original);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/v1/med/profiles/p1`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("does not call apiFetch when saveProfileDocument returns no fullName", async () => {
    const original = makeProfile({ vcard: { fn: "Old" } });
    const edited = makeProfile({ vcard: { fn: "" } });
    mockProfilesGet.mockReturnValue(edited);
    // document returns empty vcard.fn, fallback also empty
    mockGetDocument.mockResolvedValue(makeDocument({ vcard: { fn: "" } }));
    const editedWithNoFullName = { ...edited, fullName: "" };
    mockProfilesGet.mockReturnValue(editedWithNoFullName);

    await saveProfileChanges(edited, original);

    // apiFetch should not be called when fullName is falsy
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("does not throw when apiFetch fails (continues gracefully)", async () => {
    const original = makeProfile({ vcard: { fn: "Old" } });
    const edited = makeProfile({ vcard: { fn: "New" } });
    mockProfilesGet.mockReturnValue(edited);
    mockApiFetch.mockRejectedValue(new Error("Network error"));

    const result = await saveProfileChanges(edited, original);

    // apiFetch failure is caught and logged as warning, result is still success
    expect(result.success).toBe(true);
  });

  it("calls updateProfile after all saves", async () => {
    const original = makeProfile({ health: { weight: 70 } });
    const edited = makeProfile({ health: { weight: 75 } });

    await saveProfileChanges(edited, original);

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
    );
  });

  it("returns error when an unexpected exception is thrown", async () => {
    const original = makeProfile({ health: { weight: 70 } });
    const edited = makeProfile({ health: { weight: 75 } });
    mockSaveHealthProfile.mockRejectedValue(new Error("Unexpected failure"));

    const result = await saveProfileChanges(edited, original);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unexpected failure");
  });
});

// ── prepareProfileForEditing ──────────────────────────────────────────────────

describe("profiles/save - prepareProfileForEditing", () => {
  it("returns deep copy (mutations do not affect original)", () => {
    const profile = makeProfile();
    const snapshot = prepareProfileForEditing(profile);
    snapshot.fullName = "Changed";
    expect(profile.fullName).toBe("Jane Doe");
  });

  it("initializes health to empty object when absent", () => {
    const profile = makeProfile({ health: undefined });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.health).toEqual({});
  });

  it("initializes vcard to empty object when absent and no fullName", () => {
    const profile = makeProfile({ vcard: undefined, fullName: undefined });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard).toEqual({});
  });

  it("initializes insurance with empty strings when absent", () => {
    const profile = makeProfile({ insurance: undefined });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.insurance).toEqual({ provider: "", number: "" });
  });

  it("does not overwrite existing health/vcard/insurance", () => {
    const profile = makeProfile({
      health: { weight: 70 },
      vcard: { fn: "Existing" },
      insurance: { provider: "KeepCo", number: "999" },
    });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.health.weight).toBe(70);
    expect(snapshot.vcard.fn).toBe("Existing");
    expect(snapshot.insurance.provider).toBe("KeepCo");
  });

  it("migrates fullName to vcard.fn when vcard.fn is empty", () => {
    const profile = makeProfile({ fullName: "Dr. John Doe", vcard: { fn: "" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.fn).toBe("Dr. John Doe");
  });

  it("does not overwrite existing vcard.fn with fullName", () => {
    const profile = makeProfile({ fullName: "Jane Doe", vcard: { fn: "Already Set" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.fn).toBe("Already Set");
  });

  it("splits single-word fullName into familyName", () => {
    const profile = makeProfile({ fullName: "Smith", vcard: { fn: "" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.n.familyName).toBe("Smith");
    expect(snapshot.vcard.n.givenName).toBe("");
  });

  it("splits two-word fullName into givenName + familyName", () => {
    const profile = makeProfile({ fullName: "Jane Doe", vcard: { fn: "" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.n.givenName).toBe("Jane");
    expect(snapshot.vcard.n.familyName).toBe("Doe");
  });

  it("splits three-word fullName into givenName + additionalName + familyName", () => {
    const profile = makeProfile({ fullName: "Jane Marie Doe", vcard: { fn: "" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.n.givenName).toBe("Jane");
    expect(snapshot.vcard.n.additionalName).toBe("Marie");
    expect(snapshot.vcard.n.familyName).toBe("Doe");
  });

  it("detects honorific prefix ending with '.'", () => {
    const profile = makeProfile({ fullName: "Dr. Jane Doe", vcard: { fn: "" } });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.n.honorificPrefix).toBe("Dr.");
    expect(snapshot.vcard.n.givenName).toBe("Jane");
    expect(snapshot.vcard.n.familyName).toBe("Doe");
  });

  it("does not add name components when fullName is absent", () => {
    const profile = makeProfile({ fullName: undefined, vcard: {} });
    const snapshot = prepareProfileForEditing(profile);
    expect(snapshot.vcard.n).toBeUndefined();
  });
});
