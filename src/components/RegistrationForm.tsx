import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
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
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const COHERE_EVENT = "october2025"; // Current event identifier

interface RegistrationFormData {
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
}

export function RegistrationForm() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { tr } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingProfile, setExistingProfile] = useState<{
    id: string;
    email: string;
    full_name: string;
    phone_number?: string | null;
    organizations?: string | null;
    subscribed?: boolean | null;
    user_id?: string | null;
  } | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<{
    id: string;
    can_attend_invocation: boolean | null;
    can_attend_integration: boolean | null;
    co_creating_interests?: string[] | null;
    how_did_you_hear?: string | null;
    additional_notes?: string | null;
  } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
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
        // Transform database data to match interface
        setExistingProfile({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name || "",
          phone_number: profile.phone_number,
          organizations: profile.organizations,
          subscribed: profile.subscribed,
          user_id: profile.user_id,
        });

        // Check for existing registration for this event
        const { data: registration, error: regError } = await supabase
          .from("registrations")
          .select("*")
          .eq("profile_id", profile.id)
          .eq("cohere_event", COHERE_EVENT)
          .single();

        if (registration && !regError) {
          // Transform database data to match interface
          setExistingRegistration({
            id: registration.id,
            can_attend_invocation: registration.can_attend_invocation,
            can_attend_integration: registration.can_attend_integration,
            co_creating_interests: registration.co_creating_interests,
            how_did_you_hear: registration.how_did_you_hear,
            additional_notes: registration.additional_notes,
          });
          setIsEditMode(true);

          // Populate form with existing data
          setFormData({
            fullName: profile.full_name || "",
            email: profile.email,
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
            title: tr("registration.welcomeBack"),
            description: tr("registration.foundExisting"),
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
            throw new Error(tr("registration.errorMessages.emailRegistered"));
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
            user_id: userId || existingProfile?.user_id,
          })
          .eq("id", existingProfile!.id);

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
              tr("registration.errorMessages.alreadyRegisteredEvent"),
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
        throw new Error(tr("registration.errorMessages.fillRequired"));
      }

      const userId = user?.id;

      await submitToSupabase(formData, userId);
      setSubmitted(true);

      toast({
        title: isEditMode
          ? tr("registration.errorMessages.registrationUpdatedSuccess")
          : tr("registration.errorMessages.registrationSubmittedSuccess"),
        description: isEditMode
          ? tr("registration.errorMessages.registrationUpdatedDescription")
          : tr("registration.errorMessages.registrationSubmittedDescription"),
      });
    } catch (error) {
      toast({
        title: tr("registration.errorMessages.errorSubmitting"),
        description:
          (error as Error)?.message || tr("registration.errorMessages.tryAgainLater"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-green-700">
              {isEditMode
                ? tr("registration.registrationUpdated")
                : tr("registration.registrationComplete")}
            </h2>
            <p className="text-muted-foreground">
              {isEditMode
                ? tr("registration.registrationUpdateMessage")
                : tr("registration.registrationSuccessMessage")}
            </p>
            {!isEditMode && (
              <p className="text-sm text-muted-foreground">
                {tr("registration.confirmationEmailMessage")}
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
                  {tr("registration.supportWithDonation")}
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
    tr("registration.coCreatingOptions.hostEvent"),
    tr("registration.coCreatingOptions.hostDinner"),
    tr("registration.coCreatingOptions.volunteer"),
    tr("registration.coCreatingOptions.tellStories"),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header Section */}
      <Card>
        <CardContent className="p-8">
          <h1 className="text-3xl font-bold mb-4">
            {isEditMode
              ? tr("registration.updateTitle")
              : tr("registration.title")}
          </h1>
          {isEditMode ? (
            <p className="text-muted-foreground mb-4">
              {tr("registration.welcomeBack")}{" "}
              {tr("registration.foundExisting")}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">
                {tr("registration.description")}
              </p>
              <p className="text-primary font-medium">
                {tr("registration.weaveYou")}
              </p>
            </>
          )}

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              {tr("registration.cohereDescription")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Registration Form */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditMode
              ? tr("registration.updateDetails")
              : tr("registration.registrationDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">{tr("registration.fullName")}</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{tr("registration.email")}</Label>
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
                    {tr("registration.usingAccountEmail")}
                  </p>
                )}
                {!user && emailExists && !isCheckingEmail && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm">
                      {tr("registration.emailAlreadyRegistered")}
                      <Link to="/auth" className="ml-1 underline">
                        {tr("registration.signIn")}
                      </Link>{" "}
                      {tr("registration.toUpdateRegistration")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Account creation removed - registration now works without accounts */}

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">
                {tr("registration.phoneNumber")}
              </Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                placeholder={tr("registration.phoneNumberPlaceholder")}
                value={formData.phoneNumber}
                onChange={handleInputChange}
              />
              <p className="text-xs text-muted-foreground">
                {tr("registration.phoneNumberHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizations">
                {tr("registration.organizations")}
              </Label>
              <Input
                id="organizations"
                name="organizations"
                placeholder={tr("registration.organizationsPlaceholder")}
                value={formData.organizations}
                onChange={handleInputChange}
              />
            </div>

            {/* Event Attendance */}
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>{tr("registration.canAttendInvocation")}</Label>
                <p className="text-sm text-muted-foreground">
                  {tr("registration.invocationDescription")}
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
                    <Label htmlFor="invocation-yes">
                      {tr("registration.yesCanAttend")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="invocation-no" />
                    <Label htmlFor="invocation-no">
                      {tr("registration.noCannotAttend")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="maybe" id="invocation-maybe" />
                    <Label htmlFor="invocation-maybe">
                      {tr("registration.maybe")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label>{tr("registration.canAttendIntegration")}</Label>
                <p className="text-sm text-muted-foreground">
                  {tr("registration.integrationDescription")}
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
                    <Label htmlFor="integration-yes">
                      {tr("registration.yesCanAttend")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="integration-no" />
                    <Label htmlFor="integration-no">
                      {tr("registration.noCannotAttend")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="maybe" id="integration-maybe" />
                    <Label htmlFor="integration-maybe">
                      {tr("registration.maybe")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="howDidYouHear">
                {tr("registration.howDidYouHear")}
              </Label>
              <Textarea
                id="howDidYouHear"
                name="howDidYouHear"
                placeholder={tr("registration.howDidYouHearPlaceholder")}
                rows={3}
                value={formData.howDidYouHear}
                onChange={handleInputChange}
              />
            </div>

            {/* Co-creating Section */}
            <div className="space-y-4">
              <div>
                <Label className="text-lg font-semibold">
                  {tr("registration.coCreatingCOhere")}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {tr("registration.coCreatingDescription")}
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
                    {tr("registration.financialContribution")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {tr("registration.financialDescription1")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tr("registration.financialDescription2")}
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
                    {tr("registration.donateToSupport")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">
                {tr("registration.additionalNotes")}
              </Label>
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder={tr("registration.additionalNotesPlaceholder")}
                rows={3}
                value={formData.additionalNotes}
                onChange={handleInputChange}
              />
            </div>

            {/* Email Consent */}
            <div className="space-y-4 p-4 bg-muted/20 rounded-lg border">
              <Label className="text-base font-semibold">
                {tr("registration.communicationPreferences")}
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
                      {tr("registration.subscribeNewsletter")}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {tr("registration.subscribeDescription")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode
                ? tr("registration.updateRegistration")
                : tr("registration.submitRegistration")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
