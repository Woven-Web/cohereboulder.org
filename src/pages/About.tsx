import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Heart, Lightbulb, Target } from "lucide-react";

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
              Discover the story behind [CO]here and how we're weaving together 
              Boulder's regenerative community ecosystem.
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="mb-4 bg-earth-light/20 text-primary border-primary/30">
                  Our Story
                </Badge>
                <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                  Born from Community Connection
                </h2>
                <div className="space-y-6 text-lg text-muted-foreground">
                  <p>
                    [CO]here emerged from a simple realization: Boulder is home to incredible 
                    regenerative initiatives, but they often work in isolation. We saw the need 
                    for a platform that could weave these diverse threads together.
                  </p>
                  <p>
                    What started as conversations between passionate changemakers has grown into 
                    a movement that celebrates collaboration over competition, connection over isolation.
                  </p>
                  <p>
                    We believe that when regenerative communities unite, they create something 
                    far greater than the sum of their parts - a thriving ecosystem where 
                    everyone can flourish.
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-subtle rounded-xl transform rotate-3"></div>
                <Card className="relative shadow-warm">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-community rounded-full flex items-center justify-center mb-4">
                      <Heart className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Community-Driven
                    </h3>
                    <p className="text-muted-foreground">
                      Every aspect of [CO]here is shaped by the voices and needs of 
                      our regenerative community members.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Impact Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                Our Impact
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Connecting Communities
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                See how [CO]here is fostering collaboration and growth across Boulder's 
                regenerative ecosystem.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <Card className="text-center shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-4">50+</h3>
                  <p className="text-muted-foreground mb-2 font-medium">Organizations Connected</p>
                  <p className="text-sm text-muted-foreground">
                    From urban farms to wellness centers, we're building bridges 
                    across diverse regenerative initiatives.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 mx-auto bg-community-yellow/20 rounded-full flex items-center justify-center mb-6">
                    <Lightbulb className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-4">25+</h3>
                  <p className="text-muted-foreground mb-2 font-medium">Collaborative Projects</p>
                  <p className="text-sm text-muted-foreground">
                    New partnerships and initiatives sparked through 
                    [CO]here connections and gatherings.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 mx-auto bg-earth-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Target className="h-8 w-8 text-earth-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-4">100%</h3>
                  <p className="text-muted-foreground mb-2 font-medium">Community-Funded</p>
                  <p className="text-sm text-muted-foreground">
                    Supported entirely by our community members who 
                    believe in the power of connection.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Values Deep Dive */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-nature-primary/20 text-nature-primary border-nature-primary/30">
                Our Approach
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                How We Create Change
              </h2>
            </div>

            <div className="space-y-12">
              <Card className="shadow-warm overflow-hidden">
                <CardContent className="p-0">
                  <div className="lg:flex">
                    <div className="lg:w-2/3 p-8 lg:p-12">
                      <h3 className="text-2xl font-bold text-foreground mb-4">
                        Regenerative by Design
                      </h3>
                      <p className="text-lg text-muted-foreground mb-6">
                        We don't just connect existing initiatives - we actively design 
                        our platform and gatherings to regenerate the social fabric of our community.
                      </p>
                      <ul className="space-y-3 text-muted-foreground">
                        <li className="flex items-start space-x-3">
                          <div className="w-2 h-2 rounded-full bg-nature-primary mt-2 flex-shrink-0"></div>
                          <span>Prioritizing relationships over transactions</span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <div className="w-2 h-2 rounded-full bg-nature-primary mt-2 flex-shrink-0"></div>
                          <span>Creating spaces for authentic vulnerability and growth</span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <div className="w-2 h-2 rounded-full bg-nature-primary mt-2 flex-shrink-0"></div>
                          <span>Fostering abundance mindset over scarcity thinking</span>
                        </li>
                      </ul>
                    </div>
                    <div className="lg:w-1/3 bg-gradient-subtle p-8 lg:p-12 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
                          <Heart className="h-10 w-10 text-white" />
                        </div>
                        <p className="text-white font-medium">
                          Connection First
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;