import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { setUser } from "$lib/user";
import { waitLocale } from "svelte-i18n";
import { loadProfiles } from "$lib/profiles";
import { log } from "$lib/logging/logger";
import { apiFetch } from "$lib/api/client";
import { initCache } from "$lib/cache";
import { startRealtimeSync } from "$lib/cache/realtime";
import { isNativePlatform } from "$lib/config/platform";

export const load: LayoutLoad = async ({ parent, fetch }) => {
  const { session, user, supabase } = await parent();

  // Guard: Only proceed if we have a valid session
  if (!session || !user) {
    redirect(303, "/auth");
  }

  // Restore cache from Preferences BEFORE loading profiles.
  // On mobile, this seeds the in-memory store so loadProfiles gets an instant cache hit.
  // user.id (Supabase auth UUID) equals the root profile UUID in this schema.
  const authUserId = user.id;
  await initCache(authUserId);

  // fetch user data and profiles in parallel (profiles now benefits from warm cache)
  const [userData] = await Promise.all([
    apiFetch("/v1/med/user", { fetch })
      .then((r) => r.json())
      .catch((e) => {
        log.api.error("Error loading user", e);
        redirect(303, "/account");
      }),
    loadProfiles(false, fetch),
  ]);

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

    // Start realtime sync — invalidates cache and re-fetches on DB changes.
    startRealtimeSync(supabase, authUserId);

    // Initialize RevenueCat on native platforms after we have the user ID
    if (isNativePlatform()) {
      import("$lib/billing/revenuecat")
        .then(({ initRevenueCat }) => initRevenueCat(user.id))
        .catch((e) => log.api.error("RevenueCat init failed", e));
    }

    return {};
  } else {
    redirect(303, "/account");
  }
};

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time by vite.config.mobile.ts
const IS_CAPACITOR =
  typeof __CAPACITOR_BUILD__ !== "undefined" && __CAPACITOR_BUILD__ === true;

// Disable trailing slash redirects for Capacitor to prevent redirect loops
export const trailingSlash = IS_CAPACITOR ? "ignore" : "always";

// Disable SSR for Capacitor builds - server load functions won't be available
export const ssr = false;
