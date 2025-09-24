import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key to bypass RLS for public events
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "ical";
    const eventId = url.searchParams.get("event_id");

    // Fetch only public events from database
    let query = supabase
      .from("events")
      .select("*")
      .eq("is_public", true)
      .order("start_date", { ascending: true });

    if (eventId) {
      query = query.eq("id", eventId);
    }

    const { data: events, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "google") {
      // For Google Calendar, return the URL as JSON to avoid CORS issues
      if (eventId && events.length === 1) {
        // Single event - generate Google Calendar URL
        const event = events[0];
        const startDate = new Date(event.start_date);
        const endDate = new Date(event.end_date);

        const formatGoogleDate = (date: Date) => {
          return date.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
        };

        const googleUrl = new URL(
          "https://calendar.google.com/calendar/render",
        );
        googleUrl.searchParams.set("action", "TEMPLATE");
        googleUrl.searchParams.set("text", event.title);
        googleUrl.searchParams.set(
          "dates",
          `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
        );

        if (event.description) {
          googleUrl.searchParams.set("details", event.description);
        }
        if (event.location) {
          googleUrl.searchParams.set("location", event.location);
        }

        // Return the URL as JSON instead of redirecting
        return new Response(JSON.stringify({ url: googleUrl.toString() }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Multiple events not supported for individual event adding
        return new Response(
          JSON.stringify({
            error: "Please select a specific event to add to Google Calendar",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Generate iCal format
    const formatICalDate = (date: Date) => {
      // Format: YYYYMMDDTHHMMSSZ
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");
      return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    };

    const escapeICalText = (text: string) => {
      if (!text) return "";
      // Escape special characters and fold long lines
      return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "");
    };

    // Build iCal content with proper formatting
    const icalLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//COhere Boulder//COhere Events//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:COhere Boulder Events",
      "X-WR-CALDESC:Community events from COhere Boulder",
      "X-WR-TIMEZONE:America/Denver",
    ];

    for (const event of events) {
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);
      const now = new Date();

      // Generate a stable UID based on event ID
      const uid = `${event.id}@cohereboulder.org`;

      icalLines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART:${formatICalDate(startDate)}`,
        `DTEND:${formatICalDate(endDate)}`,
        `DTSTAMP:${formatICalDate(now)}`,
        `CREATED:${formatICalDate(new Date(event.created_at || now))}`,
        `LAST-MODIFIED:${formatICalDate(new Date(event.updated_at || now))}`,
        `SUMMARY:${escapeICalText(event.title)}`,
      );

      if (event.description) {
        icalLines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
      }

      if (event.location) {
        icalLines.push(`LOCATION:${escapeICalText(event.location)}`);
      }

      if (event.category) {
        icalLines.push(`CATEGORIES:${event.category.toUpperCase()}`);
      }

      // Add URL to the event if we have the Supabase URL
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (supabaseUrl) {
        icalLines.push(
          `URL:${supabaseUrl.replace("https://", "https://cohereboulder.org/")}`,
        );
      }

      icalLines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
    }

    icalLines.push("END:VCALENDAR");

    // Join with proper line endings
    const icalContent = icalLines.join("\r\n");

    // Return the iCal file with proper headers
    return new Response(icalContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="cohere-events${eventId ? `-${eventId}` : ""}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Calendar feed error:", errorMessage);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
