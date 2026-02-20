/**
 * Client Hooks
 *
 * This file runs on the client side and initializes:
 * - Capacitor plugins for mobile
 * - Auth state listeners
 * - Any other client-side initialization
 */

import { initCapacitor } from "$lib/capacitor";
import { isNativePlatform, isCapacitorBuild } from "$lib/config/platform";
import type { HandleClientError } from "@sveltejs/kit";

// Guard against multiple initializations
let initialized = false;

/**
 * Handle client-side errors
 * This prevents unhandled errors from causing page reloads
 */
export const handleError: HandleClientError = ({
  error,
  event,
  status,
  message,
}) => {
  // Log the error with full details
  console.error("[Client Error]", {
    status,
    message,
    error,
    url: event?.url?.pathname,
  });

  // Return a user-friendly error message
  return {
    message: message || "An unexpected error occurred",
  };
};

/**
 * Client-side initialization
 * This runs once when the app loads in the browser
 */
export async function init(): Promise<void> {
  // Prevent duplicate initialization
  if (initialized) {
    return;
  }
  initialized = true;

  console.log("[Hooks Client] Initializing...", {
    isNativePlatform: isNativePlatform(),
    isCapacitorBuild: isCapacitorBuild(),
  });

  // Initialize Capacitor plugins and listeners for mobile
  if (isNativePlatform() || isCapacitorBuild()) {
    await initCapacitor();
  }

  console.log("[Hooks Client] Initialization complete");
}

// Auto-initialize when this module loads
if (typeof window !== "undefined") {
  init().catch((error) => {
    console.error("[Hooks Client] Initialization failed:", error);
  });
}
