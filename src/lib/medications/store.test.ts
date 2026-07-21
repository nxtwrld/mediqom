import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get, writable } from "svelte/store";

// ---- Hoisted mock state ----
// vi.hoisted() runs before any imports, so we cannot use svelte/store's writable
// here. Instead, create a minimal hand-rolled writable-compatible store.

const { mockDocumentsStore, mockLoadDocument, mockAddDocument, mockUpdateDocument, mockRemoveDocument, mockExtractMedications, mockCalculateAllOccurrences, mockMigrate } = vi.hoisted(() => {
  // Minimal writable store implementation (no svelte dependency)
  function makeWritable<T>(initial: T) {
    let value = initial;
    const subscribers = new Set<(v: T) => void>();
    return {
      subscribe(cb: (v: T) => void) {
        subscribers.add(cb);
        cb(value);
        return () => { subscribers.delete(cb); };
      },
      set(v: T) {
        value = v;
        subscribers.forEach((cb) => cb(v));
      },
      update(fn: (v: T) => T) {
        const next = fn(value);
        value = next;
        subscribers.forEach((cb) => cb(next));
      },
    };
  }

  const mockDocumentsStore = makeWritable<any[]>([]);
  return {
    mockDocumentsStore,
    mockLoadDocument: vi.fn().mockResolvedValue(undefined),
    mockAddDocument: vi.fn().mockResolvedValue({ id: "new-doc-id" }),
    mockUpdateDocument: vi.fn().mockResolvedValue(undefined),
    mockRemoveDocument: vi.fn().mockResolvedValue(undefined),
    mockExtractMedications: vi.fn().mockReturnValue([]),
    mockCalculateAllOccurrences: vi.fn().mockReturnValue([]),
    mockMigrate: vi.fn().mockReturnValue(false),
  };
});

vi.mock("$lib/documents", () => ({
  documents: mockDocumentsStore,
  loadDocument: mockLoadDocument,
  addDocument: mockAddDocument,
  updateDocument: mockUpdateDocument,
  removeDocument: mockRemoveDocument,
}));

vi.mock("./convert", () => ({
  extractMedicationsFromDocument: mockExtractMedications,
}));

vi.mock("./occurrences", () => ({
  calculateAllOccurrences: mockCalculateAllOccurrences,
}));

vi.mock("./migrate", () => ({
  migrateMedicationContent: mockMigrate,
}));

// Documents types – no external deps
import { DocumentType } from "$lib/documents/types.d";

import {
  medicationsByProfile,
  activeMedicationsByProfile,
  todaySchedule,
  weekSchedule,
  extractedMedicationsByProfile,
  loadExtractedMedicationContent,
  loadMedicationContent,
  addMedication,
  updateMedication,
  deleteMedication,
  formatSchedule,
} from "./store";
import type { MedicationDocument, Medication, MedicationSchedule } from "./types";

// ---- Helpers ----

function makeMedDoc(overrides: Record<string, any> = {}): MedicationDocument {
  return {
    id: overrides.id ?? "med-1",
    type: "document" as any,
    key: "key-1",
    user_id: overrides.user_id ?? "profile-1",
    metadata: { title: "Med", tags: [], category: "medication" },
    owner_id: overrides.user_id ?? "profile-1",
    attachments: [],
    subtype: "medication",
    content: {
      title: overrides.title ?? "Aspirin",
      tags: ["medication"],
      category: "medication",
      status: overrides.status ?? "active",
      medication: {
        medicationName: overrides.medicationName ?? "Aspirin",
        dosage: "100mg",
        route: "oral",
        form: "tablet",
        status: overrides.status ?? "active",
        schedule: {
          frequency: "daily",
          times: ["08:00"],
          startDate: "2024-01-01",
        },
        adherence: { confirmations: [] },
      },
    },
  } as any;
}

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    medicationName: "Ibuprofen",
    dosage: "200mg",
    route: "oral",
    form: "tablet",
    status: "active",
    schedule: {
      frequency: "daily",
      times: ["08:00"],
      startDate: "2024-01-01",
    },
    adherence: { confirmations: [] },
    ...overrides,
  } as Medication;
}

// ---- Tests ----

