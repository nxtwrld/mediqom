-- Document Shares: tracks which documents have been shared and with whom
CREATE TABLE public.document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  recipient_email TEXT NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  pending_encrypted_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Sharer sees their own outgoing shares
CREATE POLICY "sharer_can_view" ON public.document_shares
  FOR SELECT USING (sharer_id IN (
    SELECT id FROM public.profiles WHERE auth_id = auth.uid()
  ));

-- Recipient sees shares addressed to them (once they have a profile)
CREATE POLICY "recipient_can_view" ON public.document_shares
  FOR SELECT USING (recipient_id IN (
    SELECT id FROM public.profiles WHERE auth_id = auth.uid()
  ));

-- Service role for insert/update
CREATE POLICY "service_insert" ON public.document_shares
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_update" ON public.document_shares
  FOR UPDATE USING (auth.role() = 'service_role');

-- Helper: find a profile (and auth ID + public key) by the user's email
CREATE OR REPLACE FUNCTION public.find_profile_by_email(lookup_email TEXT)
RETURNS TABLE (id UUID, auth_id UUID, "publicKey" TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.auth_id, p."publicKey"
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.auth_id
  WHERE u.email = lookup_email
  LIMIT 1;
$$;
