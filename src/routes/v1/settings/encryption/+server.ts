import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export interface EncryptionUpdateRequest {
  newCredentials: {
    privateKey: string;              // Re-encrypted with new method
    key_hash: string;                // Hash for verification
    key_derivation_method: 'passphrase' | 'passkey_prf';
    passkey_credential_id?: string;  // For passkey method
    passkey_prf_salt?: string;       // For passkey method
    recovery_encrypted_key?: string; // Updated recovery (optional)
    recovery_key_hash?: string;      // Hash of recovery key (optional)
  };
}

/**
 * Update encryption method for authenticated user
 * POST /v1/settings/encryption
 *
 * This endpoint allows users to switch between passphrase and passkey
 * encryption methods. The client must first verify the current credentials
 * and re-encrypt the private key with the new method before calling this.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { safeGetSession, user } = locals;
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: 'Unauthorized' });
  }

  const body = await request.json() as EncryptionUpdateRequest;
  const { newCredentials } = body;

  if (!newCredentials) {
    error(400, { message: 'Missing newCredentials' });
  }

  // Validate required fields
  if (!newCredentials.privateKey || !newCredentials.key_hash || !newCredentials.key_derivation_method) {
    error(400, { message: 'Missing required credential fields' });
  }

  // Validate passkey fields if using passkey method
  if (newCredentials.key_derivation_method === 'passkey_prf') {
    if (!newCredentials.passkey_credential_id || !newCredentials.passkey_prf_salt) {
      error(400, { message: 'Missing passkey credential fields' });
    }
  }

  // Use service role client for database updates
  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get user's profile ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile lookup error:', profileError);
      error(404, { message: 'Profile not found' });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      privateKey: newCredentials.privateKey,
      key_hash: newCredentials.key_hash,
      key_derivation_method: newCredentials.key_derivation_method,
      updated_at: new Date().toISOString()
    };

    // Handle passkey fields
    if (newCredentials.key_derivation_method === 'passkey_prf') {
      updateData.passkey_credential_id = newCredentials.passkey_credential_id;
      updateData.passkey_prf_salt = newCredentials.passkey_prf_salt;
      updateData.key_pass = null; // Clear any stored passphrase
    } else {
      // Switching to passphrase - clear passkey fields
      updateData.passkey_credential_id = null;
      updateData.passkey_prf_salt = null;
      updateData.key_pass = null; // Zero-knowledge - no server storage
    }

    // Optionally update recovery key
    if (newCredentials.recovery_encrypted_key) {
      updateData.recovery_encrypted_key = newCredentials.recovery_encrypted_key;
      updateData.recovery_created_at = new Date().toISOString();
    }
    if (newCredentials.recovery_key_hash) {
      updateData.recovery_key_hash = newCredentials.recovery_key_hash;
    }

    // Update the private_keys table
    const { error: updateError } = await supabase
      .from('private_keys')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('Update error:', updateError);
      error(500, { message: 'Failed to update encryption method' });
    }

    // Log the encryption method change
    try {
      await supabase.from('recovery_attempts').insert({
        user_id: profile.id,
        attempt_type: 'encryption_method_change',
        success: true,
        metadata: {
          new_method: newCredentials.key_derivation_method,
          timestamp: new Date().toISOString()
        }
      });
    } catch (logErr) {
      // Non-critical, just log
      console.warn('Failed to log encryption method change:', logErr);
    }

    return json({
      success: true,
      method: newCredentials.key_derivation_method
    });
  } catch (err) {
    console.error('Encryption update error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    error(500, { message: 'Failed to update encryption method' });
  }
};
