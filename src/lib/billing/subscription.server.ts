// =====================================================
// Subscription Service - Server-side operations
// =====================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type {
  Subscription,
  SubscriptionWithUsage,
  SubscriptionTier,
  ScanPack,
  ScanConsumptionResult,
  ProfileLimitResult,
  PurchaseHistoryEvent,
  SubscriptionTierId,
  PaymentSource,
} from './types';

// =====================================================
// Service Role Client
// =====================================================

function getServiceClient(): SupabaseClient {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// =====================================================
// Tier & Pack Operations (Public Read)
// =====================================================

export async function getTiers(): Promise<SubscriptionTier[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getTier(tierId: SubscriptionTierId): Promise<SubscriptionTier | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('id', tierId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getScanPacks(): Promise<ScanPack[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scan_packs')
    .select('*')
    .eq('is_active', true);

  if (error) throw error;
  return data ?? [];
}

export async function getScanPack(packId: string): Promise<ScanPack | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('scan_packs')
    .select('*')
    .eq('id', packId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// =====================================================
// Subscription Operations
// =====================================================

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getSubscriptionWithUsage(userId: string): Promise<SubscriptionWithUsage | null> {
  const supabase = getServiceClient();

  // Get subscription
  const subscription = await getSubscription(userId);
  if (!subscription) return null;

  // Get tier details
  const tier = await getTier(subscription.tier_id);

  // Get profile count
  const { count: profileCount, error: countError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('auth_id', userId);

  if (countError) throw countError;

  const remainingBase = Math.max(0, subscription.scans_base - subscription.scans_used);
  const profileLimit = tier?.profile_limit ?? 1;

  return {
    ...subscription,
    scans_available: remainingBase + subscription.scans_credits,
    scans_remaining_base: remainingBase,
    tier,
    profile_count: profileCount ?? 0,
    can_create_profile: profileLimit === null || (profileCount ?? 0) < profileLimit,
  };
}

// =====================================================
// Scan Consumption (Atomic)
// =====================================================

export async function consumeScan(userId: string): Promise<ScanConsumptionResult> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('consume_scan', { p_user_id: userId });

  if (error) throw error;
  return data as ScanConsumptionResult;
}

export async function checkScansAvailable(userId: string): Promise<{
  available: number;
  base_remaining: number;
  base_total: number;
  base_used: number;
  credits: number;
  tier_id: SubscriptionTierId;
  status: string;
  reset_at: string | null;
}> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('check_scans_available', { p_user_id: userId });

  if (error) throw error;
  return data;
}

// =====================================================
// Profile Limit Check
// =====================================================

export async function checkProfileLimit(userId: string): Promise<ProfileLimitResult> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('check_profile_limit', { p_user_id: userId });

  if (error) throw error;
  return data as ProfileLimitResult;
}

// =====================================================
// Subscription Updates (Service Role Only)
// =====================================================

export async function updateSubscriptionTier(
  userId: string,
  tierId: SubscriptionTierId,
  options: {
    source?: PaymentSource;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    idempotencyKey?: string;
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('update_subscription_tier', {
    p_user_id: userId,
    p_tier_id: tierId,
    p_source: options.source ?? 'manual',
    p_stripe_customer_id: options.stripeCustomerId ?? null,
    p_stripe_subscription_id: options.stripeSubscriptionId ?? null,
    p_period_start: options.periodStart?.toISOString() ?? null,
    p_period_end: options.periodEnd?.toISOString() ?? null,
    p_idempotency_key: options.idempotencyKey ?? null,
  });

  if (error) throw error;
  return data;
}

export async function addScanCredits(
  userId: string,
  credits: number,
  idempotencyKey?: string
): Promise<{ success: boolean; credits_added?: number; total_credits?: number; reason?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('add_scan_credits', {
    p_user_id: userId,
    p_credits: credits,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) throw error;
  return data;
}

export async function resetBaseScans(userId: string): Promise<{ success: boolean; reason?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('reset_base_scans', { p_user_id: userId });

  if (error) throw error;
  return data;
}

// =====================================================
// Subscription Status Updates
// =====================================================

export async function updateSubscriptionStatus(
  userId: string,
  status: Subscription['status'],
  cancelAtPeriodEnd?: boolean
): Promise<void> {
  const supabase = getServiceClient();

  const update: Partial<Subscription> = { status };
  if (cancelAtPeriodEnd !== undefined) {
    update.cancel_at_period_end = cancelAtPeriodEnd;
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(update)
    .eq('id', userId);

  if (error) throw error;
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from('subscriptions')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId);

  if (error) throw error;
}

// =====================================================
// Stripe ID Lookups
// =====================================================

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const subscription = await getSubscription(userId);
  return subscription?.stripe_customer_id ?? null;
}

export async function getUserByStripeCustomerId(customerId: string): Promise<string | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.id ?? null;
}

export async function getUserByStripeSubscriptionId(subscriptionId: string): Promise<string | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.id ?? null;
}

// =====================================================
// Purchase History
// =====================================================

export async function logPurchaseEvent(
  event: Omit<PurchaseHistoryEvent, 'id' | 'created_at'>
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from('purchase_history').insert(event);

  // Ignore duplicate idempotency key errors
  if (error && error.code !== '23505') throw error;
}

export async function getPurchaseHistory(userId: string): Promise<PurchaseHistoryEvent[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('purchase_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function checkIdempotency(key: string): Promise<boolean> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('purchase_history')
    .select('id')
    .eq('idempotency_key', key)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

// =====================================================
// Ensure Subscription Exists
// =====================================================

export async function ensureSubscription(userId: string, email?: string): Promise<Subscription> {
  const supabase = getServiceClient();

  // Try to get existing subscription
  const existingSubscription = await getSubscription(userId);

  if (existingSubscription) {
    return existingSubscription;
  }

  // Create free subscription
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      id: userId,
      tier_id: 'free',
      status: 'active',
      source: 'manual',
      scans_base: 5,
      scans_used: 0,
      scans_credits: 0,
      profiles: 1,
      scans_reset_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
