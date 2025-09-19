import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, ExternalLink, Mail, Loader2 } from "lucide-react";

interface RegistrationFormData {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  organizations: string;
  canAttendInvocation: string;
  canAttendIntegration: string;
  coCreatingInterests: string[];
  financialContributionInterest: boolean;
  howDidYouHear: string;
  additionalNotes: string;
}

export function RegistrationForm() {
  const { toast } = useToast();
  const { user, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
    password: "",
    phoneNumber: "",
    organizations: "",
    canAttendInvocation: "",
    canAttendIntegration: "",
    coCreatingInterests: [],
    financialContributionInterest: false,
    howDidYouHear: "",
    additionalNotes: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      coCreatingInterests: checked 
        ? [...prev.coCreatingInterests, value]
        : prev.coCreatingInterests.filter(item => item !== value)
    }));
  };

  const submitToSupabase = async (data: RegistrationFormData, userId?: string) => {
    const registrationData = {
      full_name: data.fullName,
      email: data.email,
      phone_number: data.phoneNumber,
      organizations: data.organizations,
      can_attend_invocation: data.canAttendInvocation === "yes",
      can_attend_integration: data.canAttendIntegration === "yes",
      co_creating_interests: data.coCreatingInterests,
      financial_contribution_interest: data.financialContributionInterest,
      how_did_you_hear: data.howDidYouHear,
      additional_notes: data.additionalNotes,
      user_id: userId || null,
    };

    const { error } = await supabase
      .from("registrations")
      .insert(registrationData);

    if (error) {
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

      let userId = user?.id;

      // If user is not authenticated and wants to create account
      if (!user && formData.password) {
        const { error: authError } = await signUp(formData.email, formData.password, formData.fullName);
        
        if (authError) {
          throw new Error(authError.message);
        }

        // Show verification message instead of completing registration
        setNeedsVerification(true);
        toast({
          title: "Account created!",
          description: "Please check your email to verify your account, then complete your registration.",
        });
        setIsLoading(false);
        return;
      }

      await submitToSupabase(formData, userId);
      setSubmitted(true);
      
      toast({
        title: "Registration submitted successfully!",
        description: "Thank you for registering for COhere Boulder 2025. We'll be in touch soon with more details.",
      });

    } catch (error: any) {
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
            <h2 className="text-2xl font-bold text-blue-700">Check Your Email!</h2>
            <p className="text-muted-foreground">
              We've sent you a verification link. Please verify your email address to complete your registration.
            </p>
            <p className="text-sm text-muted-foreground">
              After verification, you can return to this page to complete your registration for COhere Boulder 2025.
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
            <h2 className="text-2xl font-bold text-green-700">Registration Complete!</h2>
            <p className="text-muted-foreground">
              Thank you for registering for COhere Boulder 2025. We're excited to have you join our community-building journey.
            </p>
            <p className="text-sm text-muted-foreground">
              You'll receive a confirmation email shortly with next steps and event details.
            </p>
            
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
    "Event hosting or co-hosting",
    "Marketing and outreach",
    "Logistics and coordination",
    "Art and creative expression",
    "Documentation (photography, videography)",
    "Technical support",
    "Venue partnerships",
    "Community partnerships",
    "Volunteer coordination"
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header Section */}
      <Card>
        <CardContent className="p-8">
          <h1 className="text-3xl font-bold mb-4">Register for COhere Boulder 2025</h1>
          <p className="text-muted-foreground mb-4">
            Please complete this form to receive communications and stay up-to-date on what's unfolding with COhere. 
            Registration is free and all events are opt-in.
          </p>
          <p className="text-primary font-medium">
            We can't wait to weave you into the fabric of this community!
          </p>
          
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              COhere stokes Boulder's culture and engagement by connecting residents, organizations, artists, leaders, 
              and innovators during a 10-day container (and beyond!). Through a curated calendar of values-aligned 
              events and memorable opening & closing gatherings, we strengthen community ties, highlight our city's 
              vibrancy, and inspire action toward a more regenerative, resilient future.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Registration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Registration Details</CardTitle>
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
                  disabled={!!user}
                />
                {user && <p className="text-sm text-muted-foreground">Using your account name</p>}
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
                  disabled={!!user}
                />
                {user && <p className="text-sm text-muted-foreground">Using your account email</p>}
              </div>
            </div>

            {!user && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold">Create an Account (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                  Create an account to save your registration, access member features, and stay updated on COhere events.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="password">Password (optional)</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Choose a password to create an account"
                    minLength={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to register without creating an account
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
                <Label>Can you attend the Invocation (Opening) Gathering?</Label>
                <p className="text-sm text-muted-foreground">
                  COhere will officially kick-off with the Invocation--a gathering on the evening of Thursday, 
                  October 16th at The Riverside. The event will include a shared meal, speakers, activities, 
                  and live music. This is the best way to get oriented to COhere and the events to come.
                </p>
                <RadioGroup 
                  value={formData.canAttendInvocation} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, canAttendInvocation: value }))}
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
                  COhere closes with a festive Integration gathering to celebrate the connections and new 
                  possibilities formed during the container. There will be harvest activities, live music, 
                  food and drink, and more.
                </p>
                <RadioGroup 
                  value={formData.canAttendIntegration} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, canAttendIntegration: value }))}
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
              <Label htmlFor="howDidYouHear">How did you hear about COhere?</Label>
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
                <Label className="text-lg font-semibold">Co-creating COhere</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Everyone is invited to contribute their gifts to help co-create COhere the ways you feel called. 
                  Let us know if we should reach out to you about any of the following...
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
                    <label htmlFor={option} className="text-sm">{option}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Contribution */}
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Label className="font-semibold">Financial Contribution</Label>
                  <p className="text-sm text-muted-foreground">
                    This event is free. It is offered in the spirit of the gift and your participation is a beautiful contribution.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    If you are in a position to contribute financially--no matter the amount--to cover raw expenses 
                    and support the organizers and artists making this happen, please consider donating:
                  </p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="w-fit"
                    onClick={() => window.open('https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025', '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Donate to Support COhere
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional Notes or Comments</Label>
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder="Anything else you'd like us to know?"
                rows={3}
                value={formData.additionalNotes}
                onChange={handleInputChange}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {!user && formData.password ? "Creating Account..." : "Registering..."}
                </>
              ) : (
                <>
                  Complete Registration
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}