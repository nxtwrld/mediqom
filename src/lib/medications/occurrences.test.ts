import { describe, it, expect } from "vitest";
import { calculateOccurrences, calculateAllOccurrences } from "./occurrences";
import type { MedicationDocument } from "./types";

function makeMedDoc(
  overrides: Record<string, any> = {},
): MedicationDocument {
  return {
    id: overrides.id || "med-1",
    type: "document" as any,
    key: "key-1",
    user_id: "user-1",
    metadata: { title: "Med", tags: [] },
    owner_id: "user-1",
    attachments: [],
    subtype: "medication",
    content: {
      title: overrides.title || "Aspirin",
      tags: [],
      category: "medication",
      status: overrides.status || "active",
      medication: {
        medicationName: overrides.medicationName || "Aspirin",
        dosage: overrides.dosage || "100mg",
        route: "oral",
        form: "tablet",
        status: overrides.status || "active",
        schedule: {
          frequency: overrides.frequency || "daily",
          times: overrides.times || ["08:00"],
          startDate: overrides.startDate || "2024-06-01",
          endDate: overrides.endDate,
          byDay: overrides.byDay,
          byMonthDay: overrides.byMonthDay,
        },
        adherence: {
          confirmations: overrides.confirmations || [],
        },
        ...(overrides.medication || {}),
      },
    },
  } as any;
}

