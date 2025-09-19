import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const method = req.method;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unsubscribe token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'GET') {
      // Get current preferences for the token
      const { data, error } = await supabase
        .from('email_preferences')
        .select('email, subscribed, marketing_consent, event_notifications')
        .eq('unsubscribe_token', token)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Invalid unsubscribe token' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST') {
      // Update preferences
      const body = await req.json();
      const { subscribed, marketing_consent, event_notifications } = body;

      const { data, error } = await supabase
        .from('email_preferences')
        .update({
          subscribed: subscribed ?? false,
          marketing_consent: marketing_consent ?? false,
          event_notifications: event_notifications ?? false,
          updated_at: new Date().toISOString()
        })
        .eq('unsubscribe_token', token)
        .select('email')
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Failed to update preferences' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Updated email preferences for ${data.email}`);

      return new Response(JSON.stringify({ 
        message: 'Email preferences updated successfully',
        email: data.email 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });

  } catch (error) {
    console.error('Error in unsubscribe function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});