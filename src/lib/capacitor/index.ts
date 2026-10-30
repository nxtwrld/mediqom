/**
 * Capacitor utilities and initialization
 *
 * This module provides Capacitor-specific functionality for the mobile app.
 */

export * from "./auth";

import { browser } from "$app/environment";
import { isNativePlatform, isCapacitorBuild } from "$lib/config/platform";
import { initMobileAuth } from "./auth";

let initialized = false;

/**
 * Initialize all Capacitor plugins and listeners
 * Call this once when the app starts (in hooks.client.ts or root layout)
 */
export async function initCapacitor(): Promise<void> {
  if (!browser || initialized) return;

  console.log("[Capacitor] Initializing...", {
    isNativePlatform: isNativePlatform(),
    isCapacitorBuild: isCapacitorBuild(),
  });

  if (!isNativePlatform() && !isCapacitorBuild()) {
    console.log("[Capacitor] Not a Capacitor environment, skipping init");
    return;
  }

  try {
    // Initialize mobile authentication
    await initMobileAuth();

    // Initialize other Capacitor plugins as needed
    await initStatusBar();
    await initKeyboard();
    await initTextZoom();
    await initSplashScreen();

    initialized = true;
    console.log("[Capacitor] Initialized successfully");
  } catch (error) {
    console.error("[Capacitor] Initialization failed:", error);
  }
}

/**
 * Configure the status bar appearance
 */
async function initStatusBar(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");

    // Set status bar style
    await StatusBar.setStyle({ style: Style.Dark });

    // On Android, set background color
    if (
      (await import("@capacitor/core")).Capacitor.getPlatform() === "android"
    ) {
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    }
  } catch (error) {
    console.warn("[Capacitor] StatusBar not available:", error);
  }
}

/**
 * Configure keyboard behavior
 */
async function initKeyboard(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    const { keyboardHeight } = await import("./keyboard-store");

    Keyboard.addListener("keyboardWillShow", (info) => {
      keyboardHeight.set(info.keyboardHeight);
    });

    Keyboard.addListener("keyboardWillHide", () => {
      keyboardHeight.set(0);
    });
  } catch (error) {
    console.warn("[Capacitor] Keyboard not available:", error);
  }
}

/**
 * Follow the OS text-size setting (iOS Dynamic Type, Android font scale)
 * by scaling the root rem, so layout grows with text instead of only text.
 */
async function initTextZoom(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { TextZoom } = await import("@capacitor/text-zoom");
    const { App } = await import("@capacitor/app");

    const apply = async () => {
      const { value } = await TextZoom.getPreferred();
      const zoom = Math.min(2, Math.max(0.85, value));
      document.documentElement.style.setProperty("--text-zoom", String(zoom));
    };

    // Disable the WebView's own text-only zoom so the scale isn't applied twice
    await TextZoom.set({ value: 1 });
    await apply();

    App.addListener("resume", apply);
  } catch (error) {
    console.warn("[Capacitor] TextZoom not available:", error);
  }
}

/**
 * Hide the splash screen
 */
async function initSplashScreen(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");

    // Hide splash screen after a short delay
    setTimeout(async () => {
      await SplashScreen.hide({
        fadeOutDuration: 300,
      });
    }, 500);
  } catch (error) {
    console.warn("[Capacitor] SplashScreen not available:", error);
  }
}

/**
 * Check if Capacitor is fully initialized
 */
export function isCapacitorInitialized(): boolean {
  return initialized;
}
