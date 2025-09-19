import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight } from "lucide-react";

export const InterestForm = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
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
              <Input id="name" required placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" required placeholder="your@email.com" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization">Organization (Optional)</Label>
            <Input id="organization" placeholder="Your organization or business" />
          </div>

          <div className="space-y-3">
            <Label>How would you like to participate? (Check all that apply)</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="attend" />
                <label htmlFor="attend" className="text-sm">
                  Attend events during October 16-26
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="organize" />
                <label htmlFor="organize" className="text-sm">
                  Help organize and support COhere
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="host" />
                <label htmlFor="host" className="text-sm">
                  Host an event during the 10-day container
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="sponsor" />
                <label htmlFor="sponsor" className="text-sm">
                  Sponsor COhere Boulder 2025
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="volunteer" />
                <label htmlFor="volunteer" className="text-sm">
                  Volunteer during events
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="themes">Which themes interest you most?</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center space-x-2">
                <Checkbox id="ecology" />
                <label htmlFor="ecology">Ecology & Food Systems</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="arts" />
                <label htmlFor="arts">Arts & Culture</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="wellness" />
                <label htmlFor="wellness">Wellness</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="tech" />
                <label htmlFor="tech">Technology & Innovation</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="governance" />
                <label htmlFor="governance">Governance & Business</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="villaging" />
                <label htmlFor="villaging">Villaging & Neighboring</label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Tell us more (Optional)</Label>
            <Textarea
              id="message"
              placeholder="What excites you about COhere? What gifts might you bring to the community?"
              rows={4}
            />
          </div>

          <Button type="submit" size="lg" className="w-full">
            Submit Your Interest
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
