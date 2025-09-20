-- Initial Schema Setup with Unified Members Table
-- This creates a clean database structure from scratch

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create the unified members table
CREATE TABLE public.members (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,

  -- Profile Information
  full_name TEXT NOT NULL,
  phone_number TEXT,
  organizations TEXT,

  -- Registration Details
  registration_status TEXT DEFAULT 'registered' CHECK (
    registration_status IN ('interested', 'registered', 'cancelled', 'waitlisted')
  ),
  can_attend_invocation BOOLEAN,
  can_attend_integration BOOLEAN,
  co_creating_interests TEXT[] DEFAULT '{}',
  financial_contribution_interest BOOLEAN DEFAULT FALSE,
  how_did_you_hear TEXT,
  additional_notes TEXT,

  -- Interest Form Fields (for early interest tracking)
  participation_types TEXT[] DEFAULT '{}',
  themes TEXT[] DEFAULT '{}',

  -- Email Preferences
  subscribed BOOLEAN DEFAULT true,
  marketing_consent BOOLEAN DEFAULT true,
  event_notifications BOOLEAN DEFAULT true,
  unsubscribe_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Admin Fields
  role app_role DEFAULT 'user',
  internal_notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source TEXT DEFAULT 'registration_form'
);

-- Create indexes for performance
CREATE INDEX idx_members_email ON public.members(email);
CREATE INDEX idx_members_user_id ON public.members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_members_unsubscribe_token ON public.members(unsubscribe_token);
CREATE INDEX idx_members_registration_status ON public.members(registration_status);
CREATE INDEX idx_members_role ON public.members(role) WHERE role != 'user';
CREATE INDEX idx_members_created_at ON public.members(created_at DESC);

-- Enable RLS
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Create update trigger
CREATE TRIGGER update_members_updated_at
BEFORE UPDATE ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies

-- Anyone can register (insert)
CREATE POLICY "members_insert_public"
ON public.members
FOR INSERT
WITH CHECK (
  -- Allow public registration with basic fields only
  role = 'user' AND
  (user_id IS NULL OR user_id = auth.uid())
);

-- Users can view their own record
CREATE POLICY "members_select_own"
ON public.members
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    user_id = auth.uid() OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Users can update their own record
CREATE POLICY "members_update_own"
ON public.members
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND (
    user_id = auth.uid() OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
)
WITH CHECK (
  -- Can't change email if linked to user
  (user_id IS NULL OR email = OLD.email) AND
  -- Can't change role
  role = OLD.role AND
  -- Can't change user_id unless linking their own
  (user_id = OLD.user_id OR user_id = auth.uid())
);

-- Admins can do everything
CREATE POLICY "members_admin_all"
ON public.members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Anyone can unsubscribe with valid token
CREATE POLICY "members_unsubscribe_token"
ON public.members
FOR UPDATE
USING (true)
WITH CHECK (
  -- Only allow updating email preferences with valid token
  unsubscribe_token = OLD.unsubscribe_token AND
  -- Only these fields can be updated
  (NEW.subscribed IS DISTINCT FROM OLD.subscribed OR
   NEW.marketing_consent IS DISTINCT FROM OLD.marketing_consent OR
   NEW.event_notifications IS DISTINCT FROM OLD.event_notifications) AND
  -- Everything else must stay the same
  NEW.id = OLD.id AND
  NEW.email = OLD.email AND
  NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND
  NEW.role = OLD.role
);

-- Public can check if email exists (for duplicate detection)
CREATE POLICY "members_check_email_exists"
ON public.members
FOR SELECT
USING (true);

-- Function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if member exists with this email
  UPDATE public.members
  SET
    user_id = NEW.id,
    full_name = COALESCE(full_name, NEW.raw_user_meta_data->>'full_name'),
    last_activity_at = now()
  WHERE email = NEW.email;

  -- If no existing member, create one
  IF NOT FOUND THEN
    INSERT INTO public.members (
      user_id,
      email,
      full_name,
      source,
      registration_status
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'signup',
      'interested'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auth users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add comments for documentation
COMMENT ON TABLE public.members IS 'Unified table for all community members, combining registrations, profiles, and email preferences';
COMMENT ON COLUMN public.members.registration_status IS 'Member status: interested (early interest), registered (confirmed registration), cancelled, or waitlisted';
COMMENT ON COLUMN public.members.role IS 'User role for admin panel access';
COMMENT ON COLUMN public.members.source IS 'How this member record was created';
