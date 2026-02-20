# Subscription & Billing System

This document describes the subscription upgrade feature for Mediqom, including pricing tiers, user flows, and technical implementation.

**Current Features:** Document analysis (AI-powered medical report extraction) and secure encrypted storage.

---

## Table of Contents

1. [Subscription Tiers](#subscription-tiers)
2. [Quota System](#quota-system)
3. [User Flows](#user-flows)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Plan](#implementation-plan)

---

## Subscription Tiers

| Tier          | Price              | Profiles  | Yearly Scans | Features                                                                          |
| ------------- | ------------------ | --------- | ------------ | --------------------------------------------------------------------------------- |
| **Free**      | €0                 | 1         | 5            | Document analysis, Secure storage, Mobile & web access, Zero-knowledge encryption |
| **Caretaker** | €4.99/mo or €49/yr | 3         | 50           | All Free features + Multi-profile family management                               |
| **Family**    | €9.99/mo or €99/yr | Unlimited | 200          | All Caretaker features + Unlimited family members                                 |

### Extra Scan Pack

| Pack          | Scans | Price |
| ------------- | ----- | ----- |
| **Scan Pack** | 50    | €10   |

One-time purchase. Credits never expire and accumulate across purchases.

This applies to general subscription scans. A free user would accumulate a lot of scans over the years and that is fair.

---

## Quota System

### How Quotas Work

1. **Base Scans (Yearly Allowance)**

   - Each tier includes a yearly scan quota (Free=5, Caretaker=50, Family=200)
   - Resets on subscription anniversary date
   - Unused scans do NOT carry over

2. **Scan Packs (Purchased Scans)**

   - €10 for 50 scans
   - One-time purchase, never expires
   - Used after base scans are depleted

3. **Usage Priority**
   - System uses base scans first
   - When base depleted, uses purchased scans
   - When both depleted, user must upgrade or buy a pack

### Example Usage

```
User: Caretaker (50 base scans/year, started Jan 1)
- January: Uses 20 scans → 30 base remaining
- June: Uses 35 scans → 0 base remaining, blocked
- User buys 50-scan pack (€10) → 45 pack scans remaining
- January (renewal): Base resets to 50, 45 pack scans preserved
- Total available: 95 scans
```

### Profile Limits

| Tier      | Profile Limit       |
| --------- | ------------------- |
| Free      | 1 (user only)       |
| Caretaker | 3 (user + 2 family) |
| Family    | Unlimited           |

---

## User Flows

### Flow 1: Upgrade Subscription (Web)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER TRIGGERS UPGRADE                                        │
│    - Clicks "Upgrade" in settings                               │
│    - Hits scan limit during import                              │
│    - Reaches profile limit when adding family member            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. UPGRADE MODAL OPENS                                          │
│    - Shows current plan with usage stats                        │
│    - Lists available tiers with features                        │
│    - Toggle: Monthly / Yearly (save 17%)                        │
│    - Highlights recommended tier                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. USER SELECTS PLAN                                            │
│    - Clicks "Upgrade to Family Basic"                           │
│    - Shows price confirmation                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. STRIPE CHECKOUT (External Redirect)                          │
│    - Enter payment details                                      │
│    - Apply coupon code (if any)                                 │
│    - Confirm purchase                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SUCCESS CALLBACK                                             │
│    - Redirect to /med/settings/subscription?success=true        │
│    - Webhook updates subscription in database                   │
│    - Show success message with new plan details                 │
│    - Quotas immediately updated                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Upgrade Subscription (Mobile/IAP)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER TRIGGERS UPGRADE                                        │
│    - Same triggers as web                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. UPGRADE MODAL OPENS                                          │
│    - Same UI as web                                             │
│    - Prices from App Store / Play Store                         │
│    - Apple/Google payment badges shown                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. NATIVE IAP FLOW                                              │
│    - iOS: StoreKit2 payment sheet                               │
│    - Android: Google Play billing dialog                        │
│    - Face ID / Touch ID / Fingerprint confirmation              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. RECEIPT VALIDATION                                           │
│    - App sends receipt to /v1/billing/iap/verify                │
│    - Server validates with Apple/Google                         │
│    - Database updated with subscription                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SUCCESS                                                      │
│    - Modal shows confirmation                                   │
│    - Quotas immediately updated                                 │
│    - User can continue action that triggered upgrade            │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3: Purchase Credit Pack

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER NEEDS MORE SCANS                                        │
│    - Out of base scans AND credits                              │
│    - Wants to stock up on credits                               │
│    - Clicks "Buy Credits" in settings or import modal           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CREDIT PACK SELECTION                                        │
│    - Shows available packs with volume discounts                │
│    - Highlights best value                                      │
│    - Shows current credit balance                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CHECKOUT (Platform-specific)                                 │
│    - Web: Stripe Checkout (one-time payment)                    │
│    - Mobile: IAP consumable purchase                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CREDITS ADDED                                                │
│    - scans_credits column incremented                           │
│    - Logged in purchase_history                                 │
│    - UI shows new balance                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 4: Manage Subscription (Web)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER GOES TO SETTINGS → SUBSCRIPTION                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SUBSCRIPTION STATUS PAGE                                        │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Current Plan: Family Basic                                  │ │
│ │ Status: Active                                              │ │
│ │ Next billing: €99.00 on Jan 15, 2026                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Usage This Period                                           │ │
│ │ Scans: ████████░░ 40/50 (80%)                              │ │
│ │ Credits: 95 available                                       │ │
│ │ Profiles: 4 used (unlimited)                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Upgrade Plan] [Buy Credits] [Manage Billing →]                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Click "Manage Billing"
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STRIPE CUSTOMER PORTAL (External)                               │
│ - Update payment method                                         │
│ - View invoices                                                 │
│ - Change plan                                                   │
│ - Cancel subscription                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 5: Out of Scans During Import

```
┌─────────────────────────────────────────────────────────────────┐
│ USER UPLOADS DOCUMENT FOR IMPORT                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM CHECKS QUOTA                                             │
│ - base_scans - scans_used + scans_credits = available          │
│ - If available <= 0, show upgrade prompt                        │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┴──────────────────┐
           │                                      │
   available > 0                          available <= 0
           │                                      │
           ▼                                      ▼
┌──────────────────────┐              ┌──────────────────────────┐
│ PROCEED WITH IMPORT  │              │ SHOW UPGRADE PROMPT      │
│ - Process document   │              │                          │
│ - Deduct 1 scan      │              │ "You've used all your    │
│ - Show results       │              │  scans this period"      │
└──────────────────────┘              │                          │
                                      │ [Upgrade] [Buy Credits]  │
                                      │                          │
                                      │ Can dismiss but cannot   │
                                      │ import until upgraded    │
                                      └──────────────────────────┘
```

### Flow 6: Restore Purchases (Mobile)

```
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIOS:                                                      │
│ - New device                                                    │
│ - App reinstalled                                               │
│ - Subscription purchased on another device                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER GOES TO SETTINGS → SUBSCRIPTION                            │
│ - Sees "Free" tier even though they paid                        │
│ - Clicks "Restore Purchases"                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESTORE FLOW                                                    │
│ 1. App calls store.restorePurchases()                          │
│ 2. iOS/Android returns all past transactions                   │
│ 3. Each receipt sent to /v1/billing/iap/verify                 │
│ 4. Server validates and updates subscription                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SUCCESS                                                         │
│ - "Purchases restored successfully"                             │
│ - Subscription status updated                                   │
│ - Quotas reflect current tier                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Database Schema

#### Extended `subscriptions` Table

```sql
ALTER TABLE subscriptions ADD COLUMN
    tier_id TEXT DEFAULT 'family_free',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'trialing')),
    source TEXT DEFAULT 'manual' CHECK (source IN ('stripe', 'apple', 'google', 'manual')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    apple_original_transaction_id TEXT,
    google_purchase_token TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    scans_base INTEGER DEFAULT 0,        -- Yearly allowance from tier
    scans_used INTEGER DEFAULT 0,        -- Used from base
    scans_credits INTEGER DEFAULT 0,     -- Purchased credits (never expire)
    scans_reset_at TIMESTAMPTZ;          -- Next yearly reset
```

#### New `subscription_tiers` Table

```sql
CREATE TABLE subscription_tiers (
    id TEXT PRIMARY KEY,  -- 'free', 'caretaker', 'family'
    name TEXT NOT NULL,
    profile_limit INTEGER DEFAULT 1,  -- NULL = unlimited
    scan_limit INTEGER DEFAULT 5,     -- Yearly scans
    price_monthly_eur INTEGER DEFAULT 0,  -- cents (499 = €4.99)
    price_yearly_eur INTEGER DEFAULT 0,   -- cents (4900 = €49)
    stripe_product_id TEXT,
    stripe_price_monthly_eur TEXT,
    stripe_price_yearly_eur TEXT,
    apple_product_id_monthly TEXT,
    apple_product_id_yearly TEXT,
    google_product_id_monthly TEXT,
    google_product_id_yearly TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0
);

-- Seed data
INSERT INTO subscription_tiers (id, name, profile_limit, scan_limit, price_monthly_eur, price_yearly_eur, sort_order) VALUES
('free', 'Free', 1, 5, 0, 0, 0),
('caretaker', 'Caretaker', 3, 50, 499, 4900, 1),
('family', 'Family', NULL, 200, 999, 9900, 2);
```

#### New `scan_packs` Table

```sql
CREATE TABLE scan_packs (
    id TEXT PRIMARY KEY,  -- 'pack_50'
    name TEXT NOT NULL,
    scans INTEGER NOT NULL,
    price_eur INTEGER NOT NULL,  -- cents (1000 = €10)
    stripe_price_id TEXT,
    apple_product_id TEXT,
    google_product_id TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Seed data
INSERT INTO scan_packs (id, name, scans, price_eur) VALUES
('pack_50', 'Scan Pack', 50, 1000);
```

#### New `purchase_history` Table

```sql
CREATE TABLE purchase_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    amount INTEGER,
    currency TEXT,
    external_id TEXT,
    credits_added INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### API Endpoints

| Endpoint                      | Method | Description                                       |
| ----------------------------- | ------ | ------------------------------------------------- |
| `/v1/billing/tiers`           | GET    | List subscription tiers (free, caretaker, family) |
| `/v1/billing/packs`           | GET    | List scan packs                                   |
| `/v1/billing/subscription`    | GET    | Get current user's subscription & usage           |
| `/v1/billing/stripe/checkout` | POST   | Create Stripe Checkout (subscription or pack)     |
| `/v1/billing/stripe/portal`   | POST   | Create Stripe Customer Portal                     |
| `/v1/billing/stripe/webhook`  | POST   | Handle Stripe webhooks                            |
| `/v1/billing/iap/verify`      | POST   | Validate IAP receipt (iOS/Android)                |
| `/v1/billing/iap/restore`     | POST   | Restore mobile purchases                          |

### Payment Integrations

#### Web: Stripe

- Checkout Sessions for new subscriptions
- Customer Portal for subscription management
- Webhook events for payment lifecycle

#### Mobile: cordova-plugin-purchase

- iOS: StoreKit2
- Android: Google Play Billing Library v5+
- Server-side receipt validation

### Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_xxx
STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Apple IAP
APPLE_BUNDLE_ID=com.mediqom.app
APPLE_APP_ID=123456789
APPLE_KEY_ID=xxx
APPLE_ISSUER_ID=xxx
APPLE_PRIVATE_KEY=xxx

# Google IAP
GOOGLE_PACKAGE_NAME=com.mediqom.app
GOOGLE_SERVICE_ACCOUNT_JSON=xxx
```

---

## Implementation Plan

### Phase 1: Database & Backend (Week 1-2)

- [ ] Create database migrations
- [ ] Set up Stripe products/prices
- [ ] Implement `/v1/billing/tiers` endpoint
- [ ] Implement `/v1/billing/subscription` endpoint

### Phase 2: Stripe Integration (Week 2-3)

- [ ] Implement checkout session creation
- [ ] Implement webhook handler
- [ ] Implement customer portal
- [ ] Test web purchase flow

### Phase 3: Client UI (Week 3-4)

- [ ] Create billing components (UpgradeModal, PlanCard, etc.)
- [ ] Add subscription settings page
- [ ] Integrate upgrade triggers in import/profile flows
- [ ] Create subscription store

### Phase 4: iOS IAP (Week 4-5)

- [ ] Set up App Store Connect products
- [ ] Install cordova-plugin-purchase
- [ ] Implement Apple receipt validation
- [ ] Test iOS purchase flow

### Phase 5: Android IAP (Week 5-6)

- [ ] Set up Google Play Console products
- [ ] Implement Google receipt validation
- [ ] Test Android purchase flow

### Phase 6: Polish & Testing (Week 6-7)

- [ ] Sandbox testing all platforms
- [ ] Edge case handling (restore, refund, failure)
- [ ] Error handling and user feedback
- [ ] Documentation

---

## UI Component Structure

```
src/components/billing/
├── SubscriptionStatus.svelte   # Current plan card with usage stats
├── UpgradeModal.svelte         # Plan selection & purchase flow
├── PlanCard.svelte             # Individual tier display
└── ScanPackCard.svelte         # Scan pack purchase option

src/routes/med/settings/
└── subscription/
    └── +page.svelte            # Subscription management page
```

---

## Summary

**3 Tiers:**

- Free: 1 profile, 5 scans/year
- Caretaker (€4.99/mo): 3 profiles, 50 scans/year
- Family (€9.99/mo): Unlimited profiles, 200 scans/year

**Extra Packs:**

- 50 scans for €10 (one-time, never expires)

**Payments:**

- Web: Stripe Checkout + Customer Portal
- Mobile: cordova-plugin-purchase (StoreKit2 / Google Play Billing)
