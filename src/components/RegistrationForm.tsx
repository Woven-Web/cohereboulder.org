import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RegistrationFormData {
  fullName: string;
  email: string;
  phoneNumber: string;
  organizations: string;
  canAttendInvocation: string; // "yes" | "no" | ""
  canAttendIntegration: string; // "yes" | "no" | ""
  howDidYouHear: string;
  coCreatingInterests: string[];
  financialContributionInterest: boolean;
  additionalNotes: string;
}

export const RegistrationForm = () => {
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: "",
    email: "",
    phoneNumber: "",
    organizations: "",
    canAttendInvocation: "",
    canAttendIntegration: "",
    howDidYouHear: "",
    coCreatingInterests: [],
    financialContributionInterest: false,
    additionalNotes: "",
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: keyof RegistrationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field: 'coCreatingInterests', value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const submitToSupabase = async (data: RegistrationFormData) => {
    const { error } = await supabase
      .from('registrations')
      .insert({
        full_name: data.fullName,
        email: data.email,
        phone_number: data.phoneNumber || null,
        organizations: data.organizations || null,
        can_attend_invocation: data.canAttendInvocation === "yes" ? true : data.canAttendInvocation === "no" ? false : null,
        can_attend_integration: data.canAttendIntegration === "yes" ? true : data.canAttendIntegration === "no" ? false : null,
        how_did_you_hear: data.howDidYouHear || null,
        co_creating_interests: data.coCreatingInterests,
        financial_contribution_interest: data.financialContributionInterest,
        additional_notes: data.additionalNotes || null,
      });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.email) {
      toast({
        title: "Required fields missing",
        description: "Please fill in your full name and email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await submitToSupabase(formData);
      setSubmitted(true);
      toast({
        title: "Registration successful!",
        description: "Welcome to COhere Boulder 2025! You'll receive updates soon.",
      });
    } catch (error) {
      console.error('Error submitting registration:', error);
      toast({
        title: "Registration failed",
        description: "There was an error with your registration. Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-8 text-center">
          <h3 className="text-2xl font-bold mb-4 text-primary">Welcome to COhere Boulder 2025!</h3>
          <p className="text-muted-foreground mb-6">
            Thank you for registering! We're excited to weave you into the fabric of our community. 
            You'll receive updates and communications as we approach the October 16-26 container.
          </p>
          <p className="text-sm text-muted-foreground">
            Check your email for next steps and watch for the Telegram group invitation if you provided your phone number.
          </p>
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
            {/* Basic Information */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input 
                  id="fullName" 
                  required 
                  placeholder="Your full name"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input 
                  id="email" 
                  type="email" 
                  required 
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input 
                id="phoneNumber" 
                type="tel"
                placeholder="Your phone number"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                So we can invite you to the Telegram group if you miss the link.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizations">Organization(s)</Label>
              <Input 
                id="organizations" 
                placeholder="Your organization(s) or business"
                value={formData.organizations}
                onChange={(e) => handleInputChange('organizations', e.target.value)}
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
                  onValueChange={(value) => handleInputChange('canAttendInvocation', value)}
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
                  onValueChange={(value) => handleInputChange('canAttendIntegration', value)}
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
                placeholder="Tell us how you discovered COhere..."
                rows={3}
                value={formData.howDidYouHear}
                onChange={(e) => handleInputChange('howDidYouHear', e.target.value)}
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
                        handleCheckboxChange('coCreatingInterests', option, checked as boolean)
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
                placeholder="Anything else you'd like us to know?"
                rows={3}
                value={formData.additionalNotes}
                onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  Complete Registration
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};