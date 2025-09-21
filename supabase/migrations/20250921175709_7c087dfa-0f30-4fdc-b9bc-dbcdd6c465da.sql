-- Fix the SELECT policy to handle anonymous users properly
DROP POLICY IF EXISTS "Users can view own profile, admins can view all" ON public.profiles;

CREATE POLICY "Users can view profiles properly" 
ON public.profiles 
FOR SELECT 
USING (
  -- Anonymous users can see profiles they just created (no user_id)
  (auth.uid() IS NULL AND user_id IS NULL)
  OR
  -- Authenticated users can see their own profile
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) 
  OR 
  -- Admins can see all profiles (only check if user is authenticated)
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);