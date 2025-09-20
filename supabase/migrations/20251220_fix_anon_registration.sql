-- Allow anonymous users to create profiles and registrations during signup
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "registrations_insert" ON registrations;

-- Allow both authenticated and anonymous users to insert profiles
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Allow both authenticated and anonymous users to insert registrations
CREATE POLICY "registrations_insert" ON registrations
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Also allow anon to update profiles without user_id (for registration flow)
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated, anon
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
  );

-- Allow anon to update registrations linked to profiles without user_id
DROP POLICY IF EXISTS "registrations_update" ON registrations;
CREATE POLICY "registrations_update" ON registrations
  FOR UPDATE TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = registrations.profile_id
      AND (profiles.user_id = auth.uid() OR profiles.user_id IS NULL)
    )
  );