describe("medicationsByProfile", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    vi.clearAllMocks();
  });

  it("returns empty when no documents exist", () => {
    const store = medicationsByProfile("profile-1");
    expect(get(store)).toEqual([]);
  });

  it("filters to only medication docs for the specified profile", () => {
    const med = makeMedDoc({ user_id: "profile-1" });
    const other = makeMedDoc({ id: "other", user_id: "profile-2" });
    mockDocumentsStore.set([med, other]);

    const store = medicationsByProfile("profile-1");
    const result = get(store);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("med-1");
  });

  it("filters by metadata.category === 'medication'", () => {
    const medByMeta = {
      ...makeMedDoc({ id: "by-meta" }),
      metadata: { category: "medication" },
      subtype: undefined,
    };
    medByMeta.content = { ...medByMeta.content };
    mockDocumentsStore.set([medByMeta]);

    const store = medicationsByProfile("profile-1");
    expect(get(store)).toHaveLength(1);
  });

  it("filters by subtype === 'medication' when metadata.category differs", () => {
    const medBySubtype = makeMedDoc({ id: "by-subtype" });
    (medBySubtype as any).metadata = { category: "other" };
    mockDocumentsStore.set([medBySubtype]);

    const store = medicationsByProfile("profile-1");
    expect(get(store)).toHaveLength(1);
  });

  it("excludes docs without content", () => {
    const noContent = { ...makeMedDoc(), content: undefined } as any;
    mockDocumentsStore.set([noContent]);

    const store = medicationsByProfile("profile-1");
    expect(get(store)).toHaveLength(0);
  });

  it("reacts to store updates", () => {
    const store = medicationsByProfile("profile-1");
    expect(get(store)).toHaveLength(0);

    mockDocumentsStore.set([makeMedDoc()]);
    expect(get(store)).toHaveLength(1);

    mockDocumentsStore.set([]);
    expect(get(store)).toHaveLength(0);
  });
});

describe("activeMedicationsByProfile", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    vi.clearAllMocks();
  });

  it("returns only active medications", () => {
    const active = makeMedDoc({ id: "a1", status: "active" });
    const paused = makeMedDoc({ id: "a2", status: "paused" });
    const discontinued = makeMedDoc({ id: "a3", status: "discontinued" });
    mockDocumentsStore.set([active, paused, discontinued]);

    const store = activeMedicationsByProfile("profile-1");
    const result = get(store);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("returns empty when all medications are inactive", () => {
    mockDocumentsStore.set([makeMedDoc({ status: "paused" })]);
    const store = activeMedicationsByProfile("profile-1");
    expect(get(store)).toHaveLength(0);
  });
});

describe("todaySchedule", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    mockCalculateAllOccurrences.mockReturnValue([]);
    vi.clearAllMocks();
  });

  it("calls calculateAllOccurrences with today's date range", () => {
    mockDocumentsStore.set([makeMedDoc()]);
    const store = todaySchedule("profile-1");
    get(store); // trigger computation

    expect(mockCalculateAllOccurrences).toHaveBeenCalled();
    const [, from, to] = mockCalculateAllOccurrences.mock.calls[0];
    // from should be midnight today
    const now = new Date();
    expect(from.getFullYear()).toBe(now.getFullYear());
    expect(from.getMonth()).toBe(now.getMonth());
    expect(from.getDate()).toBe(now.getDate());
    // to should be midnight tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(to.getDate()).toBe(tomorrow.getDate());
  });

  it("returns the result of calculateAllOccurrences", () => {
    const fakeOccurrence = { medicationId: "med-1", medicationName: "Aspirin" } as any;
    mockCalculateAllOccurrences.mockReturnValue([fakeOccurrence]);
    mockDocumentsStore.set([makeMedDoc()]);

    const store = todaySchedule("profile-1");
    expect(get(store)).toEqual([fakeOccurrence]);
  });
});

describe("weekSchedule", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    mockCalculateAllOccurrences.mockReturnValue([]);
    vi.clearAllMocks();
  });

  it("calls calculateAllOccurrences with a 7-day range starting Monday", () => {
    mockDocumentsStore.set([makeMedDoc()]);
    const store = weekSchedule("profile-1");
    get(store);

    expect(mockCalculateAllOccurrences).toHaveBeenCalled();
    const [, from, to] = mockCalculateAllOccurrences.mock.calls[0];
    // 'to' should be exactly 7 days after 'from'
    const diff = to.getTime() - from.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
    // 'from' should be a Monday (day === 1)
    expect(from.getDay()).toBe(1);
  });
});

