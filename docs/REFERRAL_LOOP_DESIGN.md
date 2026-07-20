# Referral / Invite Loop — Design (build follow-on)

> **Status: DESIGN ONLY.** Nothing in this document is implemented yet. It is the
> architecture + migration sketch for the beta growth loop, to be executed as a
> separate approved effort after the beta release. See `docs/BETA_ACCESS_SYSTEM.md`
> for the current (manual apply → admin-approve) waitlist this replaces/augments.

## Goal

Turn beta access into a viral loop: invited users unlock product benefits by
inviting others ("earn features instead of paying"), and early adopters get a
"Founding Member" identity. Growth compounds: each accepted invite grants the new
user their own invite quota.

## What exists today (reuse, don't rebuild)

- **Waitlist**: `beta_applications` table + `handle_beta_approval` trigger
  (`supabase/migrations/beta_approval_simple.sql`) — public form → admin approves
  in Supabase Dashboard → auth user + profile created + magic link emailed.
- **Email invite plumbing**: `supabase.auth.admin.inviteUserByEmail()` is already
  used for document sharing (`src/routes/v1/share/create/+server.ts`) with a
  `redirectTo` → `/share/accept`. The same call powers referral invites.
- **Reward primitives** (`supabase/migrations/20260217_subscription_billing.sql`):
  - `add_scan_credits(p_user_id UUID, p_credits INTEGER, p_idempotency_key TEXT)`
    — idempotent (dedupes on `purchase_history.idempotency_key`); grants scans.
  - `update_subscription_tier(...)` — bump tier (`free|caretaker|family`).
  - `check_profile_limit(p_user_id)` / `subscription_tiers.profile_limit` — the
    cap a "invite N → unlock more profiles" mechanic targets.
- **Tiers**: `SubscriptionTierId = "free" | "caretaker" | "family"`
  (`src/lib/billing/types.ts`), seeded in the billing migration.

## What must be built

### 1. Schema (new migration `supabase/migrations/<date>_referrals.sql`)

```sql
-- One invite code per user (the sharer's stable link)
create table referral_codes (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  code        text unique not null,          -- short, URL-safe
  created_at  timestamptz not null default now()
);

-- One row per invite/redemption edge
create table referrals (
  id            uuid primary key default gen_random_uuid(),
  inviter_id    uuid not null references auth.users(id) on delete cascade,
  code          text not null references referral_codes(code),
  invitee_email text,                          -- set when invite sent by email
  invitee_id    uuid references auth.users(id) on delete set null, -- set on signup
  status        text not null default 'pending'  -- pending | accepted
                check (status in ('pending','accepted')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz
);
create index on referrals (inviter_id);
create unique index on referrals (invitee_id) where invitee_id is not null;

-- Reward ledger — every milestone payout, idempotent
create table referral_rewards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  milestone       int not null,                -- e.g. 1,4,10 accepted invites
  reward_type     text not null,               -- 'scan_credits' | 'tier_bump' | 'founding'
  idempotency_key text unique not null,        -- e.g. `${user_id}:milestone:${milestone}`
  granted_at      timestamptz not null default now()
);

-- Founding Members — sequential number under a cohort cap
create table founding_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  member_number int unique not null,           -- assigned by a sequence + cap check
  granted_at    timestamptz not null default now()
);
```

RLS: users `select` their own `referral_codes` / `referrals` / `referral_rewards`
/ `founding_members`; only `service_role` writes. No `update`/`delete` for users
(same posture as `audit_logs`). Add `SET search_path = public` to any new function
(project lint rule).

### 2. Attribution flow

1. **Generate**: on first visit to the referral UI, upsert a `referral_codes` row
   for the user (short code). Share URL: `/invite/<code>`.
2. **Send**: emailing an invite inserts a `referrals` row (`status='pending'`,
   `invitee_email` set) and calls `inviteUserByEmail(email, { redirectTo:
   '/auth/callback?next=/invite/<code>' })` — reuse the `?next=` handling already
   in `/auth/callback`.
3. **Redeem**: `/invite/<code>` stores the code (cookie/localStorage) through
   signup; on first authenticated load, a `POST /v1/referral/accept` sets the
   matching `referrals` row to `accepted` with `invitee_id` + `accepted_at`
   (guard: a user can accept at most one code; can't self-refer).

### 3. Reward engine (`service_role`, idempotent)

On each accepted referral, count the inviter's `accepted` referrals and pay out
any newly-crossed milestone that has no `referral_rewards` row yet:

- Milestone → `add_scan_credits(inviter_id, credits, `${inviter}:m:${n}`)` and/or
  `update_subscription_tier(...)`. The `idempotency_key` guarantees exactly-once
  even if the endpoint is retried.
- First N accounts overall (cohort cap) also get a `founding_members` row
  (sequential `member_number`) + a `founding` reward. Badge surfaced in-app.

Suggested first ladder (tune later): 1 invite → +X scans; 4 invites → longer AI
history / extra AI models flag; 10 invites → tier bump. The "unlock feature X"
milestones map to **feature flags** the same way `PUBLIC_ENABLE_*` do, but read
per-user from `referral_rewards` rather than build-time env.

### 4. Beta-entry gate (currently missing)

`docs/BETA_ACCESS_SYSTEM.md` claims a `BETA_ONLY_MODE` env flag + an auth hook that
blocks unauthorized signups — **this is not implemented** (`grep BETA_ONLY_MODE`
→ nothing). If invites are the gate to entry, build it: a Supabase auth hook (or
server-side signup guard) that rejects signups without a valid pending `referrals`
row or an approved `beta_applications` row.

## Landmine to resolve FIRST

`beta_approval_simple.sql` sets `profiles.subscription` using a **legacy** enum
(`'pro' | 'family' | 'individual'`) that is inconsistent with the current
`subscription_tiers` model (`free | caretaker | family`). Reconcile these before
layering referral-driven tier changes — otherwise `update_subscription_tier`
payouts and the legacy trigger will fight over the same column with different
vocabularies. Pick one source of truth (the `subscriptions` table + tier ids) and
migrate the trigger off the legacy enum.

## Rough build order

1. Reconcile the legacy subscription enum (landmine above).
2. Schema migration + RLS.
3. `/v1/referral/*` endpoints (code upsert, send-invite, accept) + attribution.
4. Reward engine (milestone payout on accept, idempotent) + Founding Member cap.
5. Beta-entry gate (`BETA_ONLY_MODE` + signup hook) if invites gate entry.
6. UI: invite link + progress-to-unlock + Founding Member badge.
