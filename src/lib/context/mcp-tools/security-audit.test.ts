import { describe, it, expect, beforeEach, vi } from "vitest";
import { MCPSecurityService } from "./security-audit";
import type { MCPSecurityContext } from "./security-audit";

function makeContext(userId = "user-1", profileId = "profile-1"): MCPSecurityContext {
  return {
    user: {
      id: userId,
      email: "u@x",
      created_at: "",
      updated_at: "",
      aud: "",
      app_metadata: {},
      user_metadata: {},
      role: "",
    } as any,
    profileId,
    sessionId: "sess-1",
    ipAddress: "127.0.0.1",
    userAgent: "ua",
  };
}

describe("MCPSecurityService.validateAccess", () => {
  let svc: MCPSecurityService;

  beforeEach(() => {
    svc = new MCPSecurityService();
    // Wire in a stub Supabase client that reports ownership for user-1/profile-1.
    svc.setSupabaseClient({
      from: (_t: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({ data: [], error: null }),
              }),
            }),
            single: () => ({
              data: { id: "profile-1", user_id: "user-1" },
              error: null,
            }),
          }),
        }),
      }),
    });
  });

  it("denies unknown tools", async () => {
    const res = await svc.validateAccess("notARealTool", makeContext());
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Unknown tool");
  });

  it("denies when user is missing (authentication required)", async () => {
    const res = await svc.validateAccess("searchDocuments", {
      profileId: "p-1",
    } as any);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Authentication required");
  });

  it("allows known tool when ownership is satisfied", async () => {
    const res = await svc.validateAccess("searchDocuments", makeContext());
    expect(res.allowed).toBe(true);
  });

  it("denies when profile ownership check fails", async () => {
    // Client reports a different user_id for the profile.
    svc.setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({ data: [], error: null }),
              }),
            }),
            single: () => ({
              data: { id: "profile-1", user_id: "other-user" },
              error: null,
            }),
          }),
        }),
      }),
    });
    const res = await svc.validateAccess("searchDocuments", makeContext());
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Profile access denied");
  });

  it("denies non-clinical users for tools that require clinical role", async () => {
    // generateClinicalSummary requires clinical role; our stub gives no metadata.
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ limit: () => ({ data: [], error: null }) }),
            }),
            single: () => {
              if (table === "profiles") {
                return {
                  data: { id: "profile-1", user_id: "user-1", metadata: null },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    });
    const res = await svc.validateAccess("generateClinicalSummary", makeContext());
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Clinical role required");
  });
});

describe("MCPSecurityService rate limiting", () => {
  it("cleanupRateLimits drops expired windows only", () => {
    const svc = new MCPSecurityService();
    // Poke private store via bracket notation to seed expired + live entries.
    (svc as any).rateLimitStore.set("expired-key", {
      count: 5,
      resetTime: Date.now() - 60_000,
    });
    (svc as any).rateLimitStore.set("live-key", {
      count: 1,
      resetTime: Date.now() + 60_000,
    });

    svc.cleanupRateLimits();
    expect((svc as any).rateLimitStore.has("expired-key")).toBe(false);
    expect((svc as any).rateLimitStore.has("live-key")).toBe(true);
  });

  it("checkRateLimit denies after maxRequests hit within window", () => {
    const svc = new MCPSecurityService();
    const limit = { maxRequests: 2, windowMs: 60_000 };
    const call = (svc as any).checkRateLimit.bind(svc);
    expect(call("k", limit)).toBe(true);
    expect(call("k", limit)).toBe(true);
    expect(call("k", limit)).toBe(false); // 3rd call rejected
  });
});

describe("MCPSecurityService.sanitizeParameters", () => {
  it("returns {} for null/undefined", () => {
    const svc = new MCPSecurityService();
    const sanitize = (svc as any).sanitizeParameters.bind(svc);
    expect(sanitize(null)).toEqual({});
    expect(sanitize(undefined)).toEqual({});
  });

  it("redacts documentContent", () => {
    const svc = new MCPSecurityService();
    const sanitize = (svc as any).sanitizeParameters.bind(svc);
    const result = sanitize({
      documentContent: "VERY SENSITIVE MEDICAL DATA",
      other: "safe",
    });
    expect(result.documentContent).toBe("[REDACTED]");
    expect(result.other).toBe("safe");
  });

  it("truncates long query fields", () => {
    const svc = new MCPSecurityService();
    const sanitize = (svc as any).sanitizeParameters.bind(svc);
    const longQuery = "x".repeat(500);
    const result = sanitize({ query: longQuery });
    expect(result.query.length).toBeLessThan(longQuery.length);
    expect(result.query).toContain("...[TRUNCATED]");
  });

  it("leaves short query fields alone", () => {
    const svc = new MCPSecurityService();
    const sanitize = (svc as any).sanitizeParameters.bind(svc);
    const result = sanitize({ query: "short query" });
    expect(result.query).toBe("short query");
  });
});

