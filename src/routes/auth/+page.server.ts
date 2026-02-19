// src/routes/+page.server.ts
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";

const getURL = (redirect: string = "/", currentUrl: URL) => {
  // Get the base URL based on environment
  console.log("[Auth Server] Environment check:", {
    SITE_URL: env?.SITE_URL,
    VERCEL_URL: env?.VERCEL_URL,
    currentOrigin: currentUrl.origin,
  });

  const baseUrl = env?.SITE_URL
    ? env.SITE_URL
    : env?.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : `${currentUrl.origin}`;

  console.log("[Auth Server] Selected base URL:", baseUrl);

  // Build the complete redirect URL with proper path
  const redirectUrl = `${baseUrl}/auth/confirm?next=${encodeURIComponent(redirect)}`;
  console.log("[Auth Server] Generated redirect URL:", redirectUrl);
  return redirectUrl;
};

export const load: PageServerLoad = async ({
  url,
  locals: { safeGetSession },
}) => {
  const { session } = await safeGetSession();
  const redirectPath = new URL(url).searchParams.get("redirect") || "/med";
  // if the user is already logged in return them to the med page
  if (session) {
    console.log(
      "[Auth Server] User is already logged in, redirecting to:",
      redirectPath,
    );
    throw redirect(303, redirectPath);
  }

  return { url: url.origin };
};

// Simple in-memory rate limiting (for production, use Redis or database)
const emailRateLimit = new Map<string, number>();

export const actions: Actions = {
  default: async ({ request, locals: { supabase }, cookies }) => {
    console.log("[Auth Server] ===== STARTING AUTH FORM SUBMISSION =====");

    let email: string = "";

    try {
      const formData = await request.formData();
      email = formData.get("email") as string;
      const redirectPath = (formData.get("redirectPath") as string) ?? "/med";

      console.log("[Auth Server] Received form data:", { email, redirectPath });
      console.log("[Auth Server] Request URL:", request.url);

      // Rate limiting: Allow only 1 request per email per 60 seconds
      const now = Date.now();
      const lastRequest = emailRateLimit.get(email);

      if (lastRequest && now - lastRequest < 60000) {
        const remainingTime = Math.ceil((60000 - (now - lastRequest)) / 1000);
        console.log("[Auth Server] Rate limited:", { email, remainingTime });
        return fail(429, {
          errors: {
            email: `Please wait ${remainingTime} seconds before requesting another magic link.`,
          },
          email: email,
        });
      }

      emailRateLimit.set(email, now);

      // Check cookies before submission
      const allCookies = cookies.getAll();
      const authCookies = allCookies.filter(
        (c) => c.name.includes("sb-") || c.name.includes("supabase"),
      );
      console.log("[Auth Server] Pre-auth cookies:", {
        totalCookies: allCookies.length,
        authCookies: authCookies.length,
        authCookieNames: authCookies.map((c) => c.name),
      });

      if (!email) {
        console.error("[Auth Server] Error: No email provided");
        return fail(400, {
          errors: {
            email: "Please enter an email address",
          },
          email: "",
        });
      }

      if (!email.includes("@")) {
        console.error("[Auth Server] Error: Invalid email format");
        return fail(400, {
          errors: {
            email: "Please enter a valid email address",
          },
          email: "",
        });
      }

      // Get the current URL to use for development
      const currentUrl = new URL(request.url);
      const redirectUrl = getURL(redirectPath, currentUrl);
      console.log(
        "[Auth Server] Final redirect URL for magic link:",
        redirectUrl,
      );

      console.log("[Auth Server] Calling Supabase signInWithOtp...");
      // Send magic link using signInWithOtp
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: true,
        },
      });

      console.log("[Auth Server] Supabase OTP response:", {
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        error: error
          ? {
              message: error.message,
              status: error.status,
              code: error.code,
            }
          : null,
      });

      if (error) {
        console.error("[Auth Server] Error sending magic link:", {
          message: error.message,
          status: error.status,
          code: error.code,
          email,
        });
        return fail(400, {
          errors: {
            email: error.message,
          },
          email: "",
        });
      }

      console.log("[Auth Server] Magic link sent successfully to:", email);
      console.log(
        "[Auth Server] User should check email and click link to:",
        redirectUrl,
      );

      return {
        success: true,
        email: email,
        message:
          "Magic link sent! Please check your email and click the link to continue.",
      };
    } catch (error) {
      console.error("[Auth Server] Unexpected error:", error);
      return fail(500, {
        errors: {
          email: "An unexpected error occurred. Please try again.",
        },
        email: email || "",
      });
    }
  },
};
