-- Fix security issue: Restrict profiles SELECT to only allow users to see their own data
-- This prevents the privacy violation while maintaining functionality

-- Drop the current overly permissive SELECT policy
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

-- Create secure SELECT policy that only allows:
-- 1. Authenticated users to see their own profile
-- 2. Admins to see all profiles
-- 3. NO anonymous access to prevent data exposure
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin')
);