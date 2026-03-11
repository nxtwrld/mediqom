# Secure Document Sharing

End-to-end encrypted document sharing between Mediqom users, including invite flow for new users.

## Status: Implemented ✓

All core components are live on the `mobile` branch.

---

## Architecture Overview

Documents are AES-256-GCM encrypted at rest. Sharing means adding a `keys` row for the recipient containing the document's AES key re-encrypted with their RSA public key.

**The core challenge**: when User B has no account yet, we can't encrypt with their public key. Solved via a **pending share + share secret** pattern: the AES key is symmetrically encrypted with a one-time secret embedded in the magic-link URL.

### Case A — Recipient already exists

1. User A opens a report → clicks Share → enters User B's email
2. Client looks up User B via `GET /v1/share/recipient-info?email=...`
3. For each selected document: decrypt AES key with User A's RSA private key → re-encrypt with User B's RSA public key
4. `POST /v1/share/create` → server inserts `keys` rows + `document_shares` rows (`status: active`)
5. User B sees shared documents immediately in their `/med` view

### Case B — Recipient is new (no account)

1. Same start, but recipient lookup returns `exists: false`
2. Client generates a random 32-byte `share_secret` (hex)
3. For each document: decrypt AES key → re-encrypt with `share_secret` via passphrase encryption
4. `POST /v1/share/create` → server inserts `document_shares` rows (`status: pending`, with `pending_encrypted_key`)
5. Server calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '/share/accept?t=SECRET' })`
6. User B receives email → clicks link → authenticates → lands on `/share/accept?t=SECRET`
7. Accept page fetches pending shares, decrypts each `pending_encrypted_key` with the secret, re-encrypts with own RSA public key, POSTs to `/v1/share/accept`
8. Server inserts `keys` rows, marks shares `active`

---

## Database

**Migration:** `supabase/migrations/20260306_document_shares.sql`

```sql
CREATE TABLE public.document_shares (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id             UUID NOT NULL REFERENCES public.profiles(id),
  recipient_email      TEXT NOT NULL,
  recipient_id         UUID REFERENCES public.profiles(id),  -- NULL until accepted
  document_id          UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  pending_encrypted_key TEXT,   -- AES key encrypted with share_secret (new users only)
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | active | revoked
  created_at           TIMESTAMPTZ DEFAULT now(),
  accepted_at          TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ
);
```

**RLS Policies:**
- `sharer_can_view` — sharer sees their outgoing shares
- `recipient_can_view` — recipient sees shares addressed to them (by `recipient_id`)
- `service_insert` / `service_update` — service role for API writes

**SQL Helper:**
```sql
CREATE FUNCTION find_profile_by_email(lookup_email TEXT)
RETURNS TABLE(profile_id UUID, auth_id UUID, public_key TEXT)
-- Joins auth.users with profiles by email
```

---

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/v1/share/recipient-info?email=` | Look up recipient; returns `{ exists, profile_id, publicKey }` |
| `POST` | `/v1/share/create` | Create share(s); handles both existing and new users |
| `GET` | `/v1/share/my-shares` | Outgoing shares for current user (grouped by recipient) |
| `DELETE` | `/v1/share/[id]` | Revoke a share; removes recipient's `keys` row |
| `GET` | `/v1/share/pending` | Pending shares for current user's email |
| `POST` | `/v1/share/accept` | Finalize a pending share with re-encrypted key |

---

## UI Components

### `src/components/apps/Share.svelte`
2-step sharing wizard:
- **Step 0**: Document checklist (all profile documents fetched + decrypted on mount) + email input
- **Step 1**: Spinner → success / error state

Key detail: documents fetched from the API have encrypted metadata. The component calls `decryptDocumentsNoStore()` from `$lib/documents/index.ts` on non-preloaded docs before displaying title/date/category icon.

### `src/components/apps/AppConnect.svelte`
Share button is shown whenever `shared` prop is provided. Opens Share.svelte in a Modal.

### `src/components/apps/SharesList.svelte`
"Shared by me" view: fetches from `GET /v1/share/my-shares`, groups by recipient email, shows status badges, revoke button per share.

### `src/routes/share/accept/+page.svelte`
Magic-link landing page for new users:
- Reads `?t=SHARE_TOKEN` from URL
- Checks auth + encryption key setup (redirects to `/med/account` if keys not ready)
- Decrypts pending shares with token → re-encrypts with own RSA public key → POSTs to accept

---

## Auth Callback

`src/routes/auth/callback/+page.svelte` reads `?next=URL` and redirects there after successful authentication. This allows the magic-link invitation to land users at `/share/accept?t=TOKEN` post-login.

---

## Encryption Flow Detail

```
User A                          Server                         User B
  |                               |                               |
  |-- GET /recipient-info ------->|                               |
  |<-- { publicKey } -------------|                               |
  |                               |                               |
  |  decrypt docAESkey            |                               |
  |  (own RSA priv key)           |                               |
  |  re-encrypt for B             |                               |
  |  (B's RSA pub key)            |                               |
  |                               |                               |
  |-- POST /share/create -------->|                               |
  |   encrypted_key_for_recipient |-- INSERT keys row for B ----->|
  |                               |-- INSERT document_shares ---->|
  |                               |                               |
  |                               |         (User B opens app)    |
  |                               |<-- loads documents ----------|
  |                               |    (via keys!inner join)      |
```

For new users (Case B), replace "re-encrypt for B" with "encrypt with share_secret" and the server sends an invite email with the secret in the redirect URL.

---

## Remaining / Future Work

- [ ] "Shared with me" section in User B's `/med` view — discover which owner profiles have shared documents
- [ ] Email notification for Case A (existing users) — currently no email is sent, only Case B gets an invite
- [ ] Share expiry / TTL option
- [ ] Bulk revoke (revoke all shares with a recipient)
- [ ] UI in SharesList for pending shares (re-send invite option)
