// =====================================================
// RevenueCat Service - Mobile in-app purchases
// =====================================================
// Handles iOS App Store + Google Play purchases via
// the RevenueCat SDK. Web purchases still use Stripe.
// =====================================================

import { browser } from '$app/environment';
import { isNativePlatform, getPlatform } from '$lib/config/platform';
import { env as publicEnv } from '$env/dynamic/public';

let initialized = false;

// =====================================================
// Result Types
// =====================================================

export interface RCPurchaseResult {
	success: boolean;
	cancelled?: boolean;
	customerInfo?: unknown;
	error?: string;
}

// =====================================================
// Initialization
// =====================================================

/**
 * Initialize RevenueCat SDK and link to Supabase user.
 * Call after successful login on native platforms.
 */
export async function initRevenueCat(userId: string): Promise<void> {
	if (!browser || !isNativePlatform() || initialized) return;

	try {
		const { Purchases } = await import('@revenuecat/purchases-capacitor');
		const platform = getPlatform();
		const e = publicEnv as Record<string, string | undefined>;
		const apiKey =
			platform === 'ios'
				? (e.PUBLIC_REVENUECAT_IOS_API_KEY ?? '')
				: (e.PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '');

		if (!apiKey) {
			console.warn('[RevenueCat] No API key configured for platform:', platform);
			return;
		}

		await Purchases.configure({ apiKey, appUserID: userId });
		initialized = true;
		console.log('[RevenueCat] Initialized for user:', userId);
	} catch (err) {
		console.error('[RevenueCat] Initialization failed:', err);
	}
}

/**
 * Check if RevenueCat has been initialized.
 */
export function isRevenueCatInitialized(): boolean {
	return initialized;
}

// =====================================================
// Offerings & Products
// =====================================================

/**
 * Fetch current offerings from RevenueCat.
 * Returns the raw offerings object (use `.current.availablePackages` for packages).
 */
export async function getOfferings(): Promise<unknown | null> {
	if (!browser || !isNativePlatform()) return null;

	try {
		const { Purchases } = await import('@revenuecat/purchases-capacitor');
		// getOfferings() returns PurchasesOfferings directly (not wrapped)
		return await Purchases.getOfferings();
	} catch (err) {
		console.error('[RevenueCat] Failed to get offerings:', err);
		return null;
	}
}

// =====================================================
// Purchase Flow
// =====================================================

/**
 * Purchase a RevenueCat package (subscription or one-time).
 * The webhook at /v1/billing/revenuecat/webhook will update the DB.
 */
export async function purchasePackage(rcPackage: unknown): Promise<RCPurchaseResult> {
	if (!browser || !isNativePlatform()) {
		return { success: false, error: 'Not a native platform' };
	}

	try {
		const { Purchases } = await import('@revenuecat/purchases-capacitor');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await Purchases.purchasePackage({ aPackage: rcPackage as any });
		return { success: true, customerInfo: result.customerInfo };
	} catch (err: unknown) {
		const e = err as Record<string, unknown>;
		// User cancelled is expected — not an error
		if (e?.code === 'PURCHASE_CANCELLED_ERROR' || e?.userCancelled === true) {
			return { success: false, cancelled: true };
		}
		console.error('[RevenueCat] Purchase failed:', err);
		return { success: false, error: (e?.message as string) || 'Purchase failed' };
	}
}

/**
 * Restore previous purchases (required by App Store guidelines).
 */
export async function restorePurchases(): Promise<RCPurchaseResult> {
	if (!browser || !isNativePlatform()) {
		return { success: false, error: 'Not a native platform' };
	}

	try {
		const { Purchases } = await import('@revenuecat/purchases-capacitor');
		const result = await Purchases.restorePurchases();
		return { success: true, customerInfo: result.customerInfo };
	} catch (err: unknown) {
		const e = err as Record<string, unknown>;
		console.error('[RevenueCat] Restore failed:', err);
		return { success: false, error: (e?.message as string) || 'Restore failed' };
	}
}

/**
 * Get current RevenueCat customer info (entitlements & subscription status).
 */
export async function getCustomerInfo(): Promise<unknown | null> {
	if (!browser || !isNativePlatform()) return null;

	try {
		const { Purchases } = await import('@revenuecat/purchases-capacitor');
		const result = await Purchases.getCustomerInfo();
		return result.customerInfo;
	} catch (err) {
		console.error('[RevenueCat] Failed to get customer info:', err);
		return null;
	}
}

// =====================================================
// Platform Helpers
// =====================================================

/**
 * Get the native product ID for a tier/pack based on current platform.
 */
export function getNativeProductId(
	tier: {
		apple_product_id_monthly?: string | null;
		apple_product_id_yearly?: string | null;
		google_product_id_monthly?: string | null;
		google_product_id_yearly?: string | null;
	},
	billingCycle: 'monthly' | 'yearly'
): string | null {
	const platform = getPlatform();
	if (platform === 'ios') {
		return billingCycle === 'yearly'
			? (tier.apple_product_id_yearly ?? null)
			: (tier.apple_product_id_monthly ?? null);
	}
	return billingCycle === 'yearly'
		? (tier.google_product_id_yearly ?? null)
		: (tier.google_product_id_monthly ?? null);
}

export function getNativePackProductId(pack: {
	apple_product_id?: string | null;
	google_product_id?: string | null;
}): string | null {
	const platform = getPlatform();
	return platform === 'ios'
		? (pack.apple_product_id ?? null)
		: (pack.google_product_id ?? null);
}
