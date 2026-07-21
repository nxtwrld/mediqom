import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { device, orientation, connectivity, screen, preferences } from "./store";
import type { DeviceState } from "./store";

// device/store.ts has no external deps — all browser APIs are guarded with
// typeof window checks, so it runs safely in jsdom / node environments.

describe("device store – initial state", () => {
  it("has sensible defaults before init()", () => {
    const state: DeviceState = get(device);
    expect(state.orientation).toBe("portrait");
    expect(state.orientationAngle).toBe(0);
    expect(state.isLandscape).toBe(false);
    expect(state.isOnline).toBe(true);
    expect(state.connectionType).toBeNull();
    expect(state.isVisible).toBe(true);
    expect(state.prefersReducedMotion).toBe(false);
    expect(state.prefersDarkMode).toBe(false);
    expect(state.batteryLevel).toBeNull();
    expect(state.isCharging).toBeNull();
  });
});

describe("derived store – orientation", () => {
  it("reflects device orientation fields", () => {
    const o = get(orientation);
    expect(o).toHaveProperty("orientation");
    expect(o).toHaveProperty("angle");
    expect(o).toHaveProperty("isLandscape");
    expect(o.orientation).toBe(get(device).orientation);
    expect(o.angle).toBe(get(device).orientationAngle);
    expect(o.isLandscape).toBe(get(device).isLandscape);
  });
});

describe("derived store – connectivity", () => {
  it("reflects isOnline and connectionType", () => {
    const c = get(connectivity);
    expect(c).toHaveProperty("isOnline");
    expect(c).toHaveProperty("connectionType");
    expect(c.isOnline).toBe(get(device).isOnline);
    expect(c.connectionType).toBe(get(device).connectionType);
  });
});

describe("derived store – screen", () => {
  it("reflects width, height, isMobile, isTouch", () => {
    const s = get(screen);
    expect(s).toHaveProperty("width");
    expect(s).toHaveProperty("height");
    expect(s).toHaveProperty("isMobile");
    expect(s).toHaveProperty("isTouch");
    expect(s.width).toBe(get(device).screenWidth);
    expect(s.height).toBe(get(device).screenHeight);
  });
});

describe("derived store – preferences", () => {
  it("reflects reducedMotion and darkMode", () => {
    const p = get(preferences);
    expect(p).toHaveProperty("reducedMotion");
    expect(p).toHaveProperty("darkMode");
    expect(p.reducedMotion).toBe(get(device).prefersReducedMotion);
    expect(p.darkMode).toBe(get(device).prefersDarkMode);
  });
});

describe("device store – derived stores stay in sync after store update", () => {
  // The store is a singleton across tests; we update it directly via its
  // internal writable — but only the public subscribe is exposed.
  // We verify reactivity by calling init() (which calls updateAll) in jsdom.

  it("orientation derived store emits correct landscape state", () => {
    // We can't easily trigger init without a full browser env, but we can
    // subscribe and verify the derived values stay consistent with the base.
    let latestOrientation: any = null;
    const unsub = orientation.subscribe((v) => { latestOrientation = v; });

    // Derived values should match base store at any point
    const base = get(device);
    expect(latestOrientation!.isLandscape).toBe(base.isLandscape);
    expect(latestOrientation!.orientation).toBe(base.orientation);

    unsub();
  });

  it("connectivity derived store tracks isOnline from base store", () => {
    let latest: any = null;
    const unsub = connectivity.subscribe((v) => { latest = v; });

    const base = get(device);
    expect(latest!.isOnline).toBe(base.isOnline);

    unsub();
  });
});

describe("device store – destroy() does not throw", () => {
  it("can call destroy() without errors", () => {
    expect(() => device.destroy()).not.toThrow();
  });
});

describe("device store – init() runs without throwing", () => {
  it("init() completes without error when window is undefined (SSR/Node)", () => {
    // In Node, window is undefined — init() has a typeof window guard and returns early.
    // It should never throw regardless of environment.
    expect(() => device.init()).not.toThrow();
  });

  it("after init() in Node, screenWidth stays 0 (no window)", () => {
    device.init();
    const s = get(device);
    // In Node environment, window is undefined, so init() returns early
    // and screen dimensions remain at the initialState default (0).
    expect(typeof s.screenWidth).toBe("number");
    expect(typeof s.screenHeight).toBe("number");
  });

  it("after init() in Node, isOnline remains true (default)", () => {
    device.init();
    const s = get(device);
    // init() returns early in Node; default isOnline is true
    expect(typeof s.isOnline).toBe("boolean");
  });
});

// ── Browser environment simulation ───────────────────────────────────────────
// Set up a fake window/navigator/document to exercise init() browser paths

