// =====================================================
// POST /v1/billing/revenuecat/webhook - RevenueCat events
// =====================================================
// RevenueCat sends an Authorization header set to the
// REVENUECAT_WEBHOOK_SECRET configured in the dashboard.
// =====================================================

import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	updateSubscriptionTier,
	addScanCredits,
	updateSubscriptionStatus,
	logPurchaseEvent,
	checkIdempotency
} from '$lib/billing/subscription.server';
import type { PaymentSource, PurchaseEventType, SubscriptionTierId } from '$lib/billing/types';

// =====================================================
// RevenueCat Webhook Types
// =====================================================

type RCEventType =
	| 'INITIAL_PURCHASE'
	| 'RENEWAL'
	| 'PRODUCT_CHANGE'
	| 'CANCELLATION'
	| 'UNCANCELLATION'
	| 'BILLING_ISSUE'
	| 'SUBSCRIBER_ALIAS'
	| 'SUBSCRIPTION_PAUSED'
	| 'EXPIRATION'
	| 'TRANSFER'
	| 'NON_SUBSCRIPTION_PURCHASE'
	| 'REFUND';

interface RCWebhookEvent {
	id: string;
	type: RCEventType;
	app_user_id: string;
	original_app_user_id: string;
	product_id: string;
	store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE';
	environment: 'PRODUCTION' | 'SANDBOX';
	purchased_at_ms?: number;
	expiration_at_ms?: number;
	price?: number;
	currency?: string;
	transaction_id?: string;
	period_type?: 'TRIAL' | 'INTRO' | 'NORMAL';
}

interface RCWebhookPayload {
	api_version: string;
	event: RCWebhookEvent;
}

// =====================================================
// Product ID Mappings
// =====================================================

// These must match the product IDs configured in App Store Connect / Google Play Console
const TIER_PRODUCT_MAP: Record<string, { tierId: SubscriptionTierId; isYearly: boolean }> = {
	// iOS
	'com.mediqom.caretaker.monthly': { tierId: 'caretaker', isYearly: false },
	'com.mediqom.caretaker.yearly': { tierId: 'caretaker', isYearly: true },
	'com.mediqom.family.monthly': { tierId: 'family', isYearly: false },
	'com.mediqom.family.yearly': { tierId: 'family', isYearly: true },
	// Android
	caretaker_monthly: { tierId: 'caretaker', isYearly: false },
	caretaker_yearly: { tierId: 'caretaker', isYearly: true },
	family_monthly: { tierId: 'family', isYearly: false },
	family_yearly: { tierId: 'family', isYearly: true }
};

const PACK_PRODUCT_MAP: Record<string, { packId: string; scans: number }> = {
	// iOS
	'com.mediqom.scans.50': { packId: 'pack_50', scans: 50 },
	// Android
	scans_50: { packId: 'pack_50', scans: 50 }
};

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings must be the same length (caller checks before calling).
 */
