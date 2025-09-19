import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventEmailRequest {
  subject: string;
  eventTitle: string;
  eventDate: string;
  eventLocation?: string;
  eventDescription: string;
  registrationUrl?: string;
  recipientFilter?: 'all' | 'marketing_consent' | 'event_notifications';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const {
      subject,
      eventTitle,
      eventDate,
      eventLocation,
      eventDescription,
      registrationUrl,
      recipientFilter = 'event_notifications'
    }: EventEmailRequest = await req.json();

    // Get email addresses based on filter
    let query = supabase
      .from('email_preferences')
      .select('email, unsubscribe_token')
      .eq('subscribed', true);

    if (recipientFilter === 'marketing_consent') {
      query = query.eq('marketing_consent', true);
    } else if (recipientFilter === 'event_notifications') {
      query = query.eq('event_notifications', true);
    }

    const { data: emailPrefs, error } = await query;

    if (error) {
      console.error('Error fetching email preferences:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!emailPrefs || emailPrefs.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscribers found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = 'https://pnvxrczcygrkbschkvkv.supabase.co/functions/v1';
    
    // Send emails to all recipients
    const emailPromises = emailPrefs.map(async (pref) => {
      const unsubscribeUrl = `${window.location.origin}/unsubscribe?token=${pref.unsubscribe_token}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">${eventTitle}</h1>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #555; margin-top: 0;">Event Details</h2>
            <p><strong>Date:</strong> ${eventDate}</p>
            ${eventLocation ? `<p><strong>Location:</strong> ${eventLocation}</p>` : ''}
            <p style="margin-top: 15px;">${eventDescription}</p>
          </div>
          
          ${registrationUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${registrationUrl}" 
                 style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Register Now
              </a>
            </div>
          ` : ''}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>You're receiving this because you signed up for COhere event notifications.</p>
            <p><a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe from these emails</a></p>
          </div>
        </div>
      `;

      return resend.emails.send({
        from: 'COhere Boulder <events@resend.dev>',
        to: [pref.email],
        subject: subject,
        html: htmlContent,
      });
    });

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Email sending complete: ${successful} successful, ${failed} failed`);

    return new Response(JSON.stringify({
      message: `Emails sent successfully`,
      successful,
      failed,
      total: emailPrefs.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-event-email function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});