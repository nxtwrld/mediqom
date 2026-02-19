// =====================================================
// Billing Store - Client-side subscription state
// =====================================================

import { writable, derived } from 'svelte/store';
import { apiGet, apiPost, type ApiRequestOptions } from '$lib/api/client';
import type {
  SubscriptionWithUsage,
  SubscriptionTier,
  ScanPack,
  SubscriptionTierId,
  BillingCycle,
  EmbeddedCheckoutResponse,
  SessionStatusResponse,
} from './types';

// =====================================================
// Stores
// =====================================================

export const subscription = writable<SubscriptionWithUsage | null>(null);
export const tiers = writable<SubscriptionTier[]>([]);
export const packs = writable<ScanPack[]>([]);
export const isLoading = writable(false);
export const error = writable<string | null>(null);

// =====================================================
// Derived Stores
// =====================================================

export const currentTier = derived(subscription, ($sub) => $sub?.tier ?? null);

export const scansAvailable = derived(subscription, ($sub) => $sub?.scans_available ?? 0);

export const hasScans = derived(scansAvailable, ($available) => $available > 0);

export const canCreateProfile = derived(subscription, ($sub) => $sub?.can_create_profile ?? false);

export const isFreeTier = derived(subscription, ($sub) => $sub?.tier_id === 'free');

export const isPaidTier = derived(subscription, ($sub) =>
  $sub ? ['caretaker', 'family'].includes($sub.tier_id) : false
);

export const isActive = derived(subscription, ($sub) =>
  $sub ? ['active', 'trialing'].includes($sub.status) : false
);

// =====================================================
// Actions
// =====================================================

export async function loadSubscription(fetchFn?: typeof fetch): Promise<void> {
  isLoading.set(true);
  error.set(null);

  try {
    const opts: ApiRequestOptions = fetchFn ? { fetch: fetchFn } : {};
    const data = await apiGet<SubscriptionWithUsage>('/v1/billing/subscription', opts);
    subscription.set(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load subscription';
    error.set(message);
    console.error('Failed to load subscription:', err);
  } finally {
    isLoading.set(false);
  }
}

export async function loadTiers(fetchFn?: typeof fetch): Promise<void> {
  try {
    const opts: ApiRequestOptions = fetchFn ? { fetch: fetchFn } : {};
    const data = await apiGet<SubscriptionTier[]>('/v1/billing/tiers', opts);
    tiers.set(data);
  } catch (err) {
    console.error('Failed to load tiers:', err);
  }
}

export async function loadPacks(fetchFn?: typeof fetch): Promise<void> {
  try {
    const opts: ApiRequestOptions = fetchFn ? { fetch: fetchFn } : {};
    const data = await apiGet<ScanPack[]>('/v1/billing/packs', opts);
    packs.set(data);
  } catch (err) {
    console.error('Failed to load packs:', err);
  }
}

export async function loadBillingData(fetchFn?: typeof fetch): Promise<void> {
  await Promise.all([
    loadSubscription(fetchFn),
    loadTiers(fetchFn),
    loadPacks(fetchFn),
  ]);
}

// =====================================================
// Checkout Actions
// =====================================================

export async function startCheckout(
  tierId: SubscriptionTierId,
  billingCycle: BillingCycle
): Promise<string | null> {
  isLoading.set(true);
  error.set(null);

  try {
    const returnUrl = `${window.location.origin}/med/settings/subscription`;
    const response = await apiPost<{ url: string }>('/v1/billing/stripe/checkout', {
      tier_id: tierId,
      billing_cycle: billingCycle,
      return_url: returnUrl,
    });

    return response.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start checkout';
    error.set(message);
    console.error('Failed to start checkout:', err);
    return null;
  } finally {
    isLoading.set(false);
  }
}

export async function startPackCheckout(packId: string): Promise<string | null> {
  isLoading.set(true);
  error.set(null);

  try {
    const returnUrl = `${window.location.origin}/med/settings/subscription`;
    const response = await apiPost<{ url: string }>('/v1/billing/stripe/checkout', {
      pack_id: packId,
      return_url: returnUrl,
    });

    return response.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start checkout';
    error.set(message);
    console.error('Failed to start checkout:', err);
    return null;
  } finally {
    isLoading.set(false);
  }
}

export async function openPortal(): Promise<string | null> {
  isLoading.set(true);
  error.set(null);

  try {
    const returnUrl = `${window.location.origin}/med/settings/subscription`;
    const response = await apiPost<{ url: string }>('/v1/billing/stripe/portal', {
      return_url: returnUrl,
    });

    return response.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to open portal';
    error.set(message);
    console.error('Failed to open portal:', err);
    return null;
  } finally {
    isLoading.set(false);
  }
}

// =====================================================
// Embedded Checkout Actions
// =====================================================

export async function createEmbeddedCheckout(
  tierId: SubscriptionTierId,
  billingCycle: BillingCycle
): Promise<EmbeddedCheckoutResponse | null> {
  isLoading.set(true);
  error.set(null);

  try {
    const returnUrl = `${window.location.origin}/med/settings/subscription`;
    const response = await apiPost<EmbeddedCheckoutResponse>(
      '/v1/billing/stripe/embedded-checkout',
      {
        tier_id: tierId,
        billing_cycle: billingCycle,
        return_url: returnUrl,
      }
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start checkout';
    error.set(message);
    console.error('Failed to create embedded checkout:', err);
    return null;
  } finally {
    isLoading.set(false);
  }
}

export async function createEmbeddedPackCheckout(
  packId: string
): Promise<EmbeddedCheckoutResponse | null> {
  isLoading.set(true);
  error.set(null);

  try {
    const returnUrl = `${window.location.origin}/med/settings/subscription`;
    const response = await apiPost<EmbeddedCheckoutResponse>(
      '/v1/billing/stripe/embedded-checkout',
      {
        pack_id: packId,
        return_url: returnUrl,
      }
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start checkout';
    error.set(message);
    console.error('Failed to create embedded checkout:', err);
    return null;
  } finally {
    isLoading.set(false);
  }
}

export async function getSessionStatus(
  sessionId: string
): Promise<SessionStatusResponse | null> {
  try {
    const response = await apiGet<SessionStatusResponse>(
      `/v1/billing/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`
    );
    return response;
  } catch (err) {
    console.error('Failed to get session status:', err);
    return null;
  }
}

// =====================================================
// Utility Functions
// =====================================================

export function formatPrice(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function getYearlySavingsPercent(tier: SubscriptionTier): number {
  if (tier.price_monthly_eur === 0) return 0;
  const yearlyIfMonthly = tier.price_monthly_eur * 12;
  const savings = yearlyIfMonthly - tier.price_yearly_eur;
  return Math.round((savings / yearlyIfMonthly) * 100);
}

export function getTierFeatures(tierId: SubscriptionTierId): string[] {
  const features: Record<SubscriptionTierId, string[]> = {
    free: [
      'Document analysis',
      'Secure storage',
      'Mobile & web access',
      'Zero-knowledge encryption',
    ],
    caretaker: [
      'All Free features',
      '3 family profiles',
      '50 scans per year',
      'Priority support',
    ],
    family: [
      'All Caretaker features',
      'Unlimited profiles',
      '200 scans per year',
      'Priority support',
    ],
  };
  return features[tierId] || [];
}

// =====================================================
// Reset store (for logout)
// =====================================================

export function resetBillingStore(): void {
  subscription.set(null);
  tiers.set([]);
  packs.set([]);
  isLoading.set(false);
  error.set(null);
}
