import { fail, redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { setUser } from "$lib/user";
import { waitLocale } from "svelte-i18n";
import { loadProfiles } from "$lib/profiles";
import { log } from "$lib/logging/logger";
import { isNativePlatform, isCapacitorBuild } from "$lib/config/platform";

// API base URL - empty for web (same origin), set for mobile builds
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Create a fetch wrapper that adds Authorization header for mobile
 */
function createMobileFetch(
  originalFetch: typeof fetch,
  accessToken: string | undefined
): typeof fetch {
  if (!accessToken) return originalFetch;

  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    // Only add auth header for API calls
    if (url.includes("/v1/")) {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  };
}

export const load: LayoutLoad = async ({ fetch, parent, url }) => {
  const { session, user } = await parent();

  // Guard: Only proceed if we have a valid session
  if (!session || !user) {
    redirect(303, "/auth");
  }

  // For mobile, wrap fetch with Authorization header
  const isMobile = isNativePlatform() || isCapacitorBuild();
  const mobileFetch = isMobile
    ? createMobileFetch(fetch, session.access_token)
    : fetch;

  // fetch basic user data - now safe because we have a session
  const userData = await mobileFetch(`${API_BASE}/v1/med/user`)
    .then((r) => r.json())
    .catch((e) => {
      log.api.error("Error loading user", e);
      redirect(303, "/account");
    });
  await loadProfiles(mobileFetch);

  if (
    userData &&
    userData.fullName &&
    userData.private_keys &&
    userData.publicKey
  ) {
    // Language is already set in root layout, no need to set it again
    // Just ensure locale is ready
    await waitLocale();

    // Pass the user session to avoid auth calls during hydration
    await setUser(userData, user);

    return {};
  } else {
    redirect(303, "/account");
  }
};

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time by vite.config.mobile.ts
const IS_CAPACITOR = typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ === true;

// Disable trailing slash redirects for Capacitor to prevent redirect loops
export const trailingSlash = IS_CAPACITOR ? "ignore" : "always";

// Disable SSR for Capacitor builds - server load functions won't be available
export const ssr = !IS_CAPACITOR;
