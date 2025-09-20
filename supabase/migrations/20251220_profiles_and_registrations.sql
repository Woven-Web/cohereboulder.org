-- Migration: Separate profiles and registrations tables
-- This replaces the unified members table with a more scalable structure

-- Drop existing members table and related objects
DROP TABLE IF EXISTS public.members CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Keep the app_role enum (already exists)
-- Keep the update_updated_at_column function (already exists)

-- Create profiles table (persistent user data)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  organizations TEXT,
  subscribed BOOLEAN DEFAULT true,
  unsubscribe_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  role app_role DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  source TEXT DEFAULT 'registration'
);

-- Create registrations table (event-specific data)
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohere_event TEXT NOT NULL DEFAULT 'october2025',
  can_attend_invocation BOOLEAN,
  can_attend_integration BOOLEAN,
  co_creating_interests TEXT[] DEFAULT '{}',
  how_did_you_hear TEXT,
  additional_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  -- One registration per person per event
  UNIQUE(profile_id, cohere_event)
);

-- Create indexes for performance
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_profiles_unsubscribe_token ON public.profiles(unsubscribe_token);
CREATE INDEX idx_profiles_role ON public.profiles(role) WHERE role != 'user';

CREATE INDEX idx_registrations_profile_id ON public.registrations(profile_id);
CREATE INDEX idx_registrations_cohere_event ON public.registrations(cohere_event);
CREATE INDEX idx_registrations_created_at ON public.registrations(created_at DESC);

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- RLS Policies for profiles
-- =====================

-- Anyone can check if an email exists (for duplicate detection)
CREATE POLICY "profiles_public_email_check"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Users can view their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid() OR
      email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- Users can update their own profile (except role)
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid() OR
      email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    role = (SELECT role FROM public.profiles WHERE id = profiles.id) AND
    (user_id IS NULL OR user_id = auth.uid() OR user_id = (SELECT user_id FROM public.profiles WHERE id = profiles.id))
  );

-- Anyone can create a profile (for public registration)
CREATE POLICY "profiles_insert_public"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    role = 'user' AND
    (user_id IS NULL OR user_id = auth.uid())
  );

-- Anyone can unsubscribe with valid token
CREATE POLICY "profiles_unsubscribe_token"
  ON public.profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (
    unsubscribe_token = (SELECT unsubscribe_token FROM public.profiles WHERE id = profiles.id) AND
    -- Only allow updating subscription status
    id = (SELECT id FROM public.profiles WHERE id = profiles.id) AND
    email = (SELECT email FROM public.profiles WHERE id = profiles.id) AND
    full_name = (SELECT full_name FROM public.profiles WHERE id = profiles.id) AND
    role = (SELECT role FROM public.profiles WHERE id = profiles.id) AND
    user_id IS NOT DISTINCT FROM (SELECT user_id FROM public.profiles WHERE id = profiles.id)
  );

-- Admins can view all profiles
CREATE POLICY "profiles_admin_select"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Admins can update all profiles
CREATE POLICY "profiles_admin_update"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- =====================
-- RLS Policies for registrations
-- =====================

-- Anyone can view registrations (needed for checking duplicates)
CREATE POLICY "registrations_public_select"
  ON public.registrations
  FOR SELECT
  USING (true);

-- Users can view their own registrations
CREATE POLICY "registrations_select_own"
  ON public.registrations
  FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM public.profiles
      WHERE user_id = auth.uid()
      OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- Users can update their own registrations
CREATE POLICY "registrations_update_own"
  ON public.registrations
  FOR UPDATE
  USING (
    profile_id IN (
      SELECT id FROM public.profiles
      WHERE user_id = auth.uid()
      OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- Users can create registrations for their profile
CREATE POLICY "registrations_insert_own"
  ON public.registrations
  FOR INSERT
  WITH CHECK (
    profile_id IN (
      SELECT id FROM public.profiles
      WHERE user_id = auth.uid()
      OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- Public can create registrations (with their profile)
CREATE POLICY "registrations_insert_public"
  ON public.registrations
  FOR INSERT
  WITH CHECK (true);

-- Admins can do everything with registrations
CREATE POLICY "registrations_admin_all"
  ON public.registrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- =====================
-- Function to handle new user signups
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-create trigger for auth users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add helpful comments
COMMENT ON TABLE public.profiles IS 'User profiles that persist across multiple COhere events';
COMMENT ON TABLE public.registrations IS 'Event-specific registrations linked to profiles';
COMMENT ON COLUMN public.registrations.cohere_event IS 'Event identifier (e.g., october2025, spring2026)';
COMMENT ON COLUMN public.profiles.role IS 'User role for admin panel access';
