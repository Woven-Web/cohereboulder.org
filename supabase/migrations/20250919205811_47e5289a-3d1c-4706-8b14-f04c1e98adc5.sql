-- Create table for interest form submissions
CREATE TABLE public.interest_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization TEXT,
  participation_types TEXT[] DEFAULT '{}',
  themes TEXT[] DEFAULT '{}',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.interest_submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert submissions (public form)
CREATE POLICY "Anyone can submit interest forms" 
ON public.interest_submissions 
FOR INSERT 
WITH CHECK (true);

-- Create policy to prevent public reading (only admins should see submissions)
-- For now, no select policy means no one can read except via service role

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_interest_submissions_updated_at
  BEFORE UPDATE ON public.interest_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();