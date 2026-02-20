// =====================================================
// Stripe Integration - Server-side
// =====================================================

import Stripe from "stripe";
import { env } from "$env/dynamic/private";
import {
  updateSubscriptionTier,
  addScanCredits,
  updateSubscriptionStatus,
  setStripeCustomerId,
  getStripeCustomerId,
  getUserByStripeCustomerId,
  getUserByStripeSubscriptionId,
  logPurchaseEvent,
  checkIdempotency,
  getTier,
  getScanPack,
} from "./subscription.server";
import type {
  SubscriptionTierId,
  BillingCycle,
  SubscriptionTier,
  ScanPack,
} from "./types";

// =====================================================
// Stripe Client
// =====================================================

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

// =====================================================
// Customer Management
// =====================================================

export async function getOrCreateCustomer(
  userId: string,
  email: string,
): Promise<string> {
  // Check if we already have a customer ID
  const existingCustomerId = await getStripeCustomerId(userId);
  if (existingCustomerId) {
    return existingCustomerId;
  }

  // Create new customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: {
      user_id: userId,
      source: "mediqom",
    },
  });

  // Save customer ID to subscription
  await setStripeCustomerId(userId, customer.id);

  return customer.id;
}

// =====================================================
// Checkout Session Creation
// =====================================================

export async function createCheckoutSession(
  userId: string,
  email: string,
  tierId: SubscriptionTierId,
  billingCycle: BillingCycle,
  returnUrl: string,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  // Get tier details
  const tier = await getTier(tierId);
  if (!tier) {
    throw new Error(`Invalid tier: ${tierId}`);
  }

  const priceId =
    billingCycle === "yearly"
      ? tier.stripe_price_yearly_eur
      : tier.stripe_price_monthly_eur;

  if (!priceId) {
    throw new Error(
      `Stripe price not configured for tier: ${tierId} (${billingCycle})`,
    );
  }

  // Get or create customer
  const customerId = await getOrCreateCustomer(userId, email);

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: {
      user_id: userId,
      tier_id: tierId,
      billing_cycle: billingCycle,
    },
    subscription_data: {
      metadata: {
        user_id: userId,
        tier_id: tierId,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: {
      enabled: true,
    },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

// =====================================================
// Embedded Checkout Session Creation
// =====================================================

export async function createEmbeddedCheckoutSession(
  userId: string,
  email: string,
  tierId: SubscriptionTierId,
  billingCycle: BillingCycle,
  returnUrl: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe();

  // Get tier details
  const tier = await getTier(tierId);
  if (!tier) {
    throw new Error(`Invalid tier: ${tierId}`);
  }

  const priceId =
    billingCycle === "yearly"
      ? tier.stripe_price_yearly_eur
      : tier.stripe_price_monthly_eur;

  if (!priceId) {
    throw new Error(
      `Stripe price not configured for tier: ${tierId} (${billingCycle})`,
    );
  }

  // Get or create customer
  const customerId = await getOrCreateCustomer(userId, email);

  // Create embedded checkout session
  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    return_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      user_id: userId,
      tier_id: tierId,
      billing_cycle: billingCycle,
    },
    subscription_data: {
      metadata: {
        user_id: userId,
        tier_id: tierId,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: {
      enabled: true,
    },
  });

  if (!session.client_secret) {
    throw new Error("Failed to create embedded checkout session");
  }

  return {
    clientSecret: session.client_secret,
    sessionId: session.id,
  };
}

export async function createEmbeddedPackCheckoutSession(
  userId: string,
  email: string,
  packId: string,
  returnUrl: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe();

  // Get pack details
  const pack = await getScanPack(packId);
  if (!pack) {
    throw new Error(`Invalid pack: ${packId}`);
  }

  if (!pack.stripe_price_id) {
    throw new Error(`Stripe price not configured for pack: ${packId}`);
  }

  // Get or create customer
  const customerId = await getOrCreateCustomer(userId, email);

  // Create embedded checkout session for one-time payment
  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price: pack.stripe_price_id,
        quantity: 1,
      },
    ],
    return_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      user_id: userId,
      pack_id: packId,
      scans: pack.scans.toString(),
    },
  });

  if (!session.client_secret) {
    throw new Error("Failed to create embedded checkout session");
  }

  return {
    clientSecret: session.client_secret,
    sessionId: session.id,
  };
}