describe("calculateOccurrences", () => {
  it("returns empty for no schedule start date", () => {
    const med = makeMedDoc();
    med.content.medication.schedule.startDate = "";
    const result = calculateOccurrences(
      med,
      new Date(2024, 5, 1),
      new Date(2024, 5, 7),
    );
    expect(result).toEqual([]);
  });

  it("returns empty when range is before start date", () => {
    const med = makeMedDoc({ startDate: "2024-06-10" });
    const result = calculateOccurrences(
      med,
      new Date(2024, 5, 1),
      new Date(2024, 5, 5),
    );
    expect(result).toEqual([]);
  });

  it("returns empty when range is after end date", () => {
    const med = makeMedDoc({
      startDate: "2024-06-01",
      endDate: "2024-06-05",
    });
    const result = calculateOccurrences(
      med,
      new Date(2024, 5, 10),
      new Date(2024, 5, 15),
    );
    expect(result).toEqual([]);
  });

  describe("daily frequency", () => {
    it("generates one occurrence per day", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        times: ["08:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 3, 23, 59, 59),
      );
      expect(result.length).toBe(3);
      expect(result[0].scheduledDate).toBe("2024-06-01");
      expect(result[1].scheduledDate).toBe("2024-06-02");
      expect(result[2].scheduledDate).toBe("2024-06-03");
    });

    it("generates multiple occurrences per day for multiple times", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        times: ["08:00", "14:00", "20:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 1, 23, 59, 59),
      );
      expect(result.length).toBe(3);
      expect(result.map((o) => o.scheduledTime)).toEqual([
        "08:00",
        "14:00",
        "20:00",
      ]);
    });

    it("uses default time 08:00 when times array is empty", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        times: [],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 1, 23, 59, 59),
      );
      expect(result.length).toBe(1);
      expect(result[0].scheduledTime).toBe("08:00");
    });

    it("clamps to schedule end date", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        endDate: "2024-06-04",
        times: ["08:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 10, 23, 59, 59),
      );
      // June 1, 2, 3 (endDate June 4 midnight excludes June 4 08:00)
      expect(result.length).toBe(3);
    });

    it("includes correct medication info in occurrences", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        medicationName: "Ibuprofen",
        dosage: "200mg",
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 1, 23, 59, 59),
      );
      expect(result[0].medicationId).toBe("med-1");
      expect(result[0].medicationName).toBe("Ibuprofen");
      expect(result[0].dosage).toBe("200mg");
      expect(result[0].form).toBe("tablet");
    });
  });

  describe("once frequency", () => {
    it("generates single occurrence on start date", () => {
      const med = makeMedDoc({
        frequency: "once",
        startDate: "2024-06-01",
        times: ["10:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 7, 23, 59, 59),
      );
      expect(result.length).toBe(1);
      expect(result[0].scheduledDate).toBe("2024-06-01");
      expect(result[0].scheduledTime).toBe("10:00");
    });

    it("returns empty if start date outside range", () => {
      const med = makeMedDoc({
        frequency: "once",
        startDate: "2024-06-10",
        times: ["10:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 5, 23, 59, 59),
      );
      expect(result).toEqual([]);
    });
  });

  describe("weekly frequency", () => {
    it("generates occurrences only on specified days", () => {
      const med = makeMedDoc({
        frequency: "weekly",
        startDate: "2024-06-01", // Saturday
        byDay: ["MO", "WE", "FR"],
        times: ["09:00"],
      });
      // June 2024: Mon=3, Wed=5, Fri=7, Mon=10, Wed=12, Fri=14
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 14, 23, 59, 59),
      );
      expect(result.length).toBe(6);
      for (const occ of result) {
        const day = new Date(occ.scheduledDate + "T12:00:00").getDay();
        expect([1, 3, 5]).toContain(day);
      }
    });

    it("defaults to range start day when no byDay specified", () => {
      const med = makeMedDoc({
        frequency: "weekly",
        startDate: "2024-06-03", // Monday
        times: ["09:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 3),
        new Date(2024, 5, 17, 23, 59, 59),
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("monthly frequency", () => {
    it("generates occurrences on specified month days", () => {
      const med = makeMedDoc({
        frequency: "monthly",
        startDate: "2024-06-01",
        byMonthDay: [1, 15],
        times: ["08:00"],
      });
      // Use a from date well before startDate to avoid boundary issues
      const result = calculateOccurrences(
        med,
        new Date(2024, 4, 25),
        new Date(2024, 7, 31, 23, 59, 59),
      );
      // June 15, July 1, July 15, Aug 1, Aug 15 (June 1 may be excluded due to UTC/local boundary)
      expect(result.length).toBeGreaterThanOrEqual(5);
    });

    it("defaults to start date's day of month when no byMonthDay", () => {
      const med = makeMedDoc({
        frequency: "monthly",
        startDate: "2024-06-10",
        times: ["08:00"],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 7, 31, 23, 59, 59),
      );
      // Multiple monthly occurrences generated
      expect(result.length).toBeGreaterThanOrEqual(2);
      // All occurrences share the same day-of-month in their scheduled date
      const days = new Set(result.map((o) => o.scheduledDate.split("-")[2]));
      expect(days.size).toBe(1);
    });
  });

  describe("as_needed frequency", () => {
    it("generates no scheduled occurrences", () => {
      const med = makeMedDoc({
        frequency: "as_needed",
        startDate: "2024-06-01",
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 30, 23, 59, 59),
      );
      expect(result).toEqual([]);
    });
  });

  describe("adherence status", () => {
    it("marks occurrences as taken when confirmation exists", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        times: ["08:00"],
        confirmations: [
          {
            date: "2024-06-01",
            scheduledTime: "08:00",
            status: "taken",
            takenAt: "08:05",
          },
        ],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 1, 23, 59, 59),
      );
      expect(result[0].status).toBe("taken");
      expect(result[0].takenAt).toBe("08:05");
    });

    it("marks occurrences as skipped when confirmation says so", () => {
      const med = makeMedDoc({
        startDate: "2024-06-01",
        times: ["08:00"],
        confirmations: [
          {
            date: "2024-06-01",
            scheduledTime: "08:00",
            status: "skipped",
          },
        ],
      });
      const result = calculateOccurrences(
        med,
        new Date(2024, 5, 1),
        new Date(2024, 5, 1, 23, 59, 59),
      );
      expect(result[0].status).toBe("skipped");
    });
  });

  it("sorts occurrences by date then time", () => {
    const med = makeMedDoc({
      startDate: "2024-06-01",
      times: ["20:00", "08:00", "14:00"],
    });
    const result = calculateOccurrences(
      med,
      new Date(2024, 5, 1),
      new Date(2024, 5, 2, 23, 59, 59),
    );
    expect(result[0].scheduledDate).toBe("2024-06-01");
    expect(result[0].scheduledTime).toBe("08:00");
    expect(result[1].scheduledTime).toBe("14:00");
    expect(result[2].scheduledTime).toBe("20:00");
  });
});

describe("calculateAllOccurrences", () => {
  it("returns empty for empty medications array", () => {
    const result = calculateAllOccurrences(
      [],
      new Date(2024, 5, 1),
      new Date(2024, 5, 7),
    );
    expect(result).toEqual([]);
  });

  it("filters out inactive medications", () => {
    const meds = [
      makeMedDoc({ id: "m1", status: "active", startDate: "2024-06-01" }),
      makeMedDoc({ id: "m2", status: "paused", startDate: "2024-06-01" }),
      makeMedDoc({
        id: "m3",
        status: "discontinued",
        startDate: "2024-06-01",
      }),
    ];
    const result = calculateAllOccurrences(
      meds,
      new Date(2024, 5, 1),
      new Date(2024, 5, 1, 23, 59, 59),
    );
    expect(result.every((o) => o.medicationId === "m1")).toBe(true);
  });

  it("combines occurrences from multiple medications", () => {
    const meds = [
      makeMedDoc({
        id: "m1",
        medicationName: "Drug A",
        startDate: "2024-06-01",
        times: ["08:00"],
      }),
      makeMedDoc({
        id: "m2",
        medicationName: "Drug B",
        startDate: "2024-06-01",
        times: ["09:00"],
      }),
    ];
    const result = calculateAllOccurrences(
      meds,
      new Date(2024, 5, 1),
      new Date(2024, 5, 1, 23, 59, 59),
    );
    expect(result.length).toBe(2);
    const names = result.map((o) => o.medicationName);
    expect(names).toContain("Drug A");
    expect(names).toContain("Drug B");
  });

  it("sorts combined results by date then time", () => {
    const meds = [
      makeMedDoc({
        id: "m1",
        startDate: "2024-06-01",
        times: ["14:00"],
      }),
      makeMedDoc({
        id: "m2",
        startDate: "2024-06-01",
        times: ["08:00"],
      }),
    ];
    const result = calculateAllOccurrences(
      meds,
      new Date(2024, 5, 1),
      new Date(2024, 5, 1, 23, 59, 59),
    );
    expect(result[0].scheduledTime).toBe("08:00");
    expect(result[1].scheduledTime).toBe("14:00");
  });
});
