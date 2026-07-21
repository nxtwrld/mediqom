import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Vercel Blob
vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  list: vi.fn(),
}));

import { deleteUserStorage } from "./cleanup";
import { del, list } from "@vercel/blob";

function makeSupabase(profileData: any = null, documentsData: any = null) {
  const chainResult = (data: any) => ({
    select: vi.fn().mockReturnValue({
      or: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data }),
      }),
      eq: vi.fn().mockResolvedValue({ data }),
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") return chainResult(profileData);
      if (table === "documents") return chainResult(documentsData);
      return chainResult(null);
    }),
  } as any;
}

describe("deleteUserStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (list as any).mockResolvedValue({ blobs: [] });
    (del as any).mockResolvedValue(undefined);
  });

  it("returns empty result when user has no data", async () => {
    const supabase = makeSupabase(null, null);
    const result = await deleteUserStorage("user-1", supabase);
    expect(result.totalDeleted).toBe(0);
    expect(result.totalErrors).toBe(0);
    expect(result.deletedFiles).toEqual([]);
  });

  it("deletes avatar from Vercel Blob", async () => {
    const supabase = makeSupabase({ avatarUrl: "https://blob.example.com/avatar.jpg" });
    const result = await deleteUserStorage("user-1", supabase);
    expect(del).toHaveBeenCalledWith("https://blob.example.com/avatar.jpg");
    expect(result.deletedFiles).toContain("https://blob.example.com/avatar.jpg");
    expect(result.totalDeleted).toBeGreaterThanOrEqual(1);
  });

  it("handles avatar deletion error gracefully", async () => {
    (del as any).mockRejectedValueOnce(new Error("Blob not found"));
    const supabase = makeSupabase({ avatarUrl: "https://blob.example.com/avatar.jpg" });
    const result = await deleteUserStorage("user-1", supabase);
    expect(result.totalErrors).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].file).toBe("https://blob.example.com/avatar.jpg");
    expect(result.errors[0].error).toBe("Blob not found");
  });

  it("deletes document attachments", async () => {
    const supabase = makeSupabase(null, [
      { attachments: ["https://blob.example.com/att1.pdf", "https://blob.example.com/att2.pdf"] },
    ]);
    const result = await deleteUserStorage("user-1", supabase);
    expect(del).toHaveBeenCalledWith("https://blob.example.com/att1.pdf");
    expect(del).toHaveBeenCalledWith("https://blob.example.com/att2.pdf");
    expect(result.totalDeleted).toBe(2);
  });

  it("skips documents without attachments array", async () => {
    const supabase = makeSupabase(null, [{ attachments: null }, { attachments: "not-an-array" }]);
    const result = await deleteUserStorage("user-1", supabase);
    expect(result.totalDeleted).toBe(0);
  });

  it("deletes blobs matching user ID prefix", async () => {
    (list as any).mockResolvedValue({
      blobs: [
        { url: "https://blob.example.com/user-1/file1.pdf" },
        { url: "https://blob.example.com/user-1/file2.jpg" },
      ],
    });
    const supabase = makeSupabase();
    const result = await deleteUserStorage("user-1", supabase);
    expect(list).toHaveBeenCalledWith({ prefix: "user-1" });
    expect(result.totalDeleted).toBe(2);
  });

  it("handles blob list error gracefully", async () => {
    (list as any).mockRejectedValue(new Error("List failed"));
    const supabase = makeSupabase();
    const result = await deleteUserStorage("user-1", supabase);
    // Should not throw, just log
    expect(result.totalErrors).toBe(0); // list errors are just console.error'd
  });

  it("handles top-level error gracefully", async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error("DB connection failed");
      }),
    } as any;
    const result = await deleteUserStorage("user-1", supabase);
    expect(result.totalErrors).toBe(1);
    expect(result.errors[0].file).toBe("storage_cleanup");
  });
});
