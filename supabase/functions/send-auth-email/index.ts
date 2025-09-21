import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import React from "npm:react@18.3.1";
import { MagicLinkEmail } from "./_templates/magic-link.tsx";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const hookSecret = Deno.env.get("SEND_AUTH_EMAIL_HOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    
    if (!hookSecret) {
      console.error("Missing SEND_AUTH_EMAIL_HOOK_SECRET");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const wh = new Webhook(hookSecret);
    const {
      user,
      email_data: { 
        token, 
        token_hash, 
        redirect_to, 
        email_action_type, 
        site_url 
      },
    } = wh.verify(payload, headers) as {
      user: {
        email: string;
        user_metadata?: {
          full_name?: string;
        };
      };
      email_data: {
        token: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
        site_url: string;
      };
    };

    const magicLinkUrl = `${site_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;
    
    let subject = "Sign in to COhere";
    let previewText = "Your magic link to access COhere";
    
    if (email_action_type === "signup") {
      subject = "Welcome to COhere Community";
      previewText = "Complete your COhere registration";
    } else if (email_action_type === "recovery") {
      subject = "Reset your COhere password";
      previewText = "Reset your password to access COhere";
    }

    const html = await renderAsync(
      React.createElement(MagicLinkEmail, {
        userName: user.user_metadata?.full_name || user.email.split('@')[0],
        magicLinkUrl,
        otpCode: token,
        emailActionType: email_action_type,
        previewText,
      })
    );

    const { error } = await resend.emails.send({
      from: "COhere Community <auth@cohere.community>",
      to: [user.email],
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    console.log(`Auth email sent successfully to ${user.email} for action: ${email_action_type}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in send-auth-email function:", error);
    return new Response(
      JSON.stringify({
        error: {
          message: error.message || "Failed to send authentication email",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});