-- Fix security warning: Set search path for database functions to prevent injection

-- Update the get_user_role function with proper search path (already has it, but ensuring it's optimal)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = _user_id;
$$;

-- Update the handle_new_user function with proper search path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if profile exists with this email
  UPDATE public.profiles
  SET
    user_id = NEW.id,
    full_name = COALESCE(full_name, NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  WHERE email = NEW.email AND user_id IS NULL;

  -- If no existing profile, create one
  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      user_id,
      email,
      full_name,
      source
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'signup'
    )
    ON CONFLICT (email) DO UPDATE
    SET user_id = NEW.id
    WHERE profiles.user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Update the update_updated_at_column function with proper search path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add additional security: Create an audit log table for sensitive operations
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  email text,
  client_ip text,
  user_agent text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view audit logs"
ON public.security_audit_log
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON public.security_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON public.security_audit_log(event_type);