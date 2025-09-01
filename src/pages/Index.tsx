import { Navigation } from "@/components/Navigation";
import { HeroSection } from "@/components/HeroSection";
import { EcosystemMap } from "@/components/EcosystemMap";
import { MissionSection } from "@/components/MissionSection";
import { ValuesSection } from "@/components/ValuesSection";
import { SupportSection } from "@/components/SupportSection";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Calendar, MapPin } from "lucide-react";
import ecosystemMapImage from "@/assets/ecosystem-map.jpg";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <HeroSection />
        
        {/* Regenerative Map Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <img
                src={ecosystemMapImage}
                alt="Boulder's Regenerative Community Map"
                className="w-full max-w-4xl mx-auto rounded-2xl shadow-warm mb-8"
              />
              <div className="space-y-6">
                <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                  Together with <a href="https://climatique.earth/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Climatique</a>, we created this map to demonstrate the rich tapestry of projects and groups working towards regenerative change in our community.
                </p>
                <p className="text-muted-foreground max-w-3xl mx-auto">
                  It is only a taste — some of the most visible and approachable 'nodes' in our ecosystem. We encourage you to use this to start exploring, but know that there's much more to discover.
                </p>
                <Button variant="community" size="lg">
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Want to chat? Join our Telegram Community
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Newsletter Section */}
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
              
              <Button variant="outline" size="lg" className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary">
                <ArrowRight className="mr-2 h-5 w-5" />
                Get the COhere newsletter for a curation of weekly events
              </Button>
            </div>
          </div>
        </section>
        
        <MissionSection />
        
        {/* Timeline Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">
              A taste of the timeline…
            </h2>
            <div className="bg-muted/30 rounded-2xl p-8 mb-8">
              <div className="text-muted-foreground">
                <p className="italic text-lg">Timeline visualization coming soon...</p>
                <p className="text-sm mt-4">
                  A visual representation of our 10-day immersive experience
                </p>
              </div>
            </div>
            <Button variant="outline" size="lg">
              Read more about the structure of the 10 days
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>
        
        <ValuesSection />
        
        {/* Maps Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Which parts of the Boulder web excite you?
              </h2>
              <p className="text-xl text-muted-foreground italic mb-8">
                What have you not discovered yet?
              </p>
              <p className="text-lg text-muted-foreground mb-8">
                To encourage more interplay across parts of the Boulder community we're making maps that bring visibility to our web.
              </p>
              <Button variant="nature" size="lg" className="mb-8">
                <ExternalLink className="mr-2 h-5 w-5" />
                See the 'Map in Progress'
              </Button>
            </div>
            
            <Card className="shadow-warm">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-semibold text-foreground mb-6">
                  Many of the events will amplify and uplift these and other projects happening in our area.
                </h3>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button variant="community" size="lg">
                    <Calendar className="mr-2 h-5 w-5" />
                    Check out the calendar here
                  </Button>
                  <Button variant="outline" size="lg">
                    <ArrowRight className="mr-2 h-5 w-5" />
                    Register for the full event here
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
        
        <SupportSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
