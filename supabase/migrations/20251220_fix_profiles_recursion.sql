-- Fix infinite recursion in profiles RLS policies
-- Drop existing policies first
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete" ON profiles;

-- Create new non-recursive policies for profiles
-- For SELECT: Anyone can read profiles (public data)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated, anon
  USING (true);

-- For INSERT: Authenticated users can create profiles
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- For UPDATE: Users can update their own profile OR profiles without user_id (for initial registration)
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
  );

-- For DELETE: Only the user themselves can delete their profile
CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Also update registrations policies to be simpler
DROP POLICY IF EXISTS "registrations_select" ON registrations;
DROP POLICY IF EXISTS "registrations_insert" ON registrations;
DROP POLICY IF EXISTS "registrations_update" ON registrations;
DROP POLICY IF EXISTS "registrations_delete" ON registrations;

-- Registrations policies
CREATE POLICY "registrations_select" ON registrations
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "registrations_insert" ON registrations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "registrations_update" ON registrations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = registrations.profile_id
      AND (profiles.user_id = auth.uid() OR profiles.user_id IS NULL)
    )
  );

CREATE POLICY "registrations_delete" ON registrations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = registrations.profile_id
      AND profiles.user_id = auth.uid()
    )
  );
