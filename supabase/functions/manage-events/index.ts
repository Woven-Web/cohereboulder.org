import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EventData {
  id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  category?: string;
  is_public?: boolean;
}

interface RequestBody extends EventData {
  action?: string;
}

// Input validation helpers
const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

const isValidCategory = (category: string | undefined): boolean => {
  if (!category) return true; // Optional field
  return ["general", "cohere", "workshop", "community"].includes(category);
};

const sanitizeString = (
  str: string | undefined,
  maxLength: number = 255,
): string | undefined => {
  if (!str) return str;
  return str.slice(0, maxLength).replace(/<[^>]*>/g, ""); // Remove HTML tags
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const requestBody: RequestBody = await req.json();
    const action = requestBody.action || "GET";

    switch (action) {
      case "GET": {
        const eventId = requestBody.id;
        if (eventId) {
          // Get single event
          const { data, error } = await supabase
            .from("events")
            .select("*")
            .eq("id", eventId)
            .single();

          if (error) {
            return new Response(JSON.stringify({ error: error.message }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          // Get all events
          const { data, error } = await supabase
            .from("events")
            .select("*")
            .order("start_date", { ascending: true });

          if (error) {
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "POST": {
        // Remove action from the data
        const { action: _, ...eventData } = requestBody;

        // Validate input
        if (!eventData.title || eventData.title.trim() === "") {
          return new Response(JSON.stringify({ error: "Title is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (
          !isValidDate(eventData.start_date) ||
          !isValidDate(eventData.end_date)
        ) {
          return new Response(
            JSON.stringify({ error: "Invalid date format" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (new Date(eventData.end_date) <= new Date(eventData.start_date)) {
          return new Response(
            JSON.stringify({ error: "End date must be after start date" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (!isValidCategory(eventData.category)) {
          return new Response(JSON.stringify({ error: "Invalid category" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Sanitize input
        const sanitizedData = {
          ...eventData,
          title: sanitizeString(eventData.title, 255)!,
          description: sanitizeString(eventData.description, 1000),
          location: sanitizeString(eventData.location, 255),
          created_by: user.id,
        };

        const { data: newEvent, error: insertError } = await supabase
          .from("events")
          .insert([sanitizedData])
          .select()
          .single();

        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(newEvent), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "PUT": {
        const eventId = requestBody.id;

        if (!eventId) {
          return new Response(JSON.stringify({ error: "Event ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Remove action and id from update data
        const { action: _, id: __, ...updateData } = requestBody;

        // Validate dates if provided
        if (updateData.start_date && !isValidDate(updateData.start_date)) {
          return new Response(
            JSON.stringify({ error: "Invalid start date format" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (updateData.end_date && !isValidDate(updateData.end_date)) {
          return new Response(
            JSON.stringify({ error: "Invalid end date format" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (
          updateData.start_date &&
          updateData.end_date &&
          new Date(updateData.end_date) <= new Date(updateData.start_date)
        ) {
          return new Response(
            JSON.stringify({ error: "End date must be after start date" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (updateData.category && !isValidCategory(updateData.category)) {
          return new Response(JSON.stringify({ error: "Invalid category" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Sanitize input
        const sanitizedUpdate = {
          ...updateData,
          title: updateData.title
            ? sanitizeString(updateData.title, 255)
            : undefined,
          description: sanitizeString(updateData.description, 1000),
          location: sanitizeString(updateData.location, 255),
        };

        // Remove undefined values
        Object.keys(sanitizedUpdate).forEach(
          (key) =>
            sanitizedUpdate[key as keyof typeof sanitizedUpdate] ===
              undefined &&
            delete sanitizedUpdate[key as keyof typeof sanitizedUpdate],
        );

        const { data: updatedEvent, error: updateError } = await supabase
          .from("events")
          .update(sanitizedUpdate)
          .eq("id", eventId)
          .select()
          .single();

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "DELETE": {
        const eventId = requestBody.id;

        if (!eventId) {
          return new Response(JSON.stringify({ error: "Event ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: deleteError } = await supabase
          .from("events")
          .delete()
          .eq("id", eventId);

        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    // Log error securely without exposing details to client
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Edge function error:", errorMessage);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
