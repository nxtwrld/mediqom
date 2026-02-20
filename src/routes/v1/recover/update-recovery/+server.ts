import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import {
  verifyRecoveryKeyHash,
  hashRecoveryKey,
} from "$lib/encryption/recovery";

/**
 * Update recovery key after generating new recovery document
 * POST /v1/recover/update-recovery
 */
export const POST: RequestHandler = async ({ request }) => {
  const { email, recoveryKey, newRecoveryEncryptedKey } = await request.json();

  if (!email || !recoveryKey || !newRecoveryEncryptedKey) {
    error(400, { message: "Missing required fields" });
  }

  // Use service role client
  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      error(404, { message: "Account not found" });
    }

    // Verify old recovery key
    const { data: privateKeys, error: keysError } = await supabase
      .from("private_keys")
      .select("recovery_key_hash")
      .eq("id", profile.id)
      .single();

    if (keysError || !privateKeys) {
      error(404, { message: "No encryption data found" });
    }

    if (privateKeys.recovery_key_hash) {
      const isValid = await verifyRecoveryKeyHash(
        recoveryKey,
        privateKeys.recovery_key_hash,
      );
      if (!isValid) {
        error(401, { message: "Invalid recovery key" });
      }
    }

    // We need to hash the NEW recovery key, but the client doesn't send it
    // The client sends the encrypted key. We'll update only the encrypted key
    // and the hash should be generated from the new recovery key on the client side
    // For now, we just update the encrypted key

    const { error: updateError } = await supabase
      .from("private_keys")
      .update({
        recovery_encrypted_key: newRecoveryEncryptedKey,
        recovery_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("Update error:", updateError);
      error(500, { message: "Failed to update recovery key" });
    }

    return json({ success: true });
  } catch (err) {
    console.error("Recovery key update error:", err);
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(500, { message: "Recovery key update failed" });
  }
};
