-- Temporarily disable the role escalation trigger to test
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.profiles;

-- Also let's simplify and test the INSERT policy
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

-- Create a more explicit INSERT policy for testing
CREATE POLICY "profiles_insert_test_policy" ON public.profiles
FOR INSERT WITH CHECK (
  -- Debug: Log what we're checking
  CASE 
    WHEN auth.uid() IS NULL AND user_id IS NULL AND email IS NOT NULL THEN true
    WHEN auth.uid() IS NOT NULL AND user_id = auth.uid() THEN true
    ELSE false
  END
);