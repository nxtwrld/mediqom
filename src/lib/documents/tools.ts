import { type Document } from "$lib/documents/types.d";
import { get } from "svelte/store";
import { profiles, profile } from "$lib/profiles";
import { type Profile } from "$lib/types.d";
import documents, { byUser } from "$lib/documents";
import user from "$lib/user";

export function getAuthor(document: Document): Profile | null {
  try {
    const profile = profiles.get(document.author_id) as Profile;
    return profile;
  } catch (e) {
    return null;
  }
}

export function getByAnotherAuthor(document: Document): Profile | null {
  if (document.author_id == document.user_id) {
    return null;
  }
  return getAuthor(document);
}

export function groupByTags(user_id: string | undefined = undefined): {
  [key: string]: Document[];
} {
  if (!user_id) user_id = get(profile).id;
  const userDocuments = get(byUser(user_id));
  const groups: {
    [key: string]: Document[];
  } = {};
  userDocuments.forEach((d) => {
    (d.metadata.tags || []).forEach((t) => {
      if (!groups[t]) {
        groups[t] = [];
      }
      groups[t].push(d as Document);
    });
  });
  return groups;
}
