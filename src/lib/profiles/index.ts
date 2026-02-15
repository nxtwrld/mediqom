import profiles from "./profiles";
import profile from "./profile";

import { decryptDocumentsNoStore, setDocuments, addDocument } from "$lib/documents";
import { DocumentType } from "$lib/documents/types.d";
import type { Document } from "$lib/documents/types.d";
import type { ProfileNew, Profile } from "$lib/types.d";
import type { ProfileCore, ProfileLoadResult } from "./types";
import user from "$lib/user";
import { prepareKeys } from "$lib/encryption/rsa";
import { createHash } from "$lib/encryption/hash";
import { generatePassphrase } from "$lib/encryption/passphrase";
import { apiFetch } from "$lib/api/client";

export { profiles, profile };

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
 *  Load
 */
export async function loadProfiles(
  force: boolean = false,
  fetchFn?: typeof globalThis.fetch,
) {
  // Guard: avoid unnecessary reloads for the same authenticated user
  // Reload only if forced, or if no profiles are in store, or if user changed
  const currentUserId = user.getId();
  const existingProfiles = profiles.get() as any[];
  if (!force && existingProfiles && existingProfiles.length > 0) {
    // Track the last user id we loaded profiles for
    if (loadProfilesMeta.lastLoadedUserId && loadProfilesMeta.lastLoadedUserId === currentUserId) {
      return;
    }
  }
  // fetch basic profile data
  const fetchOpts = fetchFn ? { fetch: fetchFn } : {};
  const profilesLoaded = await apiFetch('/v1/med/profiles', fetchOpts)
    .then((r) => r.json())
    .catch((e) => {
      console.error("Error loading profiles", e);
      return [];
    });

  // extend profile data with decrypted roots and batch set documents once
  const results: ProfileLoadResult[] = await Promise.all(
    profilesLoaded
      .filter((d: any) => d.profiles != null)
      .map(async (d: ProfileCore): Promise<ProfileLoadResult> => {
        // fetch encrypted profile and health documents
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

          // decrypt documents without mutating global documents store
          const roots = await decryptDocumentsNoStore(rootsEncrypted) as Document[];

          // map profile data
          const profileData = mapProfileData(d, roots);

          return { profileData, roots };
        } catch (e) {
          return {
            profileData: {
              ...d.profiles,
              status: d.status,
              insurance: {},
              health: {},
              vcard: {},
            },
            roots: [],
          };
        }
      }),
  );

  const profilesExtended = results.map((r) => r.profileData);
  const allRoots = results.flatMap((r) => r.roots);

  // set profiles
  profiles.set(profilesExtended || []);

  // Batch update documents store once with all roots for all profiles
  if (allRoots.length > 0) {
    setDocuments(allRoots);
  }

  // Update metadata after successful load
  loadProfilesMeta.lastLoadedUserId = currentUserId || null;
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

export function mapProfileData(
  core: ProfileCore,
  roots: Document[]
): Profile {
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
      //console.log('health', r);
      health = r.content;
      healthDocumentId = r.id;
    }
    // Remove title and tags from content object if they exist
    if (r.content && typeof r.content === 'object') {
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
  return profileData as Profile;
}

/**
 * Creat a new virtual profile
 */

export async function createVirtualProfile(profile: ProfileNew) {
  // 2. generate random passphrase
  const key_pass = generatePassphrase();
  const key_hash = await createHash(key_pass);

  // 3. encrypt private key with passphrase
  const keys = await prepareKeys(key_pass);

  console.log("Saving profile", {
    fullName: profile.fullName,
    language: profile.language || user.get()?.language || "en",
    publicKey: keys.publicKeyPEM,
    privateKey: keys.encryptedPrivateKey,
    key_hash: key_hash,
    key_pass: key_pass,
  });

  // 4. submit to server
  const response = await apiFetch('/v1/med/profiles', {
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

  //console.log('Profile saved', profileData);

  //console.log('Add profile documnets', profileData.id);
  // 7. update profiles
  await loadProfiles(true);

  // 5. create profile document if vcard is provided
  await addDocument({
    type: DocumentType.profile,
    content: {
      title: "Profile",
      tags: ["profile"],
      vcard: profile.vcard || {},
      insurance: profile.insurance || {},
    },
    user_id: profileData.id,
  });

  // 6. create a health document
  const healthDocument = {
    ...(profile.health || {}),
  };
  if (profile.birthDate) {
    healthDocument.birthDate = profile.birthDate;
  }

  //console.log('Add health documnets', profileData.id);
  await addDocument({
    type: DocumentType.health,
    content: {
      title: "Health",
      tags: ["health"],
      ...healthDocument,
    },
    user_id: profileData.id,
  });

  // 7. update profiles
  await loadProfiles(true);

  return profileData;
}
