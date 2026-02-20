import { browser } from "$app/environment";
import { Capacitor } from "@capacitor/core";

/**
 * Platform detection utilities for Capacitor mobile builds
 */

// Build-time flag - replaced by Vite define option in mobile builds
declare const __CAPACITOR_BUILD__: boolean | undefined;

// Check if running in Capacitor native environment
declare global {
  interface Window {
    __CAPACITOR_BUILD__?: boolean;
  }
}

// Cache the build flag check to avoid repeated lookups
let _isCapacitorBuild: boolean | null = null;
let _isNativePlatform: boolean | null = null;

/**
 * Check if running as a native mobile app (iOS/Android via Capacitor)
 * Uses the official Capacitor.isNativePlatform() method
 */
export function isNativePlatform(): boolean {
  if (!browser) return false;

  // Use cached value if available
  if (_isNativePlatform !== null) return _isNativePlatform;

  try {
    _isNativePlatform = Capacitor.isNativePlatform();
    return _isNativePlatform;
  } catch {
    _isNativePlatform = false;
    return false;
  }
}

/**
 * Check if this build was created for Capacitor
 * (even if running in browser during development)
 */
export function isCapacitorBuild(): boolean {
  if (!browser) return false;

  // Use cached value if available
  if (_isCapacitorBuild !== null) return _isCapacitorBuild;

  // Method 1: Check build-time constant (replaced by Vite define)
  try {
    if (typeof __CAPACITOR_BUILD__ !== "undefined" && __CAPACITOR_BUILD__) {
      _isCapacitorBuild = true;
      return true;
    }
  } catch {
    // __CAPACITOR_BUILD__ not defined
  }

  // Method 2: Check window global (set by capacitorPlugin transformIndexHtml)
  if (window.__CAPACITOR_BUILD__) {
    _isCapacitorBuild = true;
    return true;
  }

  // Method 3: Check if running in native platform (definitive test)
  if (isNativePlatform()) {
    _isCapacitorBuild = true;
    return true;
  }

  // Method 4: Check Capacitor platform (native iOS/Android means mobile build)
  try {
    const platform = Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") {
      _isCapacitorBuild = true;
      return true;
    }
  } catch {
    // Capacitor not available
  }

  _isCapacitorBuild = false;
  return false;
}

/**
 * Get the current platform
 */
export function getPlatform(): "ios" | "android" | "web" {
  if (!browser) return "web";
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
  return getPlatform() === "ios";
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  return getPlatform() === "android";
}

/**
 * Get the API base URL
 * - Mobile: absolute URL to backend (e.g., https://mediqom.com)
 * - Web: empty string (same origin, relative URLs)
 */
export function getApiBaseUrl(): string {
  if (!browser) return "";

  // For native platform or Capacitor build, use absolute URL
  if (isNativePlatform() || isCapacitorBuild()) {
    // Use environment variable or default to production URL
    return import.meta.env.VITE_API_BASE_URL || "https://mediqom.com";
  }

  // Web uses relative URLs (same origin)
  return "";
}

/**
 * Get the auth redirect URL for magic link callbacks
 * - Mobile: Universal Link (https://mediqom.com/auth/callback)
 * - Web: web URL (/auth/confirm)
 */
export function getAuthRedirectUrl(): string {
  if (!browser) return "/auth/confirm";

  if (isNativePlatform()) {
    return "https://mediqom.com/auth/callback";
  }

  return `${window.location.origin}/auth/confirm`;
}

/**
 * Platform-specific configuration
 */
export const platformConfig = {
  // Whether to use cookies (web) or token storage (mobile)
  get useTokenAuth(): boolean {
    return isNativePlatform();
  },

  // Whether SSR is available
  get hasSSR(): boolean {
    return !isCapacitorBuild();
  },

  // Deep link scheme for the app
  deepLinkScheme: "mediqom",

  // App store URLs (update with actual app store listings)
  appStoreUrl: "https://apps.apple.com/app/mediqom/id000000000",
  playStoreUrl: "https://play.google.com/store/apps/details?id=com.mediqom.app",
};
