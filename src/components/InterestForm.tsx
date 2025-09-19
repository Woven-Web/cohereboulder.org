import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FormData {
  name: string;
  email: string;
  organization: string;
  participationTypes: string[];
  themes: string[];
  message: string;
}

export const InterestForm = () => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    organization: "",
    participationTypes: [],
    themes: [],
    message: "",
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field: 'participationTypes' | 'themes', value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const submitToSupabase = async (data: FormData) => {
    const { error } = await supabase
      .from('interest_submissions')
      .insert({
        name: data.name,
        email: data.email,
        organization: data.organization || null,
        participation_types: data.participationTypes,
        themes: data.themes,
        message: data.message || null,
      });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast({
        title: "Required fields missing",
        description: "Please fill in your name and email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await submitToSupabase(formData);
      setSubmitted(true);
      toast({
        title: "Success!",
        description: "Your interest has been submitted successfully.",
      });
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        title: "Submission failed",
        description: "There was an error submitting your form. Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h3 className="text-2xl font-bold mb-4 text-primary">Thank You!</h3>
          <p className="text-muted-foreground">
            We've received your interest in COhere Boulder 2025. We'll be in touch soon with more information about how you can participate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Express Your Interest</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input 
                id="name" 
                required 
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
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
            <Label htmlFor="organization">Organization (Optional)</Label>
            <Input 
              id="organization" 
              placeholder="Your organization or business"
              value={formData.organization}
              onChange={(e) => handleInputChange('organization', e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>How would you like to participate? (Check all that apply)</Label>
            <div className="space-y-2">
              {[
                { id: 'attend', label: 'Attend events during October 16-26' },
                { id: 'organize', label: 'Help organize and support COhere' },
                { id: 'host', label: 'Host an event during the 10-day container' },
                { id: 'sponsor', label: 'Sponsor COhere Boulder 2025' },
                { id: 'volunteer', label: 'Volunteer during events' }
              ].map(({ id, label }) => (
                <div key={id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={id}
                    checked={formData.participationTypes.includes(label)}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange('participationTypes', label, checked as boolean)
                    }
                  />
                  <label htmlFor={id} className="text-sm">{label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="themes">Which themes interest you most?</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { id: 'ecology', label: 'Ecology & Food Systems' },
                { id: 'arts', label: 'Arts & Culture' },
                { id: 'wellness', label: 'Wellness' },
                { id: 'tech', label: 'Technology & Innovation' },
                { id: 'governance', label: 'Governance & Business' },
                { id: 'villaging', label: 'Villaging & Neighboring' }
              ].map(({ id, label }) => (
                <div key={id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={id}
                    checked={formData.themes.includes(label)}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange('themes', label, checked as boolean)
                    }
                  />
                  <label htmlFor={id}>{label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Tell us more (Optional)</Label>
            <Textarea
              id="message"
              placeholder="What excites you about COhere? What gifts might you bring to the community?"
              rows={4}
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit Your Interest
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};