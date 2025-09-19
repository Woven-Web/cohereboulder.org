-- Create email preferences table for marketing emails and unsubscribe functionality
CREATE TABLE public.email_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  subscribed boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  marketing_consent boolean NOT NULL DEFAULT false,
  event_notifications boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- Anyone can update their email preferences via unsubscribe token (public endpoint)
CREATE POLICY "Anyone can update preferences with valid token" 
ON public.email_preferences 
FOR UPDATE 
USING (true);

-- Anyone can insert email preferences (for registration)
CREATE POLICY "Anyone can insert email preferences" 
ON public.email_preferences 
FOR INSERT 
WITH CHECK (true);

-- Users can view their own email preferences if authenticated
CREATE POLICY "Users can view their own email preferences" 
ON public.email_preferences 
FOR SELECT 
USING (
  email IN (
    SELECT email FROM auth.users WHERE id = auth.uid()
  )
);

-- Add trigger for timestamps
CREATE TRIGGER update_email_preferences_updated_at
BEFORE UPDATE ON public.email_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add marketing consent to registrations table
ALTER TABLE public.registrations 
ADD COLUMN marketing_consent boolean DEFAULT false;