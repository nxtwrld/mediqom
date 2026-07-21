import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// Set up localStorage mock before importing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

// Mock matchMedia
const matchMediaMock = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Object.defineProperty(globalThis, "window", {
  value: { matchMedia: matchMediaMock },
  configurable: true,
});

describe("theme/store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("defaults to 'system' preference when localStorage is empty", async () => {
    const { themePreference } = await import("./store");
    expect(get(themePreference)).toBe("system");
  });

  it("reads 'dark' from localStorage", async () => {
    localStorageMock.setItem("theme", "dark");
    const { themePreference } = await import("./store");
    expect(get(themePreference)).toBe("dark");
  });

  it("reads 'light' from localStorage", async () => {
    localStorageMock.setItem("theme", "light");
    const { themePreference } = await import("./store");
    expect(get(themePreference)).toBe("light");
  });

  it("falls back to 'system' for invalid stored value", async () => {
    localStorageMock.setItem("theme", "invalid");
    const { themePreference } = await import("./store");
    expect(get(themePreference)).toBe("system");
  });

  it("toggleTheme cycles system → light → dark → system", async () => {
    const { themePreference, toggleTheme } = await import("./store");
    themePreference.set("system");

    toggleTheme();
    expect(get(themePreference)).toBe("light");

    toggleTheme();
    expect(get(themePreference)).toBe("dark");

    toggleTheme();
    expect(get(themePreference)).toBe("system");
  });

  it("theme derived store resolves correctly for explicit preference", async () => {
    const { themePreference, theme } = await import("./store");
    themePreference.set("dark");
    expect(get(theme)).toBe("dark");

    themePreference.set("light");
    expect(get(theme)).toBe("light");
  });
});
