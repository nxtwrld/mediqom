// src/routes/+page.server.ts
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { sanitizeRedirect } from "$lib/auth/sanitize-redirect";
import { checkRateLimit } from "$lib/auth/rate-limiter";

const getURL = (redirectPath: string = "/", currentUrl: URL) => {
  const baseUrl = env?.SITE_URL
    ? env.SITE_URL
    : env?.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : `${currentUrl.origin}`;

  return `${baseUrl}/auth/confirm?next=${encodeURIComponent(redirectPath)}`;
};

export const load: PageServerLoad = async ({
  url,
  locals: { safeGetSession },
}) => {
  const { session } = await safeGetSession();
  const redirectPath = sanitizeRedirect(new URL(url).searchParams.get("redirect"));
  // if the user is already logged in return them to the med page
  if (session) {
    throw redirect(303, redirectPath);
  }

  return { url: url.origin };
};

export const actions: Actions = {
  default: async ({ request, locals: { supabase }, cookies }) => {
    let email: string = "";

    try {
      const formData = await request.formData();
      email = formData.get("email") as string;
      const redirectPath = sanitizeRedirect((formData.get("redirectPath") as string) ?? "/med");

      // Rate limiting: 1 request per email per 60 seconds
      const rl = checkRateLimit("auth-magic-link", email, 1, 60_000);
      if (!rl.allowed) {
        const remainingTime = Math.ceil((rl.retryAfterMs ?? 60_000) / 1000);
        return fail(429, {
          errors: {
            email: `Please wait ${remainingTime} seconds before requesting another magic link.`,
          },
          email: email,
        });
      }

      if (!email) {
        return fail(400, {
          errors: {
            email: "Please enter an email address",
          },
          email: "",
        });
      }

      if (!email.includes("@")) {
        return fail(400, {
          errors: {
            email: "Please enter a valid email address",
          },
          email: "",
        });
      }

      const currentUrl = new URL(request.url);
      const redirectUrl = getURL(redirectPath, currentUrl);

      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
          // Account creation only happens via /v1/invite/redeem (invite-only access) —
          // this endpoint is sign-in only.
          shouldCreateUser: false,
        },
      });

      if (error) {
        console.error("[Auth Server] OTP error:", error.message);
        return fail(400, {
          errors: {
            email: error.message,
          },
          email: "",
        });
      }

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
