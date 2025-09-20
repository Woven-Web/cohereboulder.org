import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Calendar,
  Home,
  Mic,
  Music,
  Palette,
  Mail,
  Users,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";

const CoCreate = () => {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-community-yellow/20 to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6">
              {tr("coCreate.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {tr("coCreate.subtitle")}
            </p>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">
                {tr("coCreate.whatGifts")}
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                {tr("coCreate.tenDaysDescription")}
              </p>
            </div>

            {/* Ways to Contribute */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Calendar className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.hostEvent.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.hostEvent.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Home className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.openSpace.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.openSpace.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Mic className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.shareStory.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.shareStory.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Music className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.bringArt.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.bringArt.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Heart className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.offerSupport.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.offerSupport.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Palette className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">
                    {tr("coCreate.somethingElse.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tr("coCreate.somethingElse.description")}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* How It Works */}
            <Card className="shadow-warm bg-gradient-to-br from-earth-light/30 to-background mb-16">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-6 text-center">
                  How Co-Creation Works
                </h3>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">1</span>
                    </div>
                    <h4 className="font-semibold mb-2">You Offer</h4>
                    <p className="text-sm text-muted-foreground">
                      Share what you'd like to bring to the community during
                      COhere
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">2</span>
                    </div>
                    <h4 className="font-semibold mb-2">We Connect</h4>
                    <p className="text-sm text-muted-foreground">
                      We help connect you with spaces, collaborators, and
                      resources
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">3</span>
                    </div>
                    <h4 className="font-semibold mb-2">Magic Happens</h4>
                    <p className="text-sm text-muted-foreground">
                      Your offering becomes part of the tapestry of COhere
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Principles */}
            <div className="mb-16">
              <h3 className="text-2xl font-bold text-center mb-8">
                Co-Creation Principles
              </h3>

              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-semibold mb-2">Gift Economy</h4>
                    <p className="text-sm text-muted-foreground">
                      COhere operates on gift economy principles. Offerings are
                      freely given, creating abundance for all.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-semibold mb-2">Yes, And...</h4>
                    <p className="text-sm text-muted-foreground">
                      We embrace what emerges. Your ideas can evolve and combine
                      with others in unexpected ways.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-semibold mb-2">Accessibility</h4>
                    <p className="text-sm text-muted-foreground">
                      We strive to make COhere accessible to all. Let us know
                      how we can support participation.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-semibold mb-2">Regenerative</h4>
                    <p className="text-sm text-muted-foreground">
                      What we create together should leave our community
                      stronger and more connected than before.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Get Involved CTA */}
            <Card className="shadow-warm bg-gradient-to-br from-primary/10 to-background mb-16">
              <CardContent className="p-8">
                <div className="text-center">
                  <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-4">
                    Ready to Co-Create?
                  </h3>
                  <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
                    Whether you have a fully formed idea or just a spark of
                    inspiration, we want to hear from you. Let's weave something
                    beautiful together.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Button
                      variant="default"
                      size="lg"
                      className="gap-2"
                      onClick={() =>
                        (window.location.href =
                          "mailto:cohere@wovenweb.org?subject=Co-Creation Interest for COhere Boulder 2025")
                      }
                    >
                      <Mail className="h-5 w-5" />
                      Email Us Your Ideas
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground mt-4">
                    Email us at{" "}
                    <a
                      href="mailto:cohere@wovenweb.org"
                      className="text-primary hover:underline font-medium"
                    >
                      cohere@wovenweb.org
                    </a>{" "}
                    with your co-creation ideas and we'll help bring them to
                    life!
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* More Ways to Participate */}
            <div className="mb-16">
              <h3 className="text-2xl font-bold text-center mb-8">
                More Ways to Participate
              </h3>

              <div className="grid md:grid-cols-3 gap-6">
                <Card className="text-center">
                  <CardContent className="p-6">
                    <Calendar className="h-10 w-10 text-primary mx-auto mb-3" />
                    <h4 className="font-semibold mb-2">Attend Events</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Join workshops, gatherings, and celebrations throughout
                      the 10 days
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/calendar">View Calendar</a>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardContent className="p-6">
                    <Users className="h-10 w-10 text-primary mx-auto mb-3" />
                    <h4 className="font-semibold mb-2">Volunteer</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Help with setup, facilitation, or support during events
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/register">Sign Up to Volunteer</a>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardContent className="p-6">
                    <Heart className="h-10 w-10 text-primary mx-auto mb-3" />
                    <h4 className="font-semibold mb-2">Support</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Contribute to making COhere accessible for all
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          "https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025",
                          "_blank",
                        )
                      }
                    >
                      Donate
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Contact Info */}
            <Card className="shadow-warm bg-white">
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground mb-4">
                  {tr("coCreate.haveQuestions")}{" "}
                  <a
                    href="mailto:cohere@wovenweb.org"
                    className="text-primary hover:underline font-medium"
                  >
                    cohere@wovenweb.org
                  </a>
                </p>

                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {tr("coCreate.loveWhatWeCreate")}
                  </p>
                  <Button
                    variant="community"
                    className="gap-2"
                    onClick={() =>
                      window.open(
                        "https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025",
                        "_blank",
                      )
                    }
                  >
                    <Heart className="h-4 w-4" />
                    Support COhere with a Donation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CoCreate;
