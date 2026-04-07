<script lang="ts">
	// Layer 1: AES
	import {
		prepareKey as aesGenerateKey,
		exportKey as aesExportKey,
		importKey as aesImportKey,
		encrypt as aesEncrypt,
		decrypt as aesDecrypt
	} from '$lib/encryption/aes';
	// Layer 2: RSA
	import {
		encrypt as rsaEncrypt,
		decrypt as rsaDecrypt,
		keyToPEM,
		pemToKey
	} from '$lib/encryption/rsa';
	// Layer 3: KEM
	import {
		generateKemKeyPair,
		kemEncapsulate,
		kemDecapsulate,
		serializeKemKey
	} from '$lib/encryption/kem';
	// Layer 4: Hybrid
	import { hybridWrapKey, hybridUnwrapKey, isHybridWrappedKey } from '$lib/encryption/hybrid';
	// Layer 5: Passphrase
	import {
		encryptString,
		decryptString,
		generatePassphrase
	} from '$lib/encryption/passphrase';
	// Layer 6: Passkey PRF
	import {
		checkPasskeyPRFSupport,
		createPasskeyWithPRF,
		authenticateWithPasskeyPRF,
		encryptWithPRFKey,
		decryptWithPRFKey
	} from '$lib/encryption/passkey-prf';
	import type { PasskeyPRFSupport, PasskeyCredential } from '$lib/encryption/passkey-prf';
	// Layer 7: Recovery
	import {
		generateRecoveryKey,
		encryptWithRecoveryKey,
		recoverPrivateKey,
		hashRecoveryKey,
		verifyRecoveryKeyHash
	} from '$lib/encryption/recovery';

	// ── Helpers ──────────────────────────────────────────────────

	async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
		const start = performance.now();
		const result = await fn();
		return { result, ms: Math.round((performance.now() - start) * 100) / 100 };
	}

	function uint8ToHex(arr: Uint8Array, max = 32): string {
		const hex = Array.from(arr.slice(0, max), (b) => b.toString(16).padStart(2, '0')).join(' ');
		return arr.length > max ? hex + ` ... (${arr.length} bytes)` : hex;
	}

	// ── Layer 1: AES State ──────────────────────────────────────

	let aes = $state({
		plaintext: 'Hello, World! This is a test message for AES encryption.',
		keyBase64: '',
		key: null as CryptoKey | null,
		ciphertext: '',
		decrypted: '',
		error: '',
		timing: { generate: 0, encrypt: 0, decrypt: 0 }
	});

	async function aesGenerate() {
		aes.error = '';
		try {
			const { result: key, ms } = await timed(aesGenerateKey);
			aes.key = key;
			aes.keyBase64 = await aesExportKey(key);
			aes.timing.generate = ms;
		} catch (e: any) { aes.error = e.message; }
	}

	async function aesImport() {
		aes.error = '';
		try {
			aes.key = await aesImportKey(aes.keyBase64);
		} catch (e: any) { aes.error = e.message; }
	}

	async function aesDoEncrypt() {
		aes.error = '';
		if (!aes.key) { aes.error = 'Generate or import a key first'; return; }
		try {
			const { result, ms } = await timed(() => aesEncrypt(aes.key!, aes.plaintext));
			aes.ciphertext = result;
			aes.timing.encrypt = ms;
		} catch (e: any) { aes.error = e.message; }
	}

	async function aesDoDecrypt() {
		aes.error = '';
		if (!aes.key) { aes.error = 'Generate or import a key first'; return; }
		try {
			const { result, ms } = await timed(() => aesDecrypt(aes.key!, aes.ciphertext));
			aes.decrypted = result;
			aes.timing.decrypt = ms;
		} catch (e: any) { aes.error = e.message; }
	}

	// ── Layer 2: RSA State ──────────────────────────────────────

	let rsa = $state({
		publicKey: null as CryptoKey | null,
		privateKey: null as CryptoKey | null,
		publicPEM: '',
		privatePEM: '',
		plaintext: 'Hello RSA! Testing asymmetric encryption.',
		ciphertext: '',
		decrypted: '',
		generating: false,
		error: '',
		timing: { generate: 0, encrypt: 0, decrypt: 0 }
	});

	async function rsaGenerate() {
		rsa.error = '';
		rsa.generating = true;
		try {
			const { result: keyPair, ms } = await timed(() =>
				crypto.subtle.generateKey(
					{ name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
					true,
					['encrypt', 'decrypt']
				)
			);
			rsa.publicKey = keyPair.publicKey;
			rsa.privateKey = keyPair.privateKey;
			rsa.publicPEM = await keyToPEM(keyPair.publicKey, false);
			rsa.privatePEM = await keyToPEM(keyPair.privateKey, true);
			rsa.timing.generate = ms;
		} catch (e: any) { rsa.error = e.message; }
		rsa.generating = false;
	}

	async function rsaDoEncrypt() {
		rsa.error = '';
		if (!rsa.publicKey) { rsa.error = 'Generate a keypair first'; return; }
		try {
			const { result, ms } = await timed(() => rsaEncrypt(rsa.publicKey!, rsa.plaintext));
			rsa.ciphertext = result;
			rsa.timing.encrypt = ms;
		} catch (e: any) { rsa.error = e.message; }
	}

	async function rsaDoDecrypt() {
		rsa.error = '';
		if (!rsa.privateKey) { rsa.error = 'Generate a keypair first'; return; }
		try {
			const { result, ms } = await timed(() => rsaDecrypt(rsa.privateKey!, rsa.ciphertext));
			rsa.decrypted = result;
			rsa.timing.decrypt = ms;
		} catch (e: any) { rsa.error = e.message; }
	}

	// ── Layer 3: KEM State ──────────────────────────────────────

	let kem = $state({
		publicKey: null as Uint8Array | null,
		secretKey: null as Uint8Array | null,
		publicKeySerialized: '',
		secretKeySerialized: '',
		ciphertext: null as Uint8Array | null,
		ciphertextHex: '',
		senderSecret: null as Uint8Array | null,
		senderSecretHex: '',
		receiverSecret: null as Uint8Array | null,
		receiverSecretHex: '',
		match: null as boolean | null,
		error: '',
		timing: { generate: 0, encapsulate: 0, decapsulate: 0 }
	});

	async function kemGenerate() {
		kem.error = '';
		try {
			const { result, ms } = await timed(generateKemKeyPair);
			kem.publicKey = result.publicKey;
			kem.secretKey = result.secretKey;
			kem.publicKeySerialized = serializeKemKey(result.publicKey);
			kem.secretKeySerialized = serializeKemKey(result.secretKey);
			kem.timing.generate = ms;
		} catch (e: any) { kem.error = e.message; }
	}

	async function kemDoEncapsulate() {
		kem.error = '';
		if (!kem.publicKey) { kem.error = 'Generate a keypair first'; return; }
		try {
			const { result, ms } = await timed(() => kemEncapsulate(kem.publicKey!));
			kem.ciphertext = result.ciphertext;
			kem.senderSecret = result.sharedSecret;
			kem.ciphertextHex = uint8ToHex(result.ciphertext);
			kem.senderSecretHex = uint8ToHex(result.sharedSecret, 64);
			kem.timing.encapsulate = ms;
			kem.match = null;
		} catch (e: any) { kem.error = e.message; }
	}

	async function kemDoDecapsulate() {
		kem.error = '';
		if (!kem.secretKey || !kem.ciphertext) { kem.error = 'Encapsulate first'; return; }
		try {
			const { result, ms } = await timed(() => kemDecapsulate(kem.ciphertext!, kem.secretKey!));
			kem.receiverSecret = result;
			kem.receiverSecretHex = uint8ToHex(result, 64);
			kem.timing.decapsulate = ms;
			kem.match = kem.senderSecret!.length === result.length &&
				kem.senderSecret!.every((v, i) => v === result[i]);
		} catch (e: any) { kem.error = e.message; }
	}

	// ── Layer 4: Hybrid State ───────────────────────────────────

	let hybrid = $state({
		rsaPublicKey: null as CryptoKey | null,
		rsaPrivateKey: null as CryptoKey | null,
		kemPublicKey: null as Uint8Array | null,
		kemSecretKey: null as Uint8Array | null,
		aesKeyBase64: '',
		wrappedKey: '',
		unwrappedKey: '',
		isHybrid: null as boolean | null,
		match: null as boolean | null,
		generating: false,
		error: '',
		timing: { generate: 0, wrap: 0, unwrap: 0 }
	});

	async function hybridGenerate() {
		hybrid.error = '';
		hybrid.generating = true;
		try {
			const { result, ms } = await timed(async () => {
				const rsaKeyPair = await crypto.subtle.generateKey(
					{ name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
					true, ['encrypt', 'decrypt']
				);
				const kemKeys = await generateKemKeyPair();
				const aesKey = await aesGenerateKey();
				const aesKeyB64 = await aesExportKey(aesKey);
				return { rsaKeyPair, kemKeys, aesKeyB64 };
			});
			hybrid.rsaPublicKey = result.rsaKeyPair.publicKey;
			hybrid.rsaPrivateKey = result.rsaKeyPair.privateKey;
			hybrid.kemPublicKey = result.kemKeys.publicKey;
			hybrid.kemSecretKey = result.kemKeys.secretKey;
			hybrid.aesKeyBase64 = result.aesKeyB64;
			hybrid.timing.generate = ms;
		} catch (e: any) { hybrid.error = e.message; }
		hybrid.generating = false;
	}

	async function hybridDoWrap() {
		hybrid.error = '';
		if (!hybrid.rsaPublicKey || !hybrid.kemPublicKey) { hybrid.error = 'Generate keys first'; return; }
		try {
			const { result, ms } = await timed(() =>
				hybridWrapKey(hybrid.rsaPublicKey!, hybrid.kemPublicKey!, hybrid.aesKeyBase64)
			);
			hybrid.wrappedKey = result;
			hybrid.isHybrid = isHybridWrappedKey(result);
			hybrid.timing.wrap = ms;
			hybrid.match = null;
		} catch (e: any) { hybrid.error = e.message; }
	}

	async function hybridDoUnwrap() {
		hybrid.error = '';
		if (!hybrid.rsaPrivateKey || !hybrid.kemSecretKey || !hybrid.wrappedKey) { hybrid.error = 'Wrap a key first'; return; }
		try {
			const { result, ms } = await timed(() =>
				hybridUnwrapKey(hybrid.rsaPrivateKey!, hybrid.kemSecretKey!, hybrid.wrappedKey)
			);
			hybrid.unwrappedKey = result;
			hybrid.timing.unwrap = ms;
			hybrid.match = result === hybrid.aesKeyBase64;
		} catch (e: any) { hybrid.error = e.message; }
	}

	// ── Layer 5: Passphrase State ───────────────────────────────

	let pass = $state({
		passphrase: '',
		plaintext: 'Secret data protected by a passphrase.',
		ciphertext: '',
		decrypted: '',
		error: '',
		timing: { encrypt: 0, decrypt: 0 }
	});

	function passGenerate() {
		pass.passphrase = generatePassphrase();
	}

	async function passDoEncrypt() {
		pass.error = '';
		if (!pass.passphrase) { pass.error = 'Enter a passphrase'; return; }
		try {
			const { result, ms } = await timed(() => encryptString(pass.plaintext, pass.passphrase));
			pass.ciphertext = result;
			pass.timing.encrypt = ms;
		} catch (e: any) { pass.error = e.message; }
	}

	async function passDoDecrypt() {
		pass.error = '';
		if (!pass.passphrase) { pass.error = 'Enter a passphrase'; return; }
		try {
			const { result, ms } = await timed(() => decryptString(pass.ciphertext, pass.passphrase));
			pass.decrypted = result;
			pass.timing.decrypt = ms;
		} catch (e: any) { pass.error = e.message; }
	}

	// ── Layer 6: Passkey PRF State ──────────────────────────────

	let passkey = $state({
		support: null as PasskeyPRFSupport | null,
		credential: null as PasskeyCredential | null,
		derivedKey: null as CryptoKey | null,
		plaintext: 'Data encrypted with passkey-derived key.',
		ciphertext: '',
		decrypted: '',
		error: '',
		timing: { check: 0, create: 0, encrypt: 0, auth: 0, decrypt: 0 }
	});

	async function passkeyCheckSupport() {
		passkey.error = '';
		try {
			const { result, ms } = await timed(checkPasskeyPRFSupport);
			passkey.support = result;
			passkey.timing.check = ms;
		} catch (e: any) { passkey.error = e.message; }
	}

	async function passkeyCreate() {
		passkey.error = '';
		try {
			const testId = crypto.randomUUID();
			const { result, ms } = await timed(() =>
				createPasskeyWithPRF(testId, 'test@encryption-test.local', 'Encryption Test')
			);
			passkey.credential = result.credential;
			passkey.derivedKey = result.derivedKey;
			passkey.timing.create = ms;
		} catch (e: any) { passkey.error = e.message; }
	}

	async function passkeyDoEncrypt() {
		passkey.error = '';
		if (!passkey.derivedKey) { passkey.error = 'Create a passkey first'; return; }
		try {
			const { result, ms } = await timed(() => encryptWithPRFKey(passkey.plaintext, passkey.derivedKey!));
			passkey.ciphertext = result;
			passkey.timing.encrypt = ms;
		} catch (e: any) { passkey.error = e.message; }
	}

	async function passkeyAuthAndDecrypt() {
		passkey.error = '';
		if (!passkey.credential || !passkey.ciphertext) { passkey.error = 'Create passkey and encrypt first'; return; }
		try {
			const { result: key, ms: authMs } = await timed(() =>
				authenticateWithPasskeyPRF(passkey.credential!.credentialId, passkey.credential!.prfSalt)
			);
			passkey.timing.auth = authMs;
			const { result: decrypted, ms: decMs } = await timed(() => decryptWithPRFKey(passkey.ciphertext, key));
			passkey.decrypted = decrypted;
			passkey.timing.decrypt = decMs;
		} catch (e: any) { passkey.error = e.message; }
	}

	// ── Layer 7: Recovery State ─────────────────────────────────

	let recovery = $state({
		recoveryKey: '',
		hash: '',
		plaintext: 'Private key material to protect with recovery key.',
		ciphertext: '',
		decrypted: '',
		hashVerified: null as boolean | null,
		error: '',
		timing: { generate: 0, hash: 0, encrypt: 0, decrypt: 0, verify: 0 }
	});

	function recoveryGenerate() {
		recovery.recoveryKey = generateRecoveryKey();
		recovery.hashVerified = null;
	}

	async function recoveryDoHash() {
		recovery.error = '';
		try {
			const { result, ms } = await timed(() => hashRecoveryKey(recovery.recoveryKey));
			recovery.hash = result;
			recovery.timing.hash = ms;
		} catch (e: any) { recovery.error = e.message; }
	}

	async function recoveryDoEncrypt() {
		recovery.error = '';
		if (!recovery.recoveryKey) { recovery.error = 'Generate a recovery key first'; return; }
		try {
			const { result, ms } = await timed(() => encryptWithRecoveryKey(recovery.plaintext, recovery.recoveryKey));
			recovery.ciphertext = result;
			recovery.timing.encrypt = ms;
		} catch (e: any) { recovery.error = e.message; }
	}

	async function recoveryDoDecrypt() {
		recovery.error = '';
		if (!recovery.recoveryKey || !recovery.ciphertext) { recovery.error = 'Encrypt first'; return; }
		try {
			const { result, ms } = await timed(() => recoverPrivateKey(recovery.ciphertext, recovery.recoveryKey));
			recovery.decrypted = result;
			recovery.timing.decrypt = ms;
		} catch (e: any) { recovery.error = e.message; }
	}

	async function recoveryDoVerify() {
		recovery.error = '';
		if (!recovery.hash) { recovery.error = 'Hash the key first'; return; }
		try {
			const { result, ms } = await timed(() => verifyRecoveryKeyHash(recovery.recoveryKey, recovery.hash));
			recovery.hashVerified = result;
			recovery.timing.verify = ms;
		} catch (e: any) { recovery.error = e.message; }
	}

	// ── Layer 8: Full Pipeline State ────────────────────────────

	interface PipelineStep {
		name: string;
		status: 'pending' | 'running' | 'done' | 'error';
		ms: number;
		output: string;
	}

	type PipelineMode = 'passphrase' | 'passkey';

	let pipeline = $state({
		mode: 'passphrase' as PipelineMode,
		passphrase: '',
		plaintext: 'This is a full end-to-end encryption pipeline test.',
		steps: [] as PipelineStep[],
		running: false,
		error: ''
	});

	async function pipelineRun() {
		pipeline.error = '';
		pipeline.running = true;
		const usePasskey = pipeline.mode === 'passkey';

		if (!usePasskey && !pipeline.passphrase) pipeline.passphrase = generatePassphrase();

		const protectLabel = usePasskey ? 'passkey PRF' : 'passphrase';
		pipeline.steps = [
			{ name: '1. Generate AES document key', status: 'pending', ms: 0, output: '' },
			{ name: '2. Encrypt plaintext with AES', status: 'pending', ms: 0, output: '' },
			{ name: '3. Generate RSA-4096 keypair', status: 'pending', ms: 0, output: '' },
			{ name: '4. Generate ML-KEM-768 keypair', status: 'pending', ms: 0, output: '' },
			{ name: '5. Hybrid-wrap AES key', status: 'pending', ms: 0, output: '' },
			{ name: `6. Encrypt RSA private key with ${protectLabel}`, status: 'pending', ms: 0, output: '' },
			{ name: `7. Encrypt KEM secret key with ${protectLabel}`, status: 'pending', ms: 0, output: '' },
			{ name: `8. Decrypt KEM secret key with ${protectLabel}`, status: 'pending', ms: 0, output: '' },
			{ name: `9. Decrypt RSA private key with ${protectLabel}`, status: 'pending', ms: 0, output: '' },
			{ name: '10. Hybrid-unwrap AES key', status: 'pending', ms: 0, output: '' },
			{ name: '11. Decrypt document with AES', status: 'pending', ms: 0, output: '' },
		];
		if (usePasskey) {
			pipeline.steps.splice(5, 0, { name: '5b. Create passkey & derive PRF key', status: 'pending', ms: 0, output: '' });
		}

		// Helper to update a step and flush reactivity
		function step(si: number, update: Partial<PipelineStep>) {
			pipeline.steps[si] = { ...pipeline.steps[si], ...update };
		}

		// Track step index — offset shifts after passkey insertion
		let si = 0;

		try {
			// Step 1: Generate AES key
			step(si, { status: 'running' });
			const { result: docKey, ms: ms1 } = await timed(aesGenerateKey);
			const docKeyB64 = await aesExportKey(docKey);
			step(si, { status: 'done', ms: ms1, output: `Key: ${docKeyB64.slice(0, 20)}...` });
			si++;

			// Step 2: Encrypt plaintext
			step(si, { status: 'running' });
			const { result: encDoc, ms: ms2 } = await timed(() => aesEncrypt(docKey, pipeline.plaintext));
			step(si, { status: 'done', ms: ms2, output: `Ciphertext: ${encDoc.slice(0, 40)}... (${encDoc.length} chars)` });
			si++;

			// Step 3: Generate RSA keypair
			step(si, { status: 'running' });
			const { result: rsaKp, ms: ms3 } = await timed(() =>
				crypto.subtle.generateKey(
					{ name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
					true, ['encrypt', 'decrypt']
				)
			);
			const rsaPubPEM = await keyToPEM(rsaKp.publicKey, false);
			const rsaPrivPEM = await keyToPEM(rsaKp.privateKey, true);
			step(si, { status: 'done', ms: ms3, output: `RSA-4096 keypair generated (pub: ${rsaPubPEM.length} chars)` });
			si++;

			// Step 4: Generate KEM keypair
			step(si, { status: 'running' });
			const { result: kemKp, ms: ms4 } = await timed(generateKemKeyPair);
			const kemSecSerialized = serializeKemKey(kemKp.secretKey);
			step(si, { status: 'done', ms: ms4, output: `ML-KEM-768 keypair (pub: ${kemKp.publicKey.length}B, sec: ${kemKp.secretKey.length}B)` });
			si++;

			// Step 5: Hybrid wrap
			step(si, { status: 'running' });
			const { result: wrapped, ms: ms5 } = await timed(() =>
				hybridWrapKey(rsaKp.publicKey, kemKp.publicKey, docKeyB64)
			);
			step(si, { status: 'done', ms: ms5, output: `Wrapped: ${wrapped.slice(0, 40)}... (hybrid: ${isHybridWrappedKey(wrapped)})` });
			si++;

			// ── Passkey path: create passkey and derive PRF key ──
			let prfKey: CryptoKey | null = null;
			let prfCredentialId = '';
			let prfSalt = '';

			if (usePasskey) {
				step(si, { status: 'running' });
				const testId = crypto.randomUUID();
				const { result: authResult, ms: msPasskey } = await timed(() =>
					createPasskeyWithPRF(testId, 'pipeline-test@encryption-test.local', 'Pipeline Test')
				);
				prfKey = authResult.derivedKey;
				prfCredentialId = authResult.credential.credentialId;
				prfSalt = authResult.credential.prfSalt;
				step(si, { status: 'done', ms: msPasskey, output: `Passkey created, PRF key derived (credential: ${prfCredentialId.slice(0, 16)}...)` });
				si++;
			}

			// Step 6: Encrypt RSA private key
			step(si, { status: 'running' });
			let encRsaPriv: string;
			if (usePasskey) {
				const { result, ms } = await timed(() => encryptWithPRFKey(rsaPrivPEM, prfKey!));
				encRsaPriv = result;
				step(si, { status: 'done', ms, output: `Encrypted RSA priv: ${encRsaPriv.length} chars (passkey PRF)` });
			} else {
				const { result, ms } = await timed(() => encryptString(rsaPrivPEM, pipeline.passphrase));
				encRsaPriv = result;
				step(si, { status: 'done', ms, output: `Encrypted RSA priv: ${encRsaPriv.length} chars (PBKDF2 300k iter)` });
			}
			si++;

			// Step 7: Encrypt KEM secret key
			step(si, { status: 'running' });
			let encKemSec: string;
			if (usePasskey) {
				const { result, ms } = await timed(() => encryptWithPRFKey(kemSecSerialized, prfKey!));
				encKemSec = result;
				step(si, { status: 'done', ms, output: `Encrypted KEM sec: ${encKemSec.length} chars (passkey PRF)` });
			} else {
				const { result, ms } = await timed(() => encryptString(kemSecSerialized, pipeline.passphrase));
				encKemSec = result;
				step(si, { status: 'done', ms, output: `Encrypted KEM sec: ${encKemSec.length} chars` });
			}
			si++;

			// === REVERSE ===

			// Re-derive PRF key via authentication for the decrypt side
			let decryptPrfKey: CryptoKey | null = null;
			if (usePasskey) {
				// Show feedback that re-authentication is happening
				step(si, { status: 'running', output: 'Waiting for passkey re-authentication...' });
				const { result: reAuthKey } = await timed(() =>
					authenticateWithPasskeyPRF(prfCredentialId, prfSalt)
				);
				decryptPrfKey = reAuthKey;
			}

			// Step 8: Decrypt KEM secret key
			step(si, { status: 'running' });
			let decKemSec: string;
			if (usePasskey) {
				const { result, ms } = await timed(() => decryptWithPRFKey(encKemSec, decryptPrfKey!));
				decKemSec = result;
				step(si, { status: 'done', ms, output: `KEM secret recovered (match: ${decKemSec === kemSecSerialized})` });
			} else {
				const { result, ms } = await timed(() => decryptString(encKemSec, pipeline.passphrase));
				decKemSec = result;
				step(si, { status: 'done', ms, output: `KEM secret recovered (match: ${decKemSec === kemSecSerialized})` });
			}
			si++;

			// Step 9: Decrypt RSA private key
			step(si, { status: 'running' });
			let decRsaPriv: string;
			if (usePasskey) {
				const { result, ms } = await timed(() => decryptWithPRFKey(encRsaPriv, decryptPrfKey!));
				decRsaPriv = result;
				step(si, { ms });
			} else {
				const { result, ms } = await timed(() => decryptString(encRsaPriv, pipeline.passphrase));
				decRsaPriv = result;
				step(si, { ms });
			}
			const recoveredPrivKey = await pemToKey(decRsaPriv, true);
			step(si, { status: 'done', output: `RSA private key recovered (match: ${decRsaPriv === rsaPrivPEM})` });
			si++;

			// Step 10: Hybrid unwrap
			step(si, { status: 'running' });
			const { result: unwrapped, ms: ms10 } = await timed(() => {
				const kemSecBytes = new Uint8Array(
					atob(decKemSec.replace('mlkem768:', '')).split('').map(c => c.charCodeAt(0))
				);
				return hybridUnwrapKey(recoveredPrivKey, kemSecBytes, wrapped);
			});
			step(si, { status: 'done', ms: ms10, output: `AES key recovered (match: ${unwrapped === docKeyB64})` });
			si++;

			// Step 11: Decrypt document
			step(si, { status: 'running' });
			const recoveredDocKey = await aesImportKey(unwrapped);
			const { result: decDoc, ms: ms11 } = await timed(() => aesDecrypt(recoveredDocKey, encDoc));
			step(si, { status: 'done', ms: ms11, output: `Decrypted: "${decDoc}" (match: ${decDoc === pipeline.plaintext})` });

		} catch (e: any) {
			const runningIdx = pipeline.steps.findIndex(s => s.status === 'running');
			if (runningIdx >= 0) {
				step(runningIdx, { status: 'error', output: e.message });
			}
			pipeline.error = e.message;
		}
		pipeline.running = false;
	}
</script>

<div class="encryption-test">
	<div class="encryption-test-container">
	<header>
		<h1>Encryption Layer Test Console</h1>
		<p>Interactive testing for each encryption layer. All keys are generated in-memory.</p>
	</header>

	<!-- Layer 1: AES -->
	<details open>
		<summary>Layer 1: AES-256-GCM <span class="layer-desc">Document encryption</span></summary>
		<div class="panel">
			<div class="field">
				<label>Plaintext</label>
				<textarea class="input" bind:value={aes.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button -primary" onclick={aesGenerate}>Generate Key</button>
				<button class="button" onclick={aesImport} disabled={!aes.keyBase64}>Import Key</button>
				<button class="button" onclick={aesDoEncrypt} disabled={!aes.key}>Encrypt</button>
				<button class="button" onclick={aesDoDecrypt} disabled={!aes.key || !aes.ciphertext}>Decrypt</button>
			</div>
			<div class="field">
				<label>AES Key (Base64) {#if aes.timing.generate}<span class="timing">{aes.timing.generate}ms</span>{/if}</label>
				<input class="input mono" bind:value={aes.keyBase64} placeholder="Generate or paste a Base64 AES key" />
			</div>
			{#if aes.ciphertext}
				<div class="field">
					<label>Ciphertext {#if aes.timing.encrypt}<span class="timing">{aes.timing.encrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="3">{aes.ciphertext}</textarea>
				</div>
			{/if}
			{#if aes.decrypted}
				<div class="field">
					<label>Decrypted {#if aes.timing.decrypt}<span class="timing">{aes.timing.decrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{aes.decrypted}</textarea>
				</div>
			{/if}
			{#if aes.error}<p class="error">{aes.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 2: RSA -->
	<details>
		<summary>Layer 2: RSA-4096-OAEP <span class="layer-desc">Asymmetric wrapping (max ~446 bytes plaintext)</span></summary>
		<div class="panel">
			<div class="field">
				<label>Plaintext</label>
				<textarea class="input" bind:value={rsa.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button -primary" onclick={rsaGenerate} disabled={rsa.generating}>
					{rsa.generating ? 'Generating...' : 'Generate Keypair'}
				</button>
				<button class="button" onclick={rsaDoEncrypt} disabled={!rsa.publicKey}>Encrypt</button>
				<button class="button" onclick={rsaDoDecrypt} disabled={!rsa.privateKey || !rsa.ciphertext}>Decrypt</button>
			</div>
			{#if rsa.publicPEM}
				<div class="field">
					<label>Public Key (PEM) {#if rsa.timing.generate}<span class="timing">{rsa.timing.generate}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="4">{rsa.publicPEM}</textarea>
				</div>
				<div class="field">
					<label>Private Key (PEM)</label>
					<textarea class="input mono" readonly rows="4">{rsa.privatePEM}</textarea>
				</div>
			{/if}
			{#if rsa.ciphertext}
				<div class="field">
					<label>Ciphertext {#if rsa.timing.encrypt}<span class="timing">{rsa.timing.encrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="3">{rsa.ciphertext}</textarea>
				</div>
			{/if}
			{#if rsa.decrypted}
				<div class="field">
					<label>Decrypted {#if rsa.timing.decrypt}<span class="timing">{rsa.timing.decrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{rsa.decrypted}</textarea>
				</div>
			{/if}
			{#if rsa.error}<p class="error">{rsa.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 3: ML-KEM -->
	<details>
		<summary>Layer 3: ML-KEM-768 <span class="layer-desc">Post-quantum key encapsulation</span></summary>
		<div class="panel">
			<div class="actions">
				<button class="button -primary" onclick={kemGenerate}>Generate Keypair</button>
				<button class="button" onclick={kemDoEncapsulate} disabled={!kem.publicKey}>Encapsulate</button>
				<button class="button" onclick={kemDoDecapsulate} disabled={!kem.ciphertext}>Decapsulate</button>
			</div>
			{#if kem.publicKeySerialized}
				<div class="field">
					<label>Public Key {#if kem.timing.generate}<span class="timing">{kem.timing.generate}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{kem.publicKeySerialized.slice(0, 80)}... ({kem.publicKey?.length}B)</textarea>
				</div>
				<div class="field">
					<label>Secret Key</label>
					<textarea class="input mono" readonly rows="2">{kem.secretKeySerialized.slice(0, 80)}... ({kem.secretKey?.length}B)</textarea>
				</div>
			{/if}
			{#if kem.ciphertextHex}
				<div class="field">
					<label>Ciphertext {#if kem.timing.encapsulate}<span class="timing">{kem.timing.encapsulate}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{kem.ciphertextHex}</textarea>
				</div>
				<div class="field">
					<label>Sender Shared Secret (32 bytes)</label>
					<textarea class="input mono" readonly rows="1">{kem.senderSecretHex}</textarea>
				</div>
			{/if}
			{#if kem.receiverSecretHex}
				<div class="field">
					<label>Receiver Shared Secret {#if kem.timing.decapsulate}<span class="timing">{kem.timing.decapsulate}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="1">{kem.receiverSecretHex}</textarea>
				</div>
				{#if kem.match !== null}
					<p class={kem.match ? 'success' : 'error'}>
						Shared secrets {kem.match ? 'MATCH' : 'DO NOT MATCH'}
					</p>
				{/if}
			{/if}
			{#if kem.error}<p class="error">{kem.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 4: Hybrid -->
	<details>
		<summary>Layer 4: Hybrid Wrapping <span class="layer-desc">RSA + ML-KEM combined</span></summary>
		<div class="panel">
			<div class="actions">
				<button class="button -primary" onclick={hybridGenerate} disabled={hybrid.generating}>
					{hybrid.generating ? 'Generating...' : 'Generate All Keys'}
				</button>
				<button class="button" onclick={hybridDoWrap} disabled={!hybrid.rsaPublicKey}>Wrap AES Key</button>
				<button class="button" onclick={hybridDoUnwrap} disabled={!hybrid.wrappedKey}>Unwrap AES Key</button>
			</div>
			{#if hybrid.aesKeyBase64}
				<div class="field">
					<label>Original AES Key {#if hybrid.timing.generate}<span class="timing">{hybrid.timing.generate}ms</span>{/if}</label>
					<input class="input mono" readonly value={hybrid.aesKeyBase64} />
				</div>
			{/if}
			{#if hybrid.wrappedKey}
				<div class="field">
					<label>Wrapped Key {#if hybrid.timing.wrap}<span class="timing">{hybrid.timing.wrap}ms</span>{/if}
						{#if hybrid.isHybrid !== null}<span class="badge">hybrid1: {hybrid.isHybrid}</span>{/if}
					</label>
					<textarea class="input mono" readonly rows="4">{hybrid.wrappedKey}</textarea>
				</div>
			{/if}
			{#if hybrid.unwrappedKey}
				<div class="field">
					<label>Unwrapped AES Key {#if hybrid.timing.unwrap}<span class="timing">{hybrid.timing.unwrap}ms</span>{/if}</label>
					<input class="input mono" readonly value={hybrid.unwrappedKey} />
				</div>
				{#if hybrid.match !== null}
					<p class={hybrid.match ? 'success' : 'error'}>
						Keys {hybrid.match ? 'MATCH' : 'DO NOT MATCH'}
					</p>
				{/if}
			{/if}
			{#if hybrid.error}<p class="error">{hybrid.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 5: Passphrase -->
	<details>
		<summary>Layer 5: Passphrase <span class="layer-desc">PBKDF2-SHA256 (300k iterations)</span></summary>
		<div class="panel">
			<div class="field">
				<label>Passphrase</label>
				<div class="input-row">
					<input class="input" bind:value={pass.passphrase} placeholder="Enter or generate a passphrase" />
					<button class="button" onclick={passGenerate}>Generate</button>
				</div>
			</div>
			<div class="field">
				<label>Plaintext</label>
				<textarea class="input" bind:value={pass.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button -primary" onclick={passDoEncrypt} disabled={!pass.passphrase}>Encrypt</button>
				<button class="button" onclick={passDoDecrypt} disabled={!pass.ciphertext}>Decrypt</button>
			</div>
			{#if pass.ciphertext}
				<div class="field">
					<label>Ciphertext {#if pass.timing.encrypt}<span class="timing">{pass.timing.encrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="3">{pass.ciphertext}</textarea>
				</div>
			{/if}
			{#if pass.decrypted}
				<div class="field">
					<label>Decrypted {#if pass.timing.decrypt}<span class="timing">{pass.timing.decrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{pass.decrypted}</textarea>
				</div>
			{/if}
			{#if pass.error}<p class="error">{pass.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 6: Passkey PRF -->
	<details>
		<summary>Layer 6: Passkey PRF <span class="layer-desc">WebAuthn biometric key derivation</span></summary>
		<div class="panel">
			<p class="warning">This layer triggers system authenticator prompts (Face ID / Touch ID / Windows Hello).</p>
			<div class="field">
				<label>Plaintext</label>
				<textarea class="input" bind:value={passkey.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button" onclick={passkeyCheckSupport}>Check Support</button>
				<button class="button -primary" onclick={passkeyCreate}>Create Passkey</button>
				<button class="button" onclick={passkeyDoEncrypt} disabled={!passkey.derivedKey}>Encrypt</button>
				<button class="button" onclick={passkeyAuthAndDecrypt} disabled={!passkey.credential || !passkey.ciphertext}>
					Auth & Decrypt
				</button>
			</div>
			{#if passkey.support}
				<div class="field">
					<label>Browser Support {#if passkey.timing.check}<span class="timing">{passkey.timing.check}ms</span>{/if}</label>
					<div class="support-grid">
						<span>WebAuthn: <strong class={passkey.support.webauthnSupported ? 'success' : 'error'}>{passkey.support.webauthnSupported}</strong></span>
						<span>PRF: <strong class={passkey.support.prfSupported ? 'success' : 'error'}>{passkey.support.prfSupported}</strong></span>
						<span>Platform Auth: <strong class={passkey.support.platformAuthenticatorAvailable ? 'success' : 'error'}>{passkey.support.platformAuthenticatorAvailable}</strong></span>
					</div>
				</div>
			{/if}
			{#if passkey.credential}
				<div class="field">
					<label>Credential {#if passkey.timing.create}<span class="timing">{passkey.timing.create}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">ID: {passkey.credential.credentialId}
Salt: {passkey.credential.prfSalt}</textarea>
				</div>
			{/if}
			{#if passkey.ciphertext}
				<div class="field">
					<label>Ciphertext {#if passkey.timing.encrypt}<span class="timing">{passkey.timing.encrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{passkey.ciphertext}</textarea>
				</div>
			{/if}
			{#if passkey.decrypted}
				<div class="field">
					<label>Decrypted
						{#if passkey.timing.auth}<span class="timing">auth: {passkey.timing.auth}ms</span>{/if}
						{#if passkey.timing.decrypt}<span class="timing">decrypt: {passkey.timing.decrypt}ms</span>{/if}
					</label>
					<textarea class="input mono" readonly rows="2">{passkey.decrypted}</textarea>
				</div>
			{/if}
			{#if passkey.error}<p class="error">{passkey.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 7: Recovery -->
	<details>
		<summary>Layer 7: Recovery Key <span class="layer-desc">HKDF-SHA256 with 200-bit entropy</span></summary>
		<div class="panel">
			<div class="field">
				<label>Recovery Key</label>
				<div class="input-row">
					<input class="input mono" bind:value={recovery.recoveryKey} placeholder="XXXX-XXXX-XXXX-..." />
					<button class="button" onclick={recoveryGenerate}>Generate</button>
				</div>
			</div>
			<div class="field">
				<label>Plaintext</label>
				<textarea class="input" bind:value={recovery.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button" onclick={recoveryDoHash} disabled={!recovery.recoveryKey}>Hash</button>
				<button class="button -primary" onclick={recoveryDoEncrypt} disabled={!recovery.recoveryKey}>Encrypt</button>
				<button class="button" onclick={recoveryDoDecrypt} disabled={!recovery.ciphertext}>Decrypt</button>
				<button class="button" onclick={recoveryDoVerify} disabled={!recovery.hash}>Verify Hash</button>
			</div>
			{#if recovery.hash}
				<div class="field">
					<label>SHA-256 Hash {#if recovery.timing.hash}<span class="timing">{recovery.timing.hash}ms</span>{/if}</label>
					<input class="input mono" readonly value={recovery.hash} />
				</div>
			{/if}
			{#if recovery.ciphertext}
				<div class="field">
					<label>Ciphertext {#if recovery.timing.encrypt}<span class="timing">{recovery.timing.encrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="3">{recovery.ciphertext}</textarea>
				</div>
			{/if}
			{#if recovery.decrypted}
				<div class="field">
					<label>Decrypted {#if recovery.timing.decrypt}<span class="timing">{recovery.timing.decrypt}ms</span>{/if}</label>
					<textarea class="input mono" readonly rows="2">{recovery.decrypted}</textarea>
				</div>
			{/if}
			{#if recovery.hashVerified !== null}
				<p class={recovery.hashVerified ? 'success' : 'error'}>
					Hash verification: {recovery.hashVerified ? 'PASSED' : 'FAILED'}
					{#if recovery.timing.verify}<span class="timing">{recovery.timing.verify}ms</span>{/if}
				</p>
			{/if}
			{#if recovery.error}<p class="error">{recovery.error}</p>{/if}
		</div>
	</details>

	<!-- Layer 8: Full Pipeline -->
	<details>
		<summary>Layer 8: Full Pipeline <span class="layer-desc">End-to-end encryption roundtrip</span></summary>
		<div class="panel">
			<div class="field">
				<label>Key Protection Method</label>
				<div class="mode-toggle">
					<button
						class="button"
						class:-primary={pipeline.mode === 'passphrase'}
						onclick={() => pipeline.mode = 'passphrase'}
						disabled={pipeline.running}
					>Passphrase (PBKDF2)</button>
					<button
						class="button"
						class:-primary={pipeline.mode === 'passkey'}
						onclick={() => pipeline.mode = 'passkey'}
						disabled={pipeline.running}
					>Passkey PRF (WebAuthn)</button>
				</div>
			</div>
			{#if pipeline.mode === 'passphrase'}
				<div class="field">
					<label>Passphrase (for private key protection)</label>
					<div class="input-row">
						<input class="input" bind:value={pipeline.passphrase} placeholder="Auto-generated if empty" />
						<button class="button" onclick={() => pipeline.passphrase = generatePassphrase()}>Generate</button>
					</div>
				</div>
			{:else}
				<p class="warning">Passkey mode will trigger 2 system authenticator prompts: one to create the passkey, one to re-authenticate for decryption.</p>
			{/if}
			<div class="field">
				<label>Document Plaintext</label>
				<textarea class="input" bind:value={pipeline.plaintext} rows="2"></textarea>
			</div>
			<div class="actions">
				<button class="button -primary" onclick={pipelineRun} disabled={pipeline.running}>
					{pipeline.running ? 'Running...' : `Run Full Pipeline (${pipeline.mode})`}
				</button>
			</div>
			{#if pipeline.steps.length > 0}
				<div class="pipeline-log">
					{#each pipeline.steps as step}
						<div class="pipeline-step" class:done={step.status === 'done'} class:running={step.status === 'running'} class:step-error={step.status === 'error'}>
							<span class="step-icon">
								{#if step.status === 'pending'}&#9711;
								{:else if step.status === 'running'}&#9881;
								{:else if step.status === 'done'}&#10003;
								{:else}&#10007;
								{/if}
							</span>
							<span class="step-name">{step.name}</span>
							{#if step.ms}<span class="timing">{step.ms}ms</span>{/if}
							{#if step.output}<span class="step-output">{step.output}</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if pipeline.error}<p class="error">{pipeline.error}</p>{/if}
		</div>
	</details>
</div>
</div>

<style>
	.encryption-test {
		width: 100vw;
		height: 100vh;
		overflow: auto;

	}
	.encryption-test-container {
		margin: 0 auto;
		padding: var(--ui-pad-large);
		max-width: 900px
	}

	header {
		margin-bottom: var(--ui-pad-xlarge);
	}

	header h1 {
		margin: 0 0 0.25rem;
	}

	header p {
		color: var(--color-text-secondary);
		margin: 0;
	}

	details {
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-medium);
		margin-bottom: var(--ui-pad-medium);
	}

	summary {
		padding: var(--ui-pad-medium);
		cursor: pointer;
		font-weight: 600;
		user-select: none;
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
	}

	.layer-desc {
		font-weight: 400;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.panel {
		padding: 0 var(--ui-pad-medium) var(--ui-pad-medium);
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-medium);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
	}

	.mono {
		font-family: var(--font-face-values);
		font-size: 0.8125rem;
	}

	textarea.input {
		resize: vertical;
	}

	.actions {
		display: flex;
		gap: var(--ui-pad-small);
		flex-wrap: wrap;
	}

	.mode-toggle {
		display: flex;
		gap: 0;
	}

	.mode-toggle .button {
		border-radius: 0;
	}

	.mode-toggle .button:first-child {
		border-radius: var(--ui-radius-small) 0 0 var(--ui-radius-small);
	}

	.mode-toggle .button:last-child {
		border-radius: 0 var(--ui-radius-small) var(--ui-radius-small) 0;
	}

	.input-row {
		display: flex;
		gap: var(--ui-pad-small);
	}

	.input-row .input {
		flex: 1;
	}

	.timing {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-weight: 400;
		background: var(--color-surface);
		padding: 0.1rem 0.4rem;
		border-radius: var(--ui-radius-small);
	}

	.badge {
		font-size: 0.75rem;
		font-weight: 500;
		background: var(--color-primary);
		color: white;
		padding: 0.1rem 0.4rem;
		border-radius: var(--ui-radius-small);
	}

	.error {
		color: var(--color-negative);
		font-size: 0.875rem;
		margin: 0;
	}

	.success {
		color: var(--color-positive);
		font-size: 0.875rem;
		margin: 0;
		font-weight: 600;
	}

	.warning {
		color: var(--color-warning);
		font-size: 0.875rem;
		margin: 0;
		padding: var(--ui-pad-small);
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border-radius: var(--ui-radius-small);
	}

	.support-grid {
		display: flex;
		gap: var(--ui-pad-large);
		font-size: 0.875rem;
	}

	/* Pipeline */
	.pipeline-log {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.pipeline-step {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto;
		gap: 0.25rem var(--ui-pad-small);
		padding: 0.375rem var(--ui-pad-small);
		border-radius: var(--ui-radius-small);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		align-items: start;
	}

	.pipeline-step.done {
		color: var(--color-text-primary);
	}

	.pipeline-step.running {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.pipeline-step.step-error {
		background: color-mix(in srgb, var(--color-negative) 8%, transparent);
		color: var(--color-negative);
	}

	.step-icon {
		text-align: center;
	}

	.pipeline-step.done .step-icon {
		color: var(--color-positive);
	}

	.step-output {
		grid-column: 2 / -1;
		font-family: var(--font-face-values);
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		word-break: break-all;
	}
</style>
