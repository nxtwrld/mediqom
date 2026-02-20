import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { verifyRecoveryKeyHash } from "$lib/encryption/recovery";

/**
 * Verify recovery key and return encrypted data
 * POST /v1/recover/verify
 */
export const POST: RequestHandler = async ({ request }) => {
  const { email, recoveryKey } = await request.json();

  if (!email || !recoveryKey) {
    error(400, { message: "Email and recovery key are required" });
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
      error(404, { message: "Account not found" });
    }

    // Get private key data
    const { data: privateKeys, error: keysError } = await supabase
      .from("private_keys")
      .select("recovery_encrypted_key, recovery_key_hash")
      .eq("id", profile.id)
      .single();

    if (keysError || !privateKeys) {
      error(404, { message: "No encryption data found" });
    }

    if (!privateKeys.recovery_encrypted_key) {
      error(400, { message: "No recovery key configured for this account" });
    }

    // Verify the recovery key hash if available
    if (privateKeys.recovery_key_hash) {
      const isValid = await verifyRecoveryKeyHash(
        recoveryKey,
        privateKeys.recovery_key_hash,
      );
      if (!isValid) {
        error(401, { message: "Invalid recovery key" });
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
    error(500, { message: "Recovery verification failed" });
  }
};
