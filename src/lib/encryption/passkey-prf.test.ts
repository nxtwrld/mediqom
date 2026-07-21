import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from "vitest";
import {
  checkPasskeyPRFSupport,
  createPasskeyWithPRF,
  authenticateWithPasskeyPRF,
  authenticateWithDiscoverablePasskey,
  encryptWithPRFKey,
  decryptWithPRFKey,
} from "./passkey-prf";

const hasCrypto =
  typeof globalThis.crypto !== "undefined" &&
  typeof globalThis.crypto.subtle !== "undefined";

beforeAll(() => {
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = {};
  }
});

afterEach(() => {
  delete (globalThis as any).window.PublicKeyCredential;
  delete (globalThis as any).PublicKeyCredential;
});

describe("encryption/passkey-prf", () => {
  describe("checkPasskeyPRFSupport", () => {
    it("returns all false when PublicKeyCredential is not available", async () => {
      const support = await checkPasskeyPRFSupport();
      expect(support.webauthnSupported).toBe(false);
      expect(support.prfSupported).toBe(false);
      expect(support.platformAuthenticatorAvailable).toBe(false);
    });

    it("returns webauthnSupported=true and prfSupported=true when platform authenticator is available", async () => {
      const mockPKC = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(true),
      };
      (globalThis as any).window.PublicKeyCredential = mockPKC;
      (globalThis as any).PublicKeyCredential = mockPKC;

      const support = await checkPasskeyPRFSupport();
      expect(support.webauthnSupported).toBe(true);
      expect(support.platformAuthenticatorAvailable).toBe(true);
      expect(support.prfSupported).toBe(true);
    });

    it("returns prfSupported=false when platform authenticator is unavailable", async () => {
      const mockPKC = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(false),
      };
      (globalThis as any).window.PublicKeyCredential = mockPKC;
      (globalThis as any).PublicKeyCredential = mockPKC;

      const support = await checkPasskeyPRFSupport();
      expect(support.webauthnSupported).toBe(true);
      expect(support.platformAuthenticatorAvailable).toBe(false);
      expect(support.prfSupported).toBe(false);
    });

    it("handles platform authenticator check failure gracefully", async () => {
      const mockPKC = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockRejectedValue(new Error("Method not available")),
      };
      (globalThis as any).window.PublicKeyCredential = mockPKC;
      (globalThis as any).PublicKeyCredential = mockPKC;

      const support = await checkPasskeyPRFSupport();
      expect(support.webauthnSupported).toBe(true);
      expect(support.platformAuthenticatorAvailable).toBe(false);
      expect(support.prfSupported).toBe(false);
    });
  });

  describe("encryptWithPRFKey / decryptWithPRFKey", () => {
    async function makeKey(): Promise<CryptoKey> {
      return globalThis.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    it.skipIf(!hasCrypto)("encrypts and decrypts a PEM string roundtrip", async () => {
      const key = await makeKey();
      const pem =
        "-----BEGIN PRIVATE KEY-----\nMIITestKeyData\n-----END PRIVATE KEY-----";

      const encrypted = await encryptWithPRFKey(pem, key);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toBe(pem);

      const decrypted = await decryptWithPRFKey(encrypted, key);
      expect(decrypted).toBe(pem);
    });

    it.skipIf(!hasCrypto)("produces different ciphertext each call (random IV)", async () => {
      const key = await makeKey();
      const plaintext = "same-private-key-data";

      const enc1 = await encryptWithPRFKey(plaintext, key);
      const enc2 = await encryptWithPRFKey(plaintext, key);
      expect(enc1).not.toBe(enc2);
    });

    it.skipIf(!hasCrypto)("fails decryption with a different key", async () => {
      const key1 = await makeKey();
      const key2 = await makeKey();

      const encrypted = await encryptWithPRFKey("secret-key-data", key1);
      await expect(decryptWithPRFKey(encrypted, key2)).rejects.toThrow();
    });

    it.skipIf(!hasCrypto)("handles unicode content", async () => {
      const key = await makeKey();
      const unicode = "Příliš žluťoučký klíč 🔐";

      const encrypted = await encryptWithPRFKey(unicode, key);
      const decrypted = await decryptWithPRFKey(encrypted, key);
      expect(decrypted).toBe(unicode);
    });

    it.skipIf(!hasCrypto)("handles empty string", async () => {
      const key = await makeKey();
      const encrypted = await encryptWithPRFKey("", key);
      const decrypted = await decryptWithPRFKey(encrypted, key);
      expect(decrypted).toBe("");
    });
  });

  describe("createPasskeyWithPRF", () => {
    it("throws when WebAuthn is not supported", async () => {
      await expect(
        createPasskeyWithPRF("user-id", "user@example.com", "Test User"),
      ).rejects.toThrow("WebAuthn is not supported in this browser");
    });
  });

  describe("authenticateWithPasskeyPRF", () => {
    it("throws when WebAuthn is not supported", async () => {
      await expect(
        authenticateWithPasskeyPRF("credentialId64", "prfSalt64"),
      ).rejects.toThrow("WebAuthn is not supported in this browser");
    });
  });

  describe("authenticateWithDiscoverablePasskey", () => {
    it("throws when WebAuthn is not supported", async () => {
      await expect(
        authenticateWithDiscoverablePasskey([
          { credentialId: "cred1", prfSalt: "salt1" },
        ]),
      ).rejects.toThrow("WebAuthn is not supported in this browser");
    });

    it("throws when WebAuthn is not supported (empty credentials list)", async () => {
      await expect(
        authenticateWithDiscoverablePasskey([]),
      ).rejects.toThrow("WebAuthn is not supported in this browser");
    });
  });

  // -----------------------------------------------------------------------
  // Tests that require WebAuthn + navigator.credentials mocks
  // -----------------------------------------------------------------------

  // Helper to stub navigator.credentials since navigator is a read-only getter
  function stubCredentials(impl: object) {
    vi.stubGlobal("navigator", { credentials: impl });
  }

  function setupWebAuthn() {
    const mockPKC = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    };
    (globalThis as any).window.PublicKeyCredential = mockPKC;
    (globalThis as any).PublicKeyCredential = mockPKC;
    (globalThis as any).window.location = { hostname: "localhost" };
  }

  describe("createPasskeyWithPRF — with WebAuthn mocked", () => {
    beforeEach(() => {
      setupWebAuthn();
    });

    it("throws 'Failed to create passkey' when navigator.credentials.create returns null", async () => {
      stubCredentials({ create: vi.fn().mockResolvedValue(null) });

      await expect(
        createPasskeyWithPRF("uid", "user@example.com", "Test"),
      ).rejects.toThrow("Failed to create passkey");
    });

    it("throws 'PRF extension not supported' when prf.enabled is false", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({ prf: { enabled: false } }),
      };
      stubCredentials({ create: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        createPasskeyWithPRF("uid", "user@example.com", "Test"),
      ).rejects.toThrow("PRF extension not supported by this authenticator");
    });

    it("throws 'PRF extension not supported' when prf is absent from extension results", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({}),
      };
      stubCredentials({ create: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        createPasskeyWithPRF("uid", "user@example.com", "Test"),
      ).rejects.toThrow("PRF extension not supported by this authenticator");
    });

    it("throws 'PRF output not available' when prf.results.first is absent", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({
          prf: { enabled: true, results: {} },
        }),
      };
      stubCredentials({ create: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        createPasskeyWithPRF("uid", "user@example.com", "Test"),
      ).rejects.toThrow("PRF output not available");
    });

    it.skipIf(!hasCrypto)(
      "returns PasskeyAuthResult with credential and derivedKey on success",
      async () => {
        const prfOutputData = new ArrayBuffer(32);
        new Uint8Array(prfOutputData).fill(42);

        const mockCredential = {
          rawId: new Uint8Array([10, 20, 30]),
          getClientExtensionResults: vi.fn().mockReturnValue({
            prf: {
              enabled: true,
              results: { first: prfOutputData },
            },
          }),
        };
        stubCredentials({ create: vi.fn().mockResolvedValue(mockCredential) });

        const result = await createPasskeyWithPRF("uid", "user@example.com", "Test User");

        expect(result).toHaveProperty("credential");
        expect(result).toHaveProperty("derivedKey");
        expect(typeof result.credential.credentialId).toBe("string");
        expect(typeof result.credential.prfSalt).toBe("string");
        expect(typeof result.credential.userHandle).toBe("string");
        expect(result.derivedKey).toBeInstanceOf(CryptoKey);
      },
    );
  });

  describe("authenticateWithPasskeyPRF — with WebAuthn mocked", () => {
    // Valid base64-encoded values for credentialId and prfSalt
    const credentialIdB64 = btoa(String.fromCharCode(1, 2, 3, 4));
    const prfSaltB64 = btoa(String.fromCharCode(...new Array(32).fill(5)));

    beforeEach(() => {
      setupWebAuthn();
    });

    it("throws 'Failed to authenticate with passkey' when credentials.get returns null", async () => {
      stubCredentials({ get: vi.fn().mockResolvedValue(null) });

      await expect(
        authenticateWithPasskeyPRF(credentialIdB64, prfSaltB64),
      ).rejects.toThrow("Failed to authenticate with passkey");
    });

    it("throws 'PRF output not available' when prf results are absent", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({ prf: {} }),
      };
      stubCredentials({ get: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        authenticateWithPasskeyPRF(credentialIdB64, prfSaltB64),
      ).rejects.toThrow("PRF output not available");
    });

    it("throws 'PRF output not available' when prf is absent from extension results", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({}),
      };
      stubCredentials({ get: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        authenticateWithPasskeyPRF(credentialIdB64, prfSaltB64),
      ).rejects.toThrow("PRF output not available");
    });

    it.skipIf(!hasCrypto)(
      "returns a CryptoKey when PRF output is present",
      async () => {
        const prfOutputData = new ArrayBuffer(32);
        new Uint8Array(prfOutputData).fill(99);

        const mockCredential = {
          rawId: new Uint8Array([1, 2, 3]),
          getClientExtensionResults: vi.fn().mockReturnValue({
            prf: { results: { first: prfOutputData } },
          }),
        };
        stubCredentials({ get: vi.fn().mockResolvedValue(mockCredential) });

        const key = await authenticateWithPasskeyPRF(credentialIdB64, prfSaltB64);
        expect(key).toBeInstanceOf(CryptoKey);
      },
    );
  });

  describe("authenticateWithDiscoverablePasskey — with WebAuthn mocked", () => {
    const cred1Id = btoa(String.fromCharCode(1, 2, 3));
    const cred1Salt = btoa(String.fromCharCode(...new Array(32).fill(7)));

    beforeEach(() => {
      setupWebAuthn();
    });

    it("throws 'Failed to authenticate with passkey' when credentials.get returns null", async () => {
      stubCredentials({ get: vi.fn().mockResolvedValue(null) });

      await expect(
        authenticateWithDiscoverablePasskey([{ credentialId: cred1Id, prfSalt: cred1Salt }]),
      ).rejects.toThrow("Failed to authenticate with passkey");
    });

    it("throws 'PRF output not available' when extension results have no prf", async () => {
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
        getClientExtensionResults: vi.fn().mockReturnValue({}),
      };
      stubCredentials({ get: vi.fn().mockResolvedValue(mockCredential) });

      await expect(
        authenticateWithDiscoverablePasskey([{ credentialId: cred1Id, prfSalt: cred1Salt }]),
      ).rejects.toThrow("PRF output not available");
    });

    it.skipIf(!hasCrypto)(
      "returns derivedKey and credentialId on success",
      async () => {
        const prfOutputData = new ArrayBuffer(32);
        new Uint8Array(prfOutputData).fill(77);

        const rawId = new Uint8Array([1, 2, 3]);
        const mockCredential = {
          rawId,
          getClientExtensionResults: vi.fn().mockReturnValue({
            prf: { results: { first: prfOutputData } },
          }),
        };
        stubCredentials({ get: vi.fn().mockResolvedValue(mockCredential) });

        const result = await authenticateWithDiscoverablePasskey([
          { credentialId: cred1Id, prfSalt: cred1Salt },
        ]);

        expect(result).toHaveProperty("derivedKey");
        expect(result).toHaveProperty("credentialId");
        expect(result.derivedKey).toBeInstanceOf(CryptoKey);
        expect(typeof result.credentialId).toBe("string");
      },
    );

    it.skipIf(!hasCrypto)(
      "handles multiple stored credentials by building evalByCredential map",
      async () => {
        const cred2Id = btoa(String.fromCharCode(4, 5, 6));
        const cred2Salt = btoa(String.fromCharCode(...new Array(32).fill(8)));

        const prfOutputData = new ArrayBuffer(32);
        new Uint8Array(prfOutputData).fill(55);

        const rawId = new Uint8Array([4, 5, 6]);
        const mockCredential = {
          rawId,
          getClientExtensionResults: vi.fn().mockReturnValue({
            prf: { results: { first: prfOutputData } },
          }),
        };
        const mockGet = vi.fn().mockResolvedValue(mockCredential);
        stubCredentials({ get: mockGet });

        const result = await authenticateWithDiscoverablePasskey([
          { credentialId: cred1Id, prfSalt: cred1Salt },
          { credentialId: cred2Id, prfSalt: cred2Salt },
        ]);

        expect(result.derivedKey).toBeInstanceOf(CryptoKey);
        // Verify credentials.get was called with evalByCredential in extensions
        expect(mockGet).toHaveBeenCalledOnce();
        const callArg = mockGet.mock.calls[0][0];
        expect(callArg.publicKey.extensions.prf).toHaveProperty("evalByCredential");
      },
    );
  });
});
