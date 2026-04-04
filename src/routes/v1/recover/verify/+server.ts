import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { verifyRecoveryKeyHash } from "$lib/encryption/recovery";
import { checkRateLimit } from "$lib/auth/rate-limiter";

const GENERIC_ERROR = "Recovery verification failed";

/**
 * Verify recovery key and return encrypted data
 * POST /v1/recover/verify
 */
export const POST: RequestHandler = async ({ request }) => {
  // Rate limit: 5 requests per 5 min per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit("recover-verify", ip, 5, 5 * 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const { email, recoveryKey } = await request.json();

  if (!email || !recoveryKey) {
    error(400, { message: GENERIC_ERROR });
  }

  // Use service role client to access user data
  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, publicKey")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      console.warn("[Recovery] Profile not found for email lookup");
      error(400, { message: GENERIC_ERROR });
    }

    // Get private key data
    const { data: privateKeys, error: keysError } = await supabase
      .from("private_keys")
      .select("recovery_encrypted_key, recovery_key_hash")
      .eq("id", profile.id)
      .single();

    if (keysError || !privateKeys) {
      console.warn("[Recovery] No encryption data found for profile");
      error(400, { message: GENERIC_ERROR });
    }

    if (!privateKeys.recovery_encrypted_key) {
      console.warn("[Recovery] No recovery key configured for account");
      error(400, { message: GENERIC_ERROR });
    }

    // Verify the recovery key hash if available
    if (privateKeys.recovery_key_hash) {
      const isValid = await verifyRecoveryKeyHash(
        recoveryKey,
        privateKeys.recovery_key_hash,
      );
      if (!isValid) {
        console.warn("[Recovery] Invalid recovery key provided");
        error(400, { message: GENERIC_ERROR });
      }
    }

    // Return the encrypted data - client will decrypt
    return json({
      recovery_encrypted_key: privateKeys.recovery_encrypted_key,
      public_key: profile.publicKey,
    });
  } catch (err) {
    console.error("Recovery verification error:", err);
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(500, { message: GENERIC_ERROR });
  }
};