function timingSafeCompare(a: string, b: string): boolean {
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

function getPaymentSource(store: RCWebhookEvent['store']): PaymentSource {
	if (store === 'APP_STORE') return 'apple';
	if (store === 'PLAY_STORE') return 'google';
	return 'stripe';
}

// =====================================================
// Webhook Handler
// =====================================================

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();

	// Verify authorization — RevenueCat sends the secret as-is in Authorization header
	const authHeader = request.headers.get('authorization') || '';
	const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

	const secret = (env as Record<string, string | undefined>).REVENUECAT_WEBHOOK_SECRET;
	if (!secret || token.length !== secret.length || !timingSafeCompare(token, secret)) {
		console.error('[RC Webhook] Invalid authorization');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let payload: RCWebhookPayload;
	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const event = payload?.event;
	if (!event?.id || !event?.type || !event?.app_user_id) {
		return json({ error: 'Missing required event fields' }, { status: 400 });
	}

	// Skip sandbox events in production to avoid polluting DB
	if (event.environment === 'SANDBOX' && process.env.NODE_ENV === 'production') {
		console.log(`[RC Webhook] Skipping sandbox event: ${event.type} (${event.id})`);
		return json({ received: true, skipped: 'sandbox' });
	}

	console.log(
		`[RC Webhook] Processing: ${event.type} (${event.id}) for user ${event.app_user_id}`
	);

	// Idempotency check — prevent double-processing retried webhooks
	const idempotencyKey = `rc_${event.id}`;
	if (await checkIdempotency(idempotencyKey)) {
		console.log(`[RC Webhook] Duplicate event skipped: ${event.id}`);
		return json({ received: true, status: 'duplicate' });
	}

	try {
		await processRCEvent(event, idempotencyKey);
		return json({ received: true, status: 'processed' });
	} catch (err) {
		console.error(`[RC Webhook] Error processing ${event.type}:`, err);
		// Return 200 to prevent RevenueCat retries for app-level errors
		return json({ received: true, status: 'error' });
	}
};

// =====================================================
// Event Processing
// =====================================================

async function processRCEvent(event: RCWebhookEvent, idempotencyKey: string): Promise<void> {
	const userId = event.app_user_id;
	const source = getPaymentSource(event.store);
	const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined;
	const periodStart = event.purchased_at_ms ? new Date(event.purchased_at_ms) : new Date();

	switch (event.type) {
		case 'INITIAL_PURCHASE':
		case 'RENEWAL': {
			const tierMapping = TIER_PRODUCT_MAP[event.product_id];
			if (!tierMapping) {
				await handlePackPurchase(event, userId, source, idempotencyKey);
				return;
			}

			const { tierId, isYearly } = tierMapping;
			const eventType: PurchaseEventType =
				event.type === 'INITIAL_PURCHASE' ? 'subscription_created' : 'subscription_renewed';

			await updateSubscriptionTier(userId, tierId, {
				source,
				periodStart,
				periodEnd,
				idempotencyKey
			});

			await logPurchaseEvent({
				user_id: userId,
				event_type: eventType,
				source,
				amount: event.price != null ? Math.round(event.price * 100) : null,
				currency: event.currency || 'EUR',
				external_id: event.transaction_id || null,
				tier_id: tierId,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					is_yearly: isYearly,
					rc_event_id: event.id
				}
			});
			break;
		}

		case 'PRODUCT_CHANGE': {
			const tierMapping = TIER_PRODUCT_MAP[event.product_id];
			if (!tierMapping) return;

			const { tierId, isYearly } = tierMapping;

			await updateSubscriptionTier(userId, tierId, {
				source,
				periodStart,
				periodEnd,
				idempotencyKey
			});

			await logPurchaseEvent({
				user_id: userId,
				event_type: 'subscription_upgraded',
				source,
				amount: event.price != null ? Math.round(event.price * 100) : null,
				currency: event.currency || 'EUR',
				external_id: event.transaction_id || null,
				tier_id: tierId,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					is_yearly: isYearly,
					rc_event_id: event.id
				}
			});
			break;
		}

		case 'CANCELLATION': {
			await updateSubscriptionStatus(userId, 'canceled', true);

			await logPurchaseEvent({
				user_id: userId,
				event_type: 'subscription_canceled',
				source,
				amount: null,
				currency: 'EUR',
				external_id: event.transaction_id || null,
				tier_id: null,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					rc_event_id: event.id
				}
			});
			break;
		}

		case 'UNCANCELLATION': {
			await updateSubscriptionStatus(userId, 'active', false);
			break;
		}

		case 'EXPIRATION': {
			await updateSubscriptionStatus(userId, 'expired');

			await logPurchaseEvent({
				user_id: userId,
				event_type: 'subscription_expired',
				source,
				amount: null,
				currency: 'EUR',
				external_id: event.transaction_id || null,
				tier_id: null,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					rc_event_id: event.id
				}
			});
			break;
		}

		case 'BILLING_ISSUE': {
			await updateSubscriptionStatus(userId, 'past_due');

			await logPurchaseEvent({
				user_id: userId,
				event_type: 'payment_failed',
				source,
				amount: null,
				currency: 'EUR',
				external_id: event.transaction_id || null,
				tier_id: null,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					rc_event_id: event.id
				}
			});
			break;
		}

		case 'NON_SUBSCRIPTION_PURCHASE': {
			await handlePackPurchase(event, userId, source, idempotencyKey);
			break;
		}

		case 'REFUND': {
			await logPurchaseEvent({
				user_id: userId,
				event_type: 'refund',
				source,
				amount: event.price != null ? Math.round(event.price * 100) : null,
				currency: event.currency || 'EUR',
				external_id: event.transaction_id || null,
				tier_id: null,
				scans_added: null,
				idempotency_key: idempotencyKey,
				metadata: {
					product_id: event.product_id,
					store: event.store,
					environment: event.environment,
					rc_event_id: event.id
				}
			});
			break;
		}

		default:
			console.log(`[RC Webhook] Unhandled event type: ${event.type}`);
	}
}

async function handlePackPurchase(
	event: RCWebhookEvent,
	userId: string,
	source: PaymentSource,
	idempotencyKey: string
): Promise<void> {
	const packMapping = PACK_PRODUCT_MAP[event.product_id];
	if (!packMapping) {
		console.warn(`[RC Webhook] Unknown pack product: ${event.product_id}`);
		return;
	}

	await addScanCredits(userId, packMapping.scans, idempotencyKey);

	await logPurchaseEvent({
		user_id: userId,
		event_type: 'pack_purchased',
		source,
		amount: event.price != null ? Math.round(event.price * 100) : null,
		currency: event.currency || 'EUR',
		external_id: event.transaction_id || null,
		tier_id: null,
		scans_added: packMapping.scans,
		idempotency_key: idempotencyKey,
		metadata: {
			product_id: event.product_id,
			pack_id: packMapping.packId,
			store: event.store,
			environment: event.environment,
			rc_event_id: event.id
		}
	});
}
