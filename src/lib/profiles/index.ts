import profiles from "./profiles";
import profile from "./profile";

import {
  decryptDocumentsNoStore,
  addDocument,
  importDocuments,
} from "$lib/documents";
import { DocumentType } from "$lib/documents/types.d";
import type { Document } from "$lib/documents/types.d";
import type { ProfileNew, Profile } from "$lib/types.d";
import type { ProfileCore, ProfileLoadResult } from "./types";
import user from "$lib/user";
import { prepareKeys } from "$lib/encryption/rsa";
import { createHash } from "$lib/encryption/hash";
import { generatePassphrase } from "$lib/encryption/passphrase";
import { apiFetch } from "$lib/api/client";
import { writable } from "svelte/store";
import {
  getCachedProfiles,
  setCachedProfiles,
  type BasicProfile,
} from "./cache";
import { profileContextManager } from "$lib/context/integration/profile-context";
import { isCapacitorBuild } from "$lib/config/platform";

export { profiles, profile };

/** Store: true while background document loading for a profile is in progress */
export const profileDocumentsLoading = writable(false);

// Simple in-memory metadata for loadProfiles
const loadProfilesMeta: { lastLoadedUserId: string | null } = {
  lastLoadedUserId: null,
};

/** 1
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
 */
export async function loadProfiles(
  force: boolean = false,
  fetchFn?: typeof globalThis.fetch,
) {
  // Guard: avoid unnecessary reloads for the same authenticated user
  const currentUserId = user.getId();
  const existingProfiles = profiles.get() as any[];
  if (!force && existingProfiles && existingProfiles.length > 0) {
    if (
      loadProfilesMeta.lastLoadedUserId &&
      loadProfilesMeta.lastLoadedUserId === currentUserId
    ) {
      return;
    }
  }

  const fetchOpts = fetchFn ? { fetch: fetchFn } : {};

  // --- Phase 0: Stale cache (mobile only) ---
  if (currentUserId && isCapacitorBuild()) {
    const cached = await getCachedProfiles(currentUserId);
    if (cached) {
      // Only set if store is currently empty (avoids flickering on forced reloads)
      const current = profiles.get() as any[];
      if (!current || current.length === 0) {
        profiles.set(cached as any);
      }
    }
  }

  // --- Phase 1: Fetch basic profile list (fast) ---
  const profilesLoaded = await apiFetch("/v1/med/profiles", fetchOpts)
    .then((r) => r.json())
    .catch((e) => {
      console.error("Error loading profiles", e);
      return [];
    });

  // Build basic profiles with empty health/vcard/insurance
  const basicProfiles: Profile[] = profilesLoaded
    .filter((d: any) => d.profiles != null)
    .map((d: ProfileCore) => ({
      ...d.profiles,
      status: d.status,
      insurance: {},
      health: {},
      vcard: {},
    }));

  // Set store immediately so profile list renders now
  profiles.set(basicProfiles);
  loadProfilesMeta.lastLoadedUserId = currentUserId || null;

  // Cache non-sensitive metadata for mobile stale-while-revalidate (never on web)
  if (currentUserId && isCapacitorBuild()) {
    const toCache: BasicProfile[] = basicProfiles.map((p: any) => ({
      id: p.id,
      fullName: p.fullName,
      avatarUrl: p.avatarUrl,
      status: p.status,
      owner_id: p.owner_id,
      language: p.language,
    }));
    setCachedProfiles(currentUserId, toCache);
  }

  // --- Phase 2: Background enrichment with documents ---
  enrichProfilesWithDocuments(profilesLoaded, fetchOpts);
}

/**
 * Background: fetch & decrypt profile+health documents for each profile,
 * then update the profiles store with enriched data and populate documents store.
 */
async function enrichProfilesWithDocuments(
  profilesLoaded: ProfileCore[],
  fetchOpts: { fetch?: typeof globalThis.fetch },
) {
  const results: ProfileLoadResult[] = await Promise.all(
    profilesLoaded
      .filter((d: any) => d.profiles != null)
      .map(async (d: ProfileCore): Promise<ProfileLoadResult> => {
        try {
          const rootsEncrypted = await apiFetch(
            `/v1/med/profiles/${d.profiles.id}/documents?types=profile,health&full=true`,
            fetchOpts,
          )
            .then((r) => r.json())
            .catch((e) => {
              console.error("Error loading profile documents", e);
              return [];
            });

          const roots = (await decryptDocumentsNoStore(
            rootsEncrypted,
          )) as Document[];

          const profileData = mapProfileData(d, roots);
          return { profileData };
        } catch (e) {
          return {
            profileData: {
              ...d.profiles,
              status: d.status,
              insurance: {},
              health: {},
              vcard: {},
            },
          };
        }
      }),
  );

  const profilesExtended = results.map((r) => r.profileData);

  profiles.set(profilesExtended || []);
}

/** Tracks in-flight document loads per profile to prevent concurrent duplicate fetches */
const profileDocumentLoads = new Map<string, Promise<void>>();

/** Tracks profiles whose documents have already been successfully loaded this session */
const profileDocumentsLoaded = new Set<string>();

/**
 * Clears the loaded-flag for a profile so the next call re-fetches.
 * Call after document mutations (e.g. add/delete) if a full reload is needed.
 */
export function invalidateProfileDocuments(profileId: string): void {
  profileDocumentsLoaded.delete(profileId);
  profileDocumentLoads.delete(profileId);
}

/**
 * Load all documents for a single profile in the background.
 * Sets profileDocumentsLoading store during the operation.
 * Deduplicates concurrent calls and skips re-fetch if already loaded this session.
 */
export async function loadProfileDocuments(
  profileId: string,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  // Skip entirely if already successfully loaded this session
  if (profileDocumentsLoaded.has(profileId)) {
    return;
  }

  // Return existing promise if already loading for this profile
  const existing = profileDocumentLoads.get(profileId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    profileDocumentsLoading.set(true);
    try {
      const fetchOpts = fetchFn ? { fetch: fetchFn } : {};
      const response = await apiFetch(
        `/v1/med/profiles/${profileId}/documents`,
        fetchOpts,
      );

      if (response.status !== 200) {
        console.warn(`Failed to load documents for profile ${profileId}: ${response.status}`);
        return;
      }

      const documents = await importDocuments(await response.json());

      // Mark as loaded only on success so failed loads can retry
      profileDocumentsLoaded.add(profileId);

      if (documents.length > 0) {
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

export function mapProfileData(core: ProfileCore, roots: Document[]): Profile {
  let profile: any = null,
    health: any = null,
    profileDocumentId: string | null = null,
    healthDocumentId: string | null = null;

  roots.forEach((r) => {
    if (r.type === "profile") {
      profile = r.content;
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

  if (profile) {
    profileData.vcard = profile.vcard;
    profileData.insurance = profile.insurance;
    profileData.birthDate = profile.birthDate;
  }

  if (health) {
    profileData.health = health;
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
  const keys = await prepareKeys(key_pass);

  console.log("Saving profile", {
    fullName: profile.fullName,
    language: profile.language || user.get()?.language || "en",
    publicKey: keys.publicKeyPEM,
    privateKey: keys.encryptedPrivateKey,
    key_hash: key_hash,
    key_pass: key_pass,
  });

  const response = await apiFetch("/v1/med/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName: profile.fullName,
      language: profile.language || user.get()?.language || "en",
      publicKey: keys.publicKeyPEM,
      privateKey: keys.encryptedPrivateKey,
      key_hash: key_hash,
      key_pass: key_pass,
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
