import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUpdateSubscriptionTier,
  mockAddScanCredits,
  mockUpdateSubscriptionStatus,
  mockSetStripeCustomerId,
  mockGetStripeCustomerId,
  mockGetUserByStripeCustomerId,
  mockGetUserByStripeSubscriptionId,
  mockLogPurchaseEvent,
  mockCheckIdempotency,
  mockGetTier,
  mockGetScanPack,
  mockCustomersCreate,
  mockCheckoutSessionsCreate,
  mockCheckoutSessionsRetrieve,
  mockPortalSessionsCreate,
  mockPricesList,
  mockPricesRetrieve,
  mockWebhooksConstructEvent,
} = vi.hoisted(() => ({
  mockUpdateSubscriptionTier: vi.fn(),
  mockAddScanCredits: vi.fn(),
  mockUpdateSubscriptionStatus: vi.fn(),
  mockSetStripeCustomerId: vi.fn(),
  mockGetStripeCustomerId: vi.fn(),
  mockGetUserByStripeCustomerId: vi.fn(),
  mockGetUserByStripeSubscriptionId: vi.fn(),
  mockLogPurchaseEvent: vi.fn(),
  mockCheckIdempotency: vi.fn(),
  mockGetTier: vi.fn(),
  mockGetScanPack: vi.fn(),
  mockCustomersCreate: vi.fn(),
  mockCheckoutSessionsCreate: vi.fn(),
  mockCheckoutSessionsRetrieve: vi.fn(),
  mockPortalSessionsCreate: vi.fn(),
  mockPricesList: vi.fn(),
  mockPricesRetrieve: vi.fn(),
  mockWebhooksConstructEvent: vi.fn(),
}));

vi.mock("./subscription.server", () => ({
  updateSubscriptionTier: mockUpdateSubscriptionTier,
  addScanCredits: mockAddScanCredits,
  updateSubscriptionStatus: mockUpdateSubscriptionStatus,
  setStripeCustomerId: mockSetStripeCustomerId,
  getStripeCustomerId: mockGetStripeCustomerId,
  getUserByStripeCustomerId: mockGetUserByStripeCustomerId,
  getUserByStripeSubscriptionId: mockGetUserByStripeSubscriptionId,
  logPurchaseEvent: mockLogPurchaseEvent,
  checkIdempotency: mockCheckIdempotency,
  getTier: mockGetTier,
  getScanPack: mockGetScanPack,
}));

vi.mock("stripe", () => {
  const MockStripe = vi.fn(function (this: any) {
    this.customers = { create: mockCustomersCreate };
    this.checkout = { sessions: { create: mockCheckoutSessionsCreate, retrieve: mockCheckoutSessionsRetrieve } };
    this.billingPortal = { sessions: { create: mockPortalSessionsCreate } };
    this.prices = { list: mockPricesList, retrieve: mockPricesRetrieve };
    this.webhooks = { constructEvent: mockWebhooksConstructEvent };
  });
  return { default: MockStripe };
});

vi.mock("$env/dynamic/private", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_456",
  },
}));

import {
  getStripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createEmbeddedCheckoutSession,
  createEmbeddedPackCheckoutSession,
  createPackCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  handleWebhookEvent,
  handleCheckoutCompleted,
  getCheckoutSessionStatus,
  validateStripePrice,
} from "./stripe.server";

