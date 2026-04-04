-- Post-Quantum Cryptography: Add ML-KEM-768 key columns
-- Hybrid RSA-4096 + ML-KEM-768 encryption for quantum-resistant key wrapping
-- Existing RSA-only users remain unaffected (NULL KEM columns, key_mode = 'rsa-only')

-- ML-KEM public key on profiles (alongside existing RSA publicKey)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kem_public_key text,
  ADD COLUMN IF NOT EXISTS key_mode text NOT NULL DEFAULT 'rsa-only';

COMMENT ON COLUMN public.profiles.kem_public_key IS 'ML-KEM-768 public key (format: "mlkem768:<base64>"), NULL for RSA-only users';
COMMENT ON COLUMN public.profiles.key_mode IS 'Key mode: rsa-only (legacy) or hybrid (RSA + ML-KEM)';

-- ML-KEM encrypted secret key on private_keys (alongside existing RSA privateKey)
ALTER TABLE public.private_keys
  ADD COLUMN IF NOT EXISTS kem_secret_key text,
  ADD COLUMN IF NOT EXISTS key_mode text NOT NULL DEFAULT 'rsa-only';

COMMENT ON COLUMN public.private_keys.kem_secret_key IS 'AES-encrypted ML-KEM-768 secret key, NULL for RSA-only users';
COMMENT ON COLUMN public.private_keys.key_mode IS 'Key mode: rsa-only (legacy) or hybrid (RSA + ML-KEM)';

-- Drop and recreate find_profile_by_email with kem_public_key in return type
DROP FUNCTION IF EXISTS public.find_profile_by_email(text);

CREATE FUNCTION public.find_profile_by_email(lookup_email TEXT)
RETURNS TABLE (id uuid, auth_id uuid, "publicKey" text, kem_public_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.auth_id, p."publicKey", p.kem_public_key
  FROM auth.users u
  JOIN public.profiles p ON p.auth_id = u.id
  WHERE lower(u.email) = lower(lookup_email)
  LIMIT 1;
$$;
