-- Add encrypted columns to import_jobs table for secure storage of medical data
-- This migration adds encryption support for extraction results and analysis results

-- Add encrypted columns (keep original columns for backwards compatibility during rollout)
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS encrypted_extraction_result TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_analysis_results TEXT,
  ADD COLUMN IF NOT EXISTS result_encryption_key TEXT;

-- Add helpful comments
COMMENT ON COLUMN public.import_jobs.encrypted_extraction_result IS 'AES-256-GCM encrypted extraction results with IV';
COMMENT ON COLUMN public.import_jobs.encrypted_analysis_results IS 'AES-256-GCM encrypted analysis results with IV';
COMMENT ON COLUMN public.import_jobs.result_encryption_key IS 'Job encryption key wrapped with user RSA public key';

-- Update TTL trigger to use 1 hour for completed jobs (instead of 7 days)
-- This reduces exposure window for sensitive medical data
CREATE OR REPLACE FUNCTION public.update_import_job_ttl()
RETURNS TRIGGER AS $$
BEGIN
  SET search_path = public;

  IF NEW.status = 'completed' THEN
    NEW.expires_at = NOW() + INTERVAL '1 hour'; -- Reduced from 7 days to 1 hour
  ELSIF NEW.status = 'error' THEN
    NEW.expires_at = NOW() + INTERVAL '24 hours'; -- Keep 24 hours for debugging failed jobs
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_import_job_ttl'
  ) THEN
    CREATE TRIGGER trigger_update_import_job_ttl
      BEFORE UPDATE ON public.import_jobs
      FOR EACH ROW
      WHEN (NEW.status IS DISTINCT FROM OLD.status)
      EXECUTE FUNCTION public.update_import_job_ttl();
  END IF;
END
$$;
