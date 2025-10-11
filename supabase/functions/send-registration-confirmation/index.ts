import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RegistrationConfirmationRequest {
  email: string;
  fullName: string;
  canAttendInvocation: boolean;
  canAttendIntegration: boolean;
  unsubscribeToken?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      fullName,
      canAttendInvocation,
      canAttendIntegration,
      unsubscribeToken,
    }: RegistrationConfirmationRequest = await req.json();

    // Fetch email template from database
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("name", "registration_confirmation")
      .single();

    if (templateError || !template) {
      console.error("Error fetching email template:", templateError);
      throw new Error("Email template not found");
    }

    const baseUrl = "https://pnvxrczcygrkbschkvkv.supabase.co";
    const unsubscribeUrl = unsubscribeToken
      ? `${Deno.env.get("PUBLIC_SITE_URL") || "https://cohereboulder.org"}/unsubscribe?token=${unsubscribeToken}`
      : null;

    // Replace template variables
    let htmlContent = template.html_content
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{email\}\}/g, email);

    // Add unsubscribe link if token provided
    if (unsubscribeUrl) {
      htmlContent = htmlContent.replace(
        "</body>",
        `<div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
          <a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe from emails</a>
        </div></body>`
      );
    }

    const { error } = await resend.emails.send({
      from: "COhere Boulder <cohere@wovenweb.org>",
      to: [email],
      subject: template.subject,
      html: htmlContent,
    });

    if (error) {
      console.error("Error sending registration confirmation:", error);
      throw error;
    }

    console.log(`Registration confirmation sent to ${email}`);

    return new Response(
      JSON.stringify({
        message: "Registration confirmation sent successfully",
        email,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-registration-confirmation function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
