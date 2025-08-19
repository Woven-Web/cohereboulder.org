import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Users, Sprout, ArrowRight } from "lucide-react";

export const MissionSection = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-earth-light/30 to-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mission Statement */}
        <div className="text-center space-y-8 mb-16">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-muted-foreground">
              We're at a pivotal point…
            </h2>
            
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              With so much unfolding in the wider world, our local mission is to
            </p>
            
            <h3 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              <span className="text-primary">connect community</span> to create a <br />
              regenerative, resilient future.
            </h3>
            
            <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
              Together, let's celebrate the bright spots unfolding here in our community and 
              weave them together to increase our resilience, our sense of place, & our felt sense of belonging.
            </p>
          </div>
        </div>

        {/* What is COhere */}
        <div className="mb-16">
          <h3 className="text-3xl font-bold text-center text-foreground mb-12">
            [CO]here is a…
          </h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="group hover:shadow-warm transition-all duration-300 hover:scale-105">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-community rounded-full flex items-center justify-center group-hover:animate-pulse-soft">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-semibold text-foreground">Community Game</h4>
                <p className="text-muted-foreground">
                  An immersive experience that brings neighbors together through shared activities and challenges.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-warm transition-all duration-300 hover:scale-105">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-nature rounded-full flex items-center justify-center group-hover:animate-pulse-soft">
                  <Sprout className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-semibold text-foreground">Regenerative Network</h4>
                <p className="text-muted-foreground">
                  A living map of projects and people working towards a sustainable, resilient Boulder.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-warm transition-all duration-300 hover:scale-105">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-earth rounded-full flex items-center justify-center group-hover:animate-pulse-soft">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-semibold text-foreground">Cross-Pollination</h4>
                <p className="text-muted-foreground">
                  A space for ideas, resources, and relationships to flow between different parts of our community.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* What does joining look like */}
        <div className="bg-card/50 rounded-2xl p-8 lg:p-12 border border-border">
          <h3 className="text-2xl font-bold text-foreground mb-8">
            What does joining this game look like?
          </h3>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Attend events on our <a href="#calendar" className="text-primary hover:underline">co-curated calendar</a>
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Practice elements of shared gameplay throughout your daily life
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Step into a 'community activator' mindset
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Put yourself and things you care about 'on the map'
                  </span>
                </li>
              </ul>
            </div>
            
            <div className="space-y-6">
              <h4 className="text-xl font-semibold text-foreground">This is for you if…</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>• You care about community and want to meet others who do too.</li>
                <li>• You have a gift and want to offer it.</li>
                <li>• You're looking to collaborate or co-create with folks who care about our future.</li>
                <li>• You are curious what Boulder has to offer.</li>
              </ul>
              
              <Button variant="community" size="lg" className="w-full">
                Join the Community
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};