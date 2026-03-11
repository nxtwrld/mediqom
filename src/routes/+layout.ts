import { PUBLIC_MIXPANEL_TOKEN } from "$env/static/public";
import mixpanel from "mixpanel-browser";
import {
  createBrowserClient,
  createServerClient,
  isBrowser,
  parse,
} from "@supabase/ssr";
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public";
import type { LayoutLoad } from "./$types";
import { setClient, getClient } from "$lib/supabase";
import { session as CurrentSession } from "$lib/user";
import "$lib/i18n"; // Import to initialize. Important :)
import { locale, waitLocale } from "svelte-i18n";
import "$lib/config/logging-config"; // Initialize logging from environment variables
import { isNativePlatform, isCapacitorBuild } from "$lib/config/platform";

// Initialize mixpanel only if token is available (may not be in mobile builds)
try {
  if (PUBLIC_MIXPANEL_TOKEN) {
    mixpanel.init(PUBLIC_MIXPANEL_TOKEN, { debug: false });
  }
} catch (e) {
  console.warn("[Layout] Mixpanel initialization failed:", e);
}

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time by vite.config.mobile.ts
const IS_CAPACITOR =
  typeof __CAPACITOR_BUILD__ !== "undefined" && __CAPACITOR_BUILD__ === true;

// Use "ignore" for all builds: prevents Vercel from generating 308 redirect rules
// that would intercept CORS OPTIONS preflights before hooks.server.ts can handle them.
export const trailingSlash = "ignore";

// Disable SSR for Capacitor builds - server load functions won't be available
export const ssr = !IS_CAPACITOR;

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  /**
   * Declare a dependency so the layout can be invalidated, for example, on
   * session refresh.
   */
  depends("supabase:auth");

  // For Capacitor builds, always use browser client - no server data available
  const isMobileBuild = IS_CAPACITOR || isCapacitorBuild();

  // Mobile: use the registry singleton (implicit flow, configured in src/lib/supabase.ts)
  // Web browser: use createBrowserClient (PKCE via @supabase/ssr)
  // SSR: use createServerClient with cookie handling
  const supabase = isMobileBuild
    ? getClient() // Use registry singleton — same instance as capacitor/auth.ts and getAccessToken()
    : isBrowser()
      ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
          global: {
            fetch,
          },
        })
      : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
          global: {
            fetch,
          },
          cookies: {
            get(key: string) {
              return data?.cookies?.find((cookie) => cookie.name === key)
                ?.value;
            },
            set(key: string, value: string, options?: any) {
              // Server-side cookie setting not implemented in client context
            },
            remove(key: string, options?: any) {
              // Server-side cookie removal not implemented in client context
            },
          },
        });

  /**
   * Use session and user data from server (via safeGetSession)
   * For mobile (static builds), get session directly from Supabase client
   */
  let session = data?.session || null;
  let user = data?.user || null;

  // For mobile/Capacitor builds, server data won't be available at all
  // Get session directly from Supabase client
  if (
    isMobileBuild ||
    (isBrowser() && !session && (isNativePlatform() || isCapacitorBuild()))
  ) {
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        console.error("[Layout] Mobile: Session error:", sessionError);
      }
      if (sessionData?.session) {
        session = sessionData.session;
        user = sessionData.session.user;
      }
    } catch (e) {
      console.error("[Layout] Mobile: Failed to get session:", e);
    }
  }

  // Set locale based on browser language — user-specific locale set in med/+layout.ts
  if (!import.meta.env.SSR) {
    locale.set(window.navigator.language);
  } else {
    locale.set("en");
  }

  await waitLocale();

  // Only set session and client if we have valid data
  if (session) {
    CurrentSession.set(session);
  }
  setClient(supabase);

  return { session, supabase, user };
};