describe("MCPSecurityService.getAuditTrail", () => {
  function seedEntries(svc: MCPSecurityService) {
    (svc as any).auditStore = [
      {
        id: "a1",
        timestamp: "2024-01-01T00:00:00Z",
        userId: "user-1",
        profileId: "profile-1",
        toolName: "searchDocuments",
        operation: "op",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
      {
        id: "a2",
        timestamp: "2024-03-01T00:00:00Z",
        userId: "user-2",
        profileId: "profile-1",
        toolName: "getProfileData",
        operation: "op",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "high",
      },
      {
        id: "a3",
        timestamp: "2024-02-01T00:00:00Z",
        userId: "user-1",
        profileId: "other-profile",
        toolName: "searchDocuments",
        operation: "op",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
    ];
  }

  it("filters by profileId", async () => {
    const svc = new MCPSecurityService();
    seedEntries(svc);
    const entries = await svc.getAuditTrail("profile-1");
    expect(entries.map((e) => e.id).sort()).toEqual(["a1", "a2"]);
  });

  it("returns entries sorted by timestamp descending", async () => {
    const svc = new MCPSecurityService();
    seedEntries(svc);
    const entries = await svc.getAuditTrail("profile-1");
    // a2 (2024-03) before a1 (2024-01)
    expect(entries[0].id).toBe("a2");
    expect(entries[1].id).toBe("a1");
  });

  it("filters by toolName option", async () => {
    const svc = new MCPSecurityService();
    seedEntries(svc);
    const entries = await svc.getAuditTrail("profile-1", {
      toolName: "getProfileData",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].toolName).toBe("getProfileData");
  });

  it("honors limit option", async () => {
    const svc = new MCPSecurityService();
    seedEntries(svc);
    const entries = await svc.getAuditTrail("profile-1", { limit: 1 });
    expect(entries).toHaveLength(1);
  });

  it("filters by date range", async () => {
    const svc = new MCPSecurityService();
    seedEntries(svc);
    const entries = await svc.getAuditTrail("profile-1", {
      startDate: new Date("2024-02-01T00:00:00Z"),
    });
    expect(entries.map((e) => e.id)).toEqual(["a2"]);
  });
});

describe("MCPSecurityService.validateAccess — rate limit", () => {
  it("denies when rate limit is exceeded", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ limit: () => ({ data: [], error: null }) }),
            }),
            single: () => ({ data: { id: "profile-1", user_id: "user-1" }, error: null }),
          }),
        }),
      }),
    });

    // analyzeMedicalTrends has maxRequests: 10 per minute; exhaust it
    const ctx = makeContext("user-1", "profile-1");
    for (let i = 0; i < 10; i++) {
      await svc.validateAccess("analyzeMedicalTrends", ctx);
    }
    const res = await svc.validateAccess("analyzeMedicalTrends", ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Rate limit exceeded");
  });
});

