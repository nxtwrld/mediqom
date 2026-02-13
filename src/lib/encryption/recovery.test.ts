import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateRecoveryKey,
  validateRecoveryKeyFormat,
  normalizeRecoveryKey,
  encryptWithRecoveryKey,
  recoverPrivateKey,
  hashRecoveryKey,
  verifyRecoveryKeyHash,
  generateRecoveryData
} from './recovery';

// Check if Web Crypto API is available
const hasCrypto = typeof globalThis.crypto !== 'undefined' &&
                  typeof globalThis.crypto.subtle !== 'undefined' &&
                  typeof globalThis.crypto.getRandomValues === 'function';

describe('Recovery Key Generation', () => {
  it.skipIf(!hasCrypto)('should generate a recovery key in the correct format', () => {
    const key = generateRecoveryKey();

    // Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (47 chars with dashes)
    expect(key).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
    expect(key.length).toBe(47); // 40 chars + 7 dashes
  });

  it.skipIf(!hasCrypto)('should generate unique keys each time', () => {
    const key1 = generateRecoveryKey();
    const key2 = generateRecoveryKey();

    expect(key1).not.toBe(key2);
  });
});

describe('Recovery Key Validation', () => {
  it('should validate correct format', () => {
    const validKey = 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'.replace(/X/g, 'A');
    expect(validateRecoveryKeyFormat(validKey)).toBe(true);
  });

  it.skipIf(!hasCrypto)('should validate generated keys', () => {
    const key = generateRecoveryKey();
    expect(validateRecoveryKeyFormat(key)).toBe(true);
  });

  it('should reject keys that are too short', () => {
    expect(validateRecoveryKeyFormat('AAAA-AAAA')).toBe(false);
  });

  it('should reject keys with invalid characters', () => {
    expect(validateRecoveryKeyFormat('!!!!-!!!!-!!!!-!!!!-!!!!-!!!!-!!!!-!!!!')).toBe(false);
  });

  it('should normalize keys with spaces', () => {
    const keyWithSpaces = 'AAAA BBBB CCCC DDDD EEEE FFFF GGHH JJKK';
    const normalized = normalizeRecoveryKey(keyWithSpaces);
    expect(normalized).toBe('AAAABBBBCCCCDDDDEEEEFFFFGGHHJJKK');
  });

  it('should normalize lowercase to uppercase', () => {
    const lowercaseKey = 'aaaa-bbbb-cccc-dddd-eeee-ffff-gghh-jjkk';
    const normalized = normalizeRecoveryKey(lowercaseKey);
    expect(normalized).toBe('AAAABBBBCCCCDDDDEEEEFFFFGGHHJJKK');
  });
});

describe('Recovery Key Encryption/Decryption', () => {
  const testPrivateKeyPEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxSampleKey
-----END PRIVATE KEY-----`;

  it.skipIf(!hasCrypto)('should encrypt and decrypt private key', async () => {
    const recoveryKey = generateRecoveryKey();

    const encrypted = await encryptWithRecoveryKey(testPrivateKeyPEM, recoveryKey);

    // Encrypted should be different from original
    expect(encrypted).not.toBe(testPrivateKeyPEM);

    // Should be base64 encoded
    expect(() => atob(encrypted)).not.toThrow();

    // Should decrypt back to original
    const decrypted = await recoverPrivateKey(encrypted, recoveryKey);
    expect(decrypted).toBe(testPrivateKeyPEM);
  });

  it.skipIf(!hasCrypto)('should fail decryption with wrong key', async () => {
    const recoveryKey1 = generateRecoveryKey();
    const recoveryKey2 = generateRecoveryKey();

    const encrypted = await encryptWithRecoveryKey(testPrivateKeyPEM, recoveryKey1);

    // Should fail with wrong key
    await expect(recoverPrivateKey(encrypted, recoveryKey2)).rejects.toThrow();
  });

  it.skipIf(!hasCrypto)('should reject invalid key format during encryption', async () => {
    await expect(
      encryptWithRecoveryKey(testPrivateKeyPEM, 'invalid-key')
    ).rejects.toThrow('Invalid recovery key format');
  });

  it.skipIf(!hasCrypto)('should reject invalid key format during decryption', async () => {
    await expect(
      recoverPrivateKey('someEncryptedData', 'invalid-key')
    ).rejects.toThrow('Invalid recovery key format');
  });
});

describe('Recovery Key Hashing', () => {
  it.skipIf(!hasCrypto)('should create consistent hash for same key', async () => {
    const recoveryKey = generateRecoveryKey();

    const hash1 = await hashRecoveryKey(recoveryKey);
    const hash2 = await hashRecoveryKey(recoveryKey);

    expect(hash1).toBe(hash2);
  });

  it.skipIf(!hasCrypto)('should create different hashes for different keys', async () => {
    const key1 = generateRecoveryKey();
    const key2 = generateRecoveryKey();

    const hash1 = await hashRecoveryKey(key1);
    const hash2 = await hashRecoveryKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it.skipIf(!hasCrypto)('should verify correct hash', async () => {
    const recoveryKey = generateRecoveryKey();
    const hash = await hashRecoveryKey(recoveryKey);

    const isValid = await verifyRecoveryKeyHash(recoveryKey, hash);
    expect(isValid).toBe(true);
  });

  it.skipIf(!hasCrypto)('should reject incorrect hash', async () => {
    const key1 = generateRecoveryKey();
    const key2 = generateRecoveryKey();
    const hash1 = await hashRecoveryKey(key1);

    const isValid = await verifyRecoveryKeyHash(key2, hash1);
    expect(isValid).toBe(false);
  });
});

describe('Generate Recovery Data', () => {
  const testPrivateKeyPEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxSampleKey
-----END PRIVATE KEY-----`;

  it.skipIf(!hasCrypto)('should generate complete recovery data', async () => {
    const data = await generateRecoveryData(testPrivateKeyPEM);

    expect(data.recoveryKey).toBeDefined();
    expect(data.recoveryEncryptedKey).toBeDefined();
    expect(data.recoveryKeyHash).toBeDefined();

    // Key should be valid format
    expect(validateRecoveryKeyFormat(data.recoveryKey)).toBe(true);

    // Should be able to decrypt with the key
    const decrypted = await recoverPrivateKey(data.recoveryEncryptedKey, data.recoveryKey);
    expect(decrypted).toBe(testPrivateKeyPEM);

    // Hash should match
    const isValid = await verifyRecoveryKeyHash(data.recoveryKey, data.recoveryKeyHash);
    expect(isValid).toBe(true);
  });
});
