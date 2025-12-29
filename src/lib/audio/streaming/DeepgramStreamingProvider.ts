/**
 * Deepgram Streaming Provider
 *
 * Client-side WebSocket connection to Deepgram's real-time transcription API.
 * Connects directly from browser to Deepgram using a temporary API key.
 */

import {
	StreamingState,
	type StreamingProvider,
	type StreamingOptions,
	type TranscriptResult,
	type TranscriptCallback,
	type ErrorCallback,
	type StateCallback,
	type StreamingError,
	type DeepgramResponse,
	mapDeepgramLanguage
} from './types';

export class DeepgramStreamingProvider implements StreamingProvider {
	readonly name = 'deepgram';

	private socket: WebSocket | null = null;
	private _state: StreamingState = StreamingState.Disconnected;
	private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	// Event callbacks
	private transcriptCallbacks: Set<TranscriptCallback> = new Set();
	private errorCallbacks: Set<ErrorCallback> = new Set();
	private stateCallbacks: Set<StateCallback> = new Set();

	// Last partial for deduplication
	private lastPartialText: string = '';

	get isConnected(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	get state(): StreamingState {
		return this._state;
	}

	/**
	 * Connect to Deepgram WebSocket API
	 */
	async connect(token: string, options: StreamingOptions): Promise<void> {
		if (this.isConnected) {
			console.warn('[Deepgram] Already connected, disconnecting first');
			this.disconnect();
		}

		this.setState(StreamingState.Connecting);

		// Build Deepgram WebSocket URL with parameters
		// Using nova-2 (general) instead of nova-2-medical for broader compatibility
		const model = options.model || 'nova-2';
		const language = mapDeepgramLanguage(options.language);

		const params = new URLSearchParams({
			model,
			language,
			punctuate: String(options.punctuate ?? true),
			diarize: String(options.diarize ?? false),
			smart_format: String(options.smartFormat ?? true),
			interim_results: String(options.interimResults ?? true),
			utterance_end_ms: '1000', // Emit utterance end after 1s silence
			encoding: 'linear16',
			sample_rate: String(options.sampleRate || 16000),
			channels: '1'
		});

		console.log('[Deepgram] Model:', model, 'Language:', language);

		// Try authentication via Sec-WebSocket-Protocol header
		// Format: ['token', apiKey] tells Deepgram to use the second value as the API key
		const wsUrl = `wss://api.deepgram.com/v1/listen?${params}`;

		console.log('[Deepgram] Connecting to Deepgram...');
		console.log('[Deepgram] Token preview:', token.substring(0, 8) + '...' + token.substring(token.length - 4));
		console.log('[Deepgram] Token length:', token.length);
		console.log('[Deepgram] WebSocket URL:', wsUrl);

		return new Promise((resolve, reject) => {
			try {
				// Deepgram authentication via Sec-WebSocket-Protocol header
				// - For API keys: ['token', key]
				// - For access tokens (from /auth/grant): ['bearer', token]
				// See: https://github.com/deepgram/deepgram-js-sdk/issues/392

				const protocol = options.tokenType || 'bearer';
				console.log('[Deepgram] Using Sec-WebSocket-Protocol:', protocol);
				this.socket = new WebSocket(wsUrl, [protocol, token]);

				// Set binary type for audio data
				this.socket.binaryType = 'arraybuffer';

				const connectionTimeout = setTimeout(() => {
					if (this._state === StreamingState.Connecting) {
						const error: StreamingError = {
							code: 'CONNECTION_TIMEOUT',
							message: 'WebSocket connection timeout',
							recoverable: true,
							provider: this.name
						};
						this.notifyError(error);
						this.disconnect();
						reject(error);
					}
				}, 10000); // 10 second timeout

				this.socket.onopen = () => {
					clearTimeout(connectionTimeout);
					console.log('[Deepgram] WebSocket connected');
					this.setState(StreamingState.Connected);
					this.startKeepAlive();
					resolve();
				};

				this.socket.onerror = (event) => {
					clearTimeout(connectionTimeout);
					console.error('[Deepgram] WebSocket error event:', event);
					console.error('[Deepgram] WebSocket readyState:', this.socket?.readyState);
					const error: StreamingError = {
						code: 'WEBSOCKET_ERROR',
						message: 'WebSocket connection error - check browser console for details',
						recoverable: true,
						provider: this.name
					};
					this.notifyError(error);
					if (this._state === StreamingState.Connecting) {
						reject(error);
					}
				};

				this.socket.onclose = (event) => {
					clearTimeout(connectionTimeout);
					console.log('[Deepgram] WebSocket closed - code:', event.code, 'reason:', event.reason, 'wasClean:', event.wasClean);

					// Log additional debugging info for common auth failures
					if (event.code === 1006) {
						console.error('[Deepgram] Code 1006 typically indicates:');
						console.error('  - Invalid API key or temporary key');
						console.error('  - Network/firewall blocking WebSocket');
						console.error('  - Server rejected authentication');
					}

					this.stopKeepAlive();
					this.setState(StreamingState.Disconnected);

					// Only report error for unexpected closures
					if (event.code !== 1000 && event.code !== 1001) {
						const error: StreamingError = {
							code: `CLOSE_${event.code}`,
							message: event.reason || `Connection closed unexpectedly (code: ${event.code})`,
							recoverable: event.code >= 1000 && event.code < 4000,
							provider: this.name
						};
						this.notifyError(error);
					}
				};

				this.socket.onmessage = (event) => {
					try {
						const data: DeepgramResponse = JSON.parse(event.data);
						this.handleMessage(data);
					} catch (err) {
						console.error('[Deepgram] Failed to parse message:', err);
					}
				};
			} catch (err) {
				const error: StreamingError = {
					code: 'INIT_ERROR',
					message: err instanceof Error ? err.message : 'Failed to initialize WebSocket',
					recoverable: false,
					provider: this.name
				};
				this.notifyError(error);
				reject(error);
			}
		});
	}

	/**
	 * Disconnect from Deepgram
	 */
	disconnect(): void {
		this.stopKeepAlive();
		this.lastPartialText = '';

		if (this.socket) {
			if (this.socket.readyState === WebSocket.OPEN) {
				// Send close frame properly
				this.socket.close(1000, 'Client disconnect');
			}
			this.socket = null;
		}

		this.setState(StreamingState.Disconnected);
	}

	/**
	 * Send audio data to Deepgram
	 * Accepts Float32Array or Int16Array
	 */
	sendAudio(audio: Int16Array | Float32Array): void {
		if (!this.isConnected) {
			console.warn('[Deepgram] Cannot send audio - not connected');
			return;
		}

		// Convert Float32Array to Int16Array if needed
		let int16Audio: Int16Array;
		if (audio instanceof Float32Array) {
			int16Audio = this.float32ToInt16(audio);
		} else {
			int16Audio = audio;
		}

		// Update state to streaming
		if (this._state === StreamingState.Connected) {
			this.setState(StreamingState.Streaming);
		}

		// Send raw audio buffer
		this.socket!.send(int16Audio.buffer);
	}

	/**
	 * Signal end of audio stream to Deepgram
	 * This triggers final results for any pending audio
	 */
	finalize(): void {
		if (!this.isConnected) return;

		console.log('[Deepgram] Sending finalize signal');

		// Deepgram expects an empty JSON message to signal end of stream
		// This triggers any pending final results
		this.socket!.send(JSON.stringify({ type: 'CloseStream' }));
	}

	/**
	 * Handle incoming Deepgram message
	 */
	private handleMessage(data: DeepgramResponse): void {
		if (data.type === 'Results') {
			const channel = data.channel;
			const alternatives = channel?.alternatives;

			if (alternatives && alternatives.length > 0) {
				const alt = alternatives[0];
				const text = alt.transcript.trim();

				// Skip empty results
				if (!text) return;

				const isFinal = data.is_final === true;

				// Deduplicate partials
				if (!isFinal) {
					if (text === this.lastPartialText) {
						return; // Skip duplicate partial
					}
					this.lastPartialText = text;
				} else {
					this.lastPartialText = ''; // Reset on final
				}

				const result: TranscriptResult = {
					text,
					isFinal,
					confidence: alt.confidence,
					words: alt.words?.map((w) => ({
						word: w.word,
						start: w.start,
						end: w.end,
						confidence: w.confidence,
						speaker: w.speaker !== undefined ? `S${w.speaker}` : undefined,
						punctuatedWord: w.punctuated_word
					}))
				};

				this.notifyTranscript(result);
			}
		} else if (data.type === 'Metadata') {
			console.log('[Deepgram] Metadata:', data.request_id, data.model_info);
		} else if (data.type === 'UtteranceEnd') {
			// Deepgram detected end of utterance (silence)
			console.log('[Deepgram] Utterance end detected');
		} else if (data.type === 'Error') {
			console.error('[Deepgram] Error:', data.error_code, data.error_message);
			this.notifyError({
				code: data.error_code || 'DEEPGRAM_ERROR',
				message: data.error_message || 'Unknown Deepgram error',
				recoverable: false,
				provider: this.name
			});
		}
	}

	/**
	 * Start keep-alive pings to maintain connection
	 */
	private startKeepAlive(): void {
		this.stopKeepAlive();

		// Send keep-alive every 8 seconds (Deepgram timeout is ~10s)
		this.keepAliveInterval = setInterval(() => {
			if (this.isConnected) {
				try {
					this.socket!.send(JSON.stringify({ type: 'KeepAlive' }));
				} catch (err) {
					console.warn('[Deepgram] Keep-alive failed:', err);
				}
			}
		}, 8000);
	}

	/**
	 * Stop keep-alive pings
	 */
	private stopKeepAlive(): void {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = null;
		}
	}

