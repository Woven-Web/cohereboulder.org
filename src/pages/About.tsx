import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gamepad2, Users, Network, Calendar } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              Tell Me More
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto">
              An immersive game about people, place & cross-pollination.
            </p>
          </div>
        </section>

        {/* Game Explanation */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                A Game You Say?
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                An Immersive Community Experience
              </h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
              <div>
                <p className="text-lg text-muted-foreground mb-6">
                  During these 10 days, we'll be engaging in an immersive game. Rather than an escape 
                  from day-to-day life, this game invites you to lean deeper into it and try on new mindsets.
                </p>
                <p className="text-lg text-muted-foreground mb-6">
                  As we go about our days, we will notice, celebrate, and create the nodes & threads of 
                  connection that weave our community more tightly and resiliently together.
                </p>
                <p className="text-lg text-muted-foreground">
                  Take the spider's web as a metaphor for our community. We have many strong threads—anchored 
                  by gifted community activators—radiating outward into various aspects of life: food, movement, 
                  government, social justice. This game is focused on weaving across our normal patterns to 
                  create a denser and more supportive community web.
                </p>
              </div>
              <div className="relative">
                <Card className="shadow-warm">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-community rounded-full flex items-center justify-center mb-4">
                      <Gamepad2 className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Choose Your Own Path
                    </h3>
                    <p className="text-muted-foreground">
                      You are invited to engage in however much or little of the game's 
                      offerings throughout this period.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="shadow-warm overflow-hidden">
              <CardContent className="p-8 lg:p-12">
                <h3 className="text-2xl font-bold text-foreground mb-6">Game Structure</h3>
                <p className="text-lg text-muted-foreground mb-8">
                  The structure of the 10-day container will include a Kick-off gathering, 2 convergence 
                  gatherings where we all come together to share and see what's been happening, and a closing 
                  party. In between, there will be a myriad of pre-planned and emergent events, encouraged 
                  collaboration time, and interactive gameplay that pervades all aspects of day-to-day life.
                </p>
                <div className="text-center">
                  <Button variant="nature" size="lg">
                    <Calendar className="mr-2 h-5 w-5" />
                    View the Calendar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Origins Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-nature-primary/20 text-nature-primary border-nature-primary/30">
                Where is this coming from?
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                An Emergence from Heartful Friends
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-community-yellow/20 rounded-full flex items-center justify-center mb-4">
                    <Network className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Woven Web
                  </h3>
                  <p className="text-muted-foreground">
                    [CO]here is an emergence sprouting from a few heartful friends. 
                    Some of them are part of Woven web, a local org exploring how to 
                    encourage interconnectivity across Boulder.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-nature-primary/20 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Our Wider Web
                  </h3>
                  <p className="text-muted-foreground">
                    [CO]here is part of a wider emergence, drawing inspiration from 
                    the ecoversities alliance, Decolonial Futures, ten (the emergence network), 
                    Second Renaissance, EcoGather, and Regenerate Cascadia.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-warm">
              <CardContent className="p-8 lg:p-12 text-center">
                <h3 className="text-2xl font-bold text-foreground mb-6">
                  Why now?
                </h3>
                <p className="text-xl text-muted-foreground italic mb-6">
                  "Times are urgent we must slow down."
                </p>
                <p className="text-lg text-muted-foreground mb-8">
                  This 'game' is meant to get to the heart of the resilience work we need to be doing — 
                  deepening into relationships and using our collective imagination to enact life in a way 
                  that works for all life.
                </p>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-foreground mb-4">
                    Is this really meant to be silly AND serious?
                  </h4>
                  <p className="text-muted-foreground">
                    Gratitude. Grief. Glee. Giggles. Have you ever felt all of these at the same time? 
                    We have. They are all appropriate responses to being alive; here, now. We want the 
                    full spectrum of emotions to feel welcome.
                  </p>
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

export default About;