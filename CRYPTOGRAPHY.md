# Mediqom Cryptography Architecture

This document describes the end-to-end encryption architecture used to protect medical records in Mediqom. It is intended for developers, auditors, and stakeholders evaluating the system's security posture.

## Overview

- **Zero-knowledge E2E encryption** — the server never sees plaintext keys or documents
- **Per-document AES-256-GCM keys** — each document encrypted independently
- **Post-quantum ready** — hybrid RSA-4096 + ML-KEM-768 (FIPS 203) key wrapping for new users
- **Backward compatible** — legacy RSA-only users coexist seamlessly with hybrid users

---

## Algorithm Inventory

| Component | Algorithm | Key / Output Size | Parameters |
|---|---|---|---|
| Document encryption | AES-256-GCM | 256-bit key, 12-byte IV | Random IV per encryption |
| Asymmetric wrapping | RSA-4096-OAEP | 4096-bit modulus | SHA-256, e=65537 |
| Post-quantum KEM | ML-KEM-768 (FIPS 203) | 1184 B pub / 2400 B sec / 1088 B CT | `mlkem` npm package |
| Hybrid key wrapping | HKDF-SHA256 → AES-256-GCM | 256-bit derived key | salt: `mediqom-hybrid-salt-v1`, info: `mediqom-hybrid-v1` |
| Passphrase KDF | PBKDF2-SHA256 | 256-bit derived key | 300k iterations (v2), 100k legacy (v1) |
| Passkey PRF KDF | HKDF-SHA256 | 256-bit derived key | salt: `mediqom-prf-derived-key-v1`, info: `private-key-encryption` |
| Recovery key KDF | HKDF-SHA256 | 256-bit derived key | salt: `mediqom-recovery-key-v1`, info: `private-key-encryption` |
| Password hashing | bcrypt | cost 10 | Verification only |

All cryptographic operations use the Web Crypto API (`crypto.subtle`) except ML-KEM (pure TypeScript `mlkem` package) and bcrypt.

---

## Key Hierarchy

```
User passphrase ──→ PBKDF2 (300k iter) ──→ AES-256 wrapping key
User passkey PRF ──→ HKDF ──────────────→ AES-256 wrapping key    ──→ encrypts {RSA private key, KEM secret key}
Recovery key ──────→ HKDF ──────────────→ AES-256 wrapping key

RSA-4096 public key ─┐
                      ├──→ wrapKey() ──→ per-document AES-256 key ──→ encrypts document content
ML-KEM-768 public key┘
```

Each user has one RSA-4096 keypair and (for hybrid users) one ML-KEM-768 keypair. The private/secret keys are encrypted client-side before storage. Document AES keys are wrapped with the owner's public keys and stored server-side — the server never sees the unwrapped AES key.

---

## Document Encryption

Each document is encrypted with a unique random AES-256-GCM key. The content, metadata, and thumbnail are encrypted independently (each with its own IV) using the same document key.

**Flow:**
1. Generate random AES-256-GCM key via `crypto.subtle.generateKey()`
2. Encrypt content, metadata, and thumbnail separately with AES-GCM (random 12-byte IV per operation)
3. Export AES key to Base64
4. Wrap the exported key with the owner's public keys (see Key Wrapping Modes)
5. Store wrapped key in `keys` table, encrypted blobs in `documents` table

**Files:** `src/lib/encryption/aes.ts`, `src/lib/documents/index.ts`

---

## Key Wrapping Modes

Two modes coexist, auto-detected by prefix on the wrapped key string:

### RSA-only (legacy)

```
RSA-OAEP(aesKeyBase64) → Base64
```

Simple RSA-OAEP encryption of the AES key string. No prefix.

### Hybrid (new users)

```
"hybrid1:" + Base64(kemCT ∥ iv ∥ AES-GCM(rsaCT))
```

**Wrap flow:**
1. ML-KEM encapsulate with recipient's KEM public key → `{kemCiphertext, sharedSecret}`
2. HKDF-SHA256 derive AES-256 wrapping key from `sharedSecret` (salt/info as in Algorithm Inventory)
3. RSA-OAEP encrypt the AES document key → `rsaCiphertext`
4. AES-GCM encrypt `rsaCiphertext` with the HKDF-derived wrapping key → `hybridCiphertext`
5. Concatenate: `kemCiphertext[1088] ∥ iv[12] ∥ hybridCiphertext[~528]`
6. Output: `"hybrid1:" + Base64(concatenated)`

