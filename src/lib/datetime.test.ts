import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAge,
  parseDate,
  durationFromFormatted,
  durationFrom,
  core,
  date as formatDate,
  time as formatTime,
  dateTime as formatDateTime,
  duration,
  durationInMinutes,
  toOADate,
  fromOADate,
  fromDicomDate,
  toISOString,
} from "./datetime";

describe("getAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns age as of today for a past birth date (string)", () => {
    expect(getAge("1990-04-14")).toBe(36);
  });

  it("subtracts one when birthday has not occurred this year", () => {
    expect(getAge("1990-06-01")).toBe(35);
  });

  it("handles Date object inputs", () => {
    expect(getAge(new Date("2000-01-01"))).toBe(26);
  });

  it("returns 0 for missing/invalid input", () => {
    expect(getAge(undefined as any)).toBe(0);
    expect(getAge(null as any)).toBe(0);
  });
});

describe("parseDate", () => {
  it("parses DD.MM.YYYY format and returns an ISO string", () => {
    const result = parseDate("Operation on 15.03.2024");
    expect(result).toMatch(/^2024-03-1[45]T/); // timezone may shift by a day
  });

  it("falls back to chrono parsing for natural language", () => {
    const result = parseDate("January 5, 2024");
    expect(result).toMatch(/^2024-01-0[45]T/);
  });

  it("returns empty string when no date is found", () => {
    expect(parseDate("no date here")).toBe("");
  });
});

describe("durationFromFormatted", () => {
  it("measures days between two dates", () => {
    const d = durationFromFormatted(
      "days",
      "2026-01-01",
      "2026-01-11",
    );
    expect(d).toBe(10);
  });

  it("measures months between two dates", () => {
    expect(
      durationFromFormatted("months", "2025-01-01", "2026-01-01"),
    ).toBe(12);
  });

  it("measures years between two dates", () => {
    expect(
      durationFromFormatted("years", "2020-01-01", "2026-01-01"),
    ).toBe(6);
  });
});

describe("durationFrom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns days when duration is ≤ 30 days", () => {
    const r = durationFrom("2026-04-10");
    expect(r.format).toBe("days");
    expect(r.value).toBe(4);
  });

  it("returns months when duration is between 30 and 400 days", () => {
    const r = durationFrom("2026-01-01");
    expect(r.format).toBe("months");
    expect(r.value).toBe(3);
  });

  it("returns years when duration exceeds 400 days", () => {
    const r = durationFrom("2020-01-01");
    expect(r.format).toBe("years");
    expect(r.value).toBe(6);
  });
});

describe("formatting helpers (date / time / dateTime / core)", () => {
  const ref = "2026-04-14T15:30:45Z";

  it("core() returns a dayjs instance for valid input, undefined for undefined", () => {
    expect(core(undefined)).toBeUndefined();
    const d = core(ref);
    expect(d).toBeDefined();
    expect(typeof (d as any).format).toBe("function");
  });

  it("date() formats with default DD.MM.YYYY when no format supplied", () => {
    expect(formatDate(ref)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it("date() honors a custom format string", () => {
    expect(formatDate(ref, "YYYY-MM-DD")).toMatch(/^2026-04-1[45]$/);
  });

  it("time() formats with default HH:mm", () => {
    expect(formatTime(ref)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("dateTime() combines date and time by default", () => {
    expect(formatDateTime(ref)).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });

  it("all formatters return undefined for undefined input", () => {
    expect(formatDate(undefined)).toBeUndefined();
    expect(formatTime(undefined)).toBeUndefined();
    expect(formatDateTime(undefined)).toBeUndefined();
  });
});

describe("duration / durationInMinutes", () => {
  it("humanizes an ISO-8601 duration string", () => {
    // 2 hours → "2 hours"
    expect(duration("PT2H")).toMatch(/hour/);
  });

  it("returns undefined when given undefined", () => {
    expect(duration(undefined)).toBeUndefined();
  });

  it("converts an ISO-8601 duration to minutes", () => {
    expect(durationInMinutes("PT2H")).toBe(120);
    expect(durationInMinutes("PT30M")).toBe(30);
  });

  it("returns 0 for undefined duration input", () => {
    expect(durationInMinutes(undefined)).toBe(0);
  });
});

describe("toOADate / fromOADate", () => {
  it("is a round-trip for a representative date (within 1 day)", () => {
    const original = new Date("2020-06-15T12:00:00Z");
    const oa = toOADate(original);
    expect(typeof oa).toBe("number");
    const back = fromOADate(oa);
    // Accept 1-day drift due to timezone offset math inside toOADate
    const diffHours =
      Math.abs(back.getTime() - original.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThan(25);
  });
});

describe("fromDicomDate", () => {
  it("parses YYYYMMDD + HHMMSS DICOM strings", () => {
    const d = fromDicomDate("20240315", "143045");
    expect(d.toISOString()).toBe("2024-03-15T14:30:45.000Z");
  });

  it("parses DICOM date alone (no time)", () => {
    const d = fromDicomDate("20240315");
    expect(d.toISOString()).toBe("2024-03-15T00:00:00.000Z");
  });

  it("parses DICOM time with fractional milliseconds", () => {
    const d = fromDicomDate("20240315", "143045.500");
    expect(d.toISOString()).toBe("2024-03-15T14:30:45.500Z");
  });
});

describe("toISOString", () => {
  it("accepts a Date and returns its ISO representation", () => {
    expect(toISOString(new Date("2026-01-01T00:00:00Z"))).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("accepts a string and returns its ISO representation", () => {
    expect(toISOString("2026-01-01T00:00:00Z")).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