describe("extractedMedicationsByProfile", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    mockExtractMedications.mockReturnValue([]);
    vi.clearAllMocks();
  });

  it("returns empty when no non-medication docs with medication sections exist", () => {
    mockDocumentsStore.set([makeMedDoc()]);
    const store = extractedMedicationsByProfile("profile-1");
    expect(get(store)).toEqual([]);
  });

  it("calls extractMedicationsFromDocument for qualifying docs", () => {
    const doc = {
      id: "doc-1",
      user_id: "profile-1",
      type: "document",
      content: { title: "Report" },
      metadata: { category: "report", sections: ["medications"] },
    } as any;
    mockDocumentsStore.set([doc]);
    mockExtractMedications.mockReturnValue([{ medicationName: "X" }]);

    const store = extractedMedicationsByProfile("profile-1");
    const result = get(store);

    expect(mockExtractMedications).toHaveBeenCalledWith(doc);
    expect(result).toEqual([{ medicationName: "X" }]);
  });

  it("includes docs with prescriptions section", () => {
    const doc = {
      id: "doc-2",
      user_id: "profile-1",
      content: {},
      metadata: { category: "report", sections: ["prescriptions"] },
    } as any;
    mockDocumentsStore.set([doc]);

    const store = extractedMedicationsByProfile("profile-1");
    get(store);

    expect(mockExtractMedications).toHaveBeenCalledWith(doc);
  });

  it("excludes docs without content", () => {
    const doc = {
      id: "doc-3",
      user_id: "profile-1",
      content: undefined,
      metadata: { category: "report", sections: ["medications"] },
    } as any;
    mockDocumentsStore.set([doc]);

    const store = extractedMedicationsByProfile("profile-1");
    get(store);

    expect(mockExtractMedications).not.toHaveBeenCalled();
  });
});

describe("loadExtractedMedicationContent", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    vi.clearAllMocks();
    mockLoadDocument.mockResolvedValue(undefined);
  });

  it("does nothing when no qualifying docs exist", async () => {
    mockDocumentsStore.set([makeMedDoc()]);
    await loadExtractedMedicationContent("profile-1");
    expect(mockLoadDocument).not.toHaveBeenCalled();
  });

  it("calls loadDocument for docs with medication sections but no content", async () => {
    const doc = {
      id: "doc-1",
      user_id: "profile-1",
      content: undefined,
      metadata: { category: "report", sections: ["medications"] },
    } as any;
    mockDocumentsStore.set([doc]);

    await loadExtractedMedicationContent("profile-1");
    expect(mockLoadDocument).toHaveBeenCalledWith("doc-1", "profile-1");
  });
});

describe("loadMedicationContent", () => {
  beforeEach(() => {
    mockDocumentsStore.set([]);
    vi.clearAllMocks();
    mockLoadDocument.mockResolvedValue(undefined);
    mockMigrate.mockReturnValue(false);
  });

  it("does nothing when no medication preloads exist", async () => {
    mockDocumentsStore.set([]);
    await loadMedicationContent("profile-1");
    expect(mockLoadDocument).not.toHaveBeenCalled();
  });

  it("calls loadDocument for medication docs without content", async () => {
    const preload = {
      id: "med-preload",
      user_id: "profile-1",
      content: undefined,
      subtype: "medication",
      metadata: { category: "medication" },
    } as any;
    // After loadDocument is called, add content to the store
    mockLoadDocument.mockImplementation(async () => {
      mockDocumentsStore.set([{ ...preload, content: { medication: {}, status: "active" } }]);
    });
    mockDocumentsStore.set([preload]);

    await loadMedicationContent("profile-1");
    expect(mockLoadDocument).toHaveBeenCalledWith("med-preload", "profile-1");
  });

  it("calls migrateMedicationContent and updateDocument when migration returns true", async () => {
    const med = makeMedDoc();
    // Start with a preload (no content), then after load show the full doc
    const preload = { ...med, content: undefined } as any;

    mockLoadDocument.mockImplementation(async () => {
      mockDocumentsStore.set([med]);
    });
    mockMigrate.mockReturnValue(true);
    mockDocumentsStore.set([preload]);

    await loadMedicationContent("profile-1");
    expect(mockMigrate).toHaveBeenCalledWith(med.content);
    expect(mockUpdateDocument).toHaveBeenCalledWith(med);
  });
});