**Unwrap flow:** reverse of above — KEM decapsulate → HKDF → AES-GCM decrypt → RSA-OAEP decrypt.

An attacker must break **both** RSA-4096 and ML-KEM-768 to recover a document key.

**Detection:** `isHybridWrappedKey()` checks for the `"hybrid1:"` prefix.

**Files:** `src/lib/encryption/hybrid.ts`, `src/lib/encryption/keys.ts`

---

## User Key Lifecycle

### Generation

`generateKeys(passphrase, mode)` in `keys.ts`:

- **RSA-4096** keypair via Web Crypto (`modulusLength: 4096`, SHA-256, PKCS8/SPKI)
- **ML-KEM-768** keypair via `mlkem` package (hybrid mode only)
- Private/secret keys encrypted with passphrase-derived AES key (PBKDF2)

### Storage

| Column | Table | Content |
|---|---|---|
| `publicKey` | `profiles` | RSA public key (PEM) |
| `kem_public_key` | `profiles` | ML-KEM public key (`mlkem768:<base64>`) |
| `key_mode` | `profiles` | `"hybrid"` or `"rsa-only"` |
| `privateKey` | `private_keys` | RSA private key (PBKDF2-encrypted PEM) |
| `kem_secret_key` | `private_keys` | ML-KEM secret key (PBKDF2-encrypted) |
| `key_hash` | `private_keys` | bcrypt hash of passphrase |
| `key_derivation_method` | `private_keys` | `"passphrase"`, `"passkey-prf"`, etc. |
| `recovery_encrypted_key` | `private_keys` | Recovery-key-encrypted packed private keys |

### Unlock

On login, the client decrypts the private keys using the user's passphrase (PBKDF2) or passkey PRF (HKDF). Decrypted keys are held in memory only — never persisted in plaintext.

### Recovery

A 200-bit recovery key (Base32 Crockford, 40 chars) is generated at account setup. It protects a packed copy of the RSA private key + KEM secret key via HKDF → AES-256-GCM. The recovery key is shown once and can be saved as a PDF with QR code.

**Files:** `src/lib/encryption/passphrase.ts`, `src/lib/encryption/passkey-prf.ts`, `src/lib/encryption/recovery.ts`

---

## Document Sharing

### Recipient has an account

1. Decrypt the document's AES key using owner's private keys
2. Wrap the AES key with recipient's public keys (`wrapKey()` — hybrid if recipient has KEM key, RSA-only otherwise)
3. Insert wrapped key into `keys` table for recipient's `user_id`

### Recipient is new (pending share)

1. Generate ephemeral `share_secret`
2. Encrypt AES key with `share_secret` → store as `pending_encrypted_key` in `document_shares`
3. On recipient signup: decrypt with `share_secret`, re-wrap with own public keys

### Revocation

Delete the recipient's row from the `keys` table. The recipient can no longer decrypt the document.

**Files:** `src/components/apps/Share.svelte`, `src/routes/share/accept/+page.svelte`

---

## Import Job Encryption

Server-side document analysis uses ephemeral encryption:

1. Client generates a per-job AES-256 key (in-memory `Map`, 30-minute TTL)
2. Server processes documents and returns encrypted results
3. Client decrypts results using the job key
4. Job key is never persisted — lost on page reload (regenerated as needed)

**Files:** `src/lib/import/encryption.ts`, `src/lib/import/finalizer.ts`

---

## Zero-Knowledge Properties

| What server stores | Protection |
|---|---|
| `documents.content` / `metadata` / `thumbnail` | AES-256-GCM (per-document key) |
| `keys.key` | RSA-OAEP or hybrid wrapped |
| `private_keys.privateKey` | PBKDF2+AES or PRF+AES |
| `private_keys.kem_secret_key` | PBKDF2+AES or PRF+AES |

**What the server NEVER sees:**
- User passphrases or passkey PRF outputs
- RSA private keys or KEM secret keys in plaintext
- AES document keys in plaintext
- Plaintext medical data at rest

**Note:** During import analysis, unencrypted document content is sent to AI providers (OpenAI, Google, Anthropic) for processing. This is documented in the privacy policy. See `SECURITY_REPORT.md` § PHI & Third-Party Data Sharing.

