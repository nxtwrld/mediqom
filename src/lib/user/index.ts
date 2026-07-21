import { writable, type Writable, get, type Updater } from "svelte/store";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "$lib/supabase";
import auth from "$lib/auth";
import { decryptString } from "../encryption/passphrase";
import { verifyHash } from "../encryption/hash";
import { HybridKeyPair, pemToKey, importKemPublicKey, type KeyMode } from "../encryption/keys";
import { deserializeKemKey, isKemKey } from "../encryption/kem";
import {
  authenticateWithPasskeyPRF,
  decryptWithPRFKey,
  type KeyDerivationMethod,
} from "../encryption/passkey-prf";
import { recoverPrivateKey } from "../encryption/recovery";
import { clearCache } from "$lib/cache";
import { stopRealtimeSync } from "$lib/cache/realtime";
//import { loadSubscription } from "./subscriptions";

export type UserFirstTime = {
  email: string;
  id: string;
  auth_id: string;
  language: string;
  unlocked: boolean | undefined;
};

export type User = {
  email: string;
  id: string;
  auth_id: string;
  fullName: string;
  avatarUrl: string;
  subscription: string;
  language: string;
  subscriptionStats: {
    profiles: number;
    scans: number;
  };
  privateKey: string;
  publicKey: string;
  key_hash: string;
  key_pass: string;
  unlocked: boolean | undefined;
  isMedical: boolean;
  role: 'individual' | 'medical' | string;
  is_admin?: boolean;
  // User-level preferences (account-holder settings jsonb)
  settings?: Record<string, any>;
  // New encryption fields
  key_derivation_method?: KeyDerivationMethod;
  passkey_credential_id?: string;
  passkey_prf_salt?: string;
  recovery_encrypted_key?: string;
  // Post-quantum (ML-KEM) fields
  kem_public_key?: string;
  kem_secret_key?: string;
  key_mode?: KeyMode;
};

const keys: {
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
} = {};

let keyPair: HybridKeyPair = new HybridKeyPair();

const user: Writable<User | UserFirstTime | null> = writable(null);

user.subscribe((value) => {
  if (!value) {
    delete keys.privateKey;
    delete keys.publicKey;
  }
});

const userSession: Writable<Session | null> = writable(null);
export const session = {
  subscribe: userSession.subscribe,
  set: userSession.set,
  update: userSession.update,
  get: () => get(userSession),
};

