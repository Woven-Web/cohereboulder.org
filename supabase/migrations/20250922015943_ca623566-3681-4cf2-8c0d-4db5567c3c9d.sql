-- SIMPLE APPROACH: Very permissive INSERTs, secure SELECTs/UPDATEs

-- ===========================================
-- 1. PROFILES TABLE - Simple & Secure
-- ===========================================

-- Drop all existing policies
DROP POLICY IF EXISTS "profiles_anon_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- Very permissive INSERT - anyone can create profiles
CREATE POLICY "profiles_insert_allow_all" ON public.profiles
FOR INSERT WITH CHECK (true);

-- Secure SELECT - authenticated users see their own, admins see all
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
FOR SELECT USING (
  -- Authenticated users see their own profile (by email or user_id)
  (auth.uid() IS NOT NULL AND (
    user_id = auth.uid() 
    OR (user_id IS NULL AND email = auth.email())
  ))
  OR
  -- Admins see all
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Secure UPDATE - users update their own, admins update any
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
FOR UPDATE USING (
  (auth.uid() IS NOT NULL AND (
    user_id = auth.uid() 
    OR (user_id IS NULL AND email = auth.email())
  ))
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
) WITH CHECK (
  (auth.uid() IS NOT NULL AND (
    user_id = auth.uid() 
    OR (user_id IS NULL AND email = auth.email())
  ))
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Simple DELETE - users delete their own, admins delete any
CREATE POLICY "profiles_delete_own_or_admin" ON public.profiles
FOR DELETE USING (
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- ===========================================
-- 2. REGISTRATIONS TABLE - Simple & Secure  
-- ===========================================

-- Drop existing policies
DROP POLICY IF EXISTS "registrations_select_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_insert_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_delete_policy" ON public.registrations;

-- Very permissive INSERT - anyone can register
CREATE POLICY "registrations_insert_allow_all" ON public.registrations
FOR INSERT WITH CHECK (true);

-- Secure SELECT - see registrations for profiles you own or if admin
CREATE POLICY "registrations_select_own_or_admin" ON public.registrations
FOR SELECT USING (
  -- Can see registrations for profiles you own
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND (
      profiles.user_id = auth.uid()
      OR (profiles.user_id IS NULL AND profiles.email = auth.email())
    )
  )
  OR
  -- Admins see all
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Secure UPDATE - update registrations for profiles you own or if admin
CREATE POLICY "registrations_update_own_or_admin" ON public.registrations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND (
      profiles.user_id = auth.uid()
      OR (profiles.user_id IS NULL AND profiles.email = auth.email())
    )
  )
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND (
      profiles.user_id = auth.uid()
      OR (profiles.user_id IS NULL AND profiles.email = auth.email())
    )
  )
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- Simple DELETE - delete registrations for profiles you own or if admin
CREATE POLICY "registrations_delete_own_or_admin" ON public.registrations
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = registrations.profile_id 
    AND profiles.user_id = auth.uid()
  )
  OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);