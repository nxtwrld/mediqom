-- Drop the previous triggers and functions if they exist
DROP TRIGGER IF EXISTS on_beta_approval ON public.beta_applications;
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_beta_approval();
DROP TABLE IF EXISTS public.beta_invitations;

-- Create a simple function that creates auth user when beta application is approved
CREATE OR REPLACE FUNCTION public.handle_beta_approval()
RETURNS TRIGGER AS $$
DECLARE
  new_user_id uuid;
  new_profile_id uuid;
BEGIN
  -- Only proceed if status changed to 'approved' and no profile exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.profile_id IS NULL THEN
    
    -- Create the auth user
    -- They will receive a confirmation email automatically from Supabase
    INSERT INTO auth.users (
      id,
      email,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      aud,
      role
    ) VALUES (
      gen_random_uuid(),
      NEW.email,
      NULL, -- Not confirmed yet, Supabase will send confirmation email
      jsonb_build_object(
        'name', NEW.name,
        'user_type', NEW.user_type,
        'language', NEW.language,
        'beta_application_id', NEW.id
      ),
      now(),
      now(),
      'authenticated',
      'authenticated'
    ) RETURNING id INTO new_user_id;
    
    -- Create a profile for the user
    INSERT INTO public.profiles (
      id,
      auth_id,
      fullName,
      email,
      language,
      subscription
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      NEW.name,
      NEW.email,
      NEW.language,
      CASE 
        WHEN NEW.user_type = 'provider' THEN 'pro'::subscription
        WHEN NEW.user_type = 'organization' THEN 'family'::subscription
        ELSE 'individual'::subscription
      END
    ) RETURNING id INTO new_profile_id;
    
    -- Update beta application with profile reference
    NEW.profile_id := new_profile_id;
    NEW.approved_at := now();
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to fire on beta_applications updates
CREATE TRIGGER on_beta_approval
  BEFORE UPDATE ON public.beta_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_beta_approval();

-- Update the handle_new_user function to mark beta application as converted when user confirms email
CREATE OR REPLACE FUNCTION public.handle_beta_user_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user has beta application metadata and email is now confirmed
  IF NEW.email_confirmed_at IS NOT NULL AND 
     OLD.email_confirmed_at IS NULL AND
     NEW.raw_user_meta_data->>'beta_application_id' IS NOT NULL THEN
    
    -- Update beta application status to converted
    UPDATE public.beta_applications
    SET 
      status = 'converted',
      updated_at = now()
    WHERE id = (NEW.raw_user_meta_data->>'beta_application_id')::uuid;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users to handle email confirmation
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_beta_user_confirmed();

-- Add helpful comments
COMMENT ON FUNCTION public.handle_beta_approval IS 'Creates auth user and profile when beta application is approved. Supabase automatically sends confirmation email.';
COMMENT ON FUNCTION public.handle_beta_user_confirmed IS 'Marks beta application as converted when user confirms their email';