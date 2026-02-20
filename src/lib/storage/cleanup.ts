/**
 * Storage Cleanup Helper
 *
 * Centralized utilities for cleaning up user storage from Vercel Blob.
 * Used by the user self-delete endpoint.
 */

import { del, list } from "@vercel/blob";
import type { SupabaseClient } from "@supabase/supabase-js";

interface StorageCleanupResult {
  deletedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  totalDeleted: number;
  totalErrors: number;
}

/**
 * Delete all storage files associated with a user.
 *
 * @param userId - The user's UUID (from auth.users or profiles)
 * @param supabase - Supabase client (with appropriate permissions)
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
    // Get user's profile for avatar URL
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatarUrl")
      .or(`auth_id.eq.${userId},id.eq.${userId}`)
      .single();

    // Delete avatar from Vercel Blob if exists
    if (profile?.avatarUrl) {
      try {
        await del(profile.avatarUrl);
        result.deletedFiles.push(profile.avatarUrl);
        result.totalDeleted++;
      } catch (error) {
        result.errors.push({
          file: profile.avatarUrl,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        result.totalErrors++;
      }
    }

    // Get all documents owned by user to find attachments
    const { data: documents } = await supabase
      .from("documents")
      .select("attachments")
      .eq("user_id", userId);

    // Delete document attachments from Vercel Blob
    if (documents) {
      for (const doc of documents) {
        if (doc.attachments && Array.isArray(doc.attachments)) {
          for (const attachment of doc.attachments) {
            try {
              await del(attachment);
              result.deletedFiles.push(attachment);
              result.totalDeleted++;
            } catch (error) {
              result.errors.push({
                file: attachment,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              result.totalErrors++;
            }
          }
        }
      }
    }

    // List and delete any files matching user ID pattern (fallback cleanup)
    try {
      const { blobs } = await list({ prefix: userId });
      for (const blob of blobs) {
        try {
          await del(blob.url);
          result.deletedFiles.push(blob.url);
          result.totalDeleted++;
        } catch (error) {
          result.errors.push({
            file: blob.url,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          result.totalErrors++;
        }
      }
    } catch (listError) {
      console.error("Failed to list blobs for user:", userId, listError);
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
