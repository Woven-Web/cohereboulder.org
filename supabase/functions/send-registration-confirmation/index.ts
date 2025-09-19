import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationConfirmationRequest {
  email: string;
  fullName: string;
  canAttendInvocation: boolean;
  canAttendIntegration: boolean;
  unsubscribeToken?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      fullName,
      canAttendInvocation,
      canAttendIntegration,
      unsubscribeToken
    }: RegistrationConfirmationRequest = await req.json();

    const baseUrl = 'https://pnvxrczcygrkbschkvkv.supabase.co';
    const unsubscribeUrl = unsubscribeToken 
      ? `${Deno.env.get('SITE_URL') || 'https://0db2af12-4b3b-492c-b29e-c2dbee86d7b6.lovableproject.com'}/unsubscribe?token=${unsubscribeToken}`
      : null;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Welcome to COhere Boulder 2025!</h1>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #555; margin-top: 0;">Registration Confirmed</h2>
          <p>Hi ${fullName},</p>
          <p>Thank you for registering for COhere Boulder 2025! We're excited to weave you into the fabric of our community.</p>
          
          <h3 style="color: #555;">Your Registration Details:</h3>
          <ul style="margin: 15px 0;">
            <li><strong>Invocation (Opening) Gathering:</strong> ${canAttendInvocation ? '✅ Yes, you can attend' : '❌ Cannot attend'}</li>
            <li><strong>Integration (Closing) Party:</strong> ${canAttendIntegration ? '✅ Yes, you can attend' : '❌ Cannot attend'}</li>
          </ul>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #2d5a2d; margin-top: 0;">What's Next?</h3>
          <ul style="margin: 15px 0; color: #333;">
            <li>📅 <strong>Mark your calendar:</strong> October 16-25, 2025</li>
            <li>📱 <strong>Join our community:</strong> We'll send you a Telegram group invitation soon</li>
            <li>🎟️ <strong>Event details:</strong> Specific event information and tickets will be shared as we get closer</li>
            <li>🤝 <strong>Get involved:</strong> If you expressed interest in co-creating, we'll be in touch about opportunities</li>
          </ul>
        </div>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #856404; margin-top: 0;">Stay Connected</h3>
          <p style="margin: 10px 0; color: #333;">
            Follow our updates and connect with the community as we build toward October:
          </p>
          <ul style="margin: 15px 0; color: #333;">
            <li>🌐 <strong>Website:</strong> Keep checking back for event announcements</li>
            <li>💌 <strong>Email updates:</strong> We'll send you important announcements and event details</li>
            <li>🤝 <strong>Community:</strong> Join the Telegram group when invitations are sent</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025" 
             style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Support COhere with a Donation
          </a>
        </div>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
          <p><strong>Questions?</strong> Feel free to reach out - we're here to help make your COhere experience amazing.</p>
          <p>With gratitude and excitement for what we'll create together,<br>
          <strong>The COhere Boulder Team</strong></p>
          
          ${unsubscribeUrl ? `<p style="margin-top: 20px;"><a href="${unsubscribeUrl}" style="color: #666;">Update your email preferences</a></p>` : ''}
        </div>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: 'COhere Boulder <events@resend.dev>',
      to: [email],
      subject: 'Welcome to COhere Boulder 2025 - Registration Confirmed! 🎉',
      html: htmlContent,
    });

    if (error) {
      console.error('Error sending registration confirmation:', error);
      throw error;
    }

    console.log(`Registration confirmation sent to ${email}`);

    return new Response(JSON.stringify({
      message: 'Registration confirmation sent successfully',
      email
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-registration-confirmation function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});