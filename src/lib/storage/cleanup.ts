/**
 * Storage Cleanup Helper
 *
 * Centralized utilities for cleaning up user storage from Supabase Storage.
 * Used by the user self-delete endpoint (GDPR Art. 17).
 *
 * Object layout (see the upload endpoints):
 *   avatars     -> `${profileId}_${profiles.avatarUrl}`
 *                  (v1/med/profiles/[pid]/avatar/+server.ts — the column stores
 *                   only the bare filename, the key is prefixed with the profile id)
 *   attachments -> `${authUserId}/${randomName}`, recorded as Attachment.path
 *                  (v1/med/profiles/[pid]/attachments/+server.ts)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BUCKET = "avatars";
const ATTACHMENT_BUCKET = "attachments";

interface StorageCleanupResult {
  deletedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  totalDeleted: number;
  totalErrors: number;
}

/** Attachments are stored as Attachment objects, but tolerate bare path strings. */
function attachmentPath(attachment: unknown): string | null {
  if (typeof attachment === "string") return attachment;
  if (attachment && typeof attachment === "object") {
    const path = (attachment as { path?: unknown }).path;
    if (typeof path === "string") return path;
  }
  return null;
}

async function removeAll(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  result: StorageCleanupResult,
): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(bucket).remove(paths);

  if (error) {
    for (const path of paths) {
      result.errors.push({ file: `${bucket}/${path}`, error: error.message });
      result.totalErrors++;
    }
    return;
  }

  for (const path of paths) {
    result.deletedFiles.push(`${bucket}/${path}`);
    result.totalDeleted++;
  }
}

/**
 * Delete all storage files associated with a user.
 *
 * @param userId - The user's auth.users UUID
 * @param supabase - Supabase client with service-role permissions
 * @returns Summary of deleted files and any errors
 */
export async function deleteUserStorage(
  userId: string,
  supabase: SupabaseClient,
): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = {
    deletedFiles: [],
    errors: [],
    totalDeleted: 0,
    totalErrors: 0,
  };

  try {
    // Every profile the user owns: their own plus any family/dependant profiles.
    // Both cascade on auth.users deletion (20260216164220_add_user_cascade_deletes.sql),
    // so their storage must go too.
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, avatarUrl")
      .or(`auth_id.eq.${userId},owner_id.eq.${userId}`);

    if (profilesError) {
      result.errors.push({
        file: "profiles_lookup",
        error: profilesError.message,
      });
      result.totalErrors++;
    }

    const profileIds = (profiles ?? []).map((p) => p.id);

    const avatarPaths = (profiles ?? [])
      .filter((p) => p.avatarUrl)
      .map((p) => `${p.id}_${p.avatarUrl}`);
    await removeAll(supabase, AVATAR_BUCKET, avatarPaths, result);

    // Attachments hang off documents, and documents.user_id references
    // profiles.id — not auth.users.id.
    if (profileIds.length > 0) {
      const { data: documents, error: documentsError } = await supabase
        .from("documents")
        .select("attachments")
        .in("user_id", profileIds);

      if (documentsError) {
        result.errors.push({
          file: "documents_lookup",
          error: documentsError.message,
        });
        result.totalErrors++;
      }

      const attachmentPaths = (documents ?? [])
        .flatMap((doc) =>
          Array.isArray(doc.attachments) ? doc.attachments : [],
        )
        .map(attachmentPath)
        .filter((path): path is string => path !== null);

      await removeAll(
        supabase,
        ATTACHMENT_BUCKET,
        [...new Set(attachmentPaths)],
        result,
      );
    }

    // Fallback sweep: attachments live under an `${authUserId}/` folder, so anything
    // still there was orphaned by a failed save and is not referenced by any document.
    const { data: orphans, error: listError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .list(userId);

    if (listError) {
      result.errors.push({
        file: `${ATTACHMENT_BUCKET}/${userId}`,
        error: listError.message,
      });
      result.totalErrors++;
    } else if (orphans && orphans.length > 0) {
      await removeAll(
        supabase,
        ATTACHMENT_BUCKET,
        orphans.map((o) => `${userId}/${o.name}`),
        result,
      );
    }
  } catch (error) {
    console.error("Storage cleanup failed:", error);
    result.errors.push({
      file: "storage_cleanup",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    result.totalErrors++;
  }

  return result;
}
