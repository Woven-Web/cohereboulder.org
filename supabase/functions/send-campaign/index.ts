import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FilterCriteria {
  subscribed?: boolean;
  can_attend_invocation?: boolean | "maybe";
  can_attend_integration?: boolean | "maybe";
  co_creating_interests?: string[];
}

interface RequestBody {
  templateId: string;
  filters: FilterCriteria;
  selectedRecipientIds?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const { templateId, filters, selectedRecipientIds }: RequestBody =
      await req.json();

    // Get email template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      throw new Error("Email template not found");
    }

    // Build query to get matching recipients
    let query = supabase
      .from("profiles")
      .select(
        `
        id,
        email,
        full_name,
        subscribed,
        unsubscribe_token,
        registrations!inner(
          can_attend_invocation,
          can_attend_integration,
          co_creating_interests
        )
      `,
      )
      .eq("registrations.cohere_event", "october2025");

    // Apply filters
    if (filters.subscribed) {
      query = query.eq("subscribed", true);
    }

    if (filters.can_attend_invocation !== undefined) {
      if (filters.can_attend_invocation === "maybe") {
        query = query.is("registrations.can_attend_invocation", null);
      } else {
        query = query.eq(
          "registrations.can_attend_invocation",
          filters.can_attend_invocation,
        );
      }
    }

    if (filters.can_attend_integration !== undefined) {
      if (filters.can_attend_integration === "maybe") {
        query = query.is("registrations.can_attend_integration", null);
      } else {
        query = query.eq(
          "registrations.can_attend_integration",
          filters.can_attend_integration,
        );
      }
    }

    const { data: profiles, error: profilesError } = await query;

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Post-filter for co_creating_interests (array contains logic)
    let filteredProfiles = profiles || [];
    if (
      filters.co_creating_interests &&
      filters.co_creating_interests.length > 0
    ) {
      filteredProfiles = filteredProfiles.filter((profile) => {
        const registration = Array.isArray(profile.registrations)
          ? profile.registrations[0]
          : profile.registrations;

        if (!registration?.co_creating_interests) return false;

        // Check if ANY of the filter interests are in the user's interests
        return filters.co_creating_interests!.some((interest) =>
          registration.co_creating_interests.includes(interest),
        );
      });
    }

    // If manual selection is provided, filter to only selected recipients
    if (selectedRecipientIds && selectedRecipientIds.length > 0) {
      filteredProfiles = filteredProfiles.filter((profile) =>
        selectedRecipientIds.includes(profile.id),
      );
    }

    if (filteredProfiles.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No recipients match the filter criteria",
          sent_count: 0,
          failed_count: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .insert({
        template_id: templateId,
        subject: template.subject,
        filter_criteria: filters,
        recipients_count: filteredProfiles.length,
        status: "sending",
        sent_by: user.id,
      })
      .select()
      .single();

    if (campaignError) {
      console.error("Error creating campaign:", campaignError);
      throw campaignError;
    }

    // Send emails
    const emailPromises = filteredProfiles.map(async (profile) => {
      const unsubscribeUrl = `${Deno.env.get("PUBLIC_SITE_URL") || "https://cohereboulder.org"}/unsubscribe?token=${profile.unsubscribe_token}`;

      // Replace template variables
      let htmlContent = template.html_content
        .replace(/\{\{full_name\}\}/g, profile.full_name)
        .replace(/\{\{email\}\}/g, profile.email);

      // Add unsubscribe link
      htmlContent = htmlContent.replace(
        "</body>",
        `<div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
          <a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe from emails</a>
        </div></body>`,
      );

      return resend.emails.send({
        from: "COhere Boulder <cohere@wovenweb.org>",
        to: [profile.email],
        subject: template.subject,
        html: htmlContent,
      });
    });

    const results = await Promise.allSettled(emailPromises);
    const sentCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.filter((r) => r.status === "rejected").length;

    // Update campaign with results
    await supabase
      .from("email_campaigns")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: failedCount === 0 ? "sent" : "failed",
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    console.log(
      `Campaign ${campaign.id} complete: ${sentCount} sent, ${failedCount} failed`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        sent_count: sentCount,
        failed_count: failedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-campaign:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
