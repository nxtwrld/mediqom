import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { verifyRecoveryKeyHash } from "$lib/encryption/recovery";

/**
 * Update user credentials after recovery
 * POST /v1/recover/update
 */
export const POST: RequestHandler = async ({ request }) => {
  const { email, recoveryKey, newCredentials } = await request.json();

  if (!email || !recoveryKey || !newCredentials) {
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

    // Verify recovery key first
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

    // Update the credentials
    const updateData: Record<string, any> = {
      privateKey: newCredentials.privateKey,
      key_hash: newCredentials.key_hash,
      key_derivation_method: newCredentials.key_derivation_method,
      updated_at: new Date().toISOString(),
    };

    // Handle passkey fields
    if (newCredentials.key_derivation_method === "passkey_prf") {
      updateData.passkey_credential_id = newCredentials.passkey_credential_id;
      updateData.passkey_prf_salt = newCredentials.passkey_prf_salt;
      updateData.key_pass = null; // Clear any stored passphrase
    } else {
      updateData.passkey_credential_id = null;
      updateData.passkey_prf_salt = null;
      // Don't store passphrase for zero-knowledge users
      updateData.key_pass = null;
    }

    const { error: updateError } = await supabase
      .from("private_keys")
      .update(updateData)
      .eq("id", profile.id);

    if (updateError) {
      console.error("Update error:", updateError);
      error(500, { message: "Failed to update credentials" });
    }

    // Log the recovery attempt
    await supabase.from("recovery_attempts").insert({
      user_id: profile.id,
      attempt_type: "passphrase_reset",
      success: true,
    });

    return json({ success: true });
  } catch (err) {
    console.error("Recovery update error:", err);
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(500, { message: "Credential update failed" });
  }
};
