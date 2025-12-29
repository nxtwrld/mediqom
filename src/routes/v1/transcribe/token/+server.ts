import { json, error, type RequestHandler } from '@sveltejs/kit';
import { DEEPGRAM_API_KEY } from '$env/static/private';
import type { TokenRequest, TokenResponse } from '$lib/audio/streaming/types';
import { mapDeepgramLanguage } from '$lib/audio/streaming/types';
import { logger } from '$lib/logging/logger';

/**
 * Generate a temporary Deepgram access token using the grant endpoint
 *
 * This creates a short-lived JWT token (not a project API key).
 * The client must use ['bearer', token] Sec-WebSocket-Protocol format.
 *
 * See: https://developers.deepgram.com/reference/auth/tokens/grant
 */
async function generateDeepgramToken(
	language: string,
	options: TokenRequest['options'] = {}
): Promise<TokenResponse> {
	const ttlSeconds = 600; // 10 minutes

	// Use the /auth/grant endpoint to create a temporary access token
	const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
		method: 'POST',
		headers: {
			Authorization: `Token ${DEEPGRAM_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			ttl_seconds: ttlSeconds
		})
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		logger.audio.error('Failed to create Deepgram access token', {
			status: response.status,
			statusText: response.statusText,
			error: errorData
		});
		throw new Error(errorData.err_msg || `Failed to create Deepgram access token (${response.status})`);
	}

	const tokenData = await response.json();
	const accessToken = tokenData.access_token;
	const expiresIn = tokenData.expires_in || ttlSeconds;
	const expiresAt = Date.now() + expiresIn * 1000;

	const mappedLanguage = mapDeepgramLanguage(language);
	const model = options.model || 'nova-2';

	// Log token details for debugging (without exposing the full token)
	const tokenPreview = accessToken
		? `${accessToken.substring(0, 12)}...${accessToken.substring(accessToken.length - 4)}`
		: 'NO_TOKEN';

	logger.audio.info('Deepgram access token created', {
		tokenPreview,
		tokenLength: accessToken?.length,
		expiresIn,
		expiresAt: new Date(expiresAt).toISOString(),
		language: mappedLanguage,
		model,
		tokenType: 'bearer' // Indicates this is a bearer token
	});

	// Verify token was returned
	if (!accessToken) {
		logger.audio.error('Deepgram API returned empty access token', { tokenData });
		throw new Error('Deepgram API returned empty access token');
	}

	return {
		provider: 'deepgram',
		token: accessToken,
		expiresAt,
		endpoint: 'wss://api.deepgram.com/v1/listen',
		metadata: {
			model,
			language: mappedLanguage,
			tokenType: 'bearer', // Client uses ['bearer', token] protocol
			supportedFeatures: ['interim_results', 'punctuate', 'diarize', 'smart_format', 'utterance_end']
		}
	};
}

/**
 * POST /v1/transcribe/token
 *
 * Generate a short-lived API key for client-direct streaming to Deepgram.
 *
 * This creates a temporary project API key (not JWT) that can be used with
 * browser WebSocket connections via Sec-WebSocket-Protocol authentication.
 *
 * Required API key permissions: keys:write
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Authentication check
	const { session } = await locals.safeGetSession();
	if (!session) {
		error(401, { message: 'Unauthorized' });
	}

	try {
		const body: TokenRequest = await request.json();
		const { provider = 'deepgram', language = 'en', options = {} } = body;

		logger.audio.debug('Token request received', { provider, language, options });

		// Validate provider
		if (provider !== 'deepgram' && provider !== 'auto') {
			// Google requires server-side gRPC, can't do client-direct
			error(501, 'Google direct streaming not supported. Use google-live-sse endpoint.');
		}

		// Check Deepgram API key is configured
		if (!DEEPGRAM_API_KEY) {
			logger.audio.error('DEEPGRAM_API_KEY not configured');
			error(500, 'Deepgram API key not configured');
		}

		// Generate token
		const tokenResponse = await generateDeepgramToken(language, options);

		return json(tokenResponse);
	} catch (err) {
		logger.audio.error('Token generation failed', { error: err });

		if (err instanceof Error && err.message.includes('Unauthorized')) {
			error(401, { message: 'Unauthorized' });
		}

		error(500, err instanceof Error ? err.message : 'Token generation failed');
	}
};
