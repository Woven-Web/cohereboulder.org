-- Fix critical security issue: Restrict profiles table access
-- Currently anyone can read all profiles data including emails, phone numbers, etc.

-- First, drop the overly permissive policies
DROP POLICY IF EXISTS "allow_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "allow_insert_profiles" ON public.profiles;

-- Create a security definer function to get user role for RLS policies
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = _user_id;
$$;

-- Create secure SELECT policy: Users can only see their own profile, admins can see all
CREATE POLICY "Users can view own profile, admins can view all" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.get_user_role(auth.uid()) = 'admin'
);

-- Create secure INSERT policy: Only allow authenticated users to create their own profile
CREATE POLICY "Users can create own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  OR auth.uid() IS NULL  -- Allow system/trigger inserts during signup
);