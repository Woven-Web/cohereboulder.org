-- Fix security warning: Set search path for the function to prevent injection
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = _user_id;
$$;