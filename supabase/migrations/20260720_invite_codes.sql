-- Invite-only access control: admin flag + invite quota bonus on profiles,
-- invite_codes ledger, waitlist capture for users without a code.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_quota_bonus integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.invite_codes (
  code          text PRIMARY KEY,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'claimed')),
  claimed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_email text,
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invite_codes_created_by_idx ON public.invite_codes (created_by);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invite codes"
  ON public.invite_codes FOR SELECT
  USING (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join the waitlist"
  ON public.waitlist_signups FOR INSERT
  WITH CHECK (true);

-- Atomic claim: locks the row, rejects unknown/already-claimed codes,
-- otherwise marks it claimed. Modeled on public.consume_scan (20260217_subscription_billing.sql).
CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code text, p_email text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM invite_codes WHERE code = p_code FOR UPDATE;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF v_row.status = 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_claimed');
  END IF;

  UPDATE invite_codes
  SET status = 'claimed', claimed_email = p_email, claimed_at = now()
  WHERE code = p_code;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.claim_invite_code IS 'Atomically claim an invite code by code, rejecting unknown or already-claimed codes.';
