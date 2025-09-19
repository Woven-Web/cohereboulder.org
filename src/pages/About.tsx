import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart, Users, Sparkles } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-earth-light to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6">
              The COhere Blueprint
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              A repeatable model for weaving resilient communities through
              intentional gathering and connection
            </p>
          </div>
        </section>

        {/* The Three Phases */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              The Three-Phase Rhythm
            </h2>

            <div className="space-y-8">
              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-nature-teal/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-nature-teal">
                        1
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">Invitation</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Core contributors gather
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    For those who feel the call to contribute in a more direct
                    way to weaving a more resilient local community, we invite
                    you to gather and co-create what COhere can be.
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">What happens:</p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Reflect on events to steward</li>
                      <li>• Connect with other contributors</li>
                      <li>• Commit to enacting visions</li>
                      <li>• Shape the upcoming cycle</li>
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 italic">
                    Note: Invitations are typically sent personally to those
                    ready to step into greater service
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-community-orange/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-community-orange">
                        2
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">Invocation</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Community-wide launch
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    We come together as a whole community to speak, listen,
                    dance, sing, celebrate and envision. We invoke the spirit of
                    COhere, calling forward a spirit of togetherness and a more
                    beautiful vision for our home.
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">What happens:</p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Community-wide celebration</li>
                      <li>• Launch the 10-day experience</li>
                      <li>• Share offerings and events</li>
                      <li>• Set collective intentions</li>
                      <li>• Invoke the spirit of connection</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-nature-green/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-nature-green">
                        3
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">Integration</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Reflection & commitments
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    We gather to explore what has unfolded, reflect on who we
                    are as a community, and touch into what now feels possible.
                    We deepen our bonds and form commitments to continue showing
                    up and weaving our resilient local community.
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">What happens:</p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Share stories and learnings</li>
                      <li>• Recognize our interconnectivity</li>
                      <li>• Form ongoing commitments</li>
                      <li>• Shape what comes next</li>
                      <li>• Celebrate and rest</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 p-6 bg-muted/30 rounded-xl text-center">
              <p className="text-lg text-muted-foreground italic">
                "The journey of weaving our resilience never begins and never
                ends. COhere is simply a blueprint to call deeper attention to
                this process in which we all engage."
              </p>
            </div>
          </div>
        </section>

        {/* Why This Works */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              Why This Blueprint Works
            </h2>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Natural Rhythm</h3>
                <p className="text-muted-foreground">
                  The three phases mirror how communities naturally grow: small
                  groups commit, the wider community celebrates, then we
                  integrate learnings. This creates sustainable change rather
                  than one-time events.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  Distributed Leadership
                </h3>
                <p className="text-muted-foreground">
                  Rather than top-down organization, COhere emerges from many
                  people offering their gifts. This creates resilience—the web
                  remains strong even as individual threads change.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Cross-Pollination</h3>
                <p className="text-muted-foreground">
                  By bringing together diverse communities that don't usually
                  interact, we create unexpected connections and collaborations
                  that strengthen the whole ecosystem.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Ongoing Process</h3>
                <p className="text-muted-foreground">
                  COhere isn't a one-time festival—it's an ongoing rhythm that
                  deepens with each cycle. Relationships strengthen, trust
                  builds, and our collective capacity grows.
                </p>
              </div>
            </div>

            <Card className="shadow-warm bg-white">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-semibold mb-4">
                  Adaptable for Any Community
                </h3>
                <p className="text-muted-foreground">
                  This blueprint can be adapted to any community's needs. The
                  rhythm can be yearly, quarterly, or whatever serves your
                  place. The key is creating regular cycles of connection,
                  action, and integration.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Our Values */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              Living Values
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Heart className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Active Participation</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This game, much like life, becomes more fun when we are all
                    leaning in, being courageously participatory and supporting
                    one another.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Care for the Collective</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Let's nurture our collective well-being, ensuring that
                    everyone feels held, valued, and seen. Together, we thrive.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Radical Interdependence</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Be bold with offers and requests. Let's find out what's
                    possible when we lean on one another.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Heart className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Roots to Fruits</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We focus on foundational relationships and shared context.
                    From strong roots, beautiful fruits naturally emerge.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Anchor Abundance</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Collectively, we are so resourced. Give generously, and
                    trust that the rising tide will lift all ships.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">Amplify What's Good</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Celebrate and amplify the aspects of individuals, this
                    place, and this community we love.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Origins */}
        <section className="py-20 bg-gradient-to-br from-community-yellow/10 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              Where This Comes From
            </h2>

            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
              <p>
                COhere emerged from a group of friends asking: How do we weave a
                more resilient community in Boulder? How do we move beyond
                individual efforts to collective thriving?
              </p>

              <p>
                We drew inspiration from indigenous wisdom about community, from
                emergence theory, from the mycelial networks that connect
                forests, and from movements worldwide that are reimagining how
                we live together.
              </p>

              <p>
                What started as conversations became gatherings, which became
                the first COhere cycle in 2024. Now, we're learning and evolving
                with each iteration, discovering together what's possible when a
                community commits to weaving itself stronger.
              </p>

              <p>
                COhere is part of a wider emergence happening
                globally—communities remembering how to be in right relationship
                with each other and the land. We're connected to and inspired by
                regenerative movements everywhere.
              </p>
            </div>

            <div className="mt-12 text-center">
              <Link to="/join-2025">
                <Button variant="community" size="lg">
                  Join the Next Cycle
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
