-- Add unique constraint on email to prevent duplicate registrations
ALTER TABLE public.registrations
ADD CONSTRAINT registrations_email_unique UNIQUE (email);

-- Add marketing_consent column if it doesn't exist
ALTER TABLE public.registrations
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT true;

-- Create RLS policies for users to read and update their own registrations
CREATE POLICY "Users can view their own registration by email"
ON public.registrations
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND
  (email = auth.jwt() ->> 'email' OR user_id = auth.uid())
);

CREATE POLICY "Users can update their own registration"
ON public.registrations
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND
  (email = auth.jwt() ->> 'email' OR user_id = auth.uid())
);

-- Allow authenticated users to check if email exists (for duplicate detection)
CREATE POLICY "Authenticated users can check email existence"
ON public.registrations
FOR SELECT
USING (auth.uid() IS NOT NULL)
TO authenticated;

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.registrations (email);
CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON public.registrations (user_id);