// =====================================================
// Scan Pack Purchase
// =====================================================

export async function createPackCheckoutSession(
  userId: string,
  email: string,
  packId: string,
  returnUrl: string,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  // Get pack details
  const pack = await getScanPack(packId);
  if (!pack) {
    throw new Error(`Invalid pack: ${packId}`);
  }

  if (!pack.stripe_price_id) {
    throw new Error(`Stripe price not configured for pack: ${packId}`);
  }

  // Get or create customer
  const customerId = await getOrCreateCustomer(userId, email);

  // Create checkout session for one-time payment
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: pack.stripe_price_id,
        quantity: 1,
      },
    ],
    success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: {
      user_id: userId,
      pack_id: packId,
      scans: pack.scans.toString(),
    },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

// =====================================================
// Customer Portal
// =====================================================

export async function createPortalSession(
  userId: string,
  returnUrl: string,
): Promise<string> {
  const stripe = getStripe();

  const customerId = await getStripeCustomerId(userId);
  if (!customerId) {
    throw new Error("No Stripe customer found for user");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

// =====================================================
// Webhook Signature Verification
// =====================================================

export function verifyWebhookSignature(
  body: string,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

// =====================================================
// Webhook Event Handlers
// =====================================================

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  // Idempotency check
  const idempotencyKey = event.id;
  const isDuplicate = await checkIdempotency(idempotencyKey);
  if (isDuplicate) {
    console.log(`Duplicate webhook event: ${event.id}`);
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        idempotencyKey,
      );
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(
        event.data.object as Stripe.Subscription,
        idempotencyKey,
      );
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
        idempotencyKey,
      );
      break;

    case "invoice.paid":
      await handleInvoicePaid(
        event.data.object as Stripe.Invoice,
        idempotencyKey,
      );
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(
        event.data.object as Stripe.Invoice,
        idempotencyKey,
      );
      break;

    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  idempotencyKey: string,
): Promise<void> {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error("No user_id in checkout session metadata");
    return;
  }

  // Handle subscription purchase
  if (session.mode === "subscription" && session.metadata?.tier_id) {
    const tierId = session.metadata.tier_id as SubscriptionTierId;
    const subscriptionId = session.subscription as string;

    await updateSubscriptionTier(userId, tierId, {
      source: "stripe",
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      idempotencyKey,
    });

    await logPurchaseEvent({
      user_id: userId,
      event_type: "subscription_created",
      source: "stripe",
      amount: session.amount_total ?? null,
      currency: session.currency?.toUpperCase() ?? "EUR",
      external_id: session.id,
      tier_id: tierId,
      scans_added: null,
      idempotency_key: idempotencyKey,
      metadata: {
        billing_cycle: session.metadata?.billing_cycle,
        subscription_id: subscriptionId,
      },
    });
  }

  // Handle scan pack purchase
  if (session.mode === "payment" && session.metadata?.pack_id) {
    const packId = session.metadata.pack_id;
    const scans = parseInt(session.metadata.scans || "0", 10);

    if (scans > 0) {
      await addScanCredits(userId, scans, idempotencyKey);

      await logPurchaseEvent({
        user_id: userId,
        event_type: "pack_purchased",
        source: "stripe",
        amount: session.amount_total ?? null,
        currency: session.currency?.toUpperCase() ?? "EUR",
        external_id: session.id,
        tier_id: null,
        scans_added: scans,
        idempotency_key: idempotencyKey,
        metadata: { pack_id: packId },
      });
    }
  }
}