describe("MCPSecurityService.logAccess", () => {
  it("pushes an entry to the audit store on success", async () => {
    const svc = new MCPSecurityService();
    const ctx = makeContext();
    await svc.logAccess("searchDocuments", "search", ctx, { terms: ["diabetes"] }, "success");

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail).toHaveLength(1);
    expect(trail[0].toolName).toBe("searchDocuments");
    expect(trail[0].result).toBe("success");
    expect(trail[0].userId).toBe("user-1");
  });

  it("logs denied result to audit store", async () => {
    const svc = new MCPSecurityService();
    const ctx = makeContext();
    await svc.logAccess("getProfileData", "read", ctx, {}, "denied", "Profile access denied");

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail[0].result).toBe("denied");
    expect(trail[0].errorMessage).toBe("Profile access denied");
  });

  it("logs error result to audit store", async () => {
    const svc = new MCPSecurityService();
    const ctx = makeContext();
    await svc.logAccess("queryMedicalHistory", "query", ctx, {}, "error", "DB error");

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail[0].result).toBe("error");
  });

  it("uses critical sensitivity level for getMedicationHistory", async () => {
    const svc = new MCPSecurityService();
    const ctx = makeContext();
    await svc.logAccess("getMedicationHistory", "read", ctx, {}, "success", undefined, ["doc-1"], 42);

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail[0].sensitivityLevel).toBe("critical");
    expect(trail[0].dataAccessed).toEqual(["doc-1"]);
    expect(trail[0].processingTimeMs).toBe(42);
  });

  it("uses unknown sensitivity for unregistered tools", async () => {
    const svc = new MCPSecurityService();
    const ctx = makeContext();
    await svc.logAccess("unknownTool", "op", ctx, {}, "success");

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail[0].sensitivityLevel).toBe("unknown");
  });

  it("persists via Supabase client when one is set", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: () => ({ insert: insertMock }),
    });
    const ctx = makeContext();
    await svc.logAccess("searchDocuments", "search", ctx, {}, "success");

    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("handles Supabase insert error gracefully (no throw)", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: () => ({ insert: vi.fn().mockResolvedValue({ error: { message: "DB down" } }) }),
    });
    const ctx = makeContext();
    // Should not throw
    await expect(
      svc.logAccess("searchDocuments", "search", ctx, {}, "success"),
    ).resolves.toBeUndefined();
  });

  it("skips persist when no Supabase client is set", async () => {
    const svc = new MCPSecurityService();
    // No setSupabaseClient call
    const ctx = makeContext();
    // Should not throw
    await expect(
      svc.logAccess("searchDocuments", "search", ctx, {}, "success"),
    ).resolves.toBeUndefined();
  });

  it("records anonymous access level when user is undefined", async () => {
    const svc = new MCPSecurityService();
    const ctx = { user: undefined, profileId: "profile-1" } as any;
    await svc.logAccess("searchDocuments", "search", ctx, {}, "success");

    const trail = await svc.getAuditTrail("profile-1");
    expect(trail[0].userId).toBe("anonymous");
    expect(trail[0].accessLevel).toBe("anonymous");
  });
});

describe("MCPSecurityService.getAuditTrail — userId filter", () => {
  function seedTwoUsers(svc: MCPSecurityService) {
    (svc as any).auditStore = [
      {
        id: "u1a",
        timestamp: "2024-01-01T00:00:00Z",
        userId: "user-1",
        profileId: "profile-1",
        toolName: "searchDocuments",
        operation: "op",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
      {
        id: "u2a",
        timestamp: "2024-02-01T00:00:00Z",
        userId: "user-2",
        profileId: "profile-1",
        toolName: "getProfileData",
        operation: "op",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "high",
      },
    ];
  }

  it("filters by userId option", async () => {
    const svc = new MCPSecurityService();
    seedTwoUsers(svc);
    const entries = await svc.getAuditTrail("profile-1", { userId: "user-2" });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe("user-2");
  });

  it("filters by endDate option", async () => {
    const svc = new MCPSecurityService();
    seedTwoUsers(svc);
    const entries = await svc.getAuditTrail("profile-1", {
      endDate: new Date("2024-01-31T00:00:00Z"),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("u1a");
  });
});

describe("MCPSecurityService.checkProfileOwnership", () => {
  it("falls back to strict id match when no Supabase client available", async () => {
    const svc = new MCPSecurityService();
    // No client set
    const ctx = makeContext("profile-1", "profile-1"); // userId === profileId
    const res = await svc.validateAccess("searchDocuments", ctx);
    // Without a client, ownership falls back to userId === profileId (true here)
    expect(res.allowed).toBe(true);
  });

  it("denies when no client and userId !== profileId", async () => {
    const svc = new MCPSecurityService();
    // No client set, userId !== profileId
    const ctx = makeContext("user-xyz", "profile-1");
    const res = await svc.validateAccess("searchDocuments", ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Profile access denied");
  });

  it("grants access via document_shares when profile user_id differs", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            // For profiles table — returns different owner
            single: () => ({ data: { id: "profile-1", user_id: "owner-user" }, error: null }),
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  // For document_shares — returns a share record
                  data: [{ id: "share-1" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("searchDocuments", ctx);
    expect(res.allowed).toBe(true);
  });

  it("denies when profile lookup returns error", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({ data: null, error: { message: "not found" } }),
            eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }),
          }),
        }),
      }),
    });
    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("searchDocuments", ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Profile access denied");
  });

  it("denies when document_shares lookup returns error", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => ({ data: { id: "profile-1", user_id: "other" }, error: null }),
            eq: () => ({
              eq: () => ({
                limit: () => ({ data: null, error: { message: "share error" } }),
              }),
            }),
          }),
        }),
      }),
    });
    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("searchDocuments", ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Profile access denied");
  });

  it("returns false and does not throw when Supabase client throws unexpectedly", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: () => { throw new Error("unexpected DB error"); },
    });
    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("searchDocuments", ctx);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Profile access denied");
  });
});

