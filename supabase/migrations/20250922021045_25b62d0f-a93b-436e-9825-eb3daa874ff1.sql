-- Simplify and fix RLS policies for proper duplicate email checking

-- Drop existing policies for profiles table
DROP POLICY IF EXISTS "profiles_insert_allow_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own_or_admin" ON public.profiles;

-- Drop existing policies for registrations table
DROP POLICY IF EXISTS "registrations_insert_allow_all" ON public.registrations;
DROP POLICY IF EXISTS "registrations_select_own_or_admin" ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_own_or_admin" ON public.registrations;
DROP POLICY IF EXISTS "registrations_delete_own_or_admin" ON public.registrations;

-- Create new simplified policies for profiles table

-- Allow all inserts (for both anonymous and authenticated users)
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT 
WITH CHECK (true);

-- Allow anonymous users to select profiles by email (for duplicate checking)
-- Allow authenticated users to select their own data
-- Allow admins to select all data
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT 
USING (
  true -- Allow all selects for now, we'll control what data is returned in the app
);

-- Allow users to update their own profiles or admins to update any
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE 
USING (
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
);

-- Allow users to delete their own profiles or admins to delete any
CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE 
USING (
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
);

-- Create new simplified policies for registrations table

-- Allow all inserts
CREATE POLICY "registrations_insert_policy" ON public.registrations
FOR INSERT 
WITH CHECK (true);

-- Allow users to select their own registrations or admins to select all
CREATE POLICY "registrations_select_policy" ON public.registrations
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.user_id IS NULL) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
);

-- Allow users to update their own registrations or admins to update any
CREATE POLICY "registrations_update_policy" ON public.registrations
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.user_id IS NULL) OR
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
      (auth.uid() IS NULL AND profiles.user_id IS NULL) OR
      (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
    )
  )
);

-- Allow users to delete their own registrations or admins to delete any
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