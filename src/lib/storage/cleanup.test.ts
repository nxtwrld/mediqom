import { describe, it, expect, vi, beforeEach } from "vitest";

import { deleteUserStorage } from "./cleanup";

interface MockOptions {
  profiles?: any[] | null;
  profilesError?: { message: string } | null;
  documents?: any[] | null;
  documentsError?: { message: string } | null;
  orphans?: any[] | null;
  listError?: { message: string } | null;
  removeError?: { message: string } | null;
}

/**
 * Mocks the two Supabase surfaces cleanup.ts uses:
 *   .from(table).select().or()/.in()   -> profiles / documents lookups
 *   .storage.from(bucket).remove()/.list() -> object deletion
 */
function makeSupabase(options: MockOptions = {}) {
  const {
    profiles = [],
    profilesError = null,
    documents = [],
    documentsError = null,
    orphans = [],
    listError = null,
    removeError = null,
  } = options;

  const remove = vi.fn().mockResolvedValue({ error: removeError });
  const list = vi.fn().mockResolvedValue({ data: orphans, error: listError });

  return {
    client: {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          // profiles lookup
          or: vi.fn().mockResolvedValue({
            data: profiles,
            error: profilesError,
          }),
          // documents lookup
          in: vi.fn().mockResolvedValue({
            data: documents,
            error: documentsError,
          }),
        }),
      })),
      storage: {
        from: vi.fn(() => ({ remove, list })),
      },
    } as any,
    remove,
    list,
  };
}

describe("deleteUserStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty result when the user has no data", async () => {
    const { client, remove } = makeSupabase();
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalDeleted).toBe(0);
    expect(result.totalErrors).toBe(0);
    expect(result.deletedFiles).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("prefixes the avatar object key with the profile id", async () => {
    // profiles.avatarUrl stores only the bare filename; the object key is
    // `${profileId}_${filename}` (see v1/med/profiles/[pid]/avatar).
    const { client, remove } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: "face.jpg" }],
    });
    const result = await deleteUserStorage("user-1", client);

    expect(remove).toHaveBeenCalledWith(["profile-1_face.jpg"]);
    expect(result.deletedFiles).toContain("avatars/profile-1_face.jpg");
    expect(result.totalErrors).toBe(0);
  });

  it("removes avatars for dependant profiles too", async () => {
    const { client, remove } = makeSupabase({
      profiles: [
        { id: "profile-1", avatarUrl: "me.jpg" },
        { id: "profile-2", avatarUrl: "child.jpg" },
        { id: "profile-3", avatarUrl: null },
      ],
    });
    const result = await deleteUserStorage("user-1", client);

    expect(remove).toHaveBeenCalledWith([
      "profile-1_me.jpg",
      "profile-2_child.jpg",
    ]);
    expect(result.totalDeleted).toBe(2);
  });

  it("deletes document attachments by their storage path", async () => {
    const { client, remove } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: null }],
      documents: [
        {
          attachments: [
            { path: "user-1/abc123", url: "https://example.com/abc123" },
            { path: "user-1/def456", url: "https://example.com/def456" },
          ],
        },
      ],
    });
    const result = await deleteUserStorage("user-1", client);

    expect(remove).toHaveBeenCalledWith(["user-1/abc123", "user-1/def456"]);
    expect(result.totalDeleted).toBe(2);
  });

  it("tolerates attachments recorded as bare path strings", async () => {
    const { client, remove } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: null }],
      documents: [{ attachments: ["user-1/legacy"] }],
    });
    await deleteUserStorage("user-1", client);

    expect(remove).toHaveBeenCalledWith(["user-1/legacy"]);
  });

  it("skips documents without a usable attachments array", async () => {
    const { client, remove } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: null }],
      documents: [
        { attachments: null },
        { attachments: "not-an-array" },
        { attachments: [{ url: "https://example.com/x" }] }, // no path
      ],
    });
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalDeleted).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not look up documents when the user has no profiles", async () => {
    const { client } = makeSupabase({ profiles: [] });
    const result = await deleteUserStorage("user-1", client);

    expect(client.from).toHaveBeenCalledTimes(1); // profiles only
    expect(result.totalErrors).toBe(0);
  });

  it("sweeps orphaned objects under the user's attachment folder", async () => {
    const { client, remove, list } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: null }],
      orphans: [{ name: "stray1" }, { name: "stray2" }],
    });
    const result = await deleteUserStorage("user-1", client);

    expect(list).toHaveBeenCalledWith("user-1");
    expect(remove).toHaveBeenCalledWith(["user-1/stray1", "user-1/stray2"]);
    expect(result.totalDeleted).toBe(2);
  });

  it("reports a failed removal as an error rather than a deletion", async () => {
    // Erasure must be complete (GDPR Art. 17) — a silent failure is the bug
    // this replaces, so a remove() error has to surface.
    const { client } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: "face.jpg" }],
      removeError: { message: "Object not found" },
    });
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalDeleted).toBe(0);
    expect(result.totalErrors).toBe(1);
    expect(result.errors[0]).toEqual({
      file: "avatars/profile-1_face.jpg",
      error: "Object not found",
    });
  });

  it("reports a failed orphan listing as an error", async () => {
    const { client } = makeSupabase({
      profiles: [{ id: "profile-1", avatarUrl: null }],
      listError: { message: "List failed" },
    });
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalErrors).toBe(1);
    expect(result.errors[0].error).toBe("List failed");
  });

  it("reports a failed profiles lookup as an error", async () => {
    const { client } = makeSupabase({
      profiles: null,
      profilesError: { message: "DB unavailable" },
    });
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalErrors).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].file).toBe("profiles_lookup");
  });

  it("handles a top-level failure gracefully", async () => {
    const client = {
      from: vi.fn().mockImplementation(() => {
        throw new Error("DB connection failed");
      }),
    } as any;
    const result = await deleteUserStorage("user-1", client);

    expect(result.totalErrors).toBe(1);
    expect(result.errors[0].file).toBe("storage_cleanup");
  });
});
