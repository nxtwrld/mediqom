/**
 * Streaming Transcription Client
 *
 * Main client abstraction for streaming transcription.
 * Handles token management, provider connection, and automatic reconnection.
 */

import { DeepgramStreamingProvider } from './DeepgramStreamingProvider';
import {
	StreamingState,
	type StreamingProvider,
	type StreamingOptions,
	type TranscriptCallback,
	type ErrorCallback,
	type StateCallback,
	type TokenResponse,
	type StreamingError
} from './types';

export interface StreamingClientConfig {
	tokenEndpoint?: string;
	preferredProvider?: 'deepgram' | 'auto';
	language: string;
	model?: string;
	onTranscript: TranscriptCallback;
	onError?: ErrorCallback;
	onStateChange?: StateCallback;
	// Fallback options
	fallbackToBatch?: boolean;
	batchEndpoint?: string;
	// Streaming options
	diarize?: boolean;
	punctuate?: boolean;
	interimResults?: boolean;
}

const DEFAULT_TOKEN_ENDPOINT = '/v1/transcribe/token';
const TOKEN_REFRESH_BUFFER_MS = 60000; // Refresh 1 minute before expiry

export class StreamingTranscriptionClient {
	private provider: StreamingProvider | null = null;
	private config: StreamingClientConfig;
	private tokenData: TokenResponse | null = null;
	private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _isConnecting = false;

	constructor(config: StreamingClientConfig) {
		this.config = {
			tokenEndpoint: DEFAULT_TOKEN_ENDPOINT,
			preferredProvider: 'deepgram',
			fallbackToBatch: true,
			batchEndpoint: '/v1/transcribe',
			diarize: false,
			punctuate: true,
			interimResults: true,
			...config
		};
	}

	get isConnected(): boolean {
		return this.provider?.isConnected ?? false;
	}

	get isConnecting(): boolean {
		return this._isConnecting;
	}

	get state(): StreamingState {
		return this.provider?.state ?? StreamingState.Disconnected;
	}

	get currentProvider(): string | null {
		return this.provider?.name ?? null;
	}

	/**
	 * Connect to streaming provider
	 */
	async connect(): Promise<void> {
		if (this.isConnected || this._isConnecting) {
			console.warn('[StreamingClient] Already connected or connecting');
			return;
		}

		this._isConnecting = true;

		try {
			// 1. Fetch token from server
			console.log('[StreamingClient] Fetching token...');
			this.tokenData = await this.fetchToken();

			// Debug: Log token details (safely)
			const tokenPreview = this.tokenData.token
				? `${this.tokenData.token.substring(0, 8)}...${this.tokenData.token.substring(this.tokenData.token.length - 4)}`
				: 'NO_TOKEN';
			console.log('[StreamingClient] Token received:', {
				provider: this.tokenData.provider,
				tokenPreview,
				tokenLength: this.tokenData.token?.length,
				expires: new Date(this.tokenData.expiresAt).toISOString(),
				endpoint: this.tokenData.endpoint,
				model: this.tokenData.metadata?.model
			});

			// 2. Create provider based on token response
			this.provider = this.createProvider(this.tokenData.provider);

			// 3. Set up event handlers
			this.setupEventHandlers();

			// 4. Connect to provider
			console.log('[StreamingClient] Connecting to', this.tokenData.provider, 'with tokenType:', this.tokenData.metadata.tokenType);
			await this.provider.connect(this.tokenData.token, {
				language: this.config.language,
				model: this.config.model || this.tokenData.metadata.model,
				interimResults: this.config.interimResults,
				punctuate: this.config.punctuate,
				diarize: this.config.diarize,
				tokenType: this.tokenData.metadata.tokenType
			});

			// 5. Schedule token refresh
			this.scheduleTokenRefresh();

			console.log('[StreamingClient] Connected successfully');
		} catch (err) {
			console.error('[StreamingClient] Connection failed:', err);

			const error: StreamingError = {
				code: 'CONNECTION_FAILED',
				message: err instanceof Error ? err.message : 'Failed to connect',
				recoverable: this.config.fallbackToBatch ?? false,
				provider: 'client'
			};

			this.config.onError?.(error);
			throw err;
		} finally {
			this._isConnecting = false;
		}
	}

	/**
	 * Disconnect from provider
	 */
	disconnect(): void {
		console.log('[StreamingClient] Disconnecting');

		// Clear token refresh timer
		if (this.tokenRefreshTimer) {
			clearTimeout(this.tokenRefreshTimer);
			this.tokenRefreshTimer = null;
		}

		// Disconnect provider
		if (this.provider) {
			this.removeEventHandlers();
			this.provider.disconnect();
			this.provider = null;
		}

		this.tokenData = null;
	}

