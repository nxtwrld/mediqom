// =====================================================
// Stripe Client - Client-side Stripe.js loader
// =====================================================

import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Get or create a Stripe instance for client-side operations.
 * Lazily loads Stripe.js and caches the instance.
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      console.warn('Stripe publishable key not configured');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * Reset the Stripe instance (useful for testing)
 */
export function resetStripe(): void {
  stripePromise = null;
}
