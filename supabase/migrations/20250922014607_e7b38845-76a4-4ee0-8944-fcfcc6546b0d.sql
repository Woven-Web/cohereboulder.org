-- Let's temporarily simplify to the absolute minimum
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

-- Super simple anonymous-only policy for testing
CREATE POLICY "profiles_insert_simple" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() IS NULL);