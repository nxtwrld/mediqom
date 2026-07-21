-- claim_invite_code is only ever called from our service-role endpoints
-- (see src/lib/invite/redeem.server.ts); anon/authenticated should not be
-- able to call it directly via PostgREST.
REVOKE EXECUTE ON FUNCTION public.claim_invite_code(text, text) FROM anon, authenticated;
