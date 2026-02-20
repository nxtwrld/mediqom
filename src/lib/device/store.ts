import { writable, derived } from "svelte/store";

// ============ Types ============

export type DeviceOrientation =
  | "portrait"
  | "landscape-left"
  | "landscape-right"
  | "portrait-upside-down";

export interface DeviceState {
  // Orientation
  orientation: DeviceOrientation;
  orientationAngle: number;
  isLandscape: boolean;

  // Connectivity
  isOnline: boolean;
  connectionType: string | null; // 'wifi', '4g', '3g', etc.

  // Visibility
  isVisible: boolean;

  // Display
  isMobile: boolean;
  isTouch: boolean;
  screenWidth: number;
  screenHeight: number;

  // User preferences
  prefersReducedMotion: boolean;
  prefersDarkMode: boolean;

  // Battery (if available)
  batteryLevel: number | null;
  isCharging: boolean | null;
}

// ============ Initial State ============

const initialState: DeviceState = {
  orientation: "portrait",
  orientationAngle: 0,
  isLandscape: false,
  isOnline: true,
  connectionType: null,
  isVisible: true,
  isMobile: false,
  isTouch: false,
  screenWidth: 0,
  screenHeight: 0,
  prefersReducedMotion: false,
  prefersDarkMode: false,
  batteryLevel: null,
  isCharging: null,
};

// ============ Store Implementation ============

function createDeviceStore() {
  const { subscribe, update } = writable<DeviceState>(initialState);

  let cleanupFns: (() => void)[] = [];

  function init() {
    if (typeof window === "undefined") return;

    // Initial state detection
    updateAll();

    // ---- Orientation ----
    const updateOrientation = () => {
      const angle =
        window.screen?.orientation?.angle ??
        (window as unknown as { orientation: number }).orientation ??
        0;
      let orientation: DeviceOrientation;
      let isLandscape = false;

      switch (angle) {
        case 90:
          orientation = "landscape-left";
          isLandscape = true;
          break;
        case -90:
        case 270:
          orientation = "landscape-right";
          isLandscape = true;
          break;
        case 180:
          orientation = "portrait-upside-down";
          break;
        default:
          orientation = "portrait";
      }

      update((s) => ({
        ...s,
        orientation,
        orientationAngle: angle,
        isLandscape,
      }));
    };

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener("change", updateOrientation);
      cleanupFns.push(() =>
        window.screen.orientation.removeEventListener(
          "change",
          updateOrientation,
        ),
      );
    }
    window.addEventListener("orientationchange", updateOrientation);
    cleanupFns.push(() =>
      window.removeEventListener("orientationchange", updateOrientation),
    );

    // ---- Online/Offline ----
    const updateOnline = () =>
      update((s) => ({ ...s, isOnline: navigator.onLine }));
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    cleanupFns.push(() => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    });

    // ---- Network Connection Type ----
    const updateConnection = () => {
      const conn = (
        navigator as unknown as { connection?: { effectiveType: string } }
      ).connection;
      update((s) => ({ ...s, connectionType: conn?.effectiveType ?? null }));
    };
    const navConnection = (navigator as unknown as { connection?: EventTarget })
      .connection;
    if (navConnection) {
      navConnection.addEventListener("change", updateConnection);
      cleanupFns.push(() =>
        navConnection?.removeEventListener("change", updateConnection),
      );
    }

    // ---- Page Visibility ----
    const updateVisibility = () =>
      update((s) => ({ ...s, isVisible: !document.hidden }));
    document.addEventListener("visibilitychange", updateVisibility);
    cleanupFns.push(() =>
      document.removeEventListener("visibilitychange", updateVisibility),
    );

    // ---- Screen Size ----
    const updateScreen = () => {
      update((s) => ({
        ...s,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        isMobile: window.innerWidth <= 768,
      }));
    };
    window.addEventListener("resize", updateScreen);
    cleanupFns.push(() => window.removeEventListener("resize", updateScreen));

    // ---- Media Query Preferences ----
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const updateReducedMotion = (e: MediaQueryListEvent | MediaQueryList) => {
      update((s) => ({ ...s, prefersReducedMotion: e.matches }));
    };
    const updateDarkMode = (e: MediaQueryListEvent | MediaQueryList) => {
      update((s) => ({ ...s, prefersDarkMode: e.matches }));
    };

    reducedMotionQuery.addEventListener("change", updateReducedMotion);
    darkModeQuery.addEventListener("change", updateDarkMode);
    cleanupFns.push(() => {
      reducedMotionQuery.removeEventListener("change", updateReducedMotion);
      darkModeQuery.removeEventListener("change", updateDarkMode);
    });

    // ---- Battery (async) ----
    interface BatteryManager extends EventTarget {
      level: number;
      charging: boolean;
    }
    if ("getBattery" in navigator) {
      (navigator as unknown as { getBattery: () => Promise<BatteryManager> })
        .getBattery()
        .then((battery) => {
          const updateBattery = () => {
            update((s) => ({
              ...s,
              batteryLevel: battery.level,
              isCharging: battery.charging,
            }));
          };
          updateBattery();
          battery.addEventListener("levelchange", updateBattery);
          battery.addEventListener("chargingchange", updateBattery);
          cleanupFns.push(() => {
            battery.removeEventListener("levelchange", updateBattery);
            battery.removeEventListener("chargingchange", updateBattery);
          });
        });
    }

    // Initial values
    updateOrientation();
    updateOnline();
    updateConnection();
    updateVisibility();
    updateScreen();
    updateReducedMotion(reducedMotionQuery);
    updateDarkMode(darkModeQuery);
  }

  function updateAll() {
    update((s) => ({
      ...s,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      isVisible: typeof document !== "undefined" ? !document.hidden : true,
      screenWidth: typeof window !== "undefined" ? window.innerWidth : 0,
      screenHeight: typeof window !== "undefined" ? window.innerHeight : 0,
      isMobile:
        typeof window !== "undefined" ? window.innerWidth <= 768 : false,
      isTouch:
        typeof window !== "undefined"
          ? "ontouchstart" in window || navigator.maxTouchPoints > 0
          : false,
    }));
  }

  function destroy() {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  }

  return {
    subscribe,
    init,
    destroy,
  };
}

export const device = createDeviceStore();

// ============ Derived Stores for Convenience ============

export const orientation = derived(device, ($d) => ({
  orientation: $d.orientation,
  angle: $d.orientationAngle,
  isLandscape: $d.isLandscape,
}));

export const connectivity = derived(device, ($d) => ({
  isOnline: $d.isOnline,
  connectionType: $d.connectionType,
}));

export const screen = derived(device, ($d) => ({
  width: $d.screenWidth,
  height: $d.screenHeight,
  isMobile: $d.isMobile,
  isTouch: $d.isTouch,
}));

export const preferences = derived(device, ($d) => ({
  reducedMotion: $d.prefersReducedMotion,
  darkMode: $d.prefersDarkMode,
}));
