-- Create email templates table
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Admins can view all templates
CREATE POLICY "Admins can view all email templates"
ON public.email_templates
FOR SELECT
USING (get_user_role(auth.uid()) = 'admin'::text);

-- Admins can create templates
CREATE POLICY "Admins can create email templates"
ON public.email_templates
FOR INSERT
WITH CHECK (get_user_role(auth.uid()) = 'admin'::text);

-- Admins can update templates
CREATE POLICY "Admins can update email templates"
ON public.email_templates
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin'::text);

-- Admins can delete templates
CREATE POLICY "Admins can delete email templates"
ON public.email_templates
FOR DELETE
USING (get_user_role(auth.uid()) = 'admin'::text);

-- Add trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default registration confirmation template
INSERT INTO public.email_templates (name, subject, description, html_content)
VALUES (
  'registration_confirmation',
  'Welcome to COHERE!',
  'Email sent to new registrants after they complete registration',
  '<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to COHERE!</h1>
    </div>
    <div class="content">
      <p>Dear {{full_name}},</p>
      <p>Thank you for registering for COHERE. We''re excited to have you join our community!</p>
      <p>Your registration has been confirmed. We''ll keep you updated with important information about upcoming events.</p>
      <p>Best regards,<br>The COHERE Team</p>
    </div>
    <div class="footer">
      <p>COHERE Community</p>
    </div>
  </div>
</body>
</html>'
);