describe("MCPSecurityService.checkClinicalRole", () => {
  it("grants clinical role when metadata.role is 'clinical'", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => {
              if (table === "profiles") {
                return {
                  data: { id: "profile-1", user_id: "user-1", metadata: { role: "clinical" } },
                  error: null,
                };
              }
              return { data: { id: "profile-1", user_id: "user-1" }, error: null };
            },
            eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }),
          }),
        }),
      }),
    });

    // generateClinicalSummary requires clinical role
    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("generateClinicalSummary", ctx);
    expect(res.allowed).toBe(true);
  });

  it("grants clinical role when metadata.role is 'provider'", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => {
              if (table === "profiles") {
                return {
                  data: { id: "profile-1", user_id: "user-1", metadata: { role: "provider" } },
                  error: null,
                };
              }
              return { data: { id: "profile-1", user_id: "user-1" }, error: null };
            },
            eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }),
          }),
        }),
      }),
    });

    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("generateClinicalSummary", ctx);
    expect(res.allowed).toBe(true);
  });

  it("grants clinical role when metadata is a JSON string", async () => {
    const svc = new MCPSecurityService();
    svc.setSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => {
              if (table === "profiles") {
                return {
                  data: {
                    id: "profile-1",
                    user_id: "user-1",
                    metadata: JSON.stringify({ role: "clinical" }),
                  },
                  error: null,
                };
              }
              return { data: { id: "profile-1", user_id: "user-1" }, error: null };
            },
            eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }),
          }),
        }),
      }),
    });

    const ctx = makeContext("user-1", "profile-1");
    const res = await svc.validateAccess("generateClinicalSummary", ctx);
    expect(res.allowed).toBe(true);
  });
});

describe("MCPSecurityService.exportAuditLogs", () => {
  it("exports JSON by default", async () => {
    const svc = new MCPSecurityService();
    (svc as any).auditStore = [
      {
        id: "a1",
        timestamp: "2024-06-01T00:00:00Z",
        userId: "u",
        profileId: "p",
        toolName: "t",
        operation: "o",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
    ];
    const result = await svc.exportAuditLogs(
      new Date("2024-01-01"),
      new Date("2024-12-31"),
    );
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("a1");
  });

  it("exports CSV on request", async () => {
    const svc = new MCPSecurityService();
    (svc as any).auditStore = [
      {
        id: "a1",
        timestamp: "2024-06-01T00:00:00Z",
        userId: "u",
        profileId: "p",
        toolName: "t",
        operation: "o",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
        ipAddress: "1.1.1.1",
      },
    ];
    const result = await svc.exportAuditLogs(
      new Date("2024-01-01"),
      new Date("2024-12-31"),
      "csv",
    );
    expect(result.split("\n")[0]).toContain("ID");
    expect(result).toContain("a1");
  });

  it("filters outside-range entries", async () => {
    const svc = new MCPSecurityService();
    (svc as any).auditStore = [
      {
        id: "in",
        timestamp: "2024-06-01T00:00:00Z",
        userId: "u",
        profileId: "p",
        toolName: "t",
        operation: "o",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
      {
        id: "out",
        timestamp: "2020-06-01T00:00:00Z",
        userId: "u",
        profileId: "p",
        toolName: "t",
        operation: "o",
        parameters: {},
        result: "success",
        accessLevel: "authenticated",
        sensitivityLevel: "medium",
      },
    ];
    const result = await svc.exportAuditLogs(
      new Date("2024-01-01"),
      new Date("2024-12-31"),
    );
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("in");
  });
});
