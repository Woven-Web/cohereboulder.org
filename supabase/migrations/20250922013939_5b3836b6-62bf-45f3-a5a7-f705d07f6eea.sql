-- Let's try a completely open INSERT policy for testing
DROP POLICY IF EXISTS "profiles_insert_test_policy" ON public.profiles;

-- Completely open policy for testing
CREATE POLICY "profiles_insert_open_test" ON public.profiles
FOR INSERT WITH CHECK (true);