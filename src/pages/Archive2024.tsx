import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Calendar } from "lucide-react";

import { MissionSection } from "@/components/MissionSection";
import { ValuesSection } from "@/components/ValuesSection";
import { SupportSection } from "@/components/SupportSection";

const Archive2024 = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Archive Header */}
        <section className="py-12 bg-gradient-to-br from-earth-light to-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Badge className="mb-4" variant="secondary">
                Archive
              </Badge>
              <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
                COhere Boulder 2024
              </h1>
              <p className="text-xl text-muted-foreground">
                October 10-20, 2024 • Our inaugural 10-day immersive experience
              </p>
            </div>
          </div>
        </section>

        {/* Completion Message */}
        <section className="py-12 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="space-y-6">
              <h2 className="text-2xl lg:text-3xl font-bold text-white">
                [CO]here 2024 is complete.
              </h2>
              <h3 className="text-xl lg:text-2xl font-semibold text-white/90">
                & the community cultivation continues
              </h3>

              {/* YouTube Video Embed */}
              <div className="max-w-2xl mx-auto">
                <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
                  <iframe
                    src="https://www.youtube.com/embed/wMDpVsSGY5M"
                    title="COhere 2024 Video"
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What Happened Section */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              What Happened During COhere 2024
            </h2>

            <div className="prose prose-lg max-w-none text-center mb-12">
              <p className="text-xl text-muted-foreground">
                From October 10-20, 2024, Boulder came together in an
                unprecedented way. Over 10 days, we hosted dozens of events,
                connected hundreds of community members, and began weaving a
                stronger, more resilient web of connection across our city.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-primary mb-2">10</div>
                  <p className="font-semibold">Days of Connection</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    An immersive experience across Boulder
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-community-orange mb-2">
                    50+
                  </div>
                  <p className="font-semibold">Community Events</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Co-created by local organizers
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-nature-green mb-2">
                    300+
                  </div>
                  <p className="font-semibold">Participants</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Community members engaged
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Original Hero Content */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-6">
                The Original Vision
              </h2>
              <p className="text-xl text-muted-foreground italic mb-4">
                "A 10-day immersive game about people, place &
                cross-pollination"
              </p>
              <p className="text-lg text-muted-foreground">
                Un juego inmersivo de 10 días sobre comunidad, tierra y
                polinización cruzada.
              </p>
            </div>
          </div>
        </section>

        {/* Regenerative Map Section */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-8">
                Boulder's Regenerative Ecosystem Map
              </h2>
              <div className="w-full max-w-5xl mx-auto mb-8">
                <iframe
                  src={`${import.meta.env.BASE_URL}Ecosystem.pdf`}
                  title="Boulder's Regenerative Community Map"
                  className="w-full h-[600px] rounded-2xl shadow-warm"
                  style={{ border: "none" }}
                />
              </div>
              <div className="space-y-6">
                <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                  Together with{" "}
                  <a
                    href="https://climatique.earth/"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Climatique
                  </a>
                  , we created this map to demonstrate the rich tapestry of
                  projects and groups working towards regenerative change in our
                  community.
                </p>
                <p className="text-muted-foreground max-w-3xl mx-auto">
                  It is only a taste — some of the most visible and approachable
                  'nodes' in our ecosystem. We encourage you to use this to
                  start exploring, but know that there's much more to discover.
                </p>
              </div>
            </div>
          </div>
        </section>

        <MissionSection />
        <ValuesSection />

        {/* Key Events Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              Highlights from COhere 2024
            </h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Badge variant="secondary">Oct 11</Badge>
                    <h3 className="font-semibold">Kickoff Party</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The Riverside welcomed over 150 community members for an
                    evening of connection, music, and visioning for the days
                    ahead.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Badge variant="secondary">Oct 14</Badge>
                    <h3 className="font-semibold">
                      Regenerative Systems Gathering
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Junkyard Social Club hosted deep dialogues about creating
                    regenerative systems in Boulder.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Badge variant="secondary">Oct 16</Badge>
                    <h3 className="font-semibold">Community Potluck</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Hawks Nest House brought together diverse community members
                    for food, stories, and connection.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Badge variant="secondary">Oct 20</Badge>
                    <h3 className="font-semibold">Integration & Closing</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We gathered to reflect, celebrate, and commit to continuing
                    the work of community weaving.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Learnings Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              What We Learned
            </h2>

            <Card className="shadow-warm">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      The Power of Invitation
                    </h3>
                    <p className="text-muted-foreground">
                      When we create intentional space for connection, our
                      community shows up in beautiful and unexpected ways.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      Cross-Pollination Works
                    </h3>
                    <p className="text-muted-foreground">
                      Bringing together people from different sectors and
                      backgrounds created new collaborations and initiatives
                      that continue today.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      Rhythm and Repetition
                    </h3>
                    <p className="text-muted-foreground">
                      This experience showed us the value of regular cycles of
                      gathering, action, and integration - leading to our
                      ongoing annual rhythm.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      Community is Ready
                    </h3>
                    <p className="text-muted-foreground">
                      Boulder is hungry for deeper connection and ready to
                      co-create a more resilient, regenerative future together.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <SupportSection />

        {/* Continue Journey Section */}
        <section className="py-20 bg-gradient-community text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              The Journey Continues
            </h2>
            <p className="text-xl mb-8 text-white/90">
              COhere 2024 was just the beginning. Join us as we continue weaving
              a more resilient Boulder together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                variant="outline"
                className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary"
              >
                <ArrowRight className="mr-2 h-5 w-5" />
                Learn About COhere 2025
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Join Our Newsletter
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Archive2024;
