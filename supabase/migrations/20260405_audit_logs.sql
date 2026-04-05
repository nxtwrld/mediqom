-- HIPAA Audit Logging (45 CFR § 164.312)
-- Tamper-resistant audit trail for all ePHI access, modifications, sharing, and key management.
-- Zero-knowledge: logs contain IDs, types, actions — never plaintext medical data.
-- 6+ year retention (HIPAA minimum). ON DELETE SET NULL preserves logs after account deletion.

SET search_path = public;

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WHO
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'anonymous' | 'system'
  actor_email TEXT,                                -- for unauthenticated endpoints (recovery)
  -- WHAT
  action TEXT NOT NULL,                            -- 'read' | 'create' | 'update' | 'delete' | 'share' | 'revoke' | 'accept' | 'recover' | 'encrypt_change' | 'process' | 'login'
  resource_type TEXT NOT NULL,                     -- 'document' | 'profile' | 'share' | 'import_job' | 'chat' | 'session' | 'encryption' | 'account' | 'auth'
  resource_id TEXT,
  -- WHERE
  ip_address INET,
  user_agent TEXT,
  endpoint TEXT,
  http_method TEXT,
  -- CONTEXT (no plaintext ePHI)
  metadata JSONB DEFAULT '{}',
  -- OUTCOME
  status_code INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  -- WHEN
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_logs_user_time ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_time ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own logs only
CREATE POLICY "Users can read own audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can INSERT (used by server-side audit utility)
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can SELECT all logs (for admin/compliance queries)
CREATE POLICY "Service role can read all audit logs"
  ON public.audit_logs
  FOR SELECT
  TO service_role
  USING (true);

-- No UPDATE or DELETE policies for anyone — logs are immutable
-- (service_role bypasses RLS by default, but application code never issues UPDATE/DELETE)

COMMENT ON TABLE public.audit_logs IS 'HIPAA audit trail — immutable, zero-knowledge, 6+ year retention';
