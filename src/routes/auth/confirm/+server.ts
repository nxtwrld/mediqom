import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Track recent confirmation attempts to detect duplicates
const recentConfirmations = new Map<string, number>();

export const GET: RequestHandler = async ({
  url,
  locals: { supabase },
}) => {
  // Support both new flow (token_hash + type) and old flow (code)
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/med";

  /**
   * Clean up the redirect URL by deleting the Auth flow parameters.
   *
   * `next` is preserved for now, because it's needed in the error case.
   */
  const redirectTo = new URL(url);
  redirectTo.pathname = next;
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  // Handle new flow (token_hash + type) - PKCE flow
  if (token_hash && type) {
    // Check for recent duplicate attempts
    const confirmationKey = `${token_hash}_${type}`;
    const now = Date.now();
    const lastAttempt = recentConfirmations.get(confirmationKey);

    if (lastAttempt && now - lastAttempt < 5000) {
      // 5 second window
      console.log(
        "[Auth Confirm] Duplicate confirmation attempt detected, ignoring",
      );
      redirectTo.pathname = "/auth/error";
      redirectTo.searchParams.set("error", "Duplicate request");
      redirectTo.searchParams.set(
        "details",
        "This link was already used recently",
      );
      redirect(303, redirectTo);
    }

    recentConfirmations.set(confirmationKey, now);

    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error && data?.session) {
      redirectTo.searchParams.delete("next");
      redirect(303, redirectTo); // This throws an exception to interrupt flow - don't catch it!
    } else {
      console.error("[Auth Confirm] Verification failed:", {
        error: error?.message || "No session created",
        errorCode: error?.code,
        errorStatus: error?.status,
        hasValidTokenHash: !!token_hash && token_hash.length > 10,
        tokenType: type,
        isExpiredError:
          error?.message?.includes("expired") ||
          error?.message?.includes("invalid"),
      });
    }
  }
  // Handle old flow (code) - Redirect to client-side handler
  else if (code) {
    // Redirect to a client-side route that can handle OAuth codes
    redirect(
      303,
      `/auth/confirm-client?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`,
    );
  } else {
    console.error("[Auth Confirm] Missing required parameters:", {
      token_hash: !!token_hash,
      type: !!type,
      code: !!code,
    });
  }

  console.log("[Auth Confirm] FAILED - Redirecting to error page");
  redirectTo.pathname = "/auth/error";
  redirectTo.searchParams.set("error", "Authentication failed");
  redirectTo.searchParams.set(
    "details",
    !token_hash
      ? "Missing token"
      : !type
        ? "Missing type"
        : "Verification failed",
  );
  redirect(303, redirectTo);
};
