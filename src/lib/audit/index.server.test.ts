import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn().mockResolvedValue({ error: null }),
}));

// Stub env + Supabase client before importing the module under test.
vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://stub.example.com",
}));
vi.mock("$env/static/private", () => ({
  SUPABASE_SERVICE_ROLE_KEY: "stub-key",
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

import { extractRequestContext, auditLog, auditFromEvent } from "./index.server";

describe("extractRequestContext", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return {
      headers: {
        get: (k: string) => headers[k.toLowerCase()] ?? null,
      },
    } as unknown as Request;
  }

  it("prefers x-forwarded-for (first entry, trimmed)", () => {
    const req = makeRequest({ "x-forwarded-for": "  10.0.0.1 , 10.0.0.2 " });
    const ctx = extractRequestContext(req);
    expect(ctx.ip_address).toBe("10.0.0.1");
  });

  it("falls back to x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "9.9.9.9" });
    const ctx = extractRequestContext(req);
    expect(ctx.ip_address).toBe("9.9.9.9");
  });

  it("returns undefined IP when no header matches", () => {
    const req = makeRequest({});
    const ctx = extractRequestContext(req);
    expect(ctx.ip_address).toBeUndefined();
  });

  it("captures user-agent header", () => {
    const req = makeRequest({ "user-agent": "ua/1.0" });
    const ctx = extractRequestContext(req);
    expect(ctx.user_agent).toBe("ua/1.0");
  });

  it("returns undefined user_agent when absent", () => {
    const req = makeRequest({});
    const ctx = extractRequestContext(req);
    expect(ctx.user_agent).toBeUndefined();
  });
});

describe("auditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts audit entry with defaults", async () => {
    auditLog({
      user_id: "user-1",
      action: "read",
      resource_type: "document",
      resource_id: "doc-1",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        action: "read",
        resource_type: "document",
        resource_id: "doc-1",
        actor_type: "user",
        success: true,
        metadata: {},
      }),
    );
  });

  it("defaults null user_id when omitted", async () => {
    auditLog({ action: "create", resource_type: "profile" });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it("does not throw on insert failure", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "DB error" } });

    auditLog({ action: "delete", resource_type: "document" });

    await new Promise((r) => setTimeout(r, 10));
    // No exception thrown
  });
});

describe("auditFromEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts context from RequestEvent", async () => {
    const event = {
      request: {
        method: "GET",
        headers: {
          get: (k: string) => {
            if (k === "x-forwarded-for") return "1.2.3.4";
            if (k === "user-agent") return "Browser/1.0";
            if (k === "x-real-ip") return null;
            return null;
          },
        },
      },
      url: { pathname: "/v1/documents/123" },
      locals: { user: { id: "user-1" } },
    };

    auditFromEvent(event as any, {
      action: "read",
      resource_type: "document",
      resource_id: "doc-123",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        ip_address: "1.2.3.4",
        user_agent: "Browser/1.0",
        endpoint: "/v1/documents/123",
        http_method: "GET",
        action: "read",
        resource_type: "document",
      }),
    );
  });

  it("uses explicit user_id over event locals", async () => {
    const event = {
      request: { method: "POST", headers: { get: () => null } },
      url: { pathname: "/v1/share" },
      locals: { user: { id: "user-1" } },
    };

    auditFromEvent(event as any, {
      user_id: "system-user",
      action: "share",
      resource_type: "share",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "system-user" }),
    );
  });

  it("handles missing user in locals", async () => {
    const event = {
      request: { method: "POST", headers: { get: () => null } },
      url: { pathname: "/v1/auth/login" },
      locals: {},
    };

    auditFromEvent(event as any, {
      action: "login",
      resource_type: "auth",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });
});
