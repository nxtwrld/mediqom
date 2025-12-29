<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { AudioManager } from '$lib/audio/AudioManager';
	import { AudioState, convertFloat32ToMp3 } from '$lib/audio/microphone';
	import { float32Flatten } from '$lib/array';
	import { logger } from '$lib/logging/logger';
	import {
		StreamingTranscriptionClient,
		StreamingState,
		type TranscriptResult,
		type StreamingError
	} from '$lib/audio/streaming';

	// Log entry type
	interface LogEntry {
		id: number;
		timestamp: Date;
		type: 'info' | 'success' | 'warning' | 'error';
		category: string;
		message: string;
		data?: any;
	}

	// Transcript segment type
	interface TranscriptSegment {
		id: number;
		timestamp: Date;
		text: string;
		source: 'chunk' | 'final';
		audioBlob?: Blob;
		audioUrl?: string;
	}

	// State management
	let audioManager: AudioManager | null = null;
	let isRecording = $state(false);
	let isInitialized = $state(false);
	let currentState = $state<AudioState>(AudioState.Ready);
	let logEntries = $state<LogEntry[]>([]);
	let transcriptSegments = $state<TranscriptSegment[]>([]);
	let audioChunks = $state<Float32Array[]>([]);
	let isTranscribing = $state(false);
	let transcriptError = $state<string | null>(null);

	// Transcription settings
	let language = $state<'en' | 'cs' | 'de'>('cs');
	let enableTranslation = $state(false);
	let customPrompt = $state('Transcribe this conversation accurately, preserving all spoken content.');
	let transportMode = $state<'batch' | 'live' | 'google' | 'deepgram'>('batch');
	let liveEventSource: EventSource | null = null;
	let liveSessionId: string | null = null;
	let liveSocketReady = $state(false);
	let liveSocketError = $state<string | null>(null);
	let liveSeq = 0;
	const livePending = new Map<number, number>();

	// Deepgram Direct streaming state
	let deepgramClient: StreamingTranscriptionClient | null = null;
	let deepgramState = $state<StreamingState>(StreamingState.Disconnected);
	let deepgramError = $state<string | null>(null);
	let deepgramPartialText = $state<string>('');
	let deepgramStartTime: number | null = null;

	// Refs for auto-scrolling
	let transcriptContainer: HTMLDivElement;
	let logIdCounter = 0;
	let transcriptIdCounter = 0;

	// Audio playback
	let currentAudio: HTMLAudioElement | null = null;

	// Add log entry
	function addLog(
		type: LogEntry['type'],
		category: string,
		message: string,
		data?: any
	) {
		const entry: LogEntry = {
			id: logIdCounter++,
			timestamp: new Date(),
			type,
			category,
			message,
			data
		};

		// Prepend (newest first)
		logEntries = [entry, ...logEntries];

		// Limit to 200 entries
		if (logEntries.length > 200) {
			logEntries = logEntries.slice(0, 200);
		}

		// Also log to console
		const logMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'info';
		console[logMethod](`[${category}] ${message}`, data || '');
	}

	// Add transcript segment
	function addTranscript(
		text: string,
		source: 'chunk' | 'final' = 'chunk',
		audioBlob?: Blob,
		audioUrl?: string
	) {
		const segment: TranscriptSegment = {
			id: transcriptIdCounter++,
			timestamp: new Date(),
			text,
			source,
			audioBlob,
			audioUrl
		};

		transcriptSegments = [...transcriptSegments, segment];

		// Auto-scroll to bottom
		setTimeout(() => {
			if (transcriptContainer) {
				transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
			}
		}, 0);
	}

	// Clear logs
	function clearLogs() {
		logEntries = [];
		logIdCounter = 0;
		addLog('info', 'System', 'Logs cleared');
	}

	// Clear transcripts
	function clearTranscripts() {
		// Revoke audio URLs to prevent memory leaks
		transcriptSegments.forEach((segment) => {
			if (segment.audioUrl) {
				URL.revokeObjectURL(segment.audioUrl);
			}
		});

		transcriptSegments = [];
		transcriptIdCounter = 0;
		addLog('info', 'System', 'Transcripts cleared');
	}

	// Play audio chunk
	function playAudio(audioUrl: string) {
		// Stop any currently playing audio
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}

		// Create and play new audio
		currentAudio = new Audio(audioUrl);
		currentAudio.play();

		// Cleanup when finished
		currentAudio.onended = () => {
			currentAudio = null;
		};
	}

	// Download audio chunk
	function downloadAudio(blob: Blob, id: number) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `chunk-${id}.mp3`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function toBase64(bytes: Uint8Array): string {
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}
		return btoa(binary);
	}

	function encodeFloat32ToInt16Base64(data: Float32Array): string {
		const int16 = new Int16Array(data.length);
		for (let i = 0; i < data.length; i++) {
			const s = Math.max(-1, Math.min(1, data[i]));
			int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		return toBase64(new Uint8Array(int16.buffer));
	}

	function sseUrlForTransport() {
		const baseUrl = transportMode === 'google'
			? '/v1/transcribe/google-live-sse'
			: '/v1/transcribe/live-sse';

		// For Google, include language in SSE connection
		if (transportMode === 'google') {
			return `${baseUrl}?lang=${language}`;
		}

		return baseUrl;
	}

	function audioUrlForTransport() {
		if (transportMode === 'google') {
			return '/v1/transcribe/google-live-sse/audio';
		}
		return '/v1/transcribe/live-sse/audio';
	}

	async function connectLiveSSE(): Promise<boolean> {
		if (liveEventSource && liveSocketReady) return true;

		return new Promise((resolve) => {
			const sseUrl = sseUrlForTransport();
			try {
				liveEventSource = new EventSource(sseUrl);
			} catch (err) {
				liveSocketError = err instanceof Error ? err.message : String(err);
				addLog('error', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', liveSocketError);
				resolve(false);
				return;
			}
			liveSocketReady = false;
			liveSocketError = null;

			liveEventSource.addEventListener('open', () => {
				liveSocketReady = true;
				addLog('success', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', 'SSE connected');
			});

			liveEventSource.addEventListener('message', (event) => {
				try {
					const payload = JSON.parse(event.data);

					if (payload.type === 'connected') {
						liveSessionId = payload.sessionId;
						addLog('success', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', `Session established: ${liveSessionId}`);
						resolve(true);
					} else if (payload.type === 'partial' || payload.type === 'final') {
						const sentAt = livePending.get(payload.seq);
						const latencyMs = sentAt ? Math.round(performance.now() - sentAt) : undefined;
						if (sentAt) {
							livePending.delete(payload.seq);
						}
						const speakerLabel = payload.speakerTag ? `[${payload.speakerTag}] ` : '';
						addTranscript(`${speakerLabel}${payload.text}`, payload.type === 'final' ? 'final' : 'chunk');
						addLog('info', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', `📡 Received ${payload.type} transcript`, {
							seq: payload.seq,
							confidence: payload.confidence,
							latencyMs,
							speakerTag: payload.speakerTag
						});
					} else if (payload.type === 'error') {
						liveSocketError = payload.message || 'Unknown SSE error';
						addLog('error', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', liveSocketError || 'Unknown error');
					}
				} catch (err) {
					addLog('error', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', 'Failed to parse SSE message', {
						error: (err as Error).message
					});
				}
			});

			const handleClose = (reason: string) => {
				liveSocketReady = false;
				liveSessionId = null;
				addLog('warning', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', reason);
			};

			liveEventSource.addEventListener('error', (err) => {
				liveSocketError = 'SSE connection error';
				handleClose('SSE connection errored');
				resolve(false);
			});
		});
	}

	function closeLiveSSE() {
		if (liveEventSource) {
			liveEventSource.close();
		}
		liveEventSource = null;
		liveSessionId = null;
		liveSocketReady = false;
		livePending.clear();
	}

	// Deepgram Direct streaming functions
	async function connectDeepgram(): Promise<boolean> {
		if (deepgramClient?.isConnected) return true;

		try {
			addLog('info', 'Deepgram', 'Connecting to Deepgram Direct...');

			deepgramClient = new StreamingTranscriptionClient({
				language,
				model: 'nova-2', // General model - medical may have restrictions
				punctuate: true,
				interimResults: true,
				diarize: false,
				onTranscript: handleDeepgramTranscript,
				onError: handleDeepgramError,
				onStateChange: handleDeepgramStateChange
			});

			deepgramStartTime = performance.now();
			await deepgramClient.connect();

			addLog('success', 'Deepgram', 'Connected to Deepgram Direct (WebSocket)', {
				provider: deepgramClient.currentProvider,
				latencyMs: Math.round(performance.now() - deepgramStartTime)
			});

			return true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			deepgramError = msg;
			addLog('error', 'Deepgram', `Failed to connect: ${msg}`);
			return false;
		}
	}

	function handleDeepgramTranscript(result: TranscriptResult) {
		const latencyMs = deepgramStartTime ? Math.round(performance.now() - deepgramStartTime) : undefined;

		if (result.isFinal) {
			// Final transcript - add to segments
			addTranscript(result.text, 'final');
			deepgramPartialText = '';
			deepgramStartTime = performance.now(); // Reset for next utterance

			addLog('success', 'Deepgram', `Final transcript received`, {
				text: result.text,
				confidence: result.confidence?.toFixed(3),
				latencyMs,
				words: result.words?.length
			});
		} else {
			// Partial/interim result - update display
			deepgramPartialText = result.text;

			addLog('info', 'Deepgram', `Partial: "${result.text}"`, {
				confidence: result.confidence?.toFixed(3),
				latencyMs
			});
		}
	}

	function handleDeepgramError(error: StreamingError) {
		deepgramError = error.message;
		addLog('error', 'Deepgram', `Error: ${error.message}`, {
			code: error.code,
			recoverable: error.recoverable
		});

		// If recoverable and we have fallback, try batch mode
		if (error.recoverable) {
			addLog('warning', 'Deepgram', 'Attempting to reconnect...');
		}
	}

	function handleDeepgramStateChange(state: StreamingState) {
		deepgramState = state;
		addLog('info', 'Deepgram', `State: ${state}`);
	}

	function disconnectDeepgram() {
		if (deepgramClient) {
			deepgramClient.finalize();
			deepgramClient.disconnect();
			deepgramClient = null;
		}
		deepgramState = StreamingState.Disconnected;
		deepgramPartialText = '';
		deepgramStartTime = null;
	}

	async function sendAudioToDeepgram(audioData: Float32Array) {
		if (!deepgramClient?.isConnected) {
			const connected = await connectDeepgram();
			if (!connected) {
				addLog('warning', 'Deepgram', 'Not connected, falling back to batch');
				await transcribeChunkBatch(audioData);
				return;
			}
		}

		// For Deepgram Direct, we send raw audio frames directly
		// The streaming client handles the WebSocket connection
		deepgramClient!.sendAudio(audioData);

		addLog('info', 'Deepgram', 'Sent audio frame', {
			samples: audioData.length,
			durationMs: Math.round((audioData.length / 16000) * 1000)
		});
	}

	// Initialize AudioManager
	async function initializeAudio() {
		try {
			addLog('info', 'System', 'Initializing AudioManager...');
			audioManager = AudioManager.getInstance();

			// Set up all event listeners
			setupAudioEventListeners();

			const success = await audioManager.initialize();
			if (success) {
				isInitialized = true;
				currentState = audioManager.getState();
				addLog('success', 'AudioManager', 'Initialized successfully', {
					state: currentState
				});
			} else {
				addLog('error', 'AudioManager', 'Initialization failed');
			}
		} catch (error) {
			addLog('error', 'AudioManager', 'Initialization error', {
				message: (error as Error).message,
				stack: (error as Error).stack
			});
		}
	}

	// Setup AudioManager event listeners
	function setupAudioEventListeners() {
		if (!audioManager) return;

		// Initialized event
		audioManager.on('initialized', () => {
			addLog('success', 'AudioManager', 'Initialized event received');
		});

		// Recording started
		audioManager.on('recording-started', () => {
			addLog('success', 'AudioManager', 'Recording started');
			isRecording = true;
		});

		// Recording stopped
		audioManager.on('recording-stopped', () => {
			addLog('info', 'AudioManager', 'Recording stopped');
			isRecording = false;
		});

		// Speech start
		audioManager.on('speech-start', () => {
			addLog('info', 'VAD', '🎤 Speech detected - recording started');
		});

		// Speech end
		audioManager.on('speech-end', (audioData: Float32Array) => {
			const durationMs = Math.round((audioData.length / 16000) * 1000);
			addLog('info', 'VAD', '⏹️ Speech ended', {
				samples: audioData.length,
				durationMs: `${durationMs}ms`
			});
			audioChunks = [...audioChunks, audioData];
		});

		// Speech end timeout
		audioManager.on('speech-end-timeout', (audioData: Float32Array) => {
			const durationMs = Math.round((audioData.length / 16000) * 1000);
			addLog('warning', 'VAD', '⏰ Speech timeout triggered (30s limit)', {
				samples: audioData.length,
				durationMs: `${durationMs}ms`
			});
		});

		// Audio chunk (optimized 10s chunks)
		audioManager.on('audio-chunk', (audioData: Float32Array, metadata: any) => {
			const durationMs = Math.round((audioData.length / 16000) * 1000);
			addLog('success', 'AudioManager', '📦 Audio chunk ready for transcription', {
				samples: audioData.length,
				durationMs: `${durationMs}ms`,
				sequenceNumber: metadata?.sequenceNumber,
				overlapDurationMs: metadata?.overlapDurationMs,
				energyLevel: metadata?.energyLevel?.toFixed(6),
				isTimeoutForced: metadata?.isTimeoutForced
			});

			// Transcribe this chunk
			transcribeChunk(audioData);
		});

		// State change
		audioManager.on('state-change', (newState: AudioState) => {
			currentState = newState;
			addLog('info', 'AudioManager', `State changed to: ${newState}`, {
				state: newState
			});
		});

		// Error
		audioManager.on('error', (error: string) => {
			addLog('error', 'AudioManager', error);
		});
	}

	// Remove AudioManager event listeners
	function removeAudioEventListeners() {
		if (!audioManager) return;

		audioManager.removeAllListeners('initialized');
		audioManager.removeAllListeners('recording-started');
		audioManager.removeAllListeners('recording-stopped');
		audioManager.removeAllListeners('speech-start');
		audioManager.removeAllListeners('speech-end');
		audioManager.removeAllListeners('speech-end-timeout');
		audioManager.removeAllListeners('audio-chunk');
		audioManager.removeAllListeners('state-change');
		audioManager.removeAllListeners('error');
	}

	// Start recording
	async function startRecording() {
		if (!isInitialized) {
			await initializeAudio();
		}

		if (!audioManager) {
			addLog('error', 'System', 'AudioManager not initialized');
			return;
		}

		// Kick off connection in parallel so VAD isn't blocked
		let connectionPromise: Promise<boolean> | null = null;
		if (transportMode === 'live' || transportMode === 'google') {
			connectionPromise = connectLiveSSE().catch((err: Error) => {
				const msg = err instanceof Error ? err.message : String(err);
				liveSocketError = msg;
				addLog('error', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', msg);
				return false;
			});
		} else if (transportMode === 'deepgram') {
			connectionPromise = connectDeepgram().catch((err: Error) => {
				const msg = err instanceof Error ? err.message : String(err);
				deepgramError = msg;
				addLog('error', 'Deepgram', msg);
				return false;
			});
		}

		try {
			addLog('info', 'System', 'Starting recording...');
			const success = await audioManager.start();
			if (success) {
				audioChunks = [];
				addLog('success', 'System', 'Recording started successfully');
			} else {
				addLog('error', 'System', 'Failed to start recording');
			}
		} catch (error) {
			addLog('error', 'System', 'Error starting recording', {
				message: (error as Error).message
			});
		}

		// Await connection without blocking VAD start
		if (connectionPromise) {
			connectionPromise.then((connected) => {
				if (!connected) {
					const mode = transportMode === 'deepgram' ? 'Deepgram' :
						(transportMode === 'google' ? 'Google Live SSE' : 'Live SSE');
					addLog('warning', mode, 'Not connected; will fallback to batch on send');
				}
			});
		}
	}

	// Stop recording
	async function stopRecording() {
		if (!audioManager) return;

		try {
			addLog('info', 'System', 'Stopping recording...');
			await audioManager.stop();
			addLog('success', 'System', 'Recording stopped successfully');

			// Disconnect streaming connections
			if (transportMode === 'live' || transportMode === 'google') {
				closeLiveSSE();
			} else if (transportMode === 'deepgram') {
				disconnectDeepgram();
			}

			// Final transcription of any remaining chunks
			if (audioChunks.length > 0) {
				addLog('info', 'System', `Processing ${audioChunks.length} remaining audio chunks`);
			}
		} catch (error) {
			addLog('error', 'System', 'Error stopping recording', {
				message: (error as Error).message
			});
		}
	}

	async function transcribeChunkBatch(audioData: Float32Array) {
		try {
			isTranscribing = true;
			transcriptError = null;
			const startedAt = performance.now();

			addLog('info', 'Transcription', '🔄 Converting audio to MP3...');

			// Convert to MP3
			const mp3Blob = await convertFloat32ToMp3(audioData, 16000);
			const file = new File([mp3Blob], 'chunk.mp3', { type: 'audio/mp3' });

			// Build instructions object with anti-hallucination parameters
			const instructions: {
				lang: string;
				translate?: boolean;
				prompt?: string;
				includeLogprobs?: boolean;
				chunkingStrategy?: "auto";
			} = {
				lang: language,
				includeLogprobs: true, // Enable quality scoring
				chunkingStrategy: "auto" // Server-side VAD to prevent hallucinations
			};

			// Handle translation flag
			if (enableTranslation) {
				instructions.translate = true;
			}

			// Handle custom prompt with smart translation appending
			if (customPrompt.trim()) {
				if (enableTranslation) {
					// Append translation instruction to custom prompt
					instructions.prompt = customPrompt.trim() + ' Translate the transcription to English.';
				} else {
					// Use custom prompt as-is
					instructions.prompt = customPrompt.trim();
				}
			}
			// If no custom prompt, fall back to default prompt/translatePrompt selection

			addLog('info', 'Transcription', '📤 Sending to transcription service...', {
				fileSize: `${(file.size / 1024).toFixed(2)} KB`,
				language,
				translate: enableTranslation,
				customPrompt: customPrompt.trim() ? true : false,
				translationAppended: customPrompt.trim() && enableTranslation ? true : false
			});

			// Send to transcription endpoint
			const formData = new FormData();
			formData.append('file', file);
			formData.append('instructions', JSON.stringify(instructions));

			const response = await fetch('/v1/transcribe', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error(`Transcription failed: ${response.statusText}`);
			}

			const result = await response.json();

			addLog('success', 'Transcription', '✅ Transcription complete', {
				text: result.text,
				length: result.text.length,
				latencyMs: Math.round(performance.now() - startedAt)
			});

			// Create object URL for audio playback
			const audioUrl = URL.createObjectURL(mp3Blob);

			// Add to transcript display with audio
			addTranscript(result.text, 'chunk', mp3Blob, audioUrl);
		} catch (error) {
			const errorMsg = (error as Error).message;
			transcriptError = errorMsg;
			addLog('error', 'Transcription', '❌ Transcription failed', {
				error: errorMsg
			});
		} finally {
			isTranscribing = false;
		}
	}

	async function transcribeChunk(audioData: Float32Array) {
		// Deepgram Direct mode - send to WebSocket
		if (transportMode === 'deepgram') {
			await sendAudioToDeepgram(audioData);
			return;
		}

		// Live SSE modes
		if (transportMode === 'live' || transportMode === 'google') {
			try {
				const ok = await connectLiveSSE();
				if (!ok || !liveSessionId) {
					addLog('warning', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', 'SSE not ready, falling back to batch');
					await transcribeChunkBatch(audioData);
					return;
				}

				const pcm = encodeFloat32ToInt16Base64(audioData);
				const seq = liveSeq++;
				const payload = {
					sessionId: liveSessionId,
					pcm,
					seq,
					// For Google, lang is set at SSE connection time, not per-chunk
					...(transportMode !== 'google' && { lang: language }),
					translate: enableTranslation || undefined,
					prompt: customPrompt.trim() || undefined
				};

				const audioUrl = audioUrlForTransport();
				const response = await fetch(audioUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(payload)
				});

				if (!response.ok) {
					throw new Error(`Audio POST failed: ${response.statusText}`);
				}

				livePending.set(seq, performance.now());
				addLog('info', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', '📤 Sent audio frame to live endpoint', {
					samples: audioData.length,
					seq
				});
				return;
			} catch (err) {
				addLog('error', transportMode === 'google' ? 'Google Live SSE' : 'Live SSE', 'Failed to send audio over SSE, falling back', {
					error: (err as Error).message
				});
				await transcribeChunkBatch(audioData);
				return;
			}
		}

		// Default to batch POST
		await transcribeChunkBatch(audioData);
	}

	// Format timestamp
	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	// Get state color
	function getStateColor(state: AudioState): string {
		switch (state) {
			case AudioState.Ready:
				return 'var(--color-text-muted)';
			case AudioState.Listening:
				return 'var(--color-success)';
			case AudioState.Speaking:
				return 'var(--color-warning)';
			case AudioState.Stopping:
				return 'var(--color-warning)';
			case AudioState.Stopped:
				return 'var(--color-text-muted)';
			case AudioState.Error:
				return 'var(--color-error)';
			default:
				return 'var(--color-text)';
		}
	}

	// Lifecycle
	onMount(() => {
		addLog('info', 'System', 'Audio Test Page loaded');
	});

	onDestroy(() => {
		// Cleanup audio manager
		if (audioManager) {
			removeAudioEventListeners();
			if (isRecording) {
				audioManager.stop();
			}
		}

		// Cleanup streaming connections
		closeLiveSSE();
		disconnectDeepgram();

		// Cleanup audio URLs to prevent memory leaks
		transcriptSegments.forEach((segment) => {
			if (segment.audioUrl) {
				URL.revokeObjectURL(segment.audioUrl);
			}
		});

		// Stop any playing audio
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
	});
</script>

<div class="audio-test-page">
	<header class="page-header">
		<h1>Audio Manager Test & Debug Console</h1>
		<div class="status-bar">
			<div class="status-item">
				<span class="label">State:</span>
				<span class="value" style="color: {getStateColor(currentState)}">
					{currentState}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Recording:</span>
				<span class="value" style="color: {isRecording ? 'var(--color-success)' : 'var(--color-text-muted)'}">
					{isRecording ? '● REC' : '○ Idle'}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Transcribing:</span>
				<span class="value" style="color: {isTranscribing ? 'var(--color-info)' : 'var(--color-text-muted)'}">
					{isTranscribing ? '⟳ Processing...' : '✓ Ready'}
				</span>
			</div>
		</div>
	</header>

	<div class="controls">
		{#if !isRecording}
			<button class="button -primary -large" onclick={startRecording}>
				🎤 Start Recording
			</button>
		{:else}
			<button class="button -danger -large" onclick={stopRecording}>
				⏹️ Stop Recording
			</button>
		{/if}

		<button class="button" onclick={clearLogs}>Clear Logs</button>
		<button class="button" onclick={clearTranscripts}>Clear Transcripts</button>
	</div>

	<div class="transcription-settings">
		<h3>Transcription Settings</h3>
		<div class="settings-grid">
			<div class="setting-group">
				<label for="language">Input Language</label>
				<select id="language" bind:value={language} disabled={isRecording}>
					<option value="en">English</option>
					<option value="cs">Czech</option>
					<option value="de">German</option>
				</select>
			</div>

			<div class="setting-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={enableTranslation} disabled={isRecording} />
					<span>Translate to English</span>
				</label>
			</div>

			<div class="setting-group">
				<label for="transport">Transport</label>
				<select
					id="transport"
					bind:value={transportMode}
					disabled={isRecording && (transportMode === 'live' || transportMode === 'google' || transportMode === 'deepgram')}
				>
					<option value="batch">Batch (HTTP POST)</option>
					<option value="live">Live (SSE + HTTP)</option>
					<option value="google">Google Live (SSE + HTTP)</option>
					<option value="deepgram">Deepgram Direct (WebSocket)</option>
				</select>
				{#if transportMode === 'live' || transportMode === 'google'}
					<small class={liveSocketReady ? 'prompt-active' : 'prompt-default'}>
						{liveSocketReady
							? 'SSE connected'
							: liveSocketError
								? liveSocketError
								: 'SSE will connect on start'}
					</small>
				{:else if transportMode === 'deepgram'}
					<small class={deepgramState === StreamingState.Connected || deepgramState === StreamingState.Streaming ? 'prompt-active' : deepgramError ? 'prompt-error' : 'prompt-default'}>
						{deepgramState === StreamingState.Connected || deepgramState === StreamingState.Streaming
							? `WebSocket ${deepgramState}`
							: deepgramError
								? deepgramError
								: 'Will connect on start'}
					</small>
				{/if}
			</div>

			<div class="setting-group full-width">
				<label for="customPrompt">Custom Prompt</label>
				<textarea
					id="customPrompt"
					bind:value={customPrompt}
					disabled={isRecording}
					placeholder="Enter a custom prompt for transcription. Clear this field to use default medical context prompts."
					rows="3"
				></textarea>
				{#if customPrompt.trim()}
					{#if enableTranslation}
						<small class="prompt-active">✓ Custom prompt with translation to English</small>
					{:else}
						<small class="prompt-active">✓ Custom prompt (preserving original language)</small>
					{/if}
				{:else}
					{#if enableTranslation}
						<small class="prompt-default">Using default medical translation prompt</small>
					{:else}
						<small class="prompt-default">Using default medical preservation prompt</small>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<div class="content-grid">
		<!-- Event Log Column -->
		<div class="log-panel">
			<div class="panel-header">
				<h2>Event Log</h2>
				<span class="count">{logEntries.length} entries</span>
			</div>
			<div class="log-container">
				{#each logEntries as entry (entry.id)}
					<div class="log-entry log-{entry.type}">
						<div class="log-header">
							<span class="log-time">{formatTime(entry.timestamp)}</span>
							<span class="log-category">[{entry.category}]</span>
							<span class="log-type">{entry.type.toUpperCase()}</span>
						</div>
						<div class="log-message">{entry.message}</div>
						{#if entry.data}
							<details class="log-data">
								<summary>View metadata</summary>
								<pre>{JSON.stringify(entry.data, null, 2)}</pre>
							</details>
						{/if}
					</div>
				{/each}

				{#if logEntries.length === 0}
					<div class="empty-state">No events logged yet. Start recording to see events.</div>
				{/if}
			</div>
		</div>

		<!-- Transcript Column -->
		<div class="transcript-panel">
			<div class="panel-header">
				<h2>Transcript</h2>
				<span class="count">{transcriptSegments.length} segments</span>
			</div>
			<div class="transcript-container" bind:this={transcriptContainer}>
				{#if transportMode === 'deepgram' && deepgramPartialText}
					<div class="transcript-segment segment-partial">
						<div class="segment-header">
							<span class="segment-time">Live</span>
							<span class="segment-source">partial</span>
						</div>
						<div class="segment-text">{deepgramPartialText}</div>
					</div>
				{/if}

				{#each transcriptSegments as segment (segment.id)}
					<div class="transcript-segment segment-{segment.source}">
						<div class="segment-header">
							<span class="segment-time">{formatTime(segment.timestamp)}</span>
							<span class="segment-source">{segment.source}</span>
							{#if segment.audioUrl && segment.audioBlob}
								<div class="audio-controls">
									<button
										class="play-audio-btn"
										onclick={() => playAudio(segment.audioUrl!)}
										title="Play original audio"
									>
										🔊 Play
									</button>
									<button
										class="download-audio-btn"
										onclick={() => downloadAudio(segment.audioBlob!, segment.id)}
										title="Download audio chunk"
									>
										⬇️
									</button>
								</div>
							{/if}
						</div>
						<div class="segment-text">{segment.text}</div>
					</div>
				{/each}

				{#if transcriptSegments.length === 0 && !deepgramPartialText}
					<div class="empty-state">
						{#if transcriptError}
							<div class="error-message">❌ {transcriptError}</div>
						{:else if isTranscribing}
							<div class="loading-message">⟳ Transcribing audio...</div>
						{:else}
							Transcripts will appear here as speech is detected.
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.audio-test-page {
		max-width: 1400px;
		margin: 0 auto;
		padding: var(--ui-space-4);
		font-family: var(--font-family-base);
	}

	.page-header {
		margin-bottom: var(--ui-space-4);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		margin: 0 0 var(--ui-space-3) 0;
		color: var(--color-text);
	}

	.status-bar {
		display: flex;
		gap: var(--ui-space-4);
		padding: var(--ui-space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--ui-radius-md);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
	}

	.status-item {
		display: flex;
		gap: var(--ui-space-2);
	}

	.status-item .label {
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.status-item .value {
		font-weight: 700;
	}

	.controls {
		display: flex;
		gap: var(--ui-space-3);
		margin-bottom: var(--ui-space-4);
	}

	.transcription-settings {
		background: var(--color-bg-secondary);
		border-radius: var(--ui-radius-lg);
		padding: var(--ui-space-4);
		margin-bottom: var(--ui-space-4);
		border: 1px solid var(--color-border);
	}

	.transcription-settings h3 {
		margin: 0 0 var(--ui-space-3) 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
	}

	.settings-grid {
		display: grid;
		grid-template-columns: 200px 200px 1fr;
		gap: var(--ui-space-4);
		align-items: start;
	}

	.setting-group {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
	}

	.setting-group.full-width {
		grid-column: 1 / -1;
	}

	.setting-group label {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.setting-group select,
	.setting-group textarea {
		padding: var(--ui-space-2) var(--ui-space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-family-base);
		font-size: var(--font-size-sm);
	}

	.setting-group select:disabled,
	.setting-group textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.setting-group select:focus,
	.setting-group textarea:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 0;
	}

	.setting-group textarea {
		resize: vertical;
		min-height: 60px;
		font-family: var(--font-family-mono);
		line-height: 1.5;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
		cursor: pointer;
		padding: var(--ui-space-2) 0;
	}

	.checkbox-label input[type='checkbox'] {
		cursor: pointer;
		width: 18px;
		height: 18px;
	}

	.checkbox-label input[type='checkbox']:disabled {
		cursor: not-allowed;
	}

	.checkbox-label span {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.prompt-active {
		color: var(--color-success);
		font-weight: 600;
	}

	.prompt-default {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.prompt-error {
		color: var(--color-error);
		font-weight: 600;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ui-space-4);
		height: calc(100vh - 300px);
		min-height: 500px;
	}

	.log-panel,
	.transcript-panel {
		display: flex;
		flex-direction: column;
		background: var(--color-bg-secondary);
		border-radius: var(--ui-radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--ui-space-3) var(--ui-space-4);
		background: var(--color-bg-tertiary);
		border-bottom: 1px solid var(--color-border);
	}

	.panel-header h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
	}

	.panel-header .count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-family: var(--font-family-mono);
	}

	.log-container,
	.transcript-container {
		flex: 1;
		overflow-y: auto;
		padding: var(--ui-space-3);
	}

	.log-entry {
		margin-bottom: var(--ui-space-3);
		padding: var(--ui-space-3);
		background: var(--color-bg);
		border-radius: var(--ui-radius-sm);
		border-left: 3px solid;
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
	}

	.log-entry.log-info {
		border-left-color: var(--color-info);
	}

	.log-entry.log-success {
		border-left-color: var(--color-success);
	}

	.log-entry.log-warning {
		border-left-color: var(--color-warning);
	}

	.log-entry.log-error {
		border-left-color: var(--color-error);
		background: rgba(239, 68, 68, 0.05);
	}

	.log-header {
		display: flex;
		gap: var(--ui-space-2);
		margin-bottom: var(--ui-space-2);
		font-size: var(--font-size-xs);
	}

	.log-time {
		color: var(--color-text-muted);
	}

	.log-category {
		color: var(--color-info);
		font-weight: 600;
	}

	.log-type {
		margin-left: auto;
		font-weight: 700;
	}

	.log-entry.log-info .log-type {
		color: var(--color-info);
	}

	.log-entry.log-success .log-type {
		color: var(--color-success);
	}

	.log-entry.log-warning .log-type {
		color: var(--color-warning);
	}

	.log-entry.log-error .log-type {
		color: var(--color-error);
	}

	.log-message {
		color: var(--color-text);
		line-height: 1.5;
	}

	.log-data {
		margin-top: var(--ui-space-2);
		font-size: var(--font-size-xs);
	}

	.log-data summary {
		cursor: pointer;
		color: var(--color-primary);
		user-select: none;
	}

	.log-data summary:hover {
		text-decoration: underline;
	}

	.log-data pre {
		margin-top: var(--ui-space-2);
		padding: var(--ui-space-2);
		background: var(--color-bg-tertiary);
		border-radius: var(--ui-radius-sm);
		overflow-x: auto;
		color: var(--color-text-muted);
	}

	.transcript-segment {
		margin-bottom: var(--ui-space-4);
		padding: var(--ui-space-3);
		background: var(--color-bg);
		border-radius: var(--ui-radius-sm);
		border-left: 3px solid var(--color-primary);
	}

	.transcript-segment.segment-final {
		border-left-color: var(--color-success);
	}

	.transcript-segment.segment-partial {
		border-left-color: var(--color-info);
		background: rgba(59, 130, 246, 0.05);
		animation: pulse-partial 1.5s ease-in-out infinite;
	}

	@keyframes pulse-partial {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.segment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--ui-space-2);
		margin-bottom: var(--ui-space-2);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
	}

	.segment-time {
		color: var(--color-text-muted);
	}

	.segment-source {
		color: var(--color-primary);
		font-weight: 600;
		text-transform: uppercase;
	}

	.audio-controls {
		display: flex;
		gap: var(--ui-space-1);
		margin-left: auto;
	}

	.play-audio-btn,
	.download-audio-btn {
		padding: var(--ui-space-1) var(--ui-space-2);
		font-size: var(--font-size-xs);
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--ui-radius-sm);
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.download-audio-btn {
		background: var(--color-info);
		padding: var(--ui-space-1) var(--ui-space-2);
		min-width: 28px;
	}

	.play-audio-btn:hover,
	.download-audio-btn:hover {
		transform: scale(1.05);
		opacity: 0.9;
	}

	.play-audio-btn:active,
	.download-audio-btn:active {
		transform: scale(0.95);
	}

	.segment-text {
		color: var(--color-text);
		line-height: 1.6;
		font-size: var(--font-size-base);
	}

	.empty-state {
		text-align: center;
		padding: var(--ui-space-6);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.error-message {
		color: var(--color-error);
		font-weight: 600;
	}

	.loading-message {
		color: var(--color-info);
		font-weight: 600;
		animation: pulse 1.5s ease-in-out infinite;
	}

	/* Scrollbar styling */
	.log-container::-webkit-scrollbar,
	.transcript-container::-webkit-scrollbar {
		width: 8px;
	}

	.log-container::-webkit-scrollbar-track,
	.transcript-container::-webkit-scrollbar-track {
		background: var(--color-bg-tertiary);
	}

	.log-container::-webkit-scrollbar-thumb,
	.transcript-container::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 4px;
	}

	.log-container::-webkit-scrollbar-thumb:hover,
	.transcript-container::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-muted);
	}
</style>
