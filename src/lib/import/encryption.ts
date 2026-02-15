/**
 * Ephemeral key management for import jobs
 *
 * This module manages temporary encryption keys for import jobs stored in sessionStorage.
 * Keys are automatically cleared on logout or browser close, ensuring medical files
 * cached in IndexedDB remain encrypted and inaccessible without the ephemeral key.
 */

import { prepareKey, exportKey, importKey, encrypt, decrypt } from '$lib/encryption/aes'

const STORAGE_KEY = 'mediqom_import_job_keys'

/**
 * Storage structure for job keys in sessionStorage
 */
interface JobKeysStore {
	[jobId: string]: string // base64-encoded AES key
}

/**
 * Get all job keys from sessionStorage
 */
function getJobKeysStore(): JobKeysStore {
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY)
		return stored ? JSON.parse(stored) : {}
	} catch (error) {
		console.error('Failed to parse job keys from sessionStorage:', error)
		return {}
	}
}

/**
 * Save job keys to sessionStorage
 */
function setJobKeysStore(store: JobKeysStore): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
	} catch (error) {
		console.error('Failed to save job keys to sessionStorage:', error)
		throw new Error('Failed to store encryption key')
	}
}

/**
 * Generate a new AES-256-GCM key for a job
 * @param jobId - Unique job identifier
 * @returns Base64-encoded encryption key
 */
export async function generateJobKey(jobId: string): Promise<string> {
	const cryptoKey = await prepareKey()
	const keyString = await exportKey(cryptoKey)
	return keyString
}

/**
 * Store a job encryption key in sessionStorage
 * @param jobId - Unique job identifier
 * @param key - Base64-encoded encryption key
 */
export async function storeJobKey(jobId: string, key: string): Promise<void> {
	const store = getJobKeysStore()
	store[jobId] = key
	setJobKeysStore(store)
}

/**
 * Retrieve a job encryption key from sessionStorage
 * @param jobId - Unique job identifier
 * @returns Base64-encoded encryption key or null if not found
 */
export async function getJobKey(jobId: string): Promise<string | null> {
	const store = getJobKeysStore()
	return store[jobId] || null
}

/**
 * Clear a specific job encryption key from sessionStorage
 * @param jobId - Unique job identifier
 */
export async function clearJobKey(jobId: string): Promise<void> {
	const store = getJobKeysStore()
	delete store[jobId]
	setJobKeysStore(store)
}

/**
 * Clear all job encryption keys from sessionStorage
 * Should be called on logout or when clearing all import data
 */
export async function clearAllJobKeys(): Promise<void> {
	try {
		sessionStorage.removeItem(STORAGE_KEY)
	} catch (error) {
		console.error('Failed to clear job keys from sessionStorage:', error)
	}
}

/**
 * Encrypt a file's ArrayBuffer for cache storage
 * @param file - File data as ArrayBuffer
 * @param key - CryptoKey for encryption
 * @returns Base64-encoded encrypted data with IV
 */
export async function encryptFile(file: ArrayBuffer, key: CryptoKey): Promise<string> {
	try {
		// Convert ArrayBuffer to base64 string for encryption
		const base64 = arrayBufferToBase64(file)
		const encrypted = await encrypt(key, base64)
		return encrypted
	} catch (error) {
		console.error('Failed to encrypt file:', error)
		throw new Error('File encryption failed')
	}
}

/**
 * Decrypt a file from cache storage
 * @param encryptedData - Base64-encoded encrypted data with IV
 * @param key - CryptoKey for decryption
 * @returns Decrypted file as ArrayBuffer
 */
export async function decryptFile(
	encryptedData: string,
	key: CryptoKey
): Promise<ArrayBuffer> {
	try {
		const decrypted = await decrypt(key, encryptedData)
		// Convert base64 back to ArrayBuffer
		const arrayBuffer = base64ToArrayBuffer(decrypted)
		return arrayBuffer
	} catch (error) {
		console.error('Failed to decrypt file:', error)
		throw new Error('File decryption failed - key may be invalid or data corrupted')
	}
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = ''
	const bytes = new Uint8Array(buffer)
	const len = bytes.byteLength
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64)
	const len = binaryString.length
	const bytes = new Uint8Array(len)
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes.buffer
}
