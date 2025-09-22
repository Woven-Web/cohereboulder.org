-- Re-enable RLS 
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop the test policies
DROP POLICY IF EXISTS "profiles_insert_open_test" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- Create clean, simple policies
-- 1. INSERT: Allow anonymous registration and authenticated users creating their profile
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  -- Anonymous registration (no auth, no user_id, must have email)
  (auth.uid() IS NULL AND user_id IS NULL AND email IS NOT NULL)
  OR
  -- Authenticated users creating their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- 2. SELECT: Users see their own profile, admins see all
CREATE POLICY "profiles_select_policy" ON public.profiles  
FOR SELECT USING (
  -- Users can see their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Admins can see all profiles
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
  OR
  -- Allow seeing profiles during account linking (same email, no user_id yet)
  (auth.uid() IS NOT NULL AND user_id IS NULL AND email = auth.email())
);

-- 3. UPDATE: Users update own profile, account linking, admins update any
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
  -- Users updating their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Account linking: can update profile with same email from null user_id
  (auth.uid() IS NOT NULL AND user_id IS NULL AND email = auth.email())
  OR  
  -- Admins can update any profile
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
) WITH CHECK (
  -- Users can update their profile (prevent role changes unless admin)
  (auth.uid() IS NOT NULL AND user_id = auth.uid() AND (
    -- Either not changing role
    role = (SELECT role FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    OR 
    -- Or user is admin
    get_user_role(auth.uid()) = 'admin'::text
  ))
  OR
  -- Account linking: setting user_id to current auth user
  (auth.uid() IS NOT NULL AND user_id = auth.uid() AND email = auth.email())
  OR
  -- Admins can make any changes
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);

-- 4. DELETE: Users delete own profile, admins delete any
CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE USING (
  -- Users can delete their own profile
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Admins can delete any profile
  (auth.uid() IS NOT NULL AND get_user_role(auth.uid()) = 'admin'::text)
);