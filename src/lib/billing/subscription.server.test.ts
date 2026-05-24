import { describe, it, expect, vi, beforeEach } from "vitest";

// Create chainable mock builder
function createQueryBuilder(resolvedValue: any = { data: null, error: null }) {
  const builder: any = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "single",
    "order",
    "limit",
    "range",
    "filter",
    "rpc",
  ];
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  // Terminal methods that resolve
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  builder.then = (resolve: any) => Promise.resolve(resolvedValue).then(resolve);
  // Make it thenable for await
  builder[Symbol.toStringTag] = "Promise";
  return builder;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

vi.mock("$env/static/private", () => ({
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://test.supabase.co",
}));

import {
  getTiers,
  getTier,
  getScanPacks,
  getScanPack,
  getSubscription,
  getSubscriptionWithUsage,
  consumeScan,
  checkScansAvailable,
  checkProfileLimit,
  updateSubscriptionTier,
  addScanCredits,
  resetBaseScans,
  updateSubscriptionStatus,
  setStripeCustomerId,
  getStripeCustomerId,
  getUserByStripeCustomerId,
  getUserByStripeSubscriptionId,
  logPurchaseEvent,
  getPurchaseHistory,
  checkIdempotency,
  ensureSubscription,
} from "./subscription.server";

describe("billing/subscription.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTiers", () => {
    it("returns active tiers sorted by order", async () => {
      const tiers = [
        { id: "free", name: "Free" },
        { id: "pro", name: "Pro" },
      ];
      const builder = createQueryBuilder();
      builder.order = vi.fn().mockResolvedValue({ data: tiers, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getTiers();
      expect(result).toEqual(tiers);
      expect(mockFrom).toHaveBeenCalledWith("subscription_tiers");
    });

    it("returns empty array when no data", async () => {
      const builder = createQueryBuilder();
      builder.order = vi.fn().mockResolvedValue({ data: null, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getTiers();
      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const builder = createQueryBuilder();
      builder.order = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "DB error" } });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      await expect(getTiers()).rejects.toEqual({ message: "DB error" });
    });
  });

  describe("getTier", () => {
    it("returns a specific tier", async () => {
      const tier = { id: "pro", name: "Pro" };
      const builder = createQueryBuilder();
      builder.single = vi.fn().mockResolvedValue({ data: tier, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getTier("pro" as any);
      expect(result).toEqual(tier);
    });

    it("returns null when not found (PGRST116)", async () => {
      const builder = createQueryBuilder();
      builder.single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "Not found" },
      });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getTier("nonexistent" as any);
      expect(result).toBeNull();
    });
  });

  describe("getSubscription", () => {
    it("returns subscription for user", async () => {
      const sub = { id: "user-1", tier_id: "free", status: "active" };
      const builder = createQueryBuilder();
      builder.single = vi.fn().mockResolvedValue({ data: sub, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getSubscription("user-1");
      expect(result).toEqual(sub);
    });

    it("returns null for missing user", async () => {
      const builder = createQueryBuilder();
      builder.single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await getSubscription("missing");
      expect(result).toBeNull();
    });
  });

  describe("consumeScan", () => {
    it("calls consume_scan RPC", async () => {
      mockRpc.mockResolvedValue({ data: { success: true, scans_remaining: 4 }, error: null });

      const result = await consumeScan("user-1");
      expect(result).toEqual({ success: true, scans_remaining: 4 });
      expect(mockRpc).toHaveBeenCalledWith("consume_scan", {
        p_user_id: "user-1",
      });
    });

    it("throws on error", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "No scans" },
      });

      await expect(consumeScan("user-1")).rejects.toEqual({
        message: "No scans",
      });
    });
  });

  describe("checkScansAvailable", () => {
    it("returns scan availability info", async () => {
      const scanData = {
        available: 10,
        base_remaining: 5,
        base_total: 10,
        base_used: 5,
        credits: 5,
        tier_id: "pro",
        status: "active",
        reset_at: null,
      };
      mockRpc.mockResolvedValue({ data: scanData, error: null });

      const result = await checkScansAvailable("user-1");
      expect(result).toEqual(scanData);
    });
  });

  describe("updateSubscriptionTier", () => {
    it("calls update_subscription_tier RPC with options", async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const result = await updateSubscriptionTier("user-1", "pro" as any, {
        source: "stripe",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_456",
      });

      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith("update_subscription_tier", {
        p_user_id: "user-1",
        p_tier_id: "pro",
        p_source: "stripe",
        p_stripe_customer_id: "cus_123",
        p_stripe_subscription_id: "sub_456",
        p_period_start: null,
        p_period_end: null,
        p_idempotency_key: null,
      });
    });

    it("defaults to manual source", async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      await updateSubscriptionTier("user-1", "free");
      expect(mockRpc).toHaveBeenCalledWith(
        "update_subscription_tier",
        expect.objectContaining({ p_source: "manual" }),
      );
    });
  });

  describe("addScanCredits", () => {
    it("adds credits with idempotency key", async () => {
      mockRpc.mockResolvedValue({
        data: { success: true, credits_added: 10, total_credits: 15 },
        error: null,
      });

      const result = await addScanCredits("user-1", 10, "idem-key-1");
      expect(result.credits_added).toBe(10);
      expect(mockRpc).toHaveBeenCalledWith("add_scan_credits", {
        p_user_id: "user-1",
        p_credits: 10,
        p_idempotency_key: "idem-key-1",
      });
    });
  });

  describe("updateSubscriptionStatus", () => {
    it("updates status and cancel flag", async () => {
      const builder = createQueryBuilder();
      const updateFn = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockResolvedValue({ error: null });
      builder.update = updateFn;
      mockFrom.mockReturnValue({ update: updateFn });
      updateFn.mockReturnValue(builder);

      await updateSubscriptionStatus("user-1", "canceled", true);
      expect(updateFn).toHaveBeenCalledWith({
        status: "canceled",
        cancel_at_period_end: true,
      });
    });
  });

  describe("logPurchaseEvent", () => {
    it("inserts event", async () => {
      const builder = createQueryBuilder();
      const insertFn = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertFn });

      await logPurchaseEvent({
        user_id: "user-1",
        event_type: "subscription_created",
        tier_id: "pro",
        source: "stripe",
      } as any);

      expect(mockFrom).toHaveBeenCalledWith("purchase_history");
    });

    it("ignores duplicate idempotency key errors (23505)", async () => {
      const insertFn = vi
        .fn()
        .mockResolvedValue({ error: { code: "23505" } });
      mockFrom.mockReturnValue({ insert: insertFn });

      // Should not throw
      await logPurchaseEvent({
        user_id: "user-1",
        event_type: "subscription_created",
        idempotency_key: "dup-key",
      } as any);
    });
  });

  describe("checkIdempotency", () => {
    it("returns true when event exists", async () => {
      const builder = createQueryBuilder();
      builder.single = vi
        .fn()
        .mockResolvedValue({ data: { id: "evt-1" }, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await checkIdempotency("my-key");
      expect(result).toBe(true);
    });

    it("returns false when event does not exist", async () => {
      const builder = createQueryBuilder();
      builder.single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await checkIdempotency("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("ensureSubscription", () => {
    it("returns existing subscription", async () => {
      const existing = { id: "user-1", tier_id: "pro" };
      const builder = createQueryBuilder();
      builder.single = vi
        .fn()
        .mockResolvedValue({ data: existing, error: null });
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.select = vi.fn().mockReturnValue(builder);
      mockFrom.mockReturnValue(builder);

      const result = await ensureSubscription("user-1");
      expect(result).toEqual(existing);
    });
  });
});
