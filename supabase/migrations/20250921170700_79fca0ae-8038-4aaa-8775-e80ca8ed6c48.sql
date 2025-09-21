-- Make user_id nullable in map_suggestions to allow anonymous suggestions
ALTER TABLE public.map_suggestions 
ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policies to allow anonymous suggestions
DROP POLICY IF EXISTS "Users can insert their own suggestions" ON public.map_suggestions;
DROP POLICY IF EXISTS "Users can view their own suggestions" ON public.map_suggestions;

-- New policy: Allow anyone to insert suggestions
CREATE POLICY "Anyone can insert suggestions"
ON public.map_suggestions
FOR INSERT
WITH CHECK (true);

-- New policy: Users can view their own suggestions, admins can view all
CREATE POLICY "Users can view own suggestions, admins view all"
ON public.map_suggestions
FOR SELECT
USING (
  (auth.uid() IS NULL) OR 
  (auth.uid() = user_id) OR 
  (public.get_user_role(auth.uid()) = 'admin')
);