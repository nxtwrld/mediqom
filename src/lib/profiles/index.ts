import profiles from "./profiles";
import profile from "./profile";

import {
  decryptDocumentsNoStore,
  addDocument,
  importDocuments,
  setDocuments,
} from "$lib/documents";
import { DocumentType } from "$lib/documents/types.d";
import type { Document } from "$lib/documents/types.d";
import type { ProfileNew, Profile } from "$lib/types.d";
import type { ProfileCore, ProfileLoadResult } from "./types";
import user from "$lib/user";
import { generateKeys } from "$lib/encryption/keys";
import { createHash } from "$lib/encryption/hash";
import { generatePassphrase } from "$lib/encryption/passphrase";
import { apiFetch } from "$lib/api/client";
import { writable } from "svelte/store";
import { fetchCached, invalidateCachePattern, invalidateCache } from "$lib/cache";
import { profileContextManager } from "$lib/context/integration/profile-context";

export { profiles, profile };

/** Store: true while background document loading for a profile is in progress */
export const profileDocumentsLoading = writable(false);

/** Store: true while Phase 2 profile enrichment (document decryption) is in progress */
export const profilesEnriching = writable(false);

/**
 *  Removes links between a parent and a profile
 */
export async function removeLinkedParent(profile_id: string) {
  await apiFetch(`/v1/med/profiles/${profile_id}?link_type=parent`, {
    method: "DELETE",
  });
  await loadProfiles(true);
}

/**
 *  Removes links between a profile and a parent
 */
export async function removeLinkedProfile(profile_id: string) {
  await apiFetch(`/v1/med/profiles/${profile_id}`, {
    method: "DELETE",
  });
  await loadProfiles(true);
}

/**
 * Phase 1 (blocking, fast): fetch basic profile list and set in store.
 * Phase 2 (background, slow): enrich each profile with decrypted documents.
 *
 * Uses stale-while-revalidate cache on both platforms.
 * Mobile: Preferences (OS-encrypted) serves instant data on cold start.
 */
export async function loadProfiles(
  force: boolean = false,
  fetchFn?: typeof globalThis.fetch,
) {
  const currentUserId = user.getId();

  const fetchOpts = fetchFn ? { fetch: fetchFn } : {};

  // When force=true, invalidate the profile caches so fetchCached re-fetches.
  if (force && currentUserId) {
    invalidateCachePattern(`profiles:list:${currentUserId}`);
  }

  // --- Phase 1: Basic profile list (stale-while-revalidate) ---
  const basicProfiles = await fetchCached<Profile[]>(
    `profiles:list:${currentUserId}`,
    () => apiFetch("/v1/med/profiles", fetchOpts),
    async (r) => {
      const raw: ProfileCore[] = await r.json();
      return raw
        .filter((d) => d.profiles != null)
        .map((d: ProfileCore) => ({
          ...d.profiles,
          status: d.status,
          insurance: {},
          health: {},
          vcard: {},
        })) as Profile[];
    }
  );

  if (basicProfiles) {
    profiles.set(basicProfiles);
  }

  // --- Phase 2: Background enrichment with documents ---
  // Re-fetch raw list for enrichment (use cached data for performance)
  profilesEnriching.set(true);
  apiFetch("/v1/med/profiles", fetchOpts)
    .then((r) => r.json())
    .then((profilesLoaded: ProfileCore[]) =>
      enrichProfilesWithDocuments(profilesLoaded, fetchOpts, force)
    )
    .catch((e) => console.error("Error loading profiles for enrichment", e))
    .finally(() => profilesEnriching.set(false));
}

/**
 * Background: fetch & decrypt profile+health documents for each profile,
 * then update the profiles store with enriched data.
 */
async function enrichProfilesWithDocuments(
  profilesLoaded: ProfileCore[],
  fetchOpts: { fetch?: typeof globalThis.fetch },
  force: boolean = false,
) {
  const results: Profile[] = await Promise.all(
    profilesLoaded
      .filter((d: any) => d.profiles != null)
      .map(async (d: ProfileCore): Promise<Profile> => {
        const enrichKey = `profiles:enrich:${d.profiles.id}`;
        if (force) {
          invalidateCache(enrichKey);
        }
        try {
          const enriched = await fetchCached<Profile>(
            enrichKey,
            () =>
              apiFetch(
                `/v1/med/profiles/${d.profiles.id}/documents?types=profile,health&full=true`,
                fetchOpts,
              ),
            async (r) => {
              const rootsEncrypted = await r.json();
              const roots = (await decryptDocumentsNoStore(
                rootsEncrypted,
              )) as Document[];
              return await mapProfileData(d, roots);
            },
          );
          return (
            enriched || ({
              ...d.profiles,
              status: d.status,
              insurance: {},
              health: {},
              vcard: {},
            } as Profile)
          );
        } catch {
          return {
            ...d.profiles,
            status: d.status,
            insurance: {},
            health: {},
            vcard: {},
          } as Profile;
        }
      }),
  );

  profiles.set(results);

  profilesEnriching.set(false);

  // Sync the singular profile store if the currently-viewed profile was enriched
  const currentProfile = profile.get();
  if (currentProfile?.id) {
    const enrichedCurrent = results.find((r) => r.id === currentProfile.id);
    if (enrichedCurrent?.health) {
      profile.set({ ...currentProfile, ...enrichedCurrent });
    }
  }
}

/** Tracks in-flight document loads per profile to prevent concurrent duplicate fetches */
const profileDocumentLoads = new Map<string, Promise<void>>();

