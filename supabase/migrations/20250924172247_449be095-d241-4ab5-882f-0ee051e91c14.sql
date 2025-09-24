-- Create events table for calendar functionality
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  category TEXT DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on events table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view public events
CREATE POLICY "Public events are viewable by everyone" 
ON public.events 
FOR SELECT 
USING (is_public = true);

-- Allow admins to view all events
CREATE POLICY "Admins can view all events" 
ON public.events 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin');

-- Allow admins to insert events
CREATE POLICY "Admins can create events" 
ON public.events 
FOR INSERT 
WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- Allow admins to update events
CREATE POLICY "Admins can update events" 
ON public.events 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'admin');

-- Allow admins to delete events
CREATE POLICY "Admins can delete events" 
ON public.events 
FOR DELETE 
USING (get_user_role(auth.uid()) = 'admin');

-- Create trigger for updated_at
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample events for COhere 2025
INSERT INTO public.events (title, description, start_date, end_date, location, category, is_public) VALUES 
('COhere Invitation Opening', 'Official opening of the COhere 2025 Invitation phase', '2025-10-16 09:00:00-06', '2025-10-16 18:00:00-06', 'Boulder, CO', 'cohere', true),
('COhere Invocation', 'The transformative Invocation ceremony', '2025-10-20 19:00:00-06', '2025-10-20 22:00:00-06', 'Boulder, CO', 'cohere', true),
('COhere Integration Closing', 'Closing ceremony and integration celebration', '2025-10-26 16:00:00-06', '2025-10-26 20:00:00-06', 'Boulder, CO', 'cohere', true);