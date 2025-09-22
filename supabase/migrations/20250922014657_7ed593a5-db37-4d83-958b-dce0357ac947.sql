-- Drop all INSERT policies and create one simple one
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_simple" ON public.profiles;

-- Extremely simple policy - just check if anonymous
CREATE POLICY "profiles_anon_insert" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() IS NULL);