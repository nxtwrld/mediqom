-- Migration: Add cascade delete constraints for user deletion
-- Date: 2026-02-16
-- Purpose: Enable proper user deletion by adding ON DELETE CASCADE/SET NULL to foreign keys
--
-- This migration allows deleting users from auth.users without foreign key constraint violations.
-- It implements the following strategy:
-- - User data tables (profiles, documents, keys, etc.): ON DELETE CASCADE
-- - Audit log tables (beta_applications): ON DELETE SET NULL (preserve history)
--
-- Rollback plan: If migration fails, all changes are rolled back automatically (transaction-wrapped)
-- To manually rollback: recreate constraints without ON DELETE clauses (original RESTRICT behavior)

BEGIN;

-- Set search path for security (prevent function hijacking)
SET search_path = public;

-- ============================================================================
-- STEP 1: Drop and recreate keys constraints (deepest dependencies)
-- ============================================================================

-- Keys depend on documents, profiles, and auth.users
-- Drop all keys foreign key constraints
ALTER TABLE public.keys DROP CONSTRAINT IF EXISTS keys_user_id_fkey;
ALTER TABLE public.keys DROP CONSTRAINT IF EXISTS keys_author_id_fkey;
ALTER TABLE public.keys DROP CONSTRAINT IF EXISTS keys_document_id_fkey;
ALTER TABLE public.keys DROP CONSTRAINT IF EXISTS keys_owner_id_fkey;

-- Recreate with CASCADE
ALTER TABLE public.keys
  ADD CONSTRAINT keys_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.keys
  ADD CONSTRAINT keys_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(auth_id)
  ON DELETE CASCADE;

ALTER TABLE public.keys
  ADD CONSTRAINT keys_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id)
  ON DELETE CASCADE;

ALTER TABLE public.keys
  ADD CONSTRAINT keys_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- ============================================================================
-- STEP 2: Drop and recreate documents constraints
-- ============================================================================

-- Documents depend on profiles
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_author_id_fkey;

-- Recreate with CASCADE
ALTER TABLE public.documents
  ADD CONSTRAINT documents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(auth_id)
  ON DELETE CASCADE;

-- ============================================================================
-- STEP 3: Drop and recreate private_keys constraints
-- ============================================================================

-- Private keys use profile.id as primary key
ALTER TABLE public.private_keys DROP CONSTRAINT IF EXISTS private_keys_id_fkey;

-- Recreate with CASCADE
ALTER TABLE public.private_keys
  ADD CONSTRAINT private_keys_id_fkey
  FOREIGN KEY (id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- ============================================================================
-- STEP 4: Drop and recreate profiles_links constraints
-- ============================================================================

-- Profile links connect profiles to each other
ALTER TABLE public.profiles_links DROP CONSTRAINT IF EXISTS profiles_links_profile_id_fkey;
ALTER TABLE public.profiles_links DROP CONSTRAINT IF EXISTS profiles_links_parent_id_fkey;

-- Recreate with CASCADE
ALTER TABLE public.profiles_links
  ADD CONSTRAINT profiles_links_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.profiles_links
  ADD CONSTRAINT profiles_links_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- ============================================================================
-- STEP 5: Drop and recreate subscriptions constraints
-- ============================================================================

-- Subscriptions use profiles.auth_id as primary key
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_id_fkey;

-- Recreate with CASCADE
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_id_fkey
  FOREIGN KEY (id) REFERENCES public.profiles(auth_id)
  ON DELETE CASCADE;

-- ============================================================================
-- STEP 6: Drop and recreate beta_applications constraints (AUDIT LOG - SET NULL)
-- ============================================================================

-- Beta applications should preserve history even after user deletion
ALTER TABLE public.beta_applications DROP CONSTRAINT IF EXISTS beta_applications_profile_id_fkey;
ALTER TABLE public.beta_applications DROP CONSTRAINT IF EXISTS beta_applications_approved_by_fkey;

-- Recreate with SET NULL (preserve audit trail)
ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ============================================================================
-- STEP 7: Drop and recreate profiles constraints (root dependencies)
-- ============================================================================

-- Profiles depend on auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_auth_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_owner_id_fkey1;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_owner_id_fkey;

-- Recreate with CASCADE
-- When auth.users record is deleted, cascade to profile
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auth_id_fkey
  FOREIGN KEY (auth_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- When owner (auth.users) is deleted, cascade to owned profiles (family accounts)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON CONSTRAINT keys_user_id_fkey ON public.keys IS 'Cascade delete: keys deleted when profile is deleted';
COMMENT ON CONSTRAINT keys_document_id_fkey ON public.keys IS 'Cascade delete: keys deleted when document is deleted';
COMMENT ON CONSTRAINT documents_user_id_fkey ON public.documents IS 'Cascade delete: documents deleted when profile is deleted';
COMMENT ON CONSTRAINT private_keys_id_fkey ON public.private_keys IS 'Cascade delete: private keys deleted when profile is deleted';
COMMENT ON CONSTRAINT subscriptions_id_fkey ON public.subscriptions IS 'Cascade delete: subscription deleted when profile is deleted';
COMMENT ON CONSTRAINT beta_applications_profile_id_fkey ON public.beta_applications IS 'SET NULL: preserve beta application history after profile deletion';
COMMENT ON CONSTRAINT beta_applications_approved_by_fkey ON public.beta_applications IS 'SET NULL: preserve who approved even if admin is deleted';
COMMENT ON CONSTRAINT profiles_auth_id_fkey ON public.profiles IS 'Cascade delete: profile deleted when auth user is deleted';
COMMENT ON CONSTRAINT profiles_owner_id_fkey ON public.profiles IS 'Cascade delete: family profiles deleted when owner is deleted';

COMMIT;

-- ============================================================================
-- Verification queries (run after migration):
-- ============================================================================
--
-- -- Check constraint configuration
-- SELECT
--   conname AS constraint_name,
--   conrelid::regclass AS table_name,
--   confrelid::regclass AS referenced_table,
--   confdeltype AS on_delete_action,
--   CASE confdeltype
--     WHEN 'a' THEN 'NO ACTION'
--     WHEN 'r' THEN 'RESTRICT'
--     WHEN 'c' THEN 'CASCADE'
--     WHEN 'n' THEN 'SET NULL'
--     WHEN 'd' THEN 'SET DEFAULT'
--   END AS on_delete_meaning
-- FROM pg_constraint
-- WHERE contype = 'f'
--   AND connamespace = 'public'::regnamespace
-- ORDER BY table_name, constraint_name;
