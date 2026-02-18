-- =====================================================
-- Subscription & Billing System Migration
-- =====================================================
-- This migration extends the subscriptions table and creates
-- supporting tables for the billing system with proper security.
-- =====================================================

-- =====================================================
-- STEP 1: Create subscription_tiers table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  profile_limit INTEGER,  -- NULL = unlimited
  scan_limit INTEGER DEFAULT 5,
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
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.subscription_tiers IS 'Available subscription tiers with pricing and limits';
COMMENT ON COLUMN public.subscription_tiers.profile_limit IS 'Max profiles allowed (NULL = unlimited)';
COMMENT ON COLUMN public.subscription_tiers.scan_limit IS 'Yearly scan allowance';
COMMENT ON COLUMN public.subscription_tiers.price_monthly_eur IS 'Monthly price in EUR cents';
COMMENT ON COLUMN public.subscription_tiers.price_yearly_eur IS 'Yearly price in EUR cents';

-- Seed tier data
INSERT INTO public.subscription_tiers (id, name, profile_limit, scan_limit, price_monthly_eur, price_yearly_eur, sort_order)
VALUES
  ('free', 'Free', 1, 5, 0, 0, 0),
  ('caretaker', 'Caretaker', 3, 50, 499, 4900, 1),
  ('family', 'Family', NULL, 200, 999, 9900, 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  profile_limit = EXCLUDED.profile_limit,
  scan_limit = EXCLUDED.scan_limit,
  price_monthly_eur = EXCLUDED.price_monthly_eur,
  price_yearly_eur = EXCLUDED.price_yearly_eur,
  sort_order = EXCLUDED.sort_order;

-- =====================================================
-- STEP 2: Create scan_packs table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.scan_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scans INTEGER NOT NULL,
  price_eur INTEGER NOT NULL,  -- cents (1000 = €10)
  stripe_price_id TEXT,
  apple_product_id TEXT,
  google_product_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.scan_packs IS 'One-time scan credit packs for purchase';
COMMENT ON COLUMN public.scan_packs.price_eur IS 'Price in EUR cents';

-- Seed pack data
INSERT INTO public.scan_packs (id, name, scans, price_eur)
VALUES ('pack_50', 'Scan Pack', 50, 1000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  scans = EXCLUDED.scans,
  price_eur = EXCLUDED.price_eur;

-- =====================================================
-- STEP 3: Create purchase_history table with audit trail
-- =====================================================
CREATE TABLE IF NOT EXISTS public.purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'subscription_created', 'subscription_renewed', 'pack_purchased', 'subscription_canceled', etc.
  source TEXT NOT NULL,      -- 'stripe', 'apple', 'google', 'manual'
  amount INTEGER,            -- cents
  currency TEXT DEFAULT 'EUR',
  external_id TEXT,          -- Stripe payment intent, Apple transaction, etc.
  tier_id TEXT,
  scans_added INTEGER,
  idempotency_key TEXT UNIQUE,  -- CRITICAL: Prevent duplicate processing
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.purchase_history IS 'Audit log of all billing events';
COMMENT ON COLUMN public.purchase_history.idempotency_key IS 'Unique key to prevent duplicate event processing';
COMMENT ON COLUMN public.purchase_history.external_id IS 'External payment provider transaction ID';

-- Indexes for purchase_history
CREATE INDEX IF NOT EXISTS idx_purchase_history_user ON public.purchase_history(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_external ON public.purchase_history(external_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_idempotency ON public.purchase_history(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_purchase_history_created ON public.purchase_history(created_at DESC);

-- =====================================================
-- STEP 4: Extend subscriptions table
-- =====================================================
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS tier_id TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS google_purchase_token TEXT,
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scans_base INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS scans_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scans_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scans_reset_at TIMESTAMPTZ DEFAULT (now() + interval '1 year');

-- Add constraints for status and source (if not exists)
DO $$
BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'trialing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('stripe', 'apple', 'google', 'manual'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for external ID lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON public.subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

COMMENT ON COLUMN public.subscriptions.tier_id IS 'Current subscription tier ID';
COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: active, past_due, canceled, expired, trialing';
COMMENT ON COLUMN public.subscriptions.source IS 'Payment source: stripe, apple, google, manual';
COMMENT ON COLUMN public.subscriptions.scans_base IS 'Yearly scan allowance from tier';
COMMENT ON COLUMN public.subscriptions.scans_used IS 'Scans used from base allowance';
COMMENT ON COLUMN public.subscriptions.scans_credits IS 'Purchased scan credits (never expire)';
COMMENT ON COLUMN public.subscriptions.scans_reset_at IS 'Next yearly reset date for base scans';

-- =====================================================
-- STEP 5: Enable RLS on new tables
-- =====================================================
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 6: RLS Policies for subscription_tiers (public read)
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view active tiers" ON public.subscription_tiers;
CREATE POLICY "Anyone can view active tiers" ON public.subscription_tiers
  FOR SELECT
  USING (is_active = true);

-- Service role can manage tiers
DROP POLICY IF EXISTS "Service role can manage tiers" ON public.subscription_tiers;
CREATE POLICY "Service role can manage tiers" ON public.subscription_tiers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- STEP 7: RLS Policies for scan_packs (public read)
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view active packs" ON public.scan_packs;
CREATE POLICY "Anyone can view active packs" ON public.scan_packs
  FOR SELECT
  USING (is_active = true);

-- Service role can manage packs
DROP POLICY IF EXISTS "Service role can manage packs" ON public.scan_packs;
CREATE POLICY "Service role can manage packs" ON public.scan_packs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- STEP 8: RLS Policies for purchase_history
-- =====================================================
-- Users can only view their own purchase history
DROP POLICY IF EXISTS "Users can view own purchase history" ON public.purchase_history;
CREATE POLICY "Users can view own purchase history" ON public.purchase_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert purchases (webhooks)
DROP POLICY IF EXISTS "Service role can insert purchases" ON public.purchase_history;
CREATE POLICY "Service role can insert purchases" ON public.purchase_history
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can manage all purchases
DROP POLICY IF EXISTS "Service role can manage purchases" ON public.purchase_history;
CREATE POLICY "Service role can manage purchases" ON public.purchase_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- STEP 9: Atomic scan consumption function
-- =====================================================
CREATE OR REPLACE FUNCTION public.consume_scan(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_consumed BOOLEAN := false;
  v_source TEXT := NULL;
  v_remaining_base INTEGER;
  v_remaining_credits INTEGER;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'no_subscription',
      'available', 0
    );
  END IF;

  -- Check if subscription is active
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'subscription_inactive',
      'status', v_subscription.status,
      'available', 0
    );
  END IF;

  v_remaining_base := v_subscription.scans_base - v_subscription.scans_used;
  v_remaining_credits := v_subscription.scans_credits;

  -- Try base scans first
  IF v_remaining_base > 0 THEN
    UPDATE subscriptions
    SET scans_used = scans_used + 1, updated_at = now()
    WHERE id = p_user_id;
    v_consumed := true;
    v_source := 'base';
    v_remaining_base := v_remaining_base - 1;
  -- Then try credits
  ELSIF v_remaining_credits > 0 THEN
    UPDATE subscriptions
    SET scans_credits = scans_credits - 1, updated_at = now()
    WHERE id = p_user_id;
    v_consumed := true;
    v_source := 'credits';
    v_remaining_credits := v_remaining_credits - 1;
  END IF;

  RETURN jsonb_build_object(
    'success', v_consumed,
    'reason', CASE WHEN v_consumed THEN 'consumed' ELSE 'no_scans' END,
    'source', v_source,
    'remaining_base', v_remaining_base,
    'remaining_credits', v_remaining_credits,
    'available', v_remaining_base + v_remaining_credits
  );
END;
$$;

COMMENT ON FUNCTION public.consume_scan IS 'Atomically consume one scan, using base scans first then credits';

-- =====================================================
-- STEP 10: Check scan availability function
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_scans_available(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_remaining_base INTEGER;
  v_remaining_credits INTEGER;
BEGIN
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_user_id;

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'available', 0,
      'base_remaining', 0,
      'credits', 0,
      'tier_id', 'free',
      'status', 'no_subscription'
    );
  END IF;

  v_remaining_base := GREATEST(0, v_subscription.scans_base - v_subscription.scans_used);
  v_remaining_credits := COALESCE(v_subscription.scans_credits, 0);

  RETURN jsonb_build_object(
    'available', v_remaining_base + v_remaining_credits,
    'base_remaining', v_remaining_base,
    'base_total', v_subscription.scans_base,
    'base_used', v_subscription.scans_used,
    'credits', v_remaining_credits,
    'tier_id', v_subscription.tier_id,
    'status', v_subscription.status,
    'reset_at', v_subscription.scans_reset_at
  );
END;
$$;

COMMENT ON FUNCTION public.check_scans_available IS 'Get available scans for a user';

-- =====================================================
-- STEP 11: Add scan credits function
-- =====================================================
CREATE OR REPLACE FUNCTION public.add_scan_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  -- Idempotency check if key provided
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM purchase_history WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'duplicate');
    END IF;
  END IF;

  -- Add credits
  UPDATE subscriptions
  SET scans_credits = COALESCE(scans_credits, 0) + p_credits, updated_at = now()
  WHERE id = p_user_id
  RETURNING scans_credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_subscription');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credits_added', p_credits,
    'total_credits', v_new_credits
  );
END;
$$;

COMMENT ON FUNCTION public.add_scan_credits IS 'Add purchased scan credits to a user account';

-- =====================================================
-- STEP 12: Reset base scans function (yearly)
-- =====================================================
CREATE OR REPLACE FUNCTION public.reset_base_scans(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
BEGIN
  SELECT s.*, t.scan_limit
  INTO v_subscription
  FROM subscriptions s
  LEFT JOIN subscription_tiers t ON s.tier_id = t.id
  WHERE s.id = p_user_id
  FOR UPDATE;

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_subscription');
  END IF;

  -- Only reset if past reset date
  IF v_subscription.scans_reset_at > now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_due');
  END IF;

  UPDATE subscriptions
  SET
    scans_base = COALESCE(v_subscription.scan_limit, 5),
    scans_used = 0,
    scans_reset_at = now() + interval '1 year',
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_base', COALESCE(v_subscription.scan_limit, 5),
    'next_reset', now() + interval '1 year'
  );
END;
$$;

COMMENT ON FUNCTION public.reset_base_scans IS 'Reset yearly base scan allowance';

-- =====================================================
-- STEP 13: Update subscription tier function
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_subscription_tier(
  p_user_id UUID,
  p_tier_id TEXT,
  p_source TEXT DEFAULT 'manual',
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier RECORD;
  v_old_tier_id TEXT;
BEGIN
  -- Idempotency check if key provided
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM purchase_history WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'duplicate');
    END IF;
  END IF;

  -- Validate tier exists
  SELECT * INTO v_tier FROM subscription_tiers WHERE id = p_tier_id AND is_active = true;
  IF v_tier IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_tier');
  END IF;

  -- Get current tier for logging
  SELECT tier_id INTO v_old_tier_id FROM subscriptions WHERE id = p_user_id;

  -- Upsert subscription
  INSERT INTO subscriptions (
    id,
    tier_id,
    status,
    source,
    stripe_customer_id,
    stripe_subscription_id,
    current_period_start,
    current_period_end,
    scans_base,
    scans_used,
    profiles,
    scans_reset_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_tier_id,
    'active',
    p_source,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    COALESCE(p_period_start, now()),
    p_period_end,
    v_tier.scan_limit,
    0,  -- Reset scans used on upgrade
    COALESCE(v_tier.profile_limit, 999),  -- Use 999 for "unlimited"
    now() + interval '1 year',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tier_id = EXCLUDED.tier_id,
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    scans_base = EXCLUDED.scans_base,
    scans_used = 0,  -- Reset on tier change
    profiles = EXCLUDED.profiles,
    scans_reset_at = EXCLUDED.scans_reset_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'tier_id', p_tier_id,
    'old_tier_id', v_old_tier_id,
    'scans_base', v_tier.scan_limit,
    'profile_limit', v_tier.profile_limit
  );
END;
$$;

COMMENT ON FUNCTION public.update_subscription_tier IS 'Update user subscription to a new tier';

-- =====================================================
-- STEP 14: Check profile limit function
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_profile_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_profile_count INTEGER;
BEGIN
  SELECT s.*, t.profile_limit, t.name as tier_name
  INTO v_subscription
  FROM subscriptions s
  LEFT JOIN subscription_tiers t ON s.tier_id = t.id
  WHERE s.id = p_user_id;

  IF v_subscription IS NULL THEN
    -- Default to free tier limits
    v_subscription.profile_limit := 1;
    v_subscription.tier_name := 'Free';
  END IF;

  -- Count profiles owned by this user
  SELECT COUNT(*) INTO v_profile_count
  FROM profiles
  WHERE auth_id = p_user_id;

  RETURN jsonb_build_object(
    'can_create', v_subscription.profile_limit IS NULL OR v_profile_count < v_subscription.profile_limit,
    'current_count', v_profile_count,
    'limit', v_subscription.profile_limit,
    'tier', v_subscription.tier_name,
    'is_unlimited', v_subscription.profile_limit IS NULL
  );
END;
$$;

COMMENT ON FUNCTION public.check_profile_limit IS 'Check if user can create more profiles based on tier';

-- =====================================================
-- STEP 15: Migrate existing users to new schema
-- =====================================================
-- Set tier_id based on existing 'profiles' column
UPDATE public.subscriptions
SET
  tier_id = CASE
    WHEN profiles >= 999 OR profiles IS NULL THEN 'family'
    WHEN profiles >= 3 THEN 'caretaker'
    ELSE 'free'
  END,
  scans_base = CASE
    WHEN profiles >= 999 OR profiles IS NULL THEN 200
    WHEN profiles >= 3 THEN 50
    ELSE 5
  END,
  scans_reset_at = COALESCE(scans_reset_at, now() + interval '1 year')
WHERE tier_id IS NULL OR tier_id = '';

-- =====================================================
-- STEP 16: Grant permissions
-- =====================================================
GRANT SELECT ON public.subscription_tiers TO anon, authenticated;
GRANT SELECT ON public.scan_packs TO anon, authenticated;
GRANT SELECT ON public.purchase_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_scan TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_scans_available TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_profile_limit TO authenticated;

-- Service role needs all permissions for webhook processing
GRANT ALL ON public.subscription_tiers TO service_role;
GRANT ALL ON public.scan_packs TO service_role;
GRANT ALL ON public.purchase_history TO service_role;
GRANT ALL ON public.subscriptions TO service_role;
GRANT EXECUTE ON FUNCTION public.add_scan_credits TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_base_scans TO service_role;
GRANT EXECUTE ON FUNCTION public.update_subscription_tier TO service_role;