export async function setUser(
  profile: UserFirstTime | User,
  userSession?: any,
) {
  // Use provided userSession or fallback to profile data (no client-side auth calls during hydration)
  let actualUserSession = userSession;

  if (!actualUserSession) {
    // Don't make client-side auth calls during hydration - use profile data directly
    console.log(
      "[User] No user session provided, using profile data for hydration",
    );
    actualUserSession = {
      id: profile.auth_id || profile.id,
      email: (profile as any).email || "unknown@example.com",
    };
  }

  if (profile && (profile as User).fullName) {
    // move to server
    //const subscriptionStats = await loadSubscription();

    const userProfile = profile as any; // Cast to handle type issues during migration

    userProfile.privateKey = userProfile.private_keys?.privateKey;
    userProfile.key_hash = userProfile.private_keys?.key_hash;
    const key_pass = userProfile.private_keys?.key_pass;

    // Extract new encryption fields
    userProfile.key_derivation_method =
      userProfile.private_keys?.key_derivation_method;
    userProfile.passkey_credential_id =
      userProfile.private_keys?.passkey_credential_id;
    userProfile.passkey_prf_salt = userProfile.private_keys?.passkey_prf_salt;
    userProfile.recovery_encrypted_key =
      userProfile.private_keys?.recovery_encrypted_key;
    // Post-quantum (ML-KEM) fields
    userProfile.kem_secret_key = userProfile.private_keys?.kem_secret_key;
    userProfile.key_mode = userProfile.private_keys?.key_mode || userProfile.key_mode || "rsa-only";
    // kem_public_key comes from the profiles table (already on userProfile)

    delete userProfile.private_keys;

    user.set({
      ...userProfile,
      unlocked: true, // Always set to true to disable lock behavior
      role: userProfile.user_role ?? 'individual',
      isMedical:
        userProfile.user_role != null
          ? userProfile.user_role === "medical"
          : userProfile.subscription === "medical" || userProfile.subscription === "gp",
      email: actualUserSession.email as string,
      //subscriptionStats
    });

    // Set up encryption keys directly (no store update to avoid cascading re-renders)
    if (
      key_pass &&
      userProfile.key_hash &&
      userProfile.privateKey &&
      userProfile.publicKey
    ) {
      try {
        const privateKeyString = await decryptString(
          userProfile.privateKey,
          key_pass,
        );
        if (
          privateKeyString &&
          privateKeyString.indexOf("-----BEGIN PRIVATE KEY-----") === 0
        ) {
          const privateKey = await pemToKey(privateKeyString, true);
          const publicKey = await pemToKey(userProfile.publicKey, false);

          // Decrypt KEM secret key if available (hybrid mode)
          let kemPub: Uint8Array | null = null;
          let kemSec: Uint8Array | null = null;
          if (userProfile.kem_public_key && isKemKey(userProfile.kem_public_key)) {
            kemPub = deserializeKemKey(userProfile.kem_public_key);
          }
          if (userProfile.kem_secret_key) {
            try {
              const kemSecStr = await decryptString(userProfile.kem_secret_key, key_pass);
              if (kemSecStr && isKemKey(kemSecStr)) {
                kemSec = deserializeKemKey(kemSecStr);
              }
            } catch (e) {
              console.error("[User] Error decrypting KEM secret key:", e);
            }
          }

          keyPair.set(publicKey, privateKey, kemPub, kemSec);
        }
      } catch (e) {
        console.error("[User] Error setting up keys:", e);
      }
    }

    return get(user);
  } else {
    user.set({
      id: actualUserSession.id,
      auth_id: actualUserSession.id,
      email: actualUserSession.email as string,
      language: (profile as any).language || "en",
      unlocked: true, // Always set to true to disable lock behavior
    });
    return null;
  }
}

export function clearUser() {
  console.log("Clearing user");
  // auth_id equals root profile UUID in this schema — same value used in initCache.
  const $user = get(user);
  const cacheUserId = ($user as any)?.auth_id || getId();
  user.set(null);
  keyPair.destroy();
  stopRealtimeSync();
  if (cacheUserId) {
    clearCache(cacheUserId).catch(() => {});
  }
}

function getId(): string | null {
  const $user = get(user);
  return $user ? $user.id : null;
}

/**
 * Unlock with passphrase (traditional method)
 */
async function unlock(passphrase: string | null): Promise<boolean> {
  const { update } = user;
  const $user = get(user);
  if (!$user || !passphrase) {
    return false;
  }

  // Type guard to ensure we have a full User object
  const fullUser = $user as any;
  if (!fullUser.key_hash || !fullUser.privateKey || !fullUser.publicKey) {
    console.warn("[User] Missing encryption data for unlock");
    return false;
  }

  const { key_hash } = fullUser;

  try {
    const unlocked = await verifyHash(passphrase, key_hash);
    console.log("Unlocking", unlocked);

    if (unlocked) {
      // decrypt keys
      const privateKeyString = await decryptString(
        fullUser.privateKey,
        passphrase,
      );

      if (
        !privateKeyString ||
        privateKeyString.indexOf("-----BEGIN PRIVATE KEY-----") !== 0
      ) {
        return false;
      }

      const privateKey = await pemToKey(privateKeyString, true);
      const publicKey = await pemToKey(fullUser.publicKey, false);

      // Decrypt KEM secret key if available
      let kemPub: Uint8Array | null = null;
      let kemSec: Uint8Array | null = null;
      if (fullUser.kem_public_key && isKemKey(fullUser.kem_public_key)) {
        kemPub = deserializeKemKey(fullUser.kem_public_key);
      }
      if (fullUser.kem_secret_key) {
        try {
          const kemSecStr = await decryptString(fullUser.kem_secret_key, passphrase);
          if (kemSecStr && isKemKey(kemSecStr)) {
            kemSec = deserializeKemKey(kemSecStr);
          }
        } catch (e) {
          console.error("[User] Error decrypting KEM secret key:", e);
        }
      }

      keyPair.set(publicKey, privateKey, kemPub, kemSec);
      update((user) => {
        if (user) {
          user.unlocked = unlocked;
        }
        return user;
      });
      return true;
    } else {
      console.log("Unlock failed");
      keyPair.destroy();

      update((user) => {
        if (user) {
          user.unlocked = false;
        }
        return user;
      });
      return false;
    }
  } catch (error) {
    console.error("[User] Error during unlock:", error);
    keyPair.destroy();
    update((user) => {
      if (user) {
        user.unlocked = false;
      }
      return user;
    });
    return false;
  }
}

