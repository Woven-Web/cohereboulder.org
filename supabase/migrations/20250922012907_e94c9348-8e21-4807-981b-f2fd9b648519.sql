-- Fix security warnings and anonymous registration flow

-- ==============================================
-- 1. FIX FUNCTION SEARCH PATH ISSUES
-- ==============================================

-- Fix the prevent_role_escalation function to have proper search_path
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If role is being changed
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Check if current user is admin
    IF get_user_role(auth.uid()) != 'admin'::text THEN
      RAISE EXCEPTION 'Only administrators can modify user roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================
-- 2. FIX ANONYMOUS REGISTRATION FLOW
-- ==============================================

-- Update profiles INSERT policy to allow anonymous registration
-- while maintaining security
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  -- Authenticated users can only create profiles for themselves
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Allow anonymous profile creation (for registration flow)
  -- but user_id must be NULL and email must be provided
  (auth.uid() IS NULL AND user_id IS NULL AND email IS NOT NULL)
);

-- Update profiles SELECT policy to allow users to see profiles they just created
-- during anonymous registration (needed for linking)
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
  -- Users can see their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Admins can see all profiles  
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
  OR
  -- Allow reading profiles during account linking process
  -- (profiles with no user_id that match the current session email)
  (auth.uid() IS NOT NULL AND user_id IS NULL AND email = auth.email())
);

-- Update profiles UPDATE policy to allow account linking
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
  -- Users can update their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Allow account linking: updating user_id from NULL to auth.uid() when emails match
  (auth.uid() IS NOT NULL AND user_id IS NULL AND email = auth.email())
) WITH CHECK (
  -- Users can update their own profile but cannot change their role (unless admin)
  (auth.uid() IS NOT NULL AND user_id = auth.uid() AND (
    -- Either role is not being changed
    role = (SELECT role FROM profiles WHERE user_id = auth.uid())
    OR
    -- Or user is admin (can change roles)
    get_user_role(auth.uid()) = 'admin'::text
  ))
  OR
  -- Allow account linking: setting user_id to auth.uid() when linking accounts
  (auth.uid() IS NOT NULL AND user_id = auth.uid() AND email = auth.email())
);