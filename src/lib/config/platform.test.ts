import { describe, it, expect, vi, beforeEach } from "vitest";

// Static mocks — overridden per-describe using vi.resetModules() + vi.doMock() + dynamic import.
vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
    getPlatform: vi.fn().mockReturnValue("web"),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure global.window exists so platform.ts can access window.__CAPACITOR_BUILD__
 * and window.location.origin. Vitest runs in Node (no DOM) by default.
 */
function ensureWindow() {
  if (typeof global.window === "undefined") {
    Object.defineProperty(global, "window", {
      value: {
        __CAPACITOR_BUILD__: undefined,
        location: { origin: "http://localhost:3000" },
      },
      writable: true,
      configurable: true,
    });
  }
  if (!global.window.location) {
    global.window.location = { origin: "http://localhost:3000" } as Location;
  }
}

// Ensure window is set up before any test module code runs.
ensureWindow();

async function importPlatform() {
  return import("./platform") as Promise<typeof import("./platform")>;
}

// ---------------------------------------------------------------------------
// isNativePlatform
// ---------------------------------------------------------------------------
describe("isNativePlatform", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
  });

  it("returns false when browser=false (SSR)", async () => {
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { isNativePlatform } = await importPlatform();
    expect(isNativePlatform()).toBe(false);
  });

  it("returns false when Capacitor.isNativePlatform() returns false", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { isNativePlatform } = await importPlatform();
    expect(isNativePlatform()).toBe(false);
  });

  it("returns true when Capacitor.isNativePlatform() returns true", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { isNativePlatform } = await importPlatform();
    expect(isNativePlatform()).toBe(true);
  });

  it("returns false when Capacitor.isNativePlatform() throws", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockImplementation(() => {
          throw new Error("Capacitor unavailable");
        }),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { isNativePlatform } = await importPlatform();
    expect(isNativePlatform()).toBe(false);
  });

  it("caches the result (Capacitor called only once)", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    const mockFn = vi.fn().mockReturnValue(false);
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: mockFn,
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { isNativePlatform } = await importPlatform();
    isNativePlatform();
    isNativePlatform();
    isNativePlatform();
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// isCapacitorBuild
// ---------------------------------------------------------------------------
describe("isCapacitorBuild", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
    // Make sure window.__CAPACITOR_BUILD__ is cleared
    if (global.window) global.window.__CAPACITOR_BUILD__ = undefined;
  });

  it("returns false when browser=false (SSR)", async () => {
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(false);
  });

  it("returns false when no Capacitor signals are present", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(false);
  });

  it("returns true when isNativePlatform() returns true", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(true);
  });

  it("returns true when window.__CAPACITOR_BUILD__ is set", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    global.window.__CAPACITOR_BUILD__ = true;
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(true);
    global.window.__CAPACITOR_BUILD__ = undefined;
  });

  it("returns true when Capacitor platform is ios", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(true);
  });

  it("returns true when Capacitor platform is android", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("android"),
      },
    }));
    const { isCapacitorBuild } = await importPlatform();
    expect(isCapacitorBuild()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPlatform / isIOS / isAndroid
// ---------------------------------------------------------------------------
describe("getPlatform", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
  });

  it("returns 'web' when browser=false", async () => {
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { getPlatform } = await importPlatform();
    expect(getPlatform()).toBe("web");
  });

  it("returns 'ios' when Capacitor reports ios", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { getPlatform } = await importPlatform();
    expect(getPlatform()).toBe("ios");
  });

  it("returns 'android' when Capacitor reports android", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("android"),
      },
    }));
    const { getPlatform } = await importPlatform();
    expect(getPlatform()).toBe("android");
  });

  it("returns 'web' when Capacitor.getPlatform throws", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockImplementation(() => {
          throw new Error("unavailable");
        }),
      },
    }));
    const { getPlatform } = await importPlatform();
    expect(getPlatform()).toBe("web");
  });
});

describe("isIOS / isAndroid", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
  });

  it("isIOS returns true on ios platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { isIOS } = await importPlatform();
    expect(isIOS()).toBe(true);
  });

  it("isIOS returns false on android platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("android"),
      },
    }));
    const { isIOS } = await importPlatform();
    expect(isIOS()).toBe(false);
  });

  it("isAndroid returns true on android platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("android"),
      },
    }));
    const { isAndroid } = await importPlatform();
    expect(isAndroid()).toBe(true);
  });

  it("isAndroid returns false on ios platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { isAndroid } = await importPlatform();
    expect(isAndroid()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getApiBaseUrl
// ---------------------------------------------------------------------------
describe("getApiBaseUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
    if (global.window) global.window.__CAPACITOR_BUILD__ = undefined;
  });

  it("returns empty string when browser=false", async () => {
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { getApiBaseUrl } = await importPlatform();
    expect(getApiBaseUrl()).toBe("");
  });

  it("returns empty string when not native and not capacitor build", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { getApiBaseUrl } = await importPlatform();
    expect(getApiBaseUrl()).toBe("");
  });

  it("returns production URL when native platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { getApiBaseUrl } = await importPlatform();
    const url = getApiBaseUrl();
    expect(url).toMatch(/^https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// getAuthRedirectUrl
// ---------------------------------------------------------------------------
describe("getAuthRedirectUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
    if (global.window) global.window.__CAPACITOR_BUILD__ = undefined;
  });

  it("returns /auth/confirm when browser=false", async () => {
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { getAuthRedirectUrl } = await importPlatform();
    expect(getAuthRedirectUrl()).toBe("/auth/confirm");
  });

  it("returns native callback URL when isNativePlatform=true", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { getAuthRedirectUrl } = await importPlatform();
    expect(getAuthRedirectUrl()).toBe("https://mediqom.com/auth/callback");
  });

  it("returns window.location.origin + /auth/confirm for web", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { getAuthRedirectUrl } = await importPlatform();
    const result = getAuthRedirectUrl();
    expect(result).toContain("/auth/confirm");
    expect(result).toMatch(/^https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// platformConfig
// ---------------------------------------------------------------------------
describe("platformConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureWindow();
    if (global.window) global.window.__CAPACITOR_BUILD__ = undefined;
  });

  it("deepLinkScheme is 'mediqom'", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { platformConfig } = await importPlatform();
    expect(platformConfig.deepLinkScheme).toBe("mediqom");
  });

  it("hasSSR is true when not a capacitor build", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { platformConfig } = await importPlatform();
    expect(platformConfig.hasSSR).toBe(true);
  });

  it("hasSSR is false when running as native app", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { platformConfig } = await importPlatform();
    expect(platformConfig.hasSSR).toBe(false);
  });

  it("useTokenAuth is false on web", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
        getPlatform: vi.fn().mockReturnValue("web"),
      },
    }));
    const { platformConfig } = await importPlatform();
    expect(platformConfig.useTokenAuth).toBe(false);
  });

  it("useTokenAuth is true on native platform", async () => {
    vi.doMock("$app/environment", () => ({ browser: true }));
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(true),
        getPlatform: vi.fn().mockReturnValue("ios"),
      },
    }));
    const { platformConfig } = await importPlatform();
    expect(platformConfig.useTokenAuth).toBe(true);
  });
});