/**
 * Unlock with passkey PRF
 * Uses WebAuthn PRF extension to derive decryption key
 */
async function unlockWithPasskey(): Promise<boolean> {
  const { update } = user;
  const $user = get(user);

  if (!$user) {
    return false;
  }

  const fullUser = $user as User;

  // Check if user has passkey credentials
  if (
    fullUser.key_derivation_method !== "passkey_prf" ||
    !fullUser.passkey_credential_id ||
    !fullUser.passkey_prf_salt ||
    !fullUser.privateKey ||
    !fullUser.publicKey
  ) {
    console.warn("[User] Missing passkey credentials for unlock");
    return false;
  }

  try {
    // Authenticate with passkey and get PRF-derived key
    const prfDerivedKey = await authenticateWithPasskeyPRF(
      fullUser.passkey_credential_id,
      fullUser.passkey_prf_salt,
    );

    // Decrypt private key with PRF-derived key
    const privateKeyString = await decryptWithPRFKey(
      fullUser.privateKey,
      prfDerivedKey,
    );

    if (
      !privateKeyString ||
      privateKeyString.indexOf("-----BEGIN PRIVATE KEY-----") !== 0
    ) {
      console.error(
        "[User] Invalid private key format after passkey decryption",
      );
      return false;
    }

    // Import keys
    const privateKey = await pemToKey(privateKeyString, true);
    const publicKey = await pemToKey(fullUser.publicKey, false);

    // KEM keys for passkey mode (PRF-derived key doesn't encrypt KEM key separately yet)
    const kemPub = fullUser.kem_public_key && isKemKey(fullUser.kem_public_key)
      ? deserializeKemKey(fullUser.kem_public_key)
      : null;

    keyPair.set(publicKey, privateKey, kemPub, null);

    update((user) => {
      if (user) {
        user.unlocked = true;
      }
      return user;
    });

    console.log("[User] Successfully unlocked with passkey");
    return true;
  } catch (error) {
    console.error("[User] Error during passkey unlock:", error);
    keyPair.destroy();

    update((user) => {
      if (user) {
        user.unlocked = false;
      }
      return user;
    });
    return false;
  }
}

/**
 * Unlock with recovery key
 * Used when passphrase or passkey is lost
 */
async function unlockWithRecoveryKey(recoveryKey: string): Promise<boolean> {
  const { update } = user;
  const $user = get(user);

  if (!$user) {
    return false;
  }

  const fullUser = $user as User;

  if (!fullUser.recovery_encrypted_key || !fullUser.publicKey) {
    console.warn("[User] No recovery key available for this account");
    return false;
  }

  try {
    // Decrypt private key with recovery key
    const privateKeyString = await recoverPrivateKey(
      fullUser.recovery_encrypted_key,
      recoveryKey,
    );

    if (
      !privateKeyString ||
      privateKeyString.indexOf("-----BEGIN PRIVATE KEY-----") !== 0
    ) {
      console.error("[User] Invalid private key format after recovery");
      return false;
    }

    // Import keys
    const privateKey = await pemToKey(privateKeyString, true);
    const publicKey = await pemToKey(fullUser.publicKey, false);

    // KEM keys for recovery (recovery key doesn't protect KEM key separately yet)
    const kemPub = fullUser.kem_public_key && isKemKey(fullUser.kem_public_key)
      ? deserializeKemKey(fullUser.kem_public_key)
      : null;

    keyPair.set(publicKey, privateKey, kemPub, null);

    update((user) => {
      if (user) {
        user.unlocked = true;
      }
      return user;
    });

    console.log("[User] Successfully recovered with recovery key");
    return true;
  } catch (error) {
    console.error("[User] Error during recovery:", error);
    keyPair.destroy();

    update((user) => {
      if (user) {
        user.unlocked = false;
      }
      return user;
    });
    return false;
  }
}

