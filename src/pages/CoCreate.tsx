import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Calendar, Home, Mic, Music, Palette, Mail } from "lucide-react";

const CoCreate = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-community-yellow/20 to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6">
              Co-Create With Us
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              COhere is designed to be co-created. Your gifts, offerings, and
              participation shape what emerges.
            </p>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">
                What gifts do you want to weave into community?
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                The 10 days between Invocation and Integration come alive
                through what we all bring. Every offering—big or
                small—strengthens our community web.
              </p>
            </div>

            {/* Ways to Contribute */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Calendar className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Host an Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Workshops, gatherings, ceremonies, skill-shares, or
                    experiences that bring people together
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Event Hosting Guide
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Home className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Open Your Space</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Offer your home, yard, studio, or venue for gatherings and
                    connections
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Space Hosting Info
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Mic className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Share Your Story</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Lightning talks, storytelling, or sharing your vision for
                    Boulder's future
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Speaking Opportunities
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Music className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Bring Art & Music</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Performances, installations, creative experiences that
                    inspire and connect
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Artist Information
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Heart className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Offer Support</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Volunteer, provide resources, help with logistics, or
                    support other's offerings
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Support Opportunities
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <Palette className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Something Else?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Have a unique offering or wild idea? We want to hear it!
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    Share Your Idea
                  </Button>
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

            {/* Get Started */}
            <Card className="shadow-warm bg-white">
              <CardContent className="p-8 text-center">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-4">Ready to Co-Create?</h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Whether you have a fully formed idea or just a spark of
                  inspiration, we want to hear from you. Let's weave something
                  beautiful together.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button variant="community" size="lg">
                    Share Your Offering
                  </Button>
                  <Button variant="outline" size="lg">
                    <Mail className="mr-2 h-5 w-5" />
                    Contact: cohere@wovenweb.org
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
