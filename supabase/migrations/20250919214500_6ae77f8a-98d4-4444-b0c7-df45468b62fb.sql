-- Fix the SELECT policy for email_preferences to work with both authenticated and anonymous users
DROP POLICY IF EXISTS "Users can view their own email preferences" ON public.email_preferences;

-- Create a new SELECT policy that works for both authenticated and anonymous users
CREATE POLICY "Users can view email preferences" 
ON public.email_preferences 
FOR SELECT 
USING (
  -- Allow if user is authenticated and email matches their auth email
  (auth.uid() IS NOT NULL AND email = auth.email())
  OR
  -- Allow if user is not authenticated (for upsert operations during registration)
  (auth.uid() IS NULL)
);