describe("billing/stripe.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStripe", () => {
    it("returns a Stripe client", () => {
      const stripe = getStripe();
      expect(stripe).toBeDefined();
      expect(stripe.customers).toBeDefined();
    });
  });

  describe("getOrCreateCustomer", () => {
    it("returns existing customer ID if found", async () => {
      mockGetStripeCustomerId.mockResolvedValue("cus_existing");

      const result = await getOrCreateCustomer("user-1", "test@test.com");
      expect(result).toBe("cus_existing");
      expect(mockCustomersCreate).not.toHaveBeenCalled();
    });

    it("creates new customer if none exists", async () => {
      mockGetStripeCustomerId.mockResolvedValue(null);
      mockCustomersCreate.mockResolvedValue({ id: "cus_new" });

      const result = await getOrCreateCustomer("user-1", "test@test.com");
      expect(result).toBe("cus_new");
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: "test@test.com",
        metadata: { user_id: "user-1", source: "mediqom" },
      });
      expect(mockSetStripeCustomerId).toHaveBeenCalledWith("user-1", "cus_new");
    });
  });

  describe("createCheckoutSession", () => {
    beforeEach(() => {
      mockGetTier.mockResolvedValue({
        id: "pro",
        name: "Pro",
        stripe_product_id: "prod_123",
      });
      mockGetStripeCustomerId.mockResolvedValue("cus_123");
      mockPricesList.mockResolvedValue({
        data: [
          { id: "price_monthly", type: "recurring", recurring: { interval: "month" } },
          { id: "price_yearly", type: "recurring", recurring: { interval: "year" } },
        ],
      });
    });

    it("creates a subscription checkout session", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/session",
        id: "cs_123",
      });

      const result = await createCheckoutSession(
        "user-1",
        "test@test.com",
        "pro" as any,
        "monthly",
        "https://app.test/billing",
      );

      expect(result.url).toBe("https://checkout.stripe.com/session");
      expect(result.sessionId).toBe("cs_123");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: "cus_123",
          mode: "subscription",
          metadata: expect.objectContaining({
            user_id: "user-1",
            tier_id: "pro",
            billing_cycle: "monthly",
          }),
        }),
      );
    });

    it("uses yearly price for yearly billing cycle", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/session",
        id: "cs_123",
      });

      await createCheckoutSession(
        "user-1",
        "test@test.com",
        "pro" as any,
        "yearly",
        "https://app.test/billing",
      );

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: "price_yearly", quantity: 1 }],
        }),
      );
    });

    it("throws for invalid tier", async () => {
      mockGetTier.mockResolvedValue(null);

      await expect(
        createCheckoutSession("user-1", "test@test.com", "nonexistent" as any, "monthly", "/"),
      ).rejects.toThrow("Invalid tier: nonexistent");
    });

    it("throws when tier has no stripe_product_id", async () => {
      mockGetTier.mockResolvedValue({ id: "free", name: "Free", stripe_product_id: null });

      await expect(
        createCheckoutSession("user-1", "test@test.com", "free" as any, "monthly", "/"),
      ).rejects.toThrow("Stripe product not configured for tier: free");
    });

    it("throws when no matching price found", async () => {
      mockPricesList.mockResolvedValue({ data: [] });

      await expect(
        createCheckoutSession("user-1", "test@test.com", "pro" as any, "monthly", "/"),
      ).rejects.toThrow("No active monthly price found for product: prod_123");
    });

    it("throws when session has no URL", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({ url: null, id: "cs_123" });

      await expect(
        createCheckoutSession("user-1", "test@test.com", "pro" as any, "monthly", "/"),
      ).rejects.toThrow("Failed to create checkout session");
    });
  });

  describe("createEmbeddedCheckoutSession", () => {
    beforeEach(() => {
      mockGetTier.mockResolvedValue({
        id: "pro",
        stripe_product_id: "prod_123",
      });
      mockGetStripeCustomerId.mockResolvedValue("cus_123");
      mockPricesList.mockResolvedValue({
        data: [
          { id: "price_monthly", type: "recurring", recurring: { interval: "month" } },
        ],
      });
    });

    it("creates an embedded checkout session with client secret", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        client_secret: "cs_secret_123",
        id: "cs_emb_123",
      });

      const result = await createEmbeddedCheckoutSession(
        "user-1",
        "test@test.com",
        "pro" as any,
        "monthly",
        "https://app.test/billing",
      );

      expect(result.clientSecret).toBe("cs_secret_123");
      expect(result.sessionId).toBe("cs_emb_123");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ui_mode: "embedded",
          mode: "subscription",
        }),
      );
    });

    it("throws when session has no client_secret", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({ client_secret: null, id: "cs_123" });

      await expect(
        createEmbeddedCheckoutSession("user-1", "test@test.com", "pro" as any, "monthly", "/"),
      ).rejects.toThrow("Failed to create embedded checkout session");
    });
  });

  describe("createPackCheckoutSession", () => {
    beforeEach(() => {
      mockGetScanPack.mockResolvedValue({
        id: "pack10",
        scans: 10,
        stripe_product_id: "prod_pack10",
      });
      mockGetStripeCustomerId.mockResolvedValue("cus_123");
      mockPricesList.mockResolvedValue({
        data: [{ id: "price_pack", type: "one_time" }],
      });
    });

    it("creates a one-time payment checkout session", async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/pack",
        id: "cs_pack_123",
      });

      const result = await createPackCheckoutSession(
        "user-1",
        "test@test.com",
        "pack10",
        "https://app.test/billing",
      );

      expect(result.url).toBe("https://checkout.stripe.com/pack");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          metadata: expect.objectContaining({
            pack_id: "pack10",
            scans: "10",
          }),
        }),
      );
    });

    it("throws for invalid pack", async () => {
      mockGetScanPack.mockResolvedValue(null);

      await expect(
        createPackCheckoutSession("user-1", "test@test.com", "bad-pack", "/"),
      ).rejects.toThrow("Invalid pack: bad-pack");
    });

    it("throws when pack has no stripe_product_id", async () => {
      mockGetScanPack.mockResolvedValue({ id: "pack10", scans: 10, stripe_product_id: null });

      await expect(
        createPackCheckoutSession("user-1", "test@test.com", "pack10", "/"),
      ).rejects.toThrow("Stripe product not configured for pack: pack10");
    });
  });

  describe("createEmbeddedPackCheckoutSession", () => {
    it("creates embedded pack checkout session", async () => {
      mockGetScanPack.mockResolvedValue({
        id: "pack10",
        scans: 10,
        stripe_product_id: "prod_pack10",
      });
      mockGetStripeCustomerId.mockResolvedValue("cus_123");
      mockPricesList.mockResolvedValue({
        data: [{ id: "price_pack", type: "one_time" }],
      });
      mockCheckoutSessionsCreate.mockResolvedValue({
        client_secret: "cs_secret_pack",
        id: "cs_emb_pack",
      });

      const result = await createEmbeddedPackCheckoutSession(
        "user-1",
        "test@test.com",
        "pack10",
        "https://app.test/billing",
      );

      expect(result.clientSecret).toBe("cs_secret_pack");
      expect(result.sessionId).toBe("cs_emb_pack");
    });
  });

  describe("createPortalSession", () => {
    it("creates a billing portal session", async () => {
      mockGetStripeCustomerId.mockResolvedValue("cus_123");
      mockPortalSessionsCreate.mockResolvedValue({
        url: "https://billing.stripe.com/portal",
      });

      const result = await createPortalSession("user-1", "https://app.test/billing");
      expect(result).toBe("https://billing.stripe.com/portal");
    });

    it("throws when no customer found", async () => {
      mockGetStripeCustomerId.mockResolvedValue(null);

      await expect(
        createPortalSession("user-1", "/"),
      ).rejects.toThrow("No Stripe customer found for user");
    });
  });

  describe("verifyWebhookSignature", () => {
    it("calls stripe.webhooks.constructEvent", () => {
      const mockEvent = { id: "evt_123", type: "checkout.session.completed" };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = verifyWebhookSignature("body", "sig_header");
      expect(result).toEqual(mockEvent);
      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        "body",
        "sig_header",
        "whsec_test_456",
      );
    });
  });

  describe("handleWebhookEvent", () => {
    it("skips duplicate events", async () => {
      mockCheckIdempotency.mockResolvedValue(true);

      await handleWebhookEvent({
        id: "evt_dup",
        type: "checkout.session.completed",
        data: { object: {} },
      } as any);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
      expect(mockLogPurchaseEvent).not.toHaveBeenCalled();
    });

    it("handles checkout.session.completed for subscription", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockUpdateSubscriptionTier.mockResolvedValue({ success: true });
      mockLogPurchaseEvent.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_123",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_123",
            mode: "subscription",
            subscription: "sub_456",
            customer: "cus_789",
            amount_total: 999,
            currency: "eur",
            metadata: {
              user_id: "user-1",
              tier_id: "pro",
              billing_cycle: "monthly",
            },
          },
        },
      } as any);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith("user-1", "pro", {
        source: "stripe",
        stripeCustomerId: "cus_789",
        stripeSubscriptionId: "sub_456",
        idempotencyKey: "cs_123",
      });
      expect(mockLogPurchaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          event_type: "subscription_created",
          amount: 999,
          currency: "EUR",
        }),
      );
    });

    it("handles checkout.session.completed for pack purchase", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockAddScanCredits.mockResolvedValue({ success: true });
      mockLogPurchaseEvent.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_pack",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_pack",
            mode: "payment",
            amount_total: 1999,
            currency: "usd",
            metadata: {
              user_id: "user-1",
              pack_id: "pack10",
              scans: "10",
            },
          },
        },
      } as any);

      expect(mockAddScanCredits).toHaveBeenCalledWith("user-1", 10, "cs_pack");
      expect(mockLogPurchaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "pack_purchased",
          scans_added: 10,
        }),
      );
    });

    it("handles subscription updated with status mapping", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockUpdateSubscriptionStatus.mockResolvedValue(undefined);
      mockUpdateSubscriptionTier.mockResolvedValue({ success: true });

      await handleWebhookEvent({
        id: "evt_sub_update",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            status: "past_due",
            cancel_at_period_end: false,
            customer: "cus_123",
            metadata: { user_id: "user-1", tier_id: "pro" },
            items: {
              data: [
                {
                  current_period_start: 1717200000,
                  current_period_end: 1719792000,
                },
              ],
            },
          },
        },
      } as any);

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        "user-1",
        "past_due",
        false,
      );
      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith("user-1", "pro", {
        source: "stripe",
        stripeSubscriptionId: "sub_123",
        periodStart: expect.any(Date),
        periodEnd: expect.any(Date),
      });
    });

    it("handles subscription update without user_id in metadata (falls back to lookup)", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockGetUserByStripeSubscriptionId.mockResolvedValue("user-2");
      mockUpdateSubscriptionStatus.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_sub_noid",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_456",
            status: "active",
            cancel_at_period_end: false,
            customer: "cus_456",
            metadata: {},
            items: { data: [] },
          },
        },
      } as any);

      expect(mockGetUserByStripeSubscriptionId).toHaveBeenCalledWith("sub_456");
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        "user-2",
        "active",
        false,
      );
    });

    it("handles subscription deleted — downgrades to free", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockUpdateSubscriptionTier.mockResolvedValue({ success: true });
      mockLogPurchaseEvent.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_del",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_del",
            metadata: { user_id: "user-1" },
            customer: "cus_123",
          },
        },
      } as any);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith("user-1", "free", {
        source: "stripe",
        idempotencyKey: "evt_del",
      });
      expect(mockLogPurchaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "subscription_canceled",
          tier_id: "free",
        }),
      );
    });

    it("handles invoice.paid for renewal", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockGetUserByStripeCustomerId.mockResolvedValue("user-1");
      mockLogPurchaseEvent.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_inv_paid",
        type: "invoice.paid",
        data: {
          object: {
            id: "inv_123",
            billing_reason: "subscription_cycle",
            customer: "cus_123",
            amount_paid: 999,
            currency: "eur",
          },
        },
      } as any);

      expect(mockLogPurchaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "subscription_renewed",
          amount: 999,
          currency: "EUR",
        }),
      );
    });

    it("skips invoice.paid for non-renewal reasons", async () => {
      mockCheckIdempotency.mockResolvedValue(false);

      await handleWebhookEvent({
        id: "evt_inv_initial",
        type: "invoice.paid",
        data: {
          object: {
            id: "inv_init",
            billing_reason: "subscription_create",
            customer: "cus_123",
            amount_paid: 999,
            currency: "eur",
          },
        },
      } as any);

      expect(mockLogPurchaseEvent).not.toHaveBeenCalled();
    });

    it("handles invoice.payment_failed", async () => {
      mockCheckIdempotency.mockResolvedValue(false);
      mockGetUserByStripeCustomerId.mockResolvedValue("user-1");
      mockUpdateSubscriptionStatus.mockResolvedValue(undefined);
      mockLogPurchaseEvent.mockResolvedValue(undefined);

      await handleWebhookEvent({
        id: "evt_inv_fail",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "inv_fail",
            customer: "cus_123",
            amount_due: 999,
            currency: "usd",
            attempt_count: 2,
          },
        },
      } as any);

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith("user-1", "past_due");
      expect(mockLogPurchaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "payment_failed",
          metadata: { attempt_count: 2 },
        }),
      );
    });

    it("handles unrecognized event types gracefully", async () => {
      mockCheckIdempotency.mockResolvedValue(false);

      await handleWebhookEvent({
        id: "evt_unknown",
        type: "some.unknown.event",
        data: { object: {} },
      } as any);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
      expect(mockLogPurchaseEvent).not.toHaveBeenCalled();
    });
  });

  describe("handleCheckoutCompleted", () => {
    it("does nothing when no user_id in metadata", async () => {
      await handleCheckoutCompleted(
        { metadata: {}, mode: "subscription" } as any,
        "key-1",
      );

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
      expect(mockAddScanCredits).not.toHaveBeenCalled();
    });

    it("skips pack purchase when scans is 0", async () => {
      await handleCheckoutCompleted(
        {
          id: "cs_zero",
          mode: "payment",
          amount_total: 0,
          currency: "eur",
          metadata: { user_id: "user-1", pack_id: "pack0", scans: "0" },
        } as any,
        "key-2",
      );

      expect(mockAddScanCredits).not.toHaveBeenCalled();
      expect(mockLogPurchaseEvent).not.toHaveBeenCalled();
    });
  });

  describe("getCheckoutSessionStatus", () => {
    it("retrieves session status", async () => {
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        status: "complete",
        payment_status: "paid",
        customer_details: { email: "test@test.com" },
      });

      const result = await getCheckoutSessionStatus("cs_123");
      expect(result).toEqual({
        status: "complete",
        paymentStatus: "paid",
        customerEmail: "test@test.com",
      });
    });

    it("returns null email when no customer details", async () => {
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        status: "open",
        payment_status: "unpaid",
        customer_details: null,
      });

      const result = await getCheckoutSessionStatus("cs_open");
      expect(result.customerEmail).toBeNull();
    });
  });

  describe("validateStripePrice", () => {
    it("returns true for active price", async () => {
      mockPricesRetrieve.mockResolvedValue({ active: true });

      const result = await validateStripePrice("price_123");
      expect(result).toBe(true);
    });

    it("returns false for inactive price", async () => {
      mockPricesRetrieve.mockResolvedValue({ active: false });

      const result = await validateStripePrice("price_inactive");
      expect(result).toBe(false);
    });

    it("returns false when price retrieval fails", async () => {
      mockPricesRetrieve.mockRejectedValue(new Error("Not found"));

      const result = await validateStripePrice("price_bad");
      expect(result).toBe(false);
    });
  });
});