/**
 * Get the current key derivation method for the user
 */
function getKeyDerivationMethod(): KeyDerivationMethod | null {
  const $user = get(user);
  if (!$user) return null;
  return (
    (($user as User).key_derivation_method as KeyDerivationMethod) ||
    "passphrase"
  );
}

/**
 * Check if user has recovery key set up
 */
function hasRecoveryKey(): boolean {
  const $user = get(user);
  if (!$user) return false;
  return !!($user as User).recovery_encrypted_key;
}

/**
 * Check if user has passkey set up
 */
function hasPasskey(): boolean {
  const $user = get(user);
  if (!$user) return false;
  const fullUser = $user as User;
  return !!(
    fullUser.key_derivation_method === "passkey_prf" &&
    fullUser.passkey_credential_id &&
    fullUser.passkey_prf_salt
  );
}

export async function encrypt(data: string): Promise<string> {
  if (!keyPair.isReady()) {
    throw new Error("Keys not available");
  }

  return await keyPair.encrypt(data);

  /*
    const key = await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt']
    );
    const keyStr = await exportAESGCMKey(key);
    const keyEnc = await encryptWithPublicKey(keys.publicKey, keyStr);
    const dataEnc = await Promise.all(data.map(async (d) => await encryptWithAESGCM(key, d)));
    return { data: dataEnc, key: keyEnc };*/
}

export async function decrypt(data: string): Promise<string> {
  if (!keyPair.isReady()) {
    throw new Error("Keys not available");
  }
  return await keyPair.decrypt(data);
  /*
    if (!keys.privateKey) {
        throw new Error('Private key not available');
    }
    console.log('Decrypting', keyEnc);
    const key = await decryptWithPrivateKey(keys.privateKey, keyEnc);

    // key is a string, convert it to a CryptoKey
    console.log('Key', key);
    return decryptWithAESGCM(await importAESGCMKey(key), dataEnc);
    */
}

/**
 * Get the current private key as PEM string (if unlocked)
 * Used for re-encrypting when switching encryption methods
 */
export async function getPrivateKeyPEM(): Promise<string | null> {
  if (!keyPair.isReady() || !keyPair.privateKey) {
    return null;
  }

  try {
    // Import keyToPEM dynamically to avoid circular imports
    const { keyToPEM } = await import("../encryption/keys");
    return await keyToPEM(keyPair.privateKey, true);
  } catch (error) {
    console.error("[User] Error exporting private key:", error);
    return null;
  }
}

/**
 * Get the current KEM secret key as serialized string (if unlocked and available)
 * Used for recovery document generation
 */
export async function getKemSecretKeySerialized(): Promise<string | null> {
  if (!keyPair.isReady() || !keyPair.kemSecretKey) {
    return null;
  }

  try {
    const { serializeKemKey } = await import("../encryption/kem");
    return serializeKemKey(keyPair.kemSecretKey);
  } catch (error) {
    console.error("[User] Error serializing KEM secret key:", error);
    return null;
  }
}

export default {
  keyPair,
  getId,
  ...user,
  ...auth,
  get: () => {
    return get(user);
  },
  set: setUser,
  unlock,
  unlockWithPasskey,
  unlockWithRecoveryKey,
  getKeyDerivationMethod,
  hasRecoveryKey,
  hasPasskey,
  getPrivateKeyPEM,
  getKemSecretKeySerialized,
};