/**
 * Clears the in-flight load for a profile so the next call re-fetches.
 * Call after document mutations or when a realtime event fires.
 */
export function invalidateProfileDocuments(profileId: string): void {
  profileDocumentLoads.delete(profileId);
}

/**
 * Load all documents for a single profile in the background.
 * Uses stale-while-revalidate cache: returns cached docs instantly on mobile cold start,
 * then re-fetches in background.
 */
export async function loadProfileDocuments(
  profileId: string,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  // Return existing promise if already loading for this profile
  const existing = profileDocumentLoads.get(profileId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    profileDocumentsLoading.set(true);
    try {
      const fetchOpts = fetchFn ? { fetch: fetchFn } : {};

      const docs = await fetchCached<(Document | { id: string })[]>(
        `documents:${profileId}`,
        () => apiFetch(`/v1/med/profiles/${profileId}/documents`, fetchOpts),
        async (r) => {
          const status = r.status;
          if (status !== 200) {
            console.warn(`Failed to load documents for profile ${profileId}: ${status}`);
            return [];
          }
          return decryptDocumentsNoStore(await r.json());
        },
      );

      if (!docs) return;

      // Always sync store with whatever data we have (handles cache-hit path where
      // importDocuments wasn't called, so setDocuments wasn't triggered).
      if (docs.length > 0) {
        setDocuments(docs as any);
      }

      if (docs.length > 0) {
        try {
          await profileContextManager.initializeProfileContext(profileId);
        } catch (error) {
          console.warn(
            `Failed to initialize context for profile ${profileId}:`,
            error,
          );
        }
      }
    } catch (e) {
      console.error("Error loading profile documents:", e);
    } finally {
      profileDocumentsLoading.set(false);
      profileDocumentLoads.delete(profileId);
    }
  })();

  profileDocumentLoads.set(profileId, promise);
  return promise;
}

export function updateProfile(p: Profile) {
  profiles.update(p);

  // extend current profile with new data (if it is the same profile)
  let currentProfile = profile.get();
  if (currentProfile?.id === p.id) {
    profile.set({
      ...currentProfile,
      ...p,
    });
  }
}

export async function mapProfileData(core: ProfileCore, roots: Document[]): Promise<Profile> {
  let profileDoc: any = null,
    health: any = null,
    profileDocumentId: string | null = null,
    healthDocumentId: string | null = null;

  roots.forEach((r) => {
    if (r.type === "profile") {
      profileDoc = r.content;
      profileDocumentId = r.id;
    }
    if (r.type === "health") {
      health = r.content;
      healthDocumentId = r.id;
    }
    if (r.content && typeof r.content === "object") {
      const content = r.content as any;
      delete content.title;
      delete content.tags;
    }
  });

  const profileData: any = {
    ...core.profiles,
    status: core.status,
    profileDocumentId,
    healthDocumentId,
    insurance: {},
    health: {},
    vcard: {},
    birthDate: undefined,
  };

  if (profileDoc) {
    profileData.vcard = profileDoc.vcard;
    profileData.insurance = profileDoc.insurance;
    profileData.birthDate = profileDoc.birthDate;
  }

  if (health) {
    profileData.health = health;
  }

  if (import.meta.env.DEV) {
    try {
      const { generateMockSignals } = await import('$lib/capacitor/health-mock-plugin');
      profileData.health = {
        ...profileData.health,
        signals: {
          ...generateMockSignals(),
          ...(profileData.health?.signals || {})
        }
      };
    } catch {
      // Mock signals not critical — skip silently
    }
  }

  if (profileData.vcard?.fn) {
    profileData.fullName = profileData.vcard.fn;
  }

  return profileData as Profile;
}

/**
 * Create a new virtual profile
 */
export async function createVirtualProfile(profile: ProfileNew) {
  const key_pass = generatePassphrase();
  const key_hash = await createHash(key_pass);
  const keys = await generateKeys(key_pass, "hybrid");

  console.log("Saving profile", {
    fullName: profile.fullName,
    language: profile.language || user.get()?.language || "en",
    publicKey: keys.rsaPublicKeyPEM,
    privateKey: keys.encryptedRsaPrivateKey,
    key_hash: key_hash,
    key_pass: key_pass,
    key_mode: keys.mode,
  });

  const response = await apiFetch("/v1/med/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName: profile.fullName,
      language: profile.language || user.get()?.language || "en",
      publicKey: keys.rsaPublicKeyPEM,
      privateKey: keys.encryptedRsaPrivateKey,
      key_hash: key_hash,
      key_pass: key_pass,
      kem_public_key: keys.kemPublicKey,
      kem_secret_key: keys.encryptedKemSecretKey,
      key_mode: keys.mode,
    }),
  }).catch((e) => {
    console.error("Error saving profile", e);
    throw new Error("Error saving profile");
  });
  const [profileData] = await response.json();

  await loadProfiles(true);

  const vcardData = profile.vcard || {};
  if (!vcardData.fn && profile.fullName) {
    vcardData.fn = profile.fullName;
  }

  await addDocument({
    type: DocumentType.profile,
    content: {
      title: "Profile",
      tags: ["profile"],
      vcard: vcardData,
      insurance: profile.insurance || {},
    },
    user_id: profileData.id,
  });

  const healthDocument = {
    ...(profile.health || {}),
  };
  if (profile.birthDate) {
    healthDocument.birthDate = profile.birthDate;
  }

  await addDocument({
    type: DocumentType.health,
    content: {
      title: "Health",
      tags: ["health"],
      ...healthDocument,
    },
    user_id: profileData.id,
  });

  await loadProfiles(true);

  return profileData;
}
