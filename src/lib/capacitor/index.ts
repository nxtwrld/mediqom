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

    // Listen for keyboard events if needed
    Keyboard.addListener("keyboardWillShow", (info) => {
      console.log(
        "[Capacitor] Keyboard will show, height:",
        info.keyboardHeight,
      );
    });

    Keyboard.addListener("keyboardWillHide", () => {
      console.log("[Capacitor] Keyboard will hide");
    });
  } catch (error) {
    console.warn("[Capacitor] Keyboard not available:", error);
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