	/**
	 * Convert Float32Array audio to Int16Array (LINEAR16 format)
	 */
	private float32ToInt16(float32: Float32Array): Int16Array {
		const int16 = new Int16Array(float32.length);
		for (let i = 0; i < float32.length; i++) {
			// Clamp to [-1, 1] then convert to 16-bit
			const s = Math.max(-1, Math.min(1, float32[i]));
			int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		return int16;
	}

	/**
	 * Update state and notify listeners
	 */
	private setState(state: StreamingState): void {
		if (this._state !== state) {
			this._state = state;
			for (const callback of this.stateCallbacks) {
				try {
					callback(state);
				} catch (err) {
					console.error('[Deepgram] State callback error:', err);
				}
			}
		}
	}

	/**
	 * Notify transcript listeners
	 */
	private notifyTranscript(result: TranscriptResult): void {
		for (const callback of this.transcriptCallbacks) {
			try {
				callback(result);
			} catch (err) {
				console.error('[Deepgram] Transcript callback error:', err);
			}
		}
	}

	/**
	 * Notify error listeners
	 */
	private notifyError(error: StreamingError): void {
		this.setState(StreamingState.Error);
		for (const callback of this.errorCallbacks) {
			try {
				callback(error);
			} catch (err) {
				console.error('[Deepgram] Error callback error:', err);
			}
		}
	}

	// Event registration methods
	onTranscript(callback: TranscriptCallback): void {
		this.transcriptCallbacks.add(callback);
	}

	onError(callback: ErrorCallback): void {
		this.errorCallbacks.add(callback);
	}

	onStateChange(callback: StateCallback): void {
		this.stateCallbacks.add(callback);
	}

	removeTranscriptListener(callback: TranscriptCallback): void {
		this.transcriptCallbacks.delete(callback);
	}

	removeErrorListener(callback: ErrorCallback): void {
		this.errorCallbacks.delete(callback);
	}

	removeStateListener(callback: StateCallback): void {
		this.stateCallbacks.delete(callback);
	}
}