async function handleSubscriptionUpdate(
  subscription: Stripe.Subscription,
  idempotencyKey: string,
): Promise<void> {
  const userId =
    subscription.metadata?.user_id ||
    (await getUserByStripeSubscriptionId(subscription.id)) ||
    (await getUserByStripeCustomerId(subscription.customer as string));

  if (!userId) {
    console.error("Cannot find user for subscription:", subscription.id);
    return;
  }

  const tierId = subscription.metadata?.tier_id as
    | SubscriptionTierId
    | undefined;

  // Map Stripe status to our status
  let status: "active" | "past_due" | "canceled" | "expired" | "trialing" =
    "active";
  switch (subscription.status) {
    case "active":
      status = "active";
      break;
    case "past_due":
      status = "past_due";
      break;
    case "canceled":
      status = "canceled";
      break;
    case "unpaid":
    case "incomplete_expired":
      status = "expired";
      break;
    case "trialing":
      status = "trialing";
      break;
  }

  // Update subscription status
  await updateSubscriptionStatus(
    userId,
    status,
    subscription.cancel_at_period_end,
  );

  // If there's a tier change, update it
  if (tierId) {
    // Get billing period from first subscription item (Stripe now uses item-level periods)
    const firstItem = subscription.items?.data?.[0];
    const periodStart = firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000)
      : undefined;
    const periodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : undefined;

    await updateSubscriptionTier(userId, tierId, {
      source: "stripe",
      stripeSubscriptionId: subscription.id,
      periodStart,
      periodEnd,
    });
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  idempotencyKey: string,
): Promise<void> {
  const userId =
    subscription.metadata?.user_id ||
    (await getUserByStripeSubscriptionId(subscription.id));

  if (!userId) {
    console.error(
      "Cannot find user for deleted subscription:",
      subscription.id,
    );
    return;
  }

  // Downgrade to free tier
  await updateSubscriptionTier(userId, "free", {
    source: "stripe",
    idempotencyKey,
  });

  await logPurchaseEvent({
    user_id: userId,
    event_type: "subscription_canceled",
    source: "stripe",
    amount: null,
    currency: "EUR",
    external_id: subscription.id,
    tier_id: "free",
    scans_added: null,
    idempotency_key: idempotencyKey,
    metadata: {},
  });
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  idempotencyKey: string,
): Promise<void> {
  // Only log renewal events (not initial subscription)
  if (invoice.billing_reason !== "subscription_cycle") {
    return;
  }

  const userId = await getUserByStripeCustomerId(invoice.customer as string);
  if (!userId) {
    return;
  }

  await logPurchaseEvent({
    user_id: userId,
    event_type: "subscription_renewed",
    source: "stripe",
    amount: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    external_id: invoice.id,
    tier_id: null,
    scans_added: null,
    idempotency_key: idempotencyKey,
    metadata: {},
  });
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  idempotencyKey: string,
): Promise<void> {
  const userId = await getUserByStripeCustomerId(invoice.customer as string);
  if (!userId) {
    return;
  }

  await updateSubscriptionStatus(userId, "past_due");

  await logPurchaseEvent({
    user_id: userId,
    event_type: "payment_failed",
    source: "stripe",
    amount: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    external_id: invoice.id,
    tier_id: null,
    scans_added: null,
    idempotency_key: idempotencyKey,
    metadata: {
      attempt_count: invoice.attempt_count,
    },
  });
}

// =====================================================
// Session Status
// =====================================================

export interface CheckoutSessionStatus {
  status: Stripe.Checkout.Session.Status | null;
  paymentStatus: Stripe.Checkout.Session.PaymentStatus;
  customerEmail: string | null;
}

export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<CheckoutSessionStatus> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    status: session.status,
    paymentStatus: session.payment_status,
    customerEmail: session.customer_details?.email ?? null,
  };
}

// =====================================================
// Price Validation
// =====================================================

export async function validateStripePrice(priceId: string): Promise<boolean> {
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    return price.active;
  } catch {
    return false;
  }
}
