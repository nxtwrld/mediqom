-- User preferences: units, theme, language display, etc.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.settings IS 'User preferences JSON: units, theme, etc.';
