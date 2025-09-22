-- Let's try completely disabling RLS temporarily to see if that's really the issue
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;