import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

const { mockExistsSync, mockReadFileSync, mockReaddirSync, mockMatter, mockCompile } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn().mockReturnValue("---\ntitle: Test\n---\nContent here"),
    mockReaddirSync: vi.fn().mockReturnValue([]),
    mockMatter: vi.fn().mockReturnValue({ data: { title: "Test Doc" }, content: "Content" }),
    mockCompile: vi.fn().mockResolvedValue({ code: "<p>Compiled HTML</p>" }),
  }));

vi.mock("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  },
}));

vi.mock("gray-matter", () => ({ default: mockMatter }));
vi.mock("mdsvex", () => ({ compile: mockCompile }));
vi.mock("@sveltejs/kit", () => ({
  error: vi.fn((status: number, msg: string | { message: string }) => {
    throw Object.assign(
      new Error(typeof msg === "string" ? msg : msg.message || "error"),
      { status },
    );
  }),
}));

import {
  isValidLang,
  getContentPath,
  loadContent,
  listContent,
  getAllLanguagesForSlug,
} from "./loader.server";

beforeEach(() => {
  vi.clearAllMocks();
  mockCompile.mockResolvedValue({ code: "<p>Compiled HTML</p>" });
  mockMatter.mockReturnValue({ data: { title: "Test Doc" }, content: "Content" });
  mockReadFileSync.mockReturnValue("---\ntitle: Test\n---\nContent here");
  mockReaddirSync.mockReturnValue([]);
});

describe("isValidLang", () => {
  it("returns true for 'en'", () => {
    expect(isValidLang("en")).toBe(true);
  });

  it("returns true for 'cs'", () => {
    expect(isValidLang("cs")).toBe(true);
  });

  it("returns true for 'de'", () => {
    expect(isValidLang("de")).toBe(true);
  });

  it("returns false for 'fr'", () => {
    expect(isValidLang("fr")).toBe(false);
  });

  it("returns false for 'invalid'", () => {
    expect(isValidLang("invalid")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidLang("")).toBe(false);
  });
});

describe("getContentPath", () => {
  it("returns correct path for given lang and slug", () => {
    const result = getContentPath("en", "about");
    const expected = path.join(process.cwd(), "src/content/www", "en", "about.md");
    expect(result).toBe(expected);
  });

  it("returns correct path for different lang and slug", () => {
    const result = getContentPath("cs", "privacy");
    const expected = path.join(process.cwd(), "src/content/www", "cs", "privacy.md");
    expect(result).toBe(expected);
  });
});

describe("loadContent", () => {
  it("throws 404 for invalid lang", async () => {
    await expect(loadContent("fr", "about")).rejects.toMatchObject({ status: 404 });
  });

  it("reads file and returns ContentData with metadata, html, slug, lang", async () => {
    mockExistsSync.mockReturnValue(true);

    const result = await loadContent("en", "about");

    expect(result).toMatchObject({
      metadata: { title: "Test Doc" },
      content: "Content",
      html: "<p>Compiled HTML</p>",
      slug: "about",
      lang: "en",
    });
  });

  it("uses fallback lang 'en' when requested lang file does not exist", async () => {
    // First call (requested lang) → not found; second call (fallback) → found
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = await loadContent("cs", "about");

    expect(result.lang).toBe("en");
  });

  it("throws 404 when neither lang nor fallback exists", async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadContent("en", "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 500 when compile fails", async () => {
    mockExistsSync.mockReturnValue(true);
    mockCompile.mockResolvedValue(null);

    await expect(loadContent("en", "about")).rejects.toMatchObject({ status: 500 });
  });

  it("throws 500 when compile throws", async () => {
    mockExistsSync.mockReturnValue(true);
    mockCompile.mockRejectedValue(new Error("compile error"));

    await expect(loadContent("en", "about")).rejects.toMatchObject({ status: 500 });
  });

  it("calls readFileSync with utf-8 encoding", async () => {
    mockExistsSync.mockReturnValue(true);

    await loadContent("en", "about");

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining("about.md"),
      "utf-8",
    );
  });

  it("calls compile with content from gray-matter", async () => {
    mockExistsSync.mockReturnValue(true);

    await loadContent("en", "about");

    expect(mockCompile).toHaveBeenCalledWith("Content", expect.any(Object));
  });
});

describe("listContent", () => {
  it("returns empty array when directory does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await listContent("en");

    expect(result).toEqual([]);
  });

  it("returns slug names from .md files", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["about.md", "privacy.md", "terms.md"]);

    const result = await listContent("en");

    expect(result).toEqual(["about", "privacy", "terms"]);
  });

  it("filters out non-.md files", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["about.md", "image.png", "readme.txt"]);

    const result = await listContent("en");

    expect(result).toEqual(["about"]);
  });

  it("returns empty array when readdirSync throws", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => { throw new Error("EACCES"); });

    const result = await listContent("en");

    expect(result).toEqual([]);
  });
});

describe("getAllLanguagesForSlug", () => {
  it("returns langs where file exists", () => {
    // en → exists, cs → not exists, de → exists
    mockExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const result = getAllLanguagesForSlug("about");

    expect(result).toEqual(["en", "de"]);
  });

  it("returns all langs when all files exist", () => {
    mockExistsSync.mockReturnValue(true);

    const result = getAllLanguagesForSlug("about");

    expect(result).toEqual(["en", "cs", "de"]);
  });

  it("returns empty array when no lang has the file", () => {
    mockExistsSync.mockReturnValue(false);

    const result = getAllLanguagesForSlug("nonexistent");

    expect(result).toEqual([]);
  });
});