describe("addMedication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDocument.mockResolvedValue({ id: "new-doc" } as any);
  });

  it("calls addDocument with a DocumentNew shaped object", async () => {
    const med = makeMedication();
    await addMedication("profile-1", med);

    expect(mockAddDocument).toHaveBeenCalledTimes(1);
    const arg = mockAddDocument.mock.calls[0][0];
    expect(arg.type).toBe(DocumentType.document);
    expect(arg.subtype).toBe("medication");
    expect(arg.user_id).toBe("profile-1");
    expect(arg.content.medication).toBe(med);
    expect(arg.content.category).toBe("medication");
    expect(arg.content.title).toBe(med.medicationName);
    expect(arg.content.status).toBe(med.status);
  });

  it("returns the document returned by addDocument", async () => {
    const returnedDoc = { id: "returned-123" } as any;
    mockAddDocument.mockResolvedValue(returnedDoc);
    const med = makeMedication();
    const result = await addMedication("profile-1", med);
    expect(result).toBe(returnedDoc);
  });
});

describe("updateMedication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue(undefined);
  });

  it("merges medication updates into content", async () => {
    const doc = makeMedDoc();
    await updateMedication(doc, { medication: { medicationName: "NewName" } as any });

    expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
    const updatedDoc = mockUpdateDocument.mock.calls[0][0];
    expect(updatedDoc.content.medication.medicationName).toBe("NewName");
    expect(updatedDoc.content.title).toBe("NewName");
  });

  it("updates status in both content and medication", async () => {
    const doc = makeMedDoc({ status: "active" });
    await updateMedication(doc, { status: "paused" });

    const updatedDoc = mockUpdateDocument.mock.calls[0][0];
    expect(updatedDoc.content.status).toBe("paused");
    expect(updatedDoc.content.medication.status).toBe("paused");
  });

  it("applies both medication and status when both provided", async () => {
    const doc = makeMedDoc();
    await updateMedication(doc, {
      medication: { medicationName: "Updated" } as any,
      status: "completed",
    });

    const updatedDoc = mockUpdateDocument.mock.calls[0][0];
    expect(updatedDoc.content.medication.medicationName).toBe("Updated");
    expect(updatedDoc.content.status).toBe("completed");
  });
});

describe("deleteMedication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveDocument.mockResolvedValue(undefined);
  });

  it("calls removeDocument with the medication ID", async () => {
    await deleteMedication("med-42");
    expect(mockRemoveDocument).toHaveBeenCalledWith("med-42");
  });
});

describe("formatSchedule", () => {
  const baseSchedule: MedicationSchedule = {
    frequency: "daily",
    times: ["08:00"],
    startDate: "2024-01-01",
  };

  it("formats 'daily' frequency", () => {
    const result = formatSchedule({ ...baseSchedule, frequency: "daily" });
    expect(result).toContain("Daily");
  });

  it("formats 'once' frequency", () => {
    const result = formatSchedule({ ...baseSchedule, frequency: "once" });
    expect(result).toContain("Once");
  });

  it("formats 'weekly' frequency", () => {
    const result = formatSchedule({ ...baseSchedule, frequency: "weekly" });
    expect(result).toContain("Weekly");
  });

  it("formats 'weekly' with byDay", () => {
    const result = formatSchedule({
      ...baseSchedule,
      frequency: "weekly",
      byDay: ["MO", "WE"],
    });
    expect(result).toContain("Weekly");
    expect(result).toContain("MO");
    expect(result).toContain("WE");
  });

  it("formats 'monthly' frequency", () => {
    const result = formatSchedule({ ...baseSchedule, frequency: "monthly" });
    expect(result).toContain("Monthly");
  });

  it("formats 'as_needed' frequency without appending times", () => {
    const result = formatSchedule({
      ...baseSchedule,
      frequency: "as_needed",
      times: ["08:00"],
    });
    expect(result).toContain("As needed");
    expect(result).not.toContain("08:00");
  });

  it("appends times for non-as_needed frequencies", () => {
    const result = formatSchedule({ ...baseSchedule, frequency: "daily", times: ["08:00", "20:00"] });
    expect(result).toContain("08:00");
    expect(result).toContain("20:00");
  });

  it("uses custom translation function when provided", () => {
    const t = (key: string) => `[${key}]`;
    const result = formatSchedule({ ...baseSchedule, frequency: "daily" }, t);
    expect(result).toContain("[medications.frequency-daily]");
  });

  it("omits times when times array is empty", () => {
    const result = formatSchedule({ ...baseSchedule, times: [], frequency: "daily" });
    // times empty → no time suffix
    expect(result.trim()).toBe("Daily");
  });
});
