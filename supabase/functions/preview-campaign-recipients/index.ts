import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const {
      filters,
      includeProfiles,
    }: { filters: FilterCriteria; includeProfiles?: boolean } =
      await req.json();

    // Build query to count matching recipients
    let query = supabase
      .from("profiles")
      .select(
        `
        id,
        email,
        full_name,
        subscribed,
        registrations!inner(
          can_attend_invocation,
          can_attend_integration,
          co_creating_interests
        )
      `,
        { count: "exact", head: false },
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

    const { data, error, count } = await query;

    if (error) {
      console.error("Error querying profiles:", error);
      throw error;
    }

    // Post-filter for co_creating_interests (array contains logic)
    let filteredData = data || [];
    if (
      filters.co_creating_interests &&
      filters.co_creating_interests.length > 0
    ) {
      filteredData = filteredData.filter((profile) => {
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

    // Prepare response
    const response: any = {
      count: filteredData.length,
      success: true,
    };

    // Include profile details if requested
    if (includeProfiles) {
      response.profiles = filteredData.map((profile) => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
      }));
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in preview-campaign-recipients:", error);
    return new Response(JSON.stringify({ error: error.message, count: 0 }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
