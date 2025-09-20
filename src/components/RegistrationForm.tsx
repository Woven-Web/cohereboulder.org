import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle,
  ExternalLink,
  Mail,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

const COHERE_EVENT = "october2025"; // Current event identifier

interface RegistrationFormData {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  organizations: string;
  canAttendInvocation: string;
  canAttendIntegration: string;
  coCreatingInterests: string[];
  howDidYouHear: string;
  additionalNotes: string;
  subscribed: boolean;
}

export function RegistrationForm() {
  const { toast } = useToast();
  const { user, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [existingProfile, setExistingProfile] = useState<{
    id: string;
    email: string;
    full_name: string;
    phone_number?: string;
    organizations?: string;
    subscribed?: boolean;
  } | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<{
    id: string;
    can_attend_invocation: boolean | null;
    can_attend_integration: boolean | null;
    co_creating_interests?: string[];
    how_did_you_hear?: string;
    additional_notes?: string;
  } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
    password: "",
    phoneNumber: "",
    organizations: "",
    canAttendInvocation: "",
    canAttendIntegration: "",
    coCreatingInterests: [],
    howDidYouHear: "",
    additionalNotes: "",
    subscribed: true,
  });

  // Check for existing profile and registration when component mounts or user changes
  useEffect(() => {
    if (user?.email) {
      checkExistingData(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Check for duplicate email when email field changes (for non-authenticated users)
  useEffect(() => {
    if (!user && formData.email && formData.email.includes("@")) {
      const debounceTimer = setTimeout(() => {
        checkEmailExists(formData.email);
      }, 500);
      return () => clearTimeout(debounceTimer);
    }
  }, [formData.email, user]);

  const checkExistingData = async (email: string) => {
    try {
      // Check for existing profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", email)
        .single();

      if (profile && !profileError) {
        setExistingProfile(profile);

        // Check for existing registration for this event
        const { data: registration, error: regError } = await supabase
          .from("registrations")
          .select("*")
          .eq("profile_id", profile.id)
          .eq("cohere_event", COHERE_EVENT)
          .single();

        if (registration && !regError) {
          setExistingRegistration(registration);
          setIsEditMode(true);

          // Populate form with existing data
          setFormData({
            fullName: profile.full_name || "",
            email: profile.email,
            password: "",
            phoneNumber: profile.phone_number || "",
            organizations: profile.organizations || "",
            canAttendInvocation:
              registration.can_attend_invocation === true
                ? "yes"
                : registration.can_attend_invocation === false
                  ? "no"
                  : "maybe",
            canAttendIntegration:
              registration.can_attend_integration === true
                ? "yes"
                : registration.can_attend_integration === false
                  ? "no"
                  : "maybe",
            coCreatingInterests: registration.co_creating_interests || [],
            howDidYouHear: registration.how_did_you_hear || "",
            additionalNotes: registration.additional_notes || "",
            subscribed: profile.subscribed !== false,
          });

          toast({
            title: "Welcome back!",
            description:
              "We found your existing registration. You can update your information below.",
          });
        } else {
          // Profile exists but no registration for this event
          setFormData((prev) => ({
            ...prev,
            fullName: profile.full_name || "",
            email: profile.email,
            phoneNumber: profile.phone_number || "",
            organizations: profile.organizations || "",
            subscribed: profile.subscribed !== false,
          }));
        }
      }
    } catch (error) {
      console.error("Error checking existing data:", error);
    }
  };

  const checkEmailExists = async (email: string) => {
    setIsCheckingEmail(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .eq("email", email)
        .single();

      if (data && !error) {
        setEmailExists(true);
      } else {
        setEmailExists(false);
      }
    } catch (error) {
      setEmailExists(false);
    }
    setIsCheckingEmail(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (value: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      coCreatingInterests: checked
        ? [...prev.coCreatingInterests, value]
        : prev.coCreatingInterests.filter((item) => item !== value),
    }));
  };

  const submitToSupabase = async (
    data: RegistrationFormData,
    userId?: string,
  ) => {
    try {
      let profileId = existingProfile?.id;

      // Step 1: Create or update profile
      if (!profileId) {
        // Create new profile
        const { data: newProfile, error: profileError } = await supabase
          .from("profiles")
          .insert({
            email: data.email,
            full_name: data.fullName,
            phone_number: data.phoneNumber,
            organizations: data.organizations,
            user_id: userId || null,
            subscribed: data.subscribed,
            source: "registration",
          })
          .select()
          .single();

        if (profileError) {
          if (profileError.code === "23505") {
            // Unique violation
            throw new Error(
              "This email is already registered. Please sign in to update your registration.",
            );
          }
          throw profileError;
        }

        profileId = newProfile.id;
      } else {
        // Update existing profile
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            full_name: data.fullName,
            phone_number: data.phoneNumber,
            organizations: data.organizations,
            subscribed: data.subscribed,
            user_id: userId || existingProfile.user_id,
          })
          .eq("id", existingProfile.id);

        if (updateError) throw updateError;
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

      if (isEditMode && existingRegistration) {
        // Update existing registration
        const { error: updateError } = await supabase
          .from("registrations")
          .update(registrationData)
          .eq("id", existingRegistration.id);

        if (updateError) throw updateError;
      } else {
        // Insert new registration
        const { error: insertError } = await supabase
          .from("registrations")
          .insert(registrationData);

        if (insertError) {
          if (insertError.code === "23505") {
            // Unique violation
            throw new Error(
              "You're already registered for this event. Please refresh the page to see your registration.",
            );
          }
          throw insertError;
        }
      }

      // Send registration confirmation email (only for new registrations)
      if (!isEditMode) {
        try {
          // Get the unsubscribe token for the profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("unsubscribe_token")
            .eq("id", profileId)
            .single();

          const { error: emailSendError } = await supabase.functions.invoke(
            "send-registration-confirmation",
            {
              body: {
                email: data.email,
                fullName: data.fullName,
                canAttendInvocation: data.canAttendInvocation === "yes",
                canAttendIntegration: data.canAttendIntegration === "yes",
                unsubscribeToken: profile?.unsubscribe_token,
              },
            },
          );

          if (emailSendError) {
            console.error("Error sending confirmation email:", emailSendError);
          }
        } catch (emailSendError) {
          console.error("Error calling email function:", emailSendError);
        }
      }
    } catch (error) {
      console.error("Error submitting to Supabase:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Basic validation
      if (!formData.fullName || !formData.email) {
        throw new Error("Please fill in all required fields");
      }

      // Check for duplicate email for non-authenticated users
      if (!user && emailExists && !formData.password) {
        throw new Error(
          "This email is already registered. Please sign in to update your registration or create an account with a password.",
        );
      }

      const userId = user?.id;

      // If user is not authenticated and wants to create account
      if (!user && formData.password) {
        const { error: authError } = await signUp(
          formData.email,
          formData.password,
          formData.fullName,
        );

        if (authError) {
          throw new Error(authError.message);
        }

        // Show verification message instead of completing registration
        setNeedsVerification(true);
        toast({
          title: "Account created!",
          description:
            "Please check your email to verify your account, then complete your registration.",
        });
        setIsLoading(false);
        return;
      }

      await submitToSupabase(formData, userId);
      setSubmitted(true);

      toast({
        title: isEditMode
          ? "Registration updated successfully!"
          : "Registration submitted successfully!",
        description: isEditMode
          ? "Your registration has been updated with your latest information."
          : "Thank you for registering for COhere Boulder 2025. We'll be in touch soon with more details.",
      });
    } catch (error) {
      toast({
        title: "Error submitting registration",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <Mail className="h-16 w-16 text-blue-500 mx-auto" />
            <h2 className="text-2xl font-bold text-blue-700">
              Check Your Email!
            </h2>
            <p className="text-muted-foreground">
              We've sent you a verification link. Please verify your email
              address to complete your registration.
            </p>
            <p className="text-sm text-muted-foreground">
              After verification, you can return to this page to complete your
              registration for COhere Boulder 2025.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-green-700">
              {isEditMode ? "Registration Updated!" : "Registration Complete!"}
            </h2>
            <p className="text-muted-foreground">
              {isEditMode
                ? "Your registration has been successfully updated."
                : "Thank you for registering for COhere Boulder 2025. We're excited to have you join our community-building journey."}
            </p>
            {!isEditMode && (
              <p className="text-sm text-muted-foreground">
                You'll receive a confirmation email shortly with next steps and
                event details.
              </p>
            )}

            <div className="pt-4">
              <Button asChild>
                <a
                  href="https://donate.stripe.com/00g02wd3C4ZHdG0bII"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  Support COhere with a Donation
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const coCreatingOptions = [
    "I would like to host or collaboratively design an event during COhere",
    "I would like to host a community dinner (potluck style) during COhere",
    "I would like to volunteer in supporting an event",
    "I would like to help tell the stories that unfold through writing, photo, or video",
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header Section */}
      <Card>
        <CardContent className="p-8">
          <h1 className="text-3xl font-bold mb-4">
            {isEditMode ? "Update Your Registration" : "Register"} for COhere
            Boulder 2025
          </h1>
          {isEditMode ? (
            <p className="text-muted-foreground mb-4">
              Welcome back! You can update your registration information below.
              Changes will be saved immediately.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">
                Please complete this form to receive communications and stay
                up-to-date on what's unfolding with COhere. Registration is free
                and all events are opt-in.
              </p>
              <p className="text-primary font-medium">
                We can't wait to weave you into the fabric of this community!
              </p>
            </>
          )}

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              COhere stokes Boulder's culture and engagement by connecting
              residents, organizations, artists, leaders, and innovators during
              a 10-day container (and beyond!). Through a curated calendar of
              values-aligned events and memorable opening & closing gatherings,
              we strengthen community ties, highlight our city's vibrancy, and
              inspire action toward a more regenerative, resilient future.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Registration Form */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditMode
              ? "Update Registration Details"
              : "Registration Details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  disabled={!!user || isEditMode}
                />
                {user && (
                  <p className="text-sm text-muted-foreground">
                    Using your account email
                  </p>
                )}
                {!user && emailExists && !isCheckingEmail && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm">
                      This email is already registered.
                      <Link to="/auth" className="ml-1 underline">
                        Sign in
                      </Link>{" "}
                      to update your registration.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {!user && !isEditMode && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold">Create an Account (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                  Create an account to save your registration, access member
                  features, and stay updated on COhere events.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password{" "}
                    {emailExists
                      ? "(required to register with this email)"
                      : "(optional)"}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder={
                      emailExists
                        ? "Create a password to claim this email"
                        : "Choose a password to create an account"
                    }
                    minLength={6}
                    required={emailExists}
                  />
                  <p className="text-xs text-muted-foreground">
                    {emailExists
                      ? "Create an account with a password to register with this email address"
                      : "Leave blank to register without creating an account"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                placeholder="Your phone number"
                value={formData.phoneNumber}
                onChange={handleInputChange}
              />
              <p className="text-xs text-muted-foreground">
                So we can invite you to the Telegram group if you miss the link.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizations">Organization(s)</Label>
              <Input
                id="organizations"
                name="organizations"
                placeholder="Your organization(s) or business"
                value={formData.organizations}
                onChange={handleInputChange}
              />
            </div>

            {/* Event Attendance */}
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>
                  Can you attend the Invocation (Opening) Gathering?
                </Label>
                <p className="text-sm text-muted-foreground">
                  COhere will officially kick-off with the Invocation--a
                  gathering on the evening of Thursday, October 16th at The
                  Riverside. The event will include a shared meal, speakers,
                  activities, and live music. This is the best way to get
                  oriented to COhere and the events to come.
                </p>
                <RadioGroup
                  value={formData.canAttendInvocation}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      canAttendInvocation: value,
                    }))
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="invocation-yes" />
                    <Label htmlFor="invocation-yes">Yes, I can attend</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="invocation-no" />
                    <Label htmlFor="invocation-no">No, I cannot attend</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="maybe" id="invocation-maybe" />
                    <Label htmlFor="invocation-maybe">Maybe</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label>Can you attend the Integration (Closing) Party?</Label>
                <p className="text-sm text-muted-foreground">
                  COhere closes with a festive Integration gathering to
                  celebrate the connections and new possibilities formed during
                  the container. There will be harvest activities, live music,
                  food and drink, and more.
                </p>
                <RadioGroup
                  value={formData.canAttendIntegration}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      canAttendIntegration: value,
                    }))
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="integration-yes" />
                    <Label htmlFor="integration-yes">Yes, I can attend</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="integration-no" />
                    <Label htmlFor="integration-no">No, I cannot attend</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="maybe" id="integration-maybe" />
                    <Label htmlFor="integration-maybe">Maybe</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="howDidYouHear">
                How did you hear about COhere?
              </Label>
              <Textarea
                id="howDidYouHear"
                name="howDidYouHear"
                placeholder="Tell us how you discovered COhere..."
                rows={3}
                value={formData.howDidYouHear}
                onChange={handleInputChange}
              />
            </div>

            {/* Co-creating Section */}
            <div className="space-y-4">
              <div>
                <Label className="text-lg font-semibold">
                  Co-creating COhere
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Everyone is invited to contribute their gifts to help
                  co-create COhere the ways you feel called. Let us know if we
                  should reach out to you about any of the following...
                </p>
              </div>

              <div className="space-y-2">
                {coCreatingOptions.map((option) => (
                  <div key={option} className="flex items-center space-x-2">
                    <Checkbox
                      id={option}
                      checked={formData.coCreatingInterests.includes(option)}
                      onCheckedChange={(checked) =>
                        handleCheckboxChange(option, checked as boolean)
                      }
                    />
                    <label htmlFor={option} className="text-sm">
                      {option}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Contribution */}
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Label className="font-semibold">
                    Financial Contribution
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    This event is free. It is offered in the spirit of the gift
                    and your participation is a beautiful contribution.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    If you are in a position to contribute financially--no
                    matter the amount--to cover raw expenses and support the
                    organizers and artists making this happen, please consider
                    donating:
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      window.open(
                        "https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025",
                        "_blank",
                      )
                    }
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Donate to Support COhere
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">
                Additional Notes or Comments
              </Label>
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder="Anything else you'd like us to know?"
                rows={3}
                value={formData.additionalNotes}
                onChange={handleInputChange}
              />
            </div>

            {/* Email Consent */}
            <div className="space-y-4 p-4 bg-muted/20 rounded-lg border">
              <Label className="text-base font-semibold">
                Communication Preferences
              </Label>
              <div className="space-y-3">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="subscribed"
                    checked={formData.subscribed}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        subscribed: checked as boolean,
                      }))
                    }
                  />
                  <div className="space-y-1">
                    <label htmlFor="subscribed" className="text-sm font-medium">
                      Yes, I'd like to receive COhere updates and community news
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Get regular updates about upcoming events during COhere,
                      community news, and opportunities to connect. You can
                      update your preferences at any time.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || (emailExists && !formData.password && !user)
              }
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? "Update Registration" : "Submit Registration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
