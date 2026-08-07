-- Restrict beta_applications to admins.
--
-- The original policies in beta_applications.sql used `USING (auth.uid() IS NOT NULL)`
-- with the comment "since we don't have roles yet". profiles.is_admin was added later
-- (20260720_invite_codes.sql), so the roles now exist.
--
-- Two problems this closes:
--   1. Confidentiality (GDPR Art. 32) — any authenticated user could SELECT every
--      applicant's name, email, phone, organization, country and free-text answers.
--   2. Privilege escalation — the UPDATE policy combined with the handle_beta_approval()
--      trigger (beta_approval_simple.sql) let any authenticated user flip an application
--      to 'approved', which INSERTs into auth.users and public.profiles.
--
-- INSERT stays public: the beta application form is unauthenticated by design.

SET search_path = public;

-- Helper: is the caller an admin? SECURITY DEFINER so the policy does not depend on
-- whatever RLS is configured on public.profiles. Takes no arguments and reports only
-- on the caller, so it leaks nothing the caller does not already know.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_id = auth.uid() AND p.is_admin
  );
$$;

-- Callable by authenticated users only: RLS policies are evaluated as the querying
-- role, so `authenticated` needs EXECUTE for the policies below to work.
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

COMMENT ON FUNCTION public.is_admin_user() IS
  'True when the calling user profile has is_admin. For use in RLS policies.';

DROP POLICY IF EXISTS "Authenticated users can view beta applications" ON public.beta_applications;
DROP POLICY IF EXISTS "Authenticated users can update beta applications" ON public.beta_applications;

CREATE POLICY "Admins can view beta applications"
  ON public.beta_applications
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY "Admins can update beta applications"
  ON public.beta_applications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- No DELETE policy: applications are retained per the documented retention period and
-- removed by service_role only.
