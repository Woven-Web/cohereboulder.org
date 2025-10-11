-- Email Campaigns Table
-- Tracks sent email campaigns with recipient filtering and statistics

CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campaign details
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,

  -- Filter criteria (stored as JSONB for flexibility)
  -- Example: {"subscribed": true, "co_creating_interests": ["volunteer"], "can_attend_invocation": true}
  filter_criteria JSONB DEFAULT '{}'::jsonb,

  -- Statistics
  recipients_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),

  -- Audit fields
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_email_campaigns_template_id ON public.email_campaigns(template_id);
CREATE INDEX idx_email_campaigns_sent_by ON public.email_campaigns(sent_by);
CREATE INDEX idx_email_campaigns_sent_at ON public.email_campaigns(sent_at DESC);
CREATE INDEX idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX idx_email_campaigns_filter_criteria ON public.email_campaigns USING gin(filter_criteria);

-- Enable RLS
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- Add update trigger
CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- RLS Policies for email_campaigns
-- =====================

-- Only admins can view campaigns
CREATE POLICY "email_campaigns_admin_select"
  ON public.email_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Only admins can create campaigns
CREATE POLICY "email_campaigns_admin_insert"
  ON public.email_campaigns
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Only admins can update campaigns
CREATE POLICY "email_campaigns_admin_update"
  ON public.email_campaigns
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Only admins can delete campaigns
CREATE POLICY "email_campaigns_admin_delete"
  ON public.email_campaigns
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Add helpful comments
COMMENT ON TABLE public.email_campaigns IS 'Tracks email campaigns sent to filtered recipients';
COMMENT ON COLUMN public.email_campaigns.filter_criteria IS 'JSONB object containing filter criteria like {"subscribed": true, "co_creating_interests": ["volunteer"]}';
COMMENT ON COLUMN public.email_campaigns.status IS 'Campaign status: draft, sending, sent, or failed';
