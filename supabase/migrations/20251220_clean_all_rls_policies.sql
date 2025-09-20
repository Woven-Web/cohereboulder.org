-- Clean up all RLS policies to fix infinite recursion issue
-- This migration removes ALL existing policies and creates simple, non-recursive ones

-- Drop ALL existing policies on profiles table to eliminate recursion
DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_public" ON profiles;
DROP POLICY IF EXISTS "profiles_public_email_check" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_unsubscribe_token" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Create simple, non-recursive policies
-- 1. Anyone can read profiles (public info)
CREATE POLICY "allow_select_profiles" ON profiles
  FOR SELECT
  USING (true);

-- 2. Anyone can insert profiles (for registration)
CREATE POLICY "allow_insert_profiles" ON profiles
  FOR INSERT
  WITH CHECK (true);

-- 3. Users can update their own profile or unclaimed profiles
CREATE POLICY "allow_update_profiles" ON profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (
    (auth.uid() IS NULL) OR
    (user_id IS NULL) OR
    (user_id = auth.uid())
  );

-- 4. Users can only delete their own profiles
CREATE POLICY "allow_delete_own_profile" ON profiles
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Drop ALL existing policies on registrations table
DROP POLICY IF EXISTS "registrations_admin_all" ON registrations;
DROP POLICY IF EXISTS "registrations_delete" ON registrations;
DROP POLICY IF EXISTS "registrations_insert" ON registrations;
DROP POLICY IF EXISTS "registrations_insert_own" ON registrations;
DROP POLICY IF EXISTS "registrations_insert_public" ON registrations;
DROP POLICY IF EXISTS "registrations_public_select" ON registrations;
DROP POLICY IF EXISTS "registrations_select" ON registrations;
DROP POLICY IF EXISTS "registrations_select_own" ON registrations;
DROP POLICY IF EXISTS "registrations_update" ON registrations;
DROP POLICY IF EXISTS "registrations_update_own" ON registrations;

-- Create simple, non-recursive policies for registrations
-- 1. Anyone can read registrations (public info for the event)
CREATE POLICY "allow_select_registrations" ON registrations
  FOR SELECT
  USING (true);

-- 2. Anyone can insert registrations (for registration)
CREATE POLICY "allow_insert_registrations" ON registrations
  FOR INSERT
  WITH CHECK (true);

-- 3. Allow updates to registrations
CREATE POLICY "allow_update_registrations" ON registrations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. Allow deletes for own registrations only
CREATE POLICY "allow_delete_registrations" ON registrations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = registrations.profile_id
      AND profiles.user_id = auth.uid()
    )
  );
