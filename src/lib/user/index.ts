import { writable, type Writable, get, type Updater } from "svelte/store";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "$lib/supabase";
import auth from "$lib/auth";
import { decryptString } from "../encryption/passphrase";
import { verifyHash } from "../encryption/hash";
import { KeyPair, pemToKey } from "../encryption/rsa";
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
};

const keys: {
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
} = {};

let keyPair: KeyPair = new KeyPair();

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

    delete userProfile.private_keys;

    user.set({
      ...userProfile,
      unlocked: true, // Always set to true to disable lock behavior
      isMedical:
        userProfile.subscription === "medical" ||
        userProfile.subscription === "gp",
      email: actualUserSession.email as string,
      //subscriptionStats
    });

    // Set up encryption keys directly (no store update to avoid cascading re-renders)
    if (key_pass && userProfile.key_hash && userProfile.privateKey && userProfile.publicKey) {
      try {
        const privateKeyString = await decryptString(userProfile.privateKey, key_pass);
        if (privateKeyString && privateKeyString.indexOf("-----BEGIN PRIVATE KEY-----") === 0) {
          const privateKey = await pemToKey(privateKeyString, true);
          const publicKey = await pemToKey(userProfile.publicKey, false);
          keyPair.set(publicKey, privateKey);
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
  user.set(null);
  keyPair.destroy();
}

function getId(): string | null {
  const $user = get(user);
  return $user ? $user.id : null;
}

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
      keyPair.set(publicKey, privateKey);
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
};