	/**
	 * Send audio data to the streaming provider
	 */
	sendAudio(audio: Float32Array | Int16Array): void {
		if (!this.provider?.isConnected) {
			console.warn('[StreamingClient] Cannot send audio - not connected');
			return;
		}

		this.provider.sendAudio(audio);
	}

	/**
	 * Signal end of audio stream
	 */
	finalize(): void {
		if (this.provider?.isConnected) {
			this.provider.finalize();
		}
	}

	/**
	 * Reconnect with fresh token
	 */
	async reconnect(): Promise<void> {
		console.log('[StreamingClient] Reconnecting...');
		this.disconnect();
		await this.connect();
	}

	/**
	 * Update language (requires reconnection)
	 */
	async setLanguage(language: string): Promise<void> {
		if (this.config.language !== language) {
			this.config.language = language;
			if (this.isConnected) {
				await this.reconnect();
			}
		}
	}

	/**
	 * Fetch token from server
	 */
	private async fetchToken(): Promise<TokenResponse> {
		const response = await fetch(this.config.tokenEndpoint!, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				provider: this.config.preferredProvider,
				language: this.config.language,
				options: {
					model: this.config.model || 'nova-2',
					punctuate: this.config.punctuate,
					diarize: this.config.diarize
				}
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.message || error.error || 'Failed to get streaming token');
		}

		return response.json();
	}

	/**
	 * Create provider instance based on provider name
	 */
	private createProvider(provider: string): StreamingProvider {
		switch (provider) {
			case 'deepgram':
				return new DeepgramStreamingProvider();
			default:
				throw new Error(`Unsupported provider: ${provider}`);
		}
	}

	/**
	 * Set up event handlers on provider
	 */
	private setupEventHandlers(): void {
		if (!this.provider) return;

		this.provider.onTranscript(this.handleTranscript);
		this.provider.onError(this.handleError);
		this.provider.onStateChange(this.handleStateChange);
	}

	/**
	 * Remove event handlers from provider
	 */
	private removeEventHandlers(): void {
		if (!this.provider) return;

		this.provider.removeTranscriptListener(this.handleTranscript);
		this.provider.removeErrorListener(this.handleError);
		this.provider.removeStateListener(this.handleStateChange);
	}

	/**
	 * Handle transcript from provider
	 */
	private handleTranscript: TranscriptCallback = (result) => {
		this.config.onTranscript(result);
	};

	/**
	 * Handle error from provider
	 */
	private handleError: ErrorCallback = (error) => {
		console.error('[StreamingClient] Provider error:', error);
		this.config.onError?.(error);
	};

	/**
	 * Handle state change from provider
	 */
	private handleStateChange: StateCallback = (state) => {
		console.log('[StreamingClient] State changed:', state);
		this.config.onStateChange?.(state);
	};

	/**
	 * Schedule token refresh before expiry
	 */
	private scheduleTokenRefresh(): void {
		if (!this.tokenData) return;

		// Clear any existing timer
		if (this.tokenRefreshTimer) {
			clearTimeout(this.tokenRefreshTimer);
		}

		// Calculate time until refresh (1 minute before expiry)
		const refreshIn = this.tokenData.expiresAt - Date.now() - TOKEN_REFRESH_BUFFER_MS;

		if (refreshIn <= 0) {
			// Token already expired or about to expire
			console.warn('[StreamingClient] Token already expired, reconnecting');
			this.reconnect().catch(console.error);
			return;
		}

		console.log('[StreamingClient] Token refresh scheduled in', Math.round(refreshIn / 1000), 'seconds');

		this.tokenRefreshTimer = setTimeout(async () => {
			console.log('[StreamingClient] Token refresh triggered');

			try {
				// Get new token
				const newToken = await this.fetchToken();

				// If provider supports token refresh, use that
				// Otherwise, reconnect with new token
				console.log('[StreamingClient] Reconnecting with fresh token');

				// Disconnect old provider
				if (this.provider) {
					this.removeEventHandlers();
					this.provider.disconnect();
				}

				// Update token and create new provider
				this.tokenData = newToken;
				this.provider = this.createProvider(newToken.provider);
				this.setupEventHandlers();

				// Reconnect with new token
				await this.provider.connect(newToken.token, {
					language: this.config.language,
					model: this.config.model || newToken.metadata.model,
					interimResults: this.config.interimResults,
					punctuate: this.config.punctuate,
					diarize: this.config.diarize,
					tokenType: newToken.metadata.tokenType
				});

				// Schedule next refresh
				this.scheduleTokenRefresh();

				console.log('[StreamingClient] Token refresh completed');
			} catch (err) {
				console.error('[StreamingClient] Token refresh failed:', err);
				this.config.onError?.({
					code: 'TOKEN_REFRESH_FAILED',
					message: 'Failed to refresh streaming token',
					recoverable: this.config.fallbackToBatch ?? false,
					provider: 'client'
				});
			}
		}, refreshIn);
	}
}
