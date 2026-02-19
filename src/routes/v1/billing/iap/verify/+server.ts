// =====================================================
// POST /v1/billing/iap/verify - Validate IAP receipts (iOS/Android)
// =====================================================
// This endpoint validates in-app purchase receipts from mobile platforms
// and updates the user's subscription accordingly.
// =====================================================

import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  updateSubscriptionTier,
  addScanCredits,
  logPurchaseEvent,
  getTier,
  getScanPack,
} from '$lib/billing/subscription.server';
import type { SubscriptionTierId } from '$lib/billing/types';

// TODO: Implement actual Apple/Google receipt validation
// For now, this is a placeholder that returns success for development

interface IAPVerifyRequest {
  platform: 'ios' | 'android';
  receipt: string;
  product_id: string;
}

interface AppleValidationResult {
  valid: boolean;
  product_id?: string;
  transaction_id?: string;
  expires_date?: Date;
  is_trial?: boolean;
  error?: string;
}

interface GoogleValidationResult {
  valid: boolean;
  product_id?: string;
  purchase_token?: string;
  expires_date?: Date;
  auto_renewing?: boolean;
  error?: string;
}

// Map store product IDs to our tier IDs
function mapProductToTier(productId: string): { tierId: SubscriptionTierId; isYearly: boolean } | null {
  const mapping: Record<string, { tierId: SubscriptionTierId; isYearly: boolean }> = {
    // iOS products
    'com.mediqom.caretaker.monthly': { tierId: 'caretaker', isYearly: false },
    'com.mediqom.caretaker.yearly': { tierId: 'caretaker', isYearly: true },
    'com.mediqom.family.monthly': { tierId: 'family', isYearly: false },
    'com.mediqom.family.yearly': { tierId: 'family', isYearly: true },
    // Android products
    'caretaker_monthly': { tierId: 'caretaker', isYearly: false },
    'caretaker_yearly': { tierId: 'caretaker', isYearly: true },
    'family_monthly': { tierId: 'family', isYearly: false },
    'family_yearly': { tierId: 'family', isYearly: true },
  };
  return mapping[productId] || null;
}

function isPackProduct(productId: string): string | null {
  const packMapping: Record<string, string> = {
    // iOS
    'com.mediqom.scans.50': 'pack_50',
    // Android
    'scans_50': 'pack_50',
  };
  return packMapping[productId] || null;
}

async function validateAppleReceipt(receipt: string): Promise<AppleValidationResult> {
  // TODO: Implement Apple App Store Server API validation
  // https://developer.apple.com/documentation/appstoreserverapi
  //
  // 1. Decode the receipt
  // 2. Call Apple's verifyReceipt endpoint
  // 3. Validate the response
  // 4. Extract subscription info
  //
  // For now, return a placeholder error
  return {
    valid: false,
    error: 'Apple receipt validation not implemented',
  };
}

async function validateGoogleReceipt(receipt: string, productId: string): Promise<GoogleValidationResult> {
  // TODO: Implement Google Play Developer API validation
  // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions
  //
  // 1. Use Google service account to authenticate
  // 2. Call purchases.subscriptions.get or purchases.products.get
  // 3. Validate the response
  // 4. Extract subscription info
  //
  // For now, return a placeholder error
  return {
    valid: false,
    error: 'Google receipt validation not implemented',
  };
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, user } }) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const body = (await request.json()) as IAPVerifyRequest;
    const { platform, receipt, product_id } = body;

    if (!platform || !['ios', 'android'].includes(platform)) {
      return error(400, { message: 'Invalid platform' });
    }

    if (!receipt) {
      return error(400, { message: 'Receipt is required' });
    }

    if (!product_id) {
      return error(400, { message: 'product_id is required' });
    }

    // Validate receipt with the appropriate platform
    let validation: AppleValidationResult | GoogleValidationResult;

    if (platform === 'ios') {
      validation = await validateAppleReceipt(receipt);
    } else {
      validation = await validateGoogleReceipt(receipt, product_id);
    }

    if (!validation.valid) {
      return json({
        success: false,
        error: validation.error || 'Invalid receipt',
      });
    }

    // Check if this is a subscription or a pack
    const packId = isPackProduct(product_id);
    if (packId) {
      // Handle scan pack purchase
      const pack = await getScanPack(packId);
      if (!pack) {
        return error(400, { message: 'Invalid pack' });
      }

      const externalId = platform === 'ios'
        ? (validation as AppleValidationResult).transaction_id
        : (validation as GoogleValidationResult).purchase_token;

      await addScanCredits(user.id, pack.scans, externalId);

      await logPurchaseEvent({
        user_id: user.id,
        event_type: 'pack_purchased',
        source: platform === 'ios' ? 'apple' : 'google',
        amount: pack.price_eur,
        currency: 'EUR',
        external_id: externalId || null,
        tier_id: null,
        scans_added: pack.scans,
        idempotency_key: externalId || null,
        metadata: { product_id, platform },
      });

      return json({
        success: true,
        scans_added: pack.scans,
      });
    }

    // Handle subscription
    const tierMapping = mapProductToTier(product_id);
    if (!tierMapping) {
      return error(400, { message: 'Unknown product' });
    }

    const { tierId, isYearly } = tierMapping;
    const tier = await getTier(tierId);

    if (!tier) {
      return error(400, { message: 'Invalid tier' });
    }

    const externalId = platform === 'ios'
      ? (validation as AppleValidationResult).transaction_id
      : (validation as GoogleValidationResult).purchase_token;

    const periodEnd = platform === 'ios'
      ? (validation as AppleValidationResult).expires_date
      : (validation as GoogleValidationResult).expires_date;

    // Update subscription
    await updateSubscriptionTier(user.id, tierId, {
      source: platform === 'ios' ? 'apple' : 'google',
      periodStart: new Date(),
      periodEnd: periodEnd || undefined,
      idempotencyKey: externalId,
    });

    await logPurchaseEvent({
      user_id: user.id,
      event_type: 'subscription_created',
      source: platform === 'ios' ? 'apple' : 'google',
      amount: isYearly ? tier.price_yearly_eur : tier.price_monthly_eur,
      currency: 'EUR',
      external_id: externalId || null,
      tier_id: tierId,
      scans_added: null,
      idempotency_key: externalId || null,
      metadata: { product_id, platform, is_yearly: isYearly },
    });

    return json({
      success: true,
      tier_id: tierId,
    });
  } catch (err) {
    console.error('[API] /v1/billing/iap/verify - Error:', err);
    return error(500, { message: 'Failed to verify receipt' });
  }
};
