import { createServerClient } from "@supabase/ssr";
import { type Handle, redirect } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from "$env/static/public";

const supabase: Handle = async ({ event, resolve }) => {
  // Reduced logging to only errors and auth-related requests
  const shouldLog =
    !event.url.pathname.startsWith("/v1/") &&
    (event.url.pathname.startsWith("/auth") ||
      event.url.pathname === "/med" ||
      event.url.pathname === "/account");
  if (shouldLog) {
    console.log(`[REQ] ${event.request.method} ${event.url.pathname}`);
  }

  // Handle CORS preflight for mobile API calls
  if (event.request.method === 'OPTIONS' && event.url.pathname.startsWith('/v1/')) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  /**
   * Creates a Supabase client specific to this server request.
   * The Supabase client gets the Auth token from the request cookies.
   */
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key: string) => event.cookies.get(key),
        set: (key: string, value: string, options: any) => {
          event.cookies.set(key, value, { ...options, path: "/" });
        },
        remove: (key: string, options: any) => {
          event.cookies.delete(key, { ...options, path: "/" });
        },
      },
    },
  );

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession();

    if (!session) {
      // Fallback: Bearer token auth (mobile Capacitor)
      const authHeader = event.request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const tokenClient = createServerClient(
          PUBLIC_SUPABASE_URL,
          PUBLIC_SUPABASE_ANON_KEY,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            cookies: {
              get: () => undefined as unknown as string,
              set: () => {},
              remove: () => {},
            },
          },
        );
        const {
          data: { user },
          error,
        } = await tokenClient.auth.getUser();
        if (user && !error) {
          // Replace locals.supabase with the token-authenticated client
          // so downstream endpoints use the mobile user's RLS context
          event.locals.supabase = tokenClient;
          return {
            session: {
              access_token: token,
              refresh_token: '',
              expires_in: 0,
              token_type: 'bearer',
              user,
            },
            user,
          };
        }
      }
      return { session: null, user: null };
    }

    try {
      const {
        data: { user },
        error,
      } = await event.locals.supabase.auth.getUser();

      if (error) {
        return { session: null, user: null };
      }

      return { session, user };
    } catch (authError: any) {
      return { session: null, user: null };
    }
  };

  // CRITICAL: Await the response to ensure cookies are properly set
  const response = await resolve(event, {
    filterSerializedResponseHeaders(name) {
      /**
       * Supabase libraries use the `content-range` and `x-supabase-api-version`
       * headers, so we need to tell SvelteKit to pass it through.
       */
      return name === "content-range" || name === "x-supabase-api-version";
    },
  });

  // Add CORS headers for API routes (mobile Capacitor)
  if (event.url.pathname.startsWith('/v1/')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Only log errors and important requests
  if (response.status >= 400 || shouldLog) {
    console.log(`[RES] ${response.status} ${event.url.pathname}`);
  }
  return response;
};

const authGuard: Handle = async ({ event, resolve }) => {
  try {
    const { session, user } = await event.locals.safeGetSession();
    event.locals.session = session;
    event.locals.user = user;

    // Protect routes that require authentication
    const protectedRoutes = ["/private", "/med"];
    const isProtectedRoute = protectedRoutes.some((route) =>
      event.url.pathname.startsWith(route),
    );

    if (!event.locals.session && isProtectedRoute) {
      redirect(303, "/auth");
    }

    // Redirect authenticated users away from auth page
    if (event.locals.session && event.url.pathname === "/auth") {
      redirect(303, "/med");
    }

    return resolve(event);
  } catch (error) {
    console.error(
      `[AUTH ERROR] ❌ Auth guard failed for ${event.url.pathname}:`,
      error,
    );
    throw error;
  }
};

const errorHandler: Handle = async ({ event, resolve }) => {
  try {
    const response = await resolve(event);
    return response;
  } catch (error) {
    console.error(
      `[ERROR] ❌ Unhandled error in ${event.request.method} ${event.url.pathname}:`,
      {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack?.slice(0, 200) : undefined,
      },
    );
    throw error;
  }
};

export const handle: Handle = sequence(supabase, authGuard, errorHandler);
