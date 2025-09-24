import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'ical';
    const eventId = url.searchParams.get('event_id');

    // Fetch events from database
    let query = supabase
      .from('events')
      .select('*')
      .eq('is_public', true)
      .order('start_date', { ascending: true });

    if (eventId) {
      query = query.eq('id', eventId);
    }

    const { data: events, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ error: 'No events found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (format === 'google') {
      // For single event, redirect to Google Calendar
      if (events.length === 1) {
        const event = events[0];
        const startDate = new Date(event.start_date);
        const endDate = new Date(event.end_date);
        
        const formatGoogleDate = (date: Date) => {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const googleUrl = new URL('https://calendar.google.com/calendar/render');
        googleUrl.searchParams.set('action', 'TEMPLATE');
        googleUrl.searchParams.set('text', event.title);
        googleUrl.searchParams.set('dates', `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`);
        googleUrl.searchParams.set('details', event.description || '');
        googleUrl.searchParams.set('location', event.location || '');

        return Response.redirect(googleUrl.toString(), 302);
      }

      return new Response(JSON.stringify({ error: 'Google Calendar format requires a single event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate iCal format
    const formatICalDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const escapeICalText = (text: string) => {
      return text.replace(/[\\;,\n]/g, (match) => {
        switch (match) {
          case '\\': return '\\\\';
          case ';': return '\\;';
          case ',': return '\\,';
          case '\n': return '\\n';
          default: return match;
        }
      });
    };

    let icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//COhere Calendar//COhere Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const event of events) {
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);
      const now = new Date();

      icalContent.push(
        'BEGIN:VEVENT',
        `UID:${event.id}@cohere.earth`,
        `DTSTART:${formatICalDate(startDate)}`,
        `DTEND:${formatICalDate(endDate)}`,
        `DTSTAMP:${formatICalDate(now)}`,
        `SUMMARY:${escapeICalText(event.title)}`,
        `DESCRIPTION:${escapeICalText(event.description || '')}`,
        `LOCATION:${escapeICalText(event.location || '')}`,
        `CATEGORIES:${event.category?.toUpperCase() || 'GENERAL'}`,
        'END:VEVENT'
      );
    }

    icalContent.push('END:VCALENDAR');

    const icalString = icalContent.join('\r\n');

    return new Response(icalString, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="cohere-events${eventId ? `-${eventId}` : ''}.ics"`,
      },
    });

  } catch (error) {
    console.error('Error in calendar-feed function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});