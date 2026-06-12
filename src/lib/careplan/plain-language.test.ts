import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/api/client", () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({ text: "llm rewrite" }),
  })),
}));

import {
  sourceHash,
  icd10PlainKey,
  getCachedPlain,
  resolvePlainLanguage,
} from "./plain-language";
import { apiFetch } from "$lib/api/client";
import type { PlainLanguageCache } from "./types";

describe("sourceHash", () => {
  it("is stable and differs by input", () => {
    expect(sourceHash("abc")).toBe(sourceHash("abc"));
    expect(sourceHash("abc")).not.toBe(sourceHash("abd"));
  });
});

describe("icd10PlainKey", () => {
  it("builds the pinned key convention", () => {
    expect(icd10PlainKey("E11.9")).toBe("medical.icd10.e11_9.plain");
  });
});

describe("getCachedPlain", () => {
  const cache: PlainLanguageCache = {
    taskText: {
      text: "simple",
      sourceHash: sourceHash("clinical"),
      language: "en",
    },
  };
  it("hits on matching hash + language", () => {
    expect(getCachedPlain(cache, "taskText", "clinical", "en")).toBe("simple");
  });
  it("misses on language change", () => {
    expect(getCachedPlain(cache, "taskText", "clinical", "de")).toBeUndefined();
  });
  it("misses on source change", () => {
    expect(
      getCachedPlain(cache, "taskText", "different", "en"),
    ).toBeUndefined();
  });
});

describe("resolvePlainLanguage", () => {
  it("returns an i18n hit without calling the LLM", async () => {
    const t = (key: string) =>
      key === "medical.icd10.e11.plain" ? "high blood sugar" : key;
    const res = await resolvePlainLanguage({
      item: { diagnosisCode: "E11", plainLanguage: undefined },
      field: "diagnosisDescription",
      source: "Diabetes mellitus type 2",
      language: "en",
      t,
    });
    expect(res).toEqual({ text: "high blood sugar", fromCache: true });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("returns a cache hit without calling the LLM", async () => {
    const res = await resolvePlainLanguage({
      item: {
        diagnosisCode: undefined,
        plainLanguage: {
          taskText: {
            text: "cached",
            sourceHash: sourceHash("src"),
            language: "en",
          },
        },
      },
      field: "taskText",
      source: "src",
      language: "en",
      t: (k) => k,
    });
    expect(res.text).toBe("cached");
    expect(res.fromCache).toBe(true);
  });

  it("falls back to the LLM and returns a cache entry to persist", async () => {
    const res = await resolvePlainLanguage({
      item: { diagnosisCode: undefined, plainLanguage: undefined },
      field: "goalText",
      source: "reduce LDL",
      language: "en",
      t: (k) => k,
    });
    expect(res.text).toBe("llm rewrite");
    expect(res.fromCache).toBe(false);
    expect(res.cacheEntry).toMatchObject({
      text: "llm rewrite",
      language: "en",
    });
  });
});