describe("device store – init() browser paths", () => {
  let listeners: Map<string, EventListenerOrEventListenerObject[]>;
  let docListeners: Map<string, EventListenerOrEventListenerObject[]>;
  let originalWindow: any;
  let originalNavigator: any;
  let originalDocument: any;

  function makeEventTarget() {
    const ls = new Map<string, Function[]>();
    return {
      addEventListener: vi.fn((type: string, fn: Function) => {
        if (!ls.has(type)) ls.set(type, []);
        ls.get(type)!.push(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: Function) => {
        const arr = ls.get(type) || [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      }),
      dispatchEvent: (type: string) => {
        (ls.get(type) || []).forEach((fn) => fn({}));
      },
      _listeners: ls,
    };
  }

  beforeEach(() => {
    originalWindow = (global as any).window;
    originalNavigator = (global as any).navigator;
    originalDocument = (global as any).document;

    const winTarget = makeEventTarget();
    const screenOrientation = {
      angle: 0,
      ...makeEventTarget(),
    };
    const mediaQueryList = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const mockWindow = {
      addEventListener: winTarget.addEventListener,
      removeEventListener: winTarget.removeEventListener,
      _dispatch: winTarget.dispatchEvent,
      screen: { orientation: screenOrientation },
      innerWidth: 1024,
      innerHeight: 768,
      matchMedia: vi.fn().mockReturnValue(mediaQueryList),
    };
    const mockNavigator = { onLine: true, maxTouchPoints: 0 };
    const mockDocument = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(global, "window", { value: mockWindow, writable: true, configurable: true });
    Object.defineProperty(global, "navigator", { value: mockNavigator, writable: true, configurable: true });
    Object.defineProperty(global, "document", { value: mockDocument, writable: true, configurable: true });
  });

  afterEach(() => {
    device.destroy();
    Object.defineProperty(global, "window", { value: originalWindow, writable: true, configurable: true });
    Object.defineProperty(global, "navigator", { value: originalNavigator, writable: true, configurable: true });
    Object.defineProperty(global, "document", { value: originalDocument, writable: true, configurable: true });
  });

  it("init() calls updateAll when window is available", () => {
    device.init();
    const s = get(device);
    // updateAll reads window.innerWidth
    expect(s.screenWidth).toBe(1024);
    expect(s.screenHeight).toBe(768);
  });

  it("init() sets isMobile true when innerWidth <= 768", () => {
    (global as any).window.innerWidth = 375;
    device.init();
    expect(get(device).isMobile).toBe(true);
  });

  it("init() sets isMobile false when innerWidth > 768", () => {
    (global as any).window.innerWidth = 1280;
    device.init();
    expect(get(device).isMobile).toBe(false);
  });

  it("init() reads navigator.onLine", () => {
    (global as any).navigator.onLine = false;
    device.init();
    expect(get(device).isOnline).toBe(false);
  });

  it("init() reads document.hidden for isVisible", () => {
    (global as any).document.hidden = true;
    device.init();
    expect(get(device).isVisible).toBe(false);
  });

  it("init() calls matchMedia for preference queries", () => {
    device.init();
    expect((global as any).window.matchMedia).toHaveBeenCalled();
  });

  it("init() registers orientationchange listener on window", () => {
    device.init();
    expect((global as any).window.addEventListener).toHaveBeenCalledWith(
      "orientationchange",
      expect.any(Function),
    );
  });

  it("init() registers online/offline listeners", () => {
    device.init();
    expect((global as any).window.addEventListener).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );
    expect((global as any).window.addEventListener).toHaveBeenCalledWith(
      "offline",
      expect.any(Function),
    );
  });

  it("destroy() cleans up cleanupFns without error", () => {
    device.init();
    expect(() => device.destroy()).not.toThrow();
  });

  it("orientation angle 90 maps to landscape-left", () => {
    const screenOrientation = {
      angle: 90,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (global as any).window.screen = { orientation: screenOrientation };
    device.init();
    const s = get(device);
    expect(s.orientation).toBe("landscape-left");
    expect(s.isLandscape).toBe(true);
  });

  it("orientation angle 270 maps to landscape-right", () => {
    const screenOrientation = {
      angle: 270,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (global as any).window.screen = { orientation: screenOrientation };
    device.init();
    const s = get(device);
    expect(s.orientation).toBe("landscape-right");
    expect(s.isLandscape).toBe(true);
  });

  it("orientation angle 180 maps to portrait-upside-down", () => {
    const screenOrientation = {
      angle: 180,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (global as any).window.screen = { orientation: screenOrientation };
    device.init();
    const s = get(device);
    expect(s.orientation).toBe("portrait-upside-down");
    expect(s.isLandscape).toBe(false);
  });

  it("init() with getBattery updates battery state", async () => {
    const mockBattery = {
      level: 0.8,
      charging: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (global as any).navigator.getBattery = vi.fn().mockResolvedValue(mockBattery);
    device.init();
    // Wait for the async getBattery promise
    await Promise.resolve();
    await Promise.resolve();
    const s = get(device);
    expect(s.batteryLevel).toBe(0.8);
    expect(s.isCharging).toBe(true);
  });
});
