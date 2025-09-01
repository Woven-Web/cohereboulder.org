import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Lightbulb, 
  Users, 
  Handshake, 
  ArrowRight, 
  Mail, 
  MessageCircle,
  Calendar,
  MapPin 
} from "lucide-react";

const CoCreate = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              What does joining this game look like?
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto mb-8">
              Step into a 'community activator' mindset and help weave Boulder's 
              regenerative community web more tightly together.
            </p>
            <Button variant="outline" size="lg" className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary">
              Join the Game
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>

        {/* Ways to Participate */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                Get Involved
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                How to Participate
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                There are multiple ways to engage with [CO]here throughout the 10 days. 
                Choose what resonates with your energy and availability.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300 group">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Calendar className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">Attend Events</h3>
                  <p className="text-muted-foreground">
                    Join events on our co-curated calendar throughout the 10 days.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300 group">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-community-yellow/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Lightbulb className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">Practice Gameplay</h3>
                  <p className="text-muted-foreground">
                    Practice elements of shared gameplay throughout your daily life.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300 group">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-earth-primary/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Users className="h-8 w-8 text-earth-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">Community Activator</h3>
                  <p className="text-muted-foreground">
                    Step into a 'community activator' mindset and help connect others.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300 group">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <MapPin className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">Get On the Map</h3>
                  <p className="text-muted-foreground">
                    Put yourself and things you care about 'on the map' for others to discover.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* This is for you if */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                Is This For You?
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                This is for you if...
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-2 h-2 rounded-full bg-nature-primary mt-3 flex-shrink-0"></div>
                    <p className="text-lg text-muted-foreground">
                      You care about community and want to meet others who do too.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-2 h-2 rounded-full bg-primary mt-3 flex-shrink-0"></div>
                    <p className="text-lg text-muted-foreground">
                      You have a gift and want to offer it.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-2 h-2 rounded-full bg-earth-primary mt-3 flex-shrink-0"></div>
                    <p className="text-lg text-muted-foreground">
                      You're looking to collaborate or co-create with folks who care about our future.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-2 h-2 rounded-full bg-community-yellow mt-3 flex-shrink-0"></div>
                    <p className="text-lg text-muted-foreground">
                      You are curious what Boulder has to offer.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-nature-primary/20 text-nature-primary border-nature-primary/30">
                Connect With Us
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Let's Start a Conversation
              </h2>
              <p className="text-lg text-muted-foreground">
                Ready to co-create? Share your vision and let's explore how we can 
                weave it into Boulder's regenerative ecosystem.
              </p>
            </div>

            <Card className="shadow-warm">
              <CardContent className="p-8 lg:p-12">
                <form className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Full Name
                      </label>
                      <Input placeholder="Your name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Email
                      </label>
                      <Input type="email" placeholder="your@email.com" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Organization (Optional)
                    </label>
                    <Input placeholder="Your organization or project" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      How would you like to co-create?
                    </label>
                    <Textarea 
                      placeholder="Tell us about your ideas, resources, or how you'd like to contribute to our regenerative ecosystem..."
                      className="min-h-32"
                    />
                  </div>

                  <Button variant="nature" size="lg" className="w-full">
                    <Mail className="mr-2 h-5 w-5" />
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Community Channels */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Join Our Community Channels
              </h2>
              <p className="text-lg text-muted-foreground">
                Stay connected and engaged with our ongoing co-creation activities.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-community-yellow/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground mb-2">
                        Community Slack
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Join daily conversations, share resources, and collaborate 
                        on projects with fellow regenerative leaders.
                      </p>
                      <Button variant="outline" size="sm">
                        Join Slack
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-nature-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-6 w-6 text-nature-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground mb-2">
                        Monthly Gatherings
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Attend our monthly co-creation sessions where we plan 
                        initiatives and celebrate community wins together.
                      </p>
                      <Button variant="nature" size="sm">
                        View Calendar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-6">
              <MapPin className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
              Ready to Begin?
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              The regenerative future of Boulder starts with each connection we make. 
              Let's co-create something beautiful together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" size="lg" className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary">
                Schedule Call
              </Button>
              <Button variant="outline" size="lg" className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary">
                View Projects
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CoCreate;