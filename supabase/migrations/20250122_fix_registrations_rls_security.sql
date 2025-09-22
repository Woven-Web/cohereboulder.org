-- Fix security issue: Remove anonymous access to registrations table
-- Anonymous users should only be able to register through the edge function which uses service role

-- Drop existing insecure policies for registrations table
DROP POLICY IF EXISTS "registrations_select_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_delete_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_insert_policy" ON public.registrations;

-- Create secure policies for registrations table

-- INSERT: No direct inserts allowed - all registrations go through edge function with service role
-- This prevents direct table manipulation while allowing the edge function to work
CREATE POLICY "registrations_insert_policy" ON public.registrations
FOR INSERT
WITH CHECK (false);

-- SELECT: Only authenticated users can view their own registrations or admins can view all
CREATE POLICY "registrations_select_policy" ON public.registrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = registrations.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
);

-- UPDATE: Only authenticated users can update their own registrations or admins can update any
CREATE POLICY "registrations_update_policy" ON public.registrations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = registrations.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = registrations.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
);

-- DELETE: Only authenticated users can delete their own registrations or admins can delete any
CREATE POLICY "registrations_delete_policy" ON public.registrations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = registrations.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
);

-- Also secure the profiles table INSERT to prevent direct manipulation
-- All profile creation should go through the edge function
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT
WITH CHECK (false);

-- Note: The edge functions use service role key which bypasses RLS
-- This ensures that anonymous registrations still work through the proper channel (edge function)
-- while preventing direct table access by anonymous users
