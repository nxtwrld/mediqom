import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock("$lib/api/client", () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
}));

import {
  subscription,
  tiers,
  packs,
  isLoading,
  error,
  currentTier,
  scansAvailable,
  hasScans,
  canCreateProfile,
  isFreeTier,
  isPaidTier,
  isActive,
  loadSubscription,
  loadTiers,
  loadPacks,
  loadBillingData,
  startCheckout,
  startPackCheckout,
  openPortal,
  createEmbeddedCheckout,
  createEmbeddedPackCheckout,
  confirmSession,
  getSessionStatus,
  formatPrice,
  getYearlySavingsPercent,
  getTierFeatures,
  resetBillingStore,
} from "./store";

function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    tier_id: "free",
    tier: { id: "free", name: "Free" },
    status: "active",
    source: "stripe",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    scans_base: 5,
    scans_used: 0,
    scans_credits: 0,
    scans_reset_at: null,
    profiles: 1,
    updated_at: new Date().toISOString(),
    scans_available: 5,
    scans_remaining_base: 5,
    profile_count: 1,
    can_create_profile: true,
    ...overrides,
  } as any;
}

describe("billing/store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBillingStore();
    // Stub window.location for tests that call window.location.origin
    vi.stubGlobal("window", { location: { origin: "https://test.example.com" } });
  });

  // ── derived stores ────────────────────────────────────────────────────────

  describe("derived stores", () => {
    it("currentTier is null when subscription is null", () => {
      expect(get(currentTier)).toBeNull();
    });

    it("currentTier reflects subscription.tier", () => {
      subscription.set(makeSubscription({ tier: { id: "caretaker" } }));
      expect(get(currentTier)).toMatchObject({ id: "caretaker" });
    });

    it("scansAvailable defaults to 0 when subscription is null", () => {
      expect(get(scansAvailable)).toBe(0);
    });

    it("scansAvailable reflects subscription.scans_available", () => {
      subscription.set(makeSubscription({ scans_available: 10 }));
      expect(get(scansAvailable)).toBe(10);
    });

    it("hasScans is false when scans_available is 0", () => {
      subscription.set(makeSubscription({ scans_available: 0 }));
      expect(get(hasScans)).toBe(false);
    });

    it("hasScans is true when scans_available > 0", () => {
      subscription.set(makeSubscription({ scans_available: 3 }));
      expect(get(hasScans)).toBe(true);
    });

    it("canCreateProfile defaults to false when subscription is null", () => {
      expect(get(canCreateProfile)).toBe(false);
    });

    it("canCreateProfile reflects subscription.can_create_profile", () => {
      subscription.set(makeSubscription({ can_create_profile: false }));
      expect(get(canCreateProfile)).toBe(false);
    });

    it("isFreeTier is true when tier_id is 'free'", () => {
      subscription.set(makeSubscription({ tier_id: "free" }));
      expect(get(isFreeTier)).toBe(true);
    });

    it("isFreeTier is false for non-free tier", () => {
      subscription.set(makeSubscription({ tier_id: "caretaker" }));
      expect(get(isFreeTier)).toBe(false);
    });

    it("isPaidTier is false when subscription is null", () => {
      expect(get(isPaidTier)).toBe(false);
    });

    it("isPaidTier is true for caretaker tier", () => {
      subscription.set(makeSubscription({ tier_id: "caretaker" }));
      expect(get(isPaidTier)).toBe(true);
    });

    it("isPaidTier is true for family tier", () => {
      subscription.set(makeSubscription({ tier_id: "family" }));
      expect(get(isPaidTier)).toBe(true);
    });

    it("isPaidTier is false for free tier", () => {
      subscription.set(makeSubscription({ tier_id: "free" }));
      expect(get(isPaidTier)).toBe(false);
    });

    it("isActive is false when subscription is null", () => {
      expect(get(isActive)).toBe(false);
    });

    it("isActive is true for 'active' status", () => {
      subscription.set(makeSubscription({ status: "active" }));
      expect(get(isActive)).toBe(true);
    });

    it("isActive is true for 'trialing' status", () => {
      subscription.set(makeSubscription({ status: "trialing" }));
      expect(get(isActive)).toBe(true);
    });

    it("isActive is false for 'canceled' status", () => {
      subscription.set(makeSubscription({ status: "canceled" }));
      expect(get(isActive)).toBe(false);
    });
  });

  // ── loadSubscription ──────────────────────────────────────────────────────

  describe("loadSubscription", () => {
    it("sets subscription data on success", async () => {
      const sub = makeSubscription();
      mockApiGet.mockResolvedValue(sub);

      await loadSubscription();

      expect(get(subscription)).toEqual(sub);
      expect(get(error)).toBeNull();
    });

    it("sets error message on failure", async () => {
      mockApiGet.mockRejectedValue(new Error("Network error"));

      await loadSubscription();

      expect(get(error)).toBe("Network error");
      expect(get(subscription)).toBeNull();
    });

    it("clears isLoading after completion", async () => {
      mockApiGet.mockResolvedValue(makeSubscription());

      await loadSubscription();

      expect(get(isLoading)).toBe(false);
    });

    it("clears isLoading even on failure", async () => {
      mockApiGet.mockRejectedValue(new Error("fail"));

      await loadSubscription();

      expect(get(isLoading)).toBe(false);
    });

    it("passes custom fetchFn to apiGet", async () => {
      const customFetch = vi.fn();
      mockApiGet.mockResolvedValue(makeSubscription());

      await loadSubscription(customFetch as any);

      expect(mockApiGet).toHaveBeenCalledWith(
        "/v1/billing/subscription",
        expect.objectContaining({ fetch: customFetch }),
      );
    });
  });

  // ── loadTiers ─────────────────────────────────────────────────────────────

  describe("loadTiers", () => {
    it("sets tiers data on success", async () => {
      const tiersData = [{ id: "free" }, { id: "caretaker" }];
      mockApiGet.mockResolvedValue(tiersData);

      await loadTiers();

      expect(get(tiers)).toEqual(tiersData);
    });

    it("does not throw on failure", async () => {
      mockApiGet.mockRejectedValue(new Error("fail"));
      await expect(loadTiers()).resolves.toBeUndefined();
    });
  });

  // ── loadPacks ─────────────────────────────────────────────────────────────

  describe("loadPacks", () => {
    it("sets packs data on success", async () => {
      const packsData = [{ id: "pack-10", scans: 10 }];
      mockApiGet.mockResolvedValue(packsData);

      await loadPacks();

      expect(get(packs)).toEqual(packsData);
    });

    it("does not throw on failure", async () => {
      mockApiGet.mockRejectedValue(new Error("fail"));
      await expect(loadPacks()).resolves.toBeUndefined();
    });
  });

  // ── loadBillingData ───────────────────────────────────────────────────────

  describe("loadBillingData", () => {
    it("calls all three loaders in parallel", async () => {
      mockApiGet.mockResolvedValue([]);

      await loadBillingData();

      // apiGet called three times (subscription, tiers, packs)
      expect(mockApiGet).toHaveBeenCalledTimes(3);
    });
  });

  // ── startCheckout ─────────────────────────────────────────────────────────

  describe("startCheckout", () => {
    it("returns checkout URL on success", async () => {
      mockApiPost.mockResolvedValue({ url: "https://stripe.com/pay" });

      const url = await startCheckout("caretaker", "monthly");

      expect(url).toBe("https://stripe.com/pay");
    });

    it("returns null and sets error on failure", async () => {
      mockApiPost.mockRejectedValue(new Error("Stripe error"));

      const url = await startCheckout("caretaker", "monthly");

      expect(url).toBeNull();
      expect(get(error)).toBe("Stripe error");
    });

    it("includes return_url with window.location.origin", async () => {
      mockApiPost.mockResolvedValue({ url: "https://stripe.com/pay" });

      await startCheckout("caretaker", "monthly");

      expect(mockApiPost).toHaveBeenCalledWith(
        "/v1/billing/stripe/checkout",
        expect.objectContaining({
          return_url: expect.stringContaining("https://test.example.com"),
        }),
      );
    });
  });

  // ── startPackCheckout ─────────────────────────────────────────────────────

  describe("startPackCheckout", () => {
    it("returns checkout URL on success", async () => {
      mockApiPost.mockResolvedValue({ url: "https://stripe.com/pack" });
      const url = await startPackCheckout("pack-10");
      expect(url).toBe("https://stripe.com/pack");
    });

    it("returns null on failure", async () => {
      mockApiPost.mockRejectedValue(new Error("fail"));
      expect(await startPackCheckout("pack-10")).toBeNull();
    });
  });

  // ── openPortal ────────────────────────────────────────────────────────────

  describe("openPortal", () => {
    it("returns portal URL on success", async () => {
      mockApiPost.mockResolvedValue({ url: "https://stripe.com/portal" });
      expect(await openPortal()).toBe("https://stripe.com/portal");
    });

    it("returns null on failure", async () => {
      mockApiPost.mockRejectedValue(new Error("fail"));
      expect(await openPortal()).toBeNull();
    });
  });

  // ── createEmbeddedCheckout ────────────────────────────────────────────────

  describe("createEmbeddedCheckout", () => {
    it("returns response on success", async () => {
      const response = { clientSecret: "cs_test_123" };
      mockApiPost.mockResolvedValue(response);

      const result = await createEmbeddedCheckout("caretaker", "monthly");
      expect(result).toEqual(response);
    });

    it("returns null on failure", async () => {
      mockApiPost.mockRejectedValue(new Error("fail"));
      expect(await createEmbeddedCheckout("caretaker", "monthly")).toBeNull();
    });
  });

  // ── createEmbeddedPackCheckout ────────────────────────────────────────────

  describe("createEmbeddedPackCheckout", () => {
    it("returns response on success", async () => {
      const response = { clientSecret: "cs_test_456" };
      mockApiPost.mockResolvedValue(response);
      expect(await createEmbeddedPackCheckout("pack-10")).toEqual(response);
    });

    it("returns null on failure", async () => {
      mockApiPost.mockRejectedValue(new Error("fail"));
      expect(await createEmbeddedPackCheckout("pack-10")).toBeNull();
    });
  });

  // ── confirmSession ────────────────────────────────────────────────────────

  describe("confirmSession", () => {
    it("calls apiPost with session_id", async () => {
      mockApiPost.mockResolvedValue({});
      await confirmSession("sess_abc");
      expect(mockApiPost).toHaveBeenCalledWith(
        "/v1/billing/stripe/confirm-session",
        { session_id: "sess_abc" },
      );
    });

    it("does not throw on failure (non-fatal)", async () => {
      mockApiPost.mockRejectedValue(new Error("fail"));
      await expect(confirmSession("sess_abc")).resolves.toBeUndefined();
    });
  });

  // ── getSessionStatus ──────────────────────────────────────────────────────

  describe("getSessionStatus", () => {
    it("returns response on success", async () => {
      const status = { status: "complete" };
      mockApiGet.mockResolvedValue(status);
      const result = await getSessionStatus("sess_abc");
      expect(result).toEqual(status);
    });

    it("returns null on failure", async () => {
      mockApiGet.mockRejectedValue(new Error("fail"));
      expect(await getSessionStatus("sess_abc")).toBeNull();
    });

    it("encodes session_id in query string", async () => {
      mockApiGet.mockResolvedValue({});
      await getSessionStatus("sess/special");
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent("sess/special")),
      );
    });
  });

  // ── formatPrice ───────────────────────────────────────────────────────────

  describe("formatPrice", () => {
    it("converts cents to EUR currency string", () => {
      const result = formatPrice(999);
      expect(result).toContain("9.99");
    });

    it("handles zero cents", () => {
      const result = formatPrice(0);
      expect(result).toContain("0");
    });

    it("uses custom currency when provided", () => {
      const result = formatPrice(1000, "USD");
      expect(result).toContain("10");
    });
  });

  // ── getYearlySavingsPercent ───────────────────────────────────────────────

  describe("getYearlySavingsPercent", () => {
    it("returns 0 for free tier (price_monthly_eur is 0)", () => {
      const tier = { price_monthly_eur: 0, price_yearly_eur: 0 } as any;
      expect(getYearlySavingsPercent(tier)).toBe(0);
    });

    it("calculates savings percentage correctly", () => {
      // monthly: 10, yearly: 96 → yearly if monthly: 120, savings: 24, percent: 20%
      const tier = { price_monthly_eur: 1000, price_yearly_eur: 9600 } as any;
      expect(getYearlySavingsPercent(tier)).toBe(20);
    });

    it("returns 0 when no savings", () => {
      const tier = { price_monthly_eur: 1000, price_yearly_eur: 12000 } as any;
      expect(getYearlySavingsPercent(tier)).toBe(0);
    });
  });

  // ── getTierFeatures ───────────────────────────────────────────────────────

  describe("getTierFeatures", () => {
    it("returns features for free tier", () => {
      const features = getTierFeatures("free");
      expect(features.length).toBeGreaterThan(0);
      expect(features.some((f) => f.toLowerCase().includes("document"))).toBe(true);
    });

    it("returns features for caretaker tier", () => {
      const features = getTierFeatures("caretaker");
      expect(features.length).toBeGreaterThan(0);
    });

    it("returns features for family tier", () => {
      const features = getTierFeatures("family");
      expect(features.length).toBeGreaterThan(0);
    });

    it("returns empty array for unknown tier", () => {
      expect(getTierFeatures("unknown" as any)).toEqual([]);
    });
  });

  // ── resetBillingStore ─────────────────────────────────────────────────────

  describe("resetBillingStore", () => {
    it("resets subscription to null", () => {
      subscription.set(makeSubscription());
      resetBillingStore();
      expect(get(subscription)).toBeNull();
    });

    it("resets tiers to empty array", () => {
      tiers.set([{ id: "free" } as any]);
      resetBillingStore();
      expect(get(tiers)).toEqual([]);
    });

    it("resets packs to empty array", () => {
      packs.set([{ id: "pack-10" } as any]);
      resetBillingStore();
      expect(get(packs)).toEqual([]);
    });

    it("resets error to null", () => {
      error.set("some error");
      resetBillingStore();
      expect(get(error)).toBeNull();
    });

    it("resets isLoading to false", () => {
      isLoading.set(true);
      resetBillingStore();
      expect(get(isLoading)).toBe(false);
    });
  });
});
