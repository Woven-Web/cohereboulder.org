-- PHASE 1: CRITICAL SECURITY FIXES

-- ==============================================
-- 1. SECURE PROFILES TABLE RLS POLICIES
-- ==============================================

-- Drop existing insecure policies
DROP POLICY IF EXISTS "Users can view profiles properly" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation for authenticated users and anonymous re" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile updates" ON public.profiles;
DROP POLICY IF EXISTS "allow_delete_own_profile" ON public.profiles;

-- Create secure SELECT policy - no anonymous access
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
  -- Users can only see their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Admins can see all profiles
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Create secure INSERT policy - only authenticated users can create profiles
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  -- Only authenticated users can create profiles, and only for themselves
  auth.uid() IS NOT NULL AND user_id = auth.uid()
);

-- Create secure UPDATE policy - prevent role changes by regular users
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
  -- Users can only update their own profile
  auth.uid() IS NOT NULL AND user_id = auth.uid()
) WITH CHECK (
  -- Users can update their own profile but cannot change their role
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid()
  AND (
    -- Either role is not being changed
    role = (SELECT role FROM profiles WHERE user_id = auth.uid())
    OR
    -- Or user is admin (can change roles)
    get_user_role(auth.uid()) = 'admin'::text
  )
);

-- Create secure DELETE policy
CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE USING (
  -- Users can delete their own profile, admins can delete any
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- ==============================================
-- 2. SECURE REGISTRATIONS TABLE RLS POLICIES
-- ==============================================

-- Drop existing dangerous policies
DROP POLICY IF EXISTS "allow_insert_registrations" ON public.registrations;
DROP POLICY IF EXISTS "allow_update_registrations" ON public.registrations;
DROP POLICY IF EXISTS "allow_select_registrations" ON public.registrations;
DROP POLICY IF EXISTS "allow_delete_registrations" ON public.registrations;

-- Create secure SELECT policy
CREATE POLICY "registrations_select_policy" ON public.registrations
FOR SELECT USING (
  -- Users can see registrations for their own profile
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  -- Admins can see all registrations
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Create secure INSERT policy
CREATE POLICY "registrations_insert_policy" ON public.registrations
FOR INSERT WITH CHECK (
  -- Users can only create registrations for their own profile
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  -- Allow registration creation for profiles without user_id (anonymous registration)
  -- This is needed for the registration flow before authentication
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id IS NULL
  )
  OR
  -- Admins can create registrations for anyone
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Create secure UPDATE policy  
CREATE POLICY "registrations_update_policy" ON public.registrations
FOR UPDATE USING (
  -- Users can update registrations for their own profile
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  -- Admins can update all registrations
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
) WITH CHECK (
  -- Same check for the updated data
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Create secure DELETE policy
CREATE POLICY "registrations_delete_policy" ON public.registrations
FOR DELETE USING (
  -- Users can delete registrations for their own profile
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  -- Admins can delete all registrations
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- ==============================================
-- 3. PREVENT PRIVILEGE ESCALATION
-- ==============================================

-- Create function to prevent role changes by non-admins
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to prevent role escalation
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();

-- ==============================================
-- 4. SECURE MAP SUGGESTIONS (BONUS)
-- ==============================================

-- The map_suggestions table also needs better security
-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can insert suggestions" ON public.map_suggestions;
DROP POLICY IF EXISTS "Users can view own suggestions, admins view all" ON public.map_suggestions;

-- Create secure policies for map_suggestions
CREATE POLICY "map_suggestions_insert_policy" ON public.map_suggestions
FOR INSERT WITH CHECK (
  -- Only authenticated users can create suggestions, and they must set their user_id
  auth.uid() IS NOT NULL AND user_id = auth.uid()
);

CREATE POLICY "map_suggestions_select_policy" ON public.map_suggestions
FOR SELECT USING (
  -- Users can see their own suggestions, admins can see all
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

CREATE POLICY "map_suggestions_update_policy" ON public.map_suggestions
FOR UPDATE USING (
  -- Only admins can update suggestions (for status changes)
  auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text
) WITH CHECK (
  auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text
);

CREATE POLICY "map_suggestions_delete_policy" ON public.map_suggestions
FOR DELETE USING (
  -- Users can delete their own suggestions, admins can delete any
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);