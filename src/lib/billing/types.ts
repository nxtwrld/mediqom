// =====================================================
// Billing System Types
// =====================================================

// Subscription tiers
export type SubscriptionTierId = 'free' | 'caretaker' | 'family';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'trialing';

export type PaymentSource = 'stripe' | 'apple' | 'google' | 'manual';

export type BillingCycle = 'monthly' | 'yearly';

// Subscription tier definition
export interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  profile_limit: number | null; // null = unlimited
  scan_limit: number;
  price_monthly_eur: number; // cents
  price_yearly_eur: number; // cents
  stripe_product_id: string | null;
  stripe_price_monthly_eur: string | null;
  stripe_price_yearly_eur: string | null;
  apple_product_id_monthly: string | null;
  apple_product_id_yearly: string | null;
  google_product_id_monthly: string | null;
  google_product_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
}

// Scan pack definition
export interface ScanPack {
  id: string;
  name: string;
  scans: number;
  price_eur: number; // cents
  stripe_price_id: string | null;
  apple_product_id: string | null;
  google_product_id: string | null;
  is_active: boolean;
}

// User subscription state
export interface Subscription {
  id: string; // user_id
  tier_id: SubscriptionTierId;
  status: SubscriptionStatus;
  source: PaymentSource;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scans_base: number;
  scans_used: number;
  scans_credits: number;
  scans_reset_at: string | null;
  profiles: number;
  updated_at: string;
}

// Subscription with computed fields for UI
export interface SubscriptionWithUsage extends Subscription {
  scans_available: number;
  scans_remaining_base: number;
  tier: SubscriptionTier | null;
  profile_count: number;
  can_create_profile: boolean;
}

// Purchase history event
export interface PurchaseHistoryEvent {
  id: string;
  user_id: string;
  event_type: PurchaseEventType;
  source: PaymentSource;
  amount: number | null;
  currency: string;
  external_id: string | null;
  tier_id: SubscriptionTierId | null;
  scans_added: number | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type PurchaseEventType =
  | 'subscription_created'
  | 'subscription_renewed'
  | 'subscription_upgraded'
  | 'subscription_downgraded'
  | 'subscription_canceled'
  | 'subscription_expired'
  | 'pack_purchased'
  | 'trial_started'
  | 'trial_ended'
  | 'payment_failed'
  | 'refund';

// API request/response types
export interface CheckoutRequest {
  tier_id: SubscriptionTierId;
  billing_cycle: BillingCycle;
  return_url: string;
}

export interface CheckoutResponse {
  url: string;
  session_id: string;
}

export interface EmbeddedCheckoutResponse {
  clientSecret: string;
  sessionId: string;
}

export interface SessionStatusResponse {
  status: 'complete' | 'open' | 'expired' | null;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  customerEmail: string | null;
}

export interface PortalRequest {
  return_url: string;
}

export interface PortalResponse {
  url: string;
}

export interface IAPVerifyRequest {
  platform: 'ios' | 'android';
  receipt: string;
  product_id: string;
}

export interface IAPVerifyResponse {
  success: boolean;
  tier_id?: SubscriptionTierId;
  scans_added?: number;
  error?: string;
}

// Scan consumption result
export interface ScanConsumptionResult {
  success: boolean;
  reason: 'consumed' | 'no_scans' | 'no_subscription' | 'subscription_inactive';
  source?: 'base' | 'credits';
  remaining_base?: number;
  remaining_credits?: number;
  available?: number;
  status?: SubscriptionStatus;
}

// Profile limit check result
export interface ProfileLimitResult {
  can_create: boolean;
  current_count: number;
  limit: number | null;
  tier: string;
  is_unlimited: boolean;
}

// Stripe webhook event types we handle
export type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.created';