---

## Database Schema

```sql
-- profiles (public keys, mode)
profiles.publicKey        TEXT    -- RSA-4096 public key (PEM)
profiles.kem_public_key   TEXT    -- "mlkem768:<base64>" or NULL
profiles.key_mode         TEXT    -- "hybrid" | "rsa-only"

-- private_keys (encrypted private keys)
private_keys.privateKey              TEXT    -- PBKDF2-encrypted RSA private PEM
private_keys.kem_secret_key          TEXT    -- PBKDF2-encrypted KEM secret key
private_keys.key_hash                TEXT    -- bcrypt(passphrase)
private_keys.key_derivation_method   TEXT    -- "passphrase" | "passkey-prf"
private_keys.recovery_encrypted_key  TEXT    -- Recovery-key-encrypted packed keys

-- keys (per-document, per-user wrapped AES keys)
keys.document_id  UUID
keys.user_id      UUID
keys.key          TEXT    -- RSA-OAEP or "hybrid1:..." wrapped AES key

-- document_shares (pending shares)
document_shares.pending_encrypted_key  TEXT    -- share_secret-encrypted AES key
document_shares.status                 TEXT    -- "pending" | "accepted" | "revoked"
```

---

## Regulatory Compliance

| Regulation | Requirement | Status |
|---|---|---|
| **ANSSI/BSI** | Hybrid PQC mandatory for lattice-based schemes until 2030 | Implemented — RSA-4096 + ML-KEM-768 |
| **EU C(2024) 2393** | Hybrid by default for high-risk systems | Implemented — default for new users |
| **EHDS (2027)** | EU cybersecurity regulation for health data | Aligned — E2E encryption, zero-knowledge |
| **HIPAA** | Encryption at rest | Implemented — AES-256-GCM per document |
| **HIPAA** | Access controls | Implemented — per-document key wrapping, RLS |
| **HIPAA** | Audit trail | Implemented — `audit_logs` table with RLS, 16 endpoints |

---

## Wire Formats

### Hybrid wrapped key

```
"hybrid1:" + Base64(
  kemCiphertext[1088 bytes]
  ∥ iv[12 bytes]
  ∥ hybridCiphertext[~528 bytes]   // AES-GCM(rsaCiphertext) + 16-byte GCM tag
)
```

### PBKDF2-encrypted private key (v2)

```
Base64(
  version[2 bytes: 0x00 0x01]
  ∥ salt[16 bytes]
  ∥ iv[12 bytes]
  ∥ ciphertext + GCM tag
)
```

Legacy (v1): same layout without the 2-byte version prefix. Detected by absence of `[0x00, 0x01]`.

### AES-GCM encrypted content

```
Base64( iv[12 bytes] ∥ ciphertext + GCM tag )
```

### KEM key serialization

```
"mlkem768:" + Base64(key_bytes)
```

### Recovery key

```
XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

40 Base32 Crockford characters (200 bits entropy), dash-separated in groups of 4.
Alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (excludes I, L, O, U to avoid ambiguity).

---

## Source Files Reference

| File | Purpose |
|---|---|
| `src/lib/encryption/aes.ts` | AES-256-GCM encrypt/decrypt, key generation and export |
| `src/lib/encryption/rsa.ts` | RSA-4096-OAEP encrypt/decrypt, PEM import/export |
| `src/lib/encryption/kem.ts` | ML-KEM-768 keygen, encapsulate, decapsulate, serialization |
| `src/lib/encryption/hybrid.ts` | Hybrid RSA+KEM key wrapping and unwrapping |
| `src/lib/encryption/keys.ts` | Unified key management, mode detection, `HybridKeyPair` class |
| `src/lib/encryption/passphrase.ts` | PBKDF2 key derivation, passphrase generation |
| `src/lib/encryption/passkey-prf.ts` | WebAuthn PRF extension, HKDF derivation |
| `src/lib/encryption/recovery.ts` | Recovery key generation, HKDF derivation, key packing |
| `src/lib/encryption/recovery-document.ts` | Recovery key PDF with QR code |
| `src/lib/encryption/hash.ts` | bcrypt hashing and verification |
| `src/lib/documents/index.ts` | Document encryption/decryption, key wrapping per profile |
| `src/lib/import/encryption.ts` | Ephemeral per-job encryption for import flow |
