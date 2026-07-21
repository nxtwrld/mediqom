import { describe, it, expect } from "vitest";
import {
  buildSecurityContextFromEvent,
  buildSecurityContextFromBrowser,
  buildTestSecurityContext,
  validateSecurityContext,
  sanitizeSecurityContext,
} from "./security-context-builder";
import type { RequestEvent } from "@sveltejs/kit";
import type { User } from "@supabase/supabase-js";

// Minimal fake user to satisfy Supabase User type for tests.
const fakeUser: User = {
  id: "user-123",
  email: "u@example.com",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  role: "authenticated",
} as unknown as User;

function makeEvent(
  headers: Record<string, string> = {},
  clientAddress = "1.2.3.4",
): RequestEvent {
  return {
    request: {
      headers: {
        get: (k: string) => headers[k.toLowerCase()] ?? null,
      },
    },
    getClientAddress: () => clientAddress,
  } as unknown as RequestEvent;
}

describe("buildSecurityContextFromEvent", () => {
  it("uses x-forwarded-for first, splitting on comma", () => {
    const event = makeEvent({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    const ctx = buildSecurityContextFromEvent(event, fakeUser, "p-1");
    expect(ctx.ipAddress).toBe("10.0.0.1");
  });

  it("falls back through x-real-ip, x-client-ip, cf-connecting-ip, x-forwarded", () => {
    const event = makeEvent({ "cf-connecting-ip": "5.5.5.5" });
    const ctx = buildSecurityContextFromEvent(event, fakeUser, "p-1");
    expect(ctx.ipAddress).toBe("5.5.5.5");
  });

  it("falls back to event.getClientAddress() when no headers present", () => {
    const event = makeEvent({}, "9.9.9.9");
    const ctx = buildSecurityContextFromEvent(event, fakeUser, "p-1");
    expect(ctx.ipAddress).toBe("9.9.9.9");
  });

  it("captures user-agent header", () => {
    const event = makeEvent({ "user-agent": "test-ua" });
    const ctx = buildSecurityContextFromEvent(event, fakeUser, "p-1");
    expect(ctx.userAgent).toBe("test-ua");
  });

  it("passes through user, profileId, sessionId", () => {
    const ctx = buildSecurityContextFromEvent(
      makeEvent(),
      fakeUser,
      "profile-xyz",
      "sess-1",
    );
    expect(ctx.user).toBe(fakeUser);
    expect(ctx.profileId).toBe("profile-xyz");
    expect(ctx.sessionId).toBe("sess-1");
  });
});

describe("buildSecurityContextFromBrowser", () => {
  it("returns ctx without ipAddress", () => {
    const ctx = buildSecurityContextFromBrowser(fakeUser, "p-1");
    expect(ctx.ipAddress).toBeUndefined();
    expect(ctx.user).toBe(fakeUser);
    expect(ctx.profileId).toBe("p-1");
  });

  it("pulls userAgent from navigator when available", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "mock-browser/1.0" },
      configurable: true,
    });
    try {
      const ctx = buildSecurityContextFromBrowser(fakeUser, "p-1");
      expect(ctx.userAgent).toBe("mock-browser/1.0");
    } finally {
      // Leave navigator defined but reset value — deleting on Node is finicky.
      Object.defineProperty(globalThis, "navigator", {
        value: undefined,
        configurable: true,
      });
    }
  });
});

describe("buildTestSecurityContext", () => {
  it("returns context with synthetic user fields", () => {
    const ctx = buildTestSecurityContext("uid", "pid", "sid");
    expect(ctx.user.id).toBe("uid");
    expect(ctx.user.email).toBe("test@example.com");
    expect(ctx.profileId).toBe("pid");
    expect(ctx.sessionId).toBe("sid");
    expect(ctx.ipAddress).toBe("127.0.0.1");
    expect(ctx.userAgent).toBe("test-agent");
  });
});

describe("validateSecurityContext", () => {
  it("accepts a complete context", () => {
    const ctx = buildTestSecurityContext("u", "p");
    const res = validateSecurityContext(ctx);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects context missing user", () => {
    const res = validateSecurityContext({
      profileId: "p",
    } as any);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("User is required");
  });

  it("rejects context with user but no id", () => {
    const res = validateSecurityContext({
      user: { id: "" },
      profileId: "p",
    } as any);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("User ID is required");
  });

  it("rejects context missing profileId", () => {
    const res = validateSecurityContext({
      user: fakeUser,
      profileId: "",
    } as any);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Profile ID is required");
  });

  it("accumulates multiple errors", () => {
    const res = validateSecurityContext({} as any);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("sanitizeSecurityContext", () => {
  it("replaces raw user with flags and ID", () => {
    const ctx = buildTestSecurityContext("u1", "p1", "s1");
    const sanitized = sanitizeSecurityContext(ctx);
    expect(sanitized.userId).toBe("u1");
    expect(sanitized.profileId).toBe("p1");
    expect(sanitized.sessionId).toBe("s1");
    expect(sanitized.hasUser).toBe(true);
    expect(sanitized.hasIP).toBe(true);
    expect(sanitized.hasUserAgent).toBe(true);
  });

  it("marks missing user as 'anonymous'", () => {
    const sanitized = sanitizeSecurityContext({
      profileId: "p",
    } as any);
    expect(sanitized.userId).toBe("anonymous");
    expect(sanitized.hasUser).toBe(false);
  });
});
