import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegistrationRequest {
  fullName: string;
  email: string;
  phoneNumber: string;
  organizations: string;
  canAttendInvocation: string;
  canAttendIntegration: string;
  coCreatingInterests: string[];
  howDidYouHear: string;
  additionalNotes: string;
  subscribed: boolean;
  userId?: string;
  isEditMode?: boolean;
  existingProfileId?: string;
  existingRegistrationId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for bypassing RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const COHERE_EVENT = "october2025";

    const data: RegistrationRequest = await req.json();
    console.log("Registration request received:", { email: data.email, isEditMode: data.isEditMode });

    let profileId = data.existingProfileId;

    // Step 1: Create or update profile
    if (!profileId) {
      // Create new profile
      const { data: newProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          email: data.email,
          full_name: data.fullName,
          phone_number: data.phoneNumber,
          organizations: data.organizations,
          user_id: data.userId || null,
          subscribed: data.subscribed,
          source: "registration",
        })
        .select()
        .single();

      if (profileError) {
        console.error("Profile creation error:", profileError);
        if (profileError.code === "23505") {
          // Email already exists
          return new Response(
            JSON.stringify({ 
              error: "This email is already registered. Please sign in to update your registration." 
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        throw profileError;
      }

      profileId = newProfile.id;
      console.log("Created new profile:", profileId);
    } else {
      // Update existing profile
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name: data.fullName,
          phone_number: data.phoneNumber,
          organizations: data.organizations,
          subscribed: data.subscribed,
          user_id: data.userId || null,
        })
        .eq("id", data.existingProfileId);

      if (updateError) {
        console.error("Profile update error:", updateError);
        throw updateError;
      }
      console.log("Updated existing profile:", profileId);
    }

    // Step 2: Create or update registration for this event
    const registrationData = {
      profile_id: profileId,
      cohere_event: COHERE_EVENT,
      can_attend_invocation:
        data.canAttendInvocation === "yes"
          ? true
          : data.canAttendInvocation === "no"
            ? false
            : null,
      can_attend_integration:
        data.canAttendIntegration === "yes"
          ? true
          : data.canAttendIntegration === "no"
            ? false
            : null,
      co_creating_interests: data.coCreatingInterests,
      how_did_you_hear: data.howDidYouHear,
      additional_notes: data.additionalNotes,
    };

    if (data.isEditMode && data.existingRegistrationId) {
      // Update existing registration
      const { error: updateError } = await supabaseAdmin
        .from("registrations")
        .update(registrationData)
        .eq("id", data.existingRegistrationId);

      if (updateError) {
        console.error("Registration update error:", updateError);
        throw updateError;
      }
      console.log("Updated existing registration:", data.existingRegistrationId);
    } else {
      // Insert new registration
      const { error: insertError } = await supabaseAdmin
        .from("registrations")
        .insert(registrationData);

      if (insertError) {
        console.error("Registration insert error:", insertError);
        if (insertError.code === "23505") {
          return new Response(
            JSON.stringify({ 
              error: "You are already registered for this event." 
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        throw insertError;
      }
      console.log("Created new registration for profile:", profileId);
    }

    // Step 3: Send confirmation email (only for new registrations)
    if (!data.isEditMode) {
      try {
        // Get the unsubscribe token for the profile
        const { data: profile, error: profileSelectError } = await supabaseAdmin
          .from("profiles")
          .select("unsubscribe_token")
          .eq("id", profileId)
          .single();

        if (profileSelectError) {
          console.error("Error fetching profile for email:", profileSelectError);
        } else {
          // Send confirmation email using the existing email function
          const { error: emailSendError } = await supabaseAdmin.functions.invoke(
            "send-registration-confirmation",
            {
              body: {
                email: data.email,
                fullName: data.fullName,
                canAttendInvocation: data.canAttendInvocation === "yes",
                canAttendIntegration: data.canAttendIntegration === "yes",
                unsubscribeToken: profile?.unsubscribe_token,
              },
            }
          );

          if (emailSendError) {
            console.error("Error sending confirmation email:", emailSendError);
            // Don't fail the registration if email fails
          } else {
            console.log("Confirmation email sent successfully");
          }
        }
      } catch (emailError) {
        console.error("Error with email sending:", emailError);
        // Don't fail the registration if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        profileId: profileId,
        message: data.isEditMode ? "Registration updated successfully" : "Registration completed successfully"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in register-user function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "An unexpected error occurred" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);