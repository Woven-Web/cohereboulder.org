-- Fix RLS policy for profiles to allow anonymous profile creation
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;

-- Create a new policy that properly allows anonymous profile creation
CREATE POLICY "Allow profile creation for authenticated users and anonymous registration" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated and creating their own profile
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) 
  OR 
  -- Allow if user is not authenticated (anonymous registration)
  (auth.uid() IS NULL AND user_id IS NULL)
);

-- Also update the update policy to be more explicit
DROP POLICY IF EXISTS "allow_update_profiles" ON public.profiles;

CREATE POLICY "Allow profile updates" 
ON public.profiles 
FOR UPDATE 
USING (
  -- User can update their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR 
  -- Allow updates during account linking (when user_id is null)
  (user_id IS NULL)
)
WITH CHECK (
  -- Can set user_id to their own ID or leave it null
  (auth.uid() IS NULL OR user_id IS NULL OR user_id = auth.uid())
);