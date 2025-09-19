-- Create table for COhere Boulder 2025 registrations
CREATE TABLE public.registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  organizations TEXT,
  can_attend_invocation BOOLEAN,
  can_attend_integration BOOLEAN,
  how_did_you_hear TEXT,
  co_creating_interests TEXT[] DEFAULT '{}',
  financial_contribution_interest BOOLEAN DEFAULT FALSE,
  additional_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to register (public form)
CREATE POLICY "Anyone can register for COhere" 
ON public.registrations 
FOR INSERT 
WITH CHECK (true);

-- Create policy to prevent public reading (only admins should see registrations)
-- For now, no select policy means no one can read except via service role

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();