import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Rate limiting storage
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_REQUESTS = 10; // 10 requests per minute per IP

// Security logging function
const logSecurityEvent = (event: string, details: any) => {
  console.log(`[SECURITY] ${event}:`, JSON.stringify(details));
};

// Rate limiting function
const checkRateLimit = (clientIP: string): boolean => {
  const now = Date.now();
  const key = `unsubscribe:${clientIP}`;
  
  let rateLimitData = rateLimitStore.get(key);
  
  if (!rateLimitData || now - rateLimitData.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitData = { count: 0, lastReset: now };
  }
  
  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);
  
  if (rateLimitData.count > RATE_LIMIT_REQUESTS) {
    logSecurityEvent("RATE_LIMIT_EXCEEDED", { 
      clientIP, 
      count: rateLimitData.count,
      timeWindow: RATE_LIMIT_WINDOW 
    });
    return false;
  }
  
  return true;
};

// Input validation function
const validateToken = (token: string): boolean => {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 10 || token.length > 100) return false;
  // Basic UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(token);
};

// Input validation for preferences
const validatePreferences = (prefs: any): boolean => {
  if (!prefs || typeof prefs !== 'object') return false;
  
  const validKeys = ['subscribed', 'marketing_consent', 'event_notifications'];
  const receivedKeys = Object.keys(prefs);
  
  // Check for extra keys (potential injection attempt)
  if (receivedKeys.some(key => !validKeys.includes(key))) return false;
  
  // Validate boolean values
  for (const key of validKeys) {
    if (prefs[key] !== undefined && typeof prefs[key] !== 'boolean') return false;
  }
  
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIP = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     "unknown";

    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      logSecurityEvent("RATE_LIMIT_BLOCKED", { clientIP, endpoint: "unsubscribe" });
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const method = req.method;

    // Validate token
    if (!token || !validateToken(token)) {
      logSecurityEvent("INVALID_TOKEN", { clientIP, token: token ? "present" : "missing" });
      return new Response(
        JSON.stringify({ error: "Invalid unsubscribe token format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (method === "GET") {
      logSecurityEvent("UNSUBSCRIBE_ACCESS", { clientIP, token: "present" });
      
      // Get current preferences for the token
      const { data, error } = await supabase
        .from("profiles")
        .select("email, subscribed, marketing_consent, event_notifications")
        .eq("unsubscribe_token", token)
        .single();

      if (error || !data) {
        logSecurityEvent("TOKEN_NOT_FOUND", { clientIP, error: error?.message });
        return new Response(
          JSON.stringify({ error: "Invalid unsubscribe token" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({
        email: data.email,
        subscribed: data.subscribed ?? true,
        marketing_consent: data.marketing_consent ?? false,
        event_notifications: data.event_notifications ?? false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      // Parse and validate preferences
      let body;
      try {
        body = await req.json();
      } catch (e) {
        logSecurityEvent("INVALID_JSON", { clientIP });
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!validatePreferences(body)) {
        logSecurityEvent("INVALID_PREFERENCES", { clientIP, body });
        return new Response(
          JSON.stringify({ error: "Invalid preferences data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { subscribed, marketing_consent, event_notifications } = body;

      logSecurityEvent("PREFERENCES_UPDATE", { clientIP, token: "present" });

      const { data, error } = await supabase
        .from("profiles")
        .update({
          subscribed: subscribed ?? false,
          marketing_consent: marketing_consent ?? false,
          event_notifications: event_notifications ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("unsubscribe_token", token)
        .select("email")
        .single();

      if (error || !data) {
        logSecurityEvent("UPDATE_FAILED", { clientIP, error: error?.message });
        return new Response(
          JSON.stringify({ error: "Failed to update preferences" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      logSecurityEvent("PREFERENCES_UPDATED", { email: data.email, clientIP });

      return new Response(
        JSON.stringify({
          message: "Email preferences updated successfully",
          email: data.email,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders,
    });
  } catch (error) {
    logSecurityEvent("UNHANDLED_ERROR", { error: error.message });
    console.error("Error in unsubscribe function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});