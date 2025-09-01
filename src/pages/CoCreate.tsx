import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ExternalLink, Mail, Calendar, MessageSquare } from "lucide-react";
import honeycombImg from "@/assets/honeycomb-lattice.jpg";

const CoCreate = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section with Image */}
        <section className="relative">
          <div className="relative h-96 lg:h-[500px] overflow-hidden">
            <img 
              src={honeycombImg} 
              alt="Honeycomb lattice pattern" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <h1 className="text-4xl lg:text-6xl font-bold text-white text-center px-4">
                CO-Create with us
              </h1>
            </div>
          </div>
        </section>

        {/* Have something to share */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">
              Have something to share?
            </h2>
            
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
              <p className="text-xl font-semibold">
                [CO]here is designed to be co-created.
              </p>
              
              <h3 className="text-2xl font-bold text-foreground italic">
                What gifts do you want to weave into community?
              </h3>
              
              <div>
                <h4 className="text-xl font-semibold text-foreground mb-4">
                  How to Host an Event:
                </h4>
                <ol className="space-y-3 list-decimal list-inside">
                  <li>
                    If you are cross-posting an event or have a clear sense of what you want to host, fill out{" "}
                    <a 
                      href="https://docs.google.com/forms/d/e/1FAIpQLSdOXu197SdnvN1oHg6PNTlE65QHWxsNigfz8BeC1PWPeuKK-A/viewform"
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      this form
                    </a>
                    .
                  </li>
                  <li>
                    If you want to discuss what/where/how to host get in touch: Cohere@wovenweb.org
                  </li>
                  <li>
                    We have an array of venues you can host at & will be happy to support you in bringing your vision to life.
                  </li>
                </ol>
              </div>
              
              <p>
                <strong>We're also inviting artists, storytellers, healers, jesters, & musicians to weave in. Drop us a line ~ Cohere@wovenweb.org</strong>
              </p>
              
              <p>
                If you want more context, read the full CO-creation guide{" "}
                <a 
                  href="https://docs.google.com/document/d/1XVoeSy-H8-0G-kjizJse3jx6ftIkm9RLr4UaDFUfWfU/edit"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  here
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Community Dinner and Lightning Talks */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-foreground mb-8">
              Love hosting in your home? Have a community-oriented or regenerative project?
            </h2>
            
            <div className="space-y-8">
              <div>
                <p className="text-lg text-muted-foreground mb-6">
                  We're looking for people open to hosting a Community Dinner.
                </p>
                <Button asChild className="mb-6">
                  <a 
                    href="https://forms.gle/WDxDNyEEd8k5TzBf9"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center"
                  >
                    Host a Community Dinner
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
              
              <div>
                <p className="text-lg text-muted-foreground mb-6">
                  We will have opportunities throughout the event to give a 6-10 minute Lightning Talk.
                </p>
                <Button asChild variant="outline">
                  <a 
                    href="https://forms.gle/ZzWM5tTyrowRugtB7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center"
                  >
                    Apply to Give a Talk
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Event Calendar Preview */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-card/50 rounded-2xl p-8 lg:p-12 border border-border">
              <div className="grid gap-8">
                {/* Event 1 */}
                <div className="flex items-start space-x-6 p-6 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-muted-foreground">OCT</div>
                    <div className="text-3xl font-bold text-foreground">1</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground mb-2">Kickoff Party!</h3>
                    <p className="text-muted-foreground mb-1">The Riverside</p>
                    <p className="text-muted-foreground mb-1">5pm-10pm</p>
                    <p className="text-sm text-primary">[Dinner included!]</p>
                  </div>
                </div>

                {/* Event 2 */}
                <div className="flex items-start space-x-6 p-6 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-muted-foreground">OCT</div>
                    <div className="text-3xl font-bold text-foreground">4</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground mb-2">Regenerative Systems + Dinner & Dialogue</h3>
                    <p className="text-muted-foreground mb-1">Junkyard Social Club</p>
                    <p className="text-muted-foreground">6:30pm-8:30pm</p>
                  </div>
                </div>

                {/* Event 3 */}
                <div className="flex items-start space-x-6 p-6 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-muted-foreground">OCT</div>
                    <div className="text-3xl font-bold text-foreground">5</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground mb-2">The <strong>Big Dream</strong> Workshop & Ecstatic Dance</h3>
                    <p className="text-muted-foreground mb-1">Junkyard Social Club</p>
                    <p className="text-muted-foreground">5pm-8:30pm</p>
                  </div>
                </div>

                {/* Event 4 */}
                <div className="flex items-start space-x-6 p-6 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-muted-foreground">OCT</div>
                    <div className="text-3xl font-bold text-foreground">16</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground mb-2">Springfed Community Potluck</h3>
                    <p className="text-muted-foreground mb-1">Hawks Nest House</p>
                    <p className="text-muted-foreground">6pm-10pm</p>
                  </div>
                </div>

                {/* Event 5 */}
                <div className="flex items-start space-x-6 p-6 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-muted-foreground">OCT</div>
                    <div className="text-3xl font-bold text-foreground">20</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground mb-2">Closing Party</h3>
                    <p className="text-muted-foreground mb-1">The Riverside</p>
                    <p className="text-muted-foreground">TBD</p>
                  </div>
                </div>
              </div>
              
              <div className="text-center mt-8">
                <Button asChild variant="outline" size="lg">
                  <a href="/calendar" className="inline-flex items-center">
                    <Calendar className="mr-2 h-5 w-5" />
                    View Full Calendar
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
              Ready to Co-Create?
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              Get in touch to discuss hosting, sharing your gifts, or joining our community of regenerative creators.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                variant="outline" 
                size="lg" 
                className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary"
              >
                <a 
                  href="mailto:Cohere@wovenweb.org"
                  className="inline-flex items-center"
                >
                  <Mail className="mr-2 h-5 w-5" />
                  Contact Us
                </a>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg" 
                className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary"
              >
                <a 
                  href="https://docs.google.com/forms/d/e/1FAIpQLSdOXu197SdnvN1oHg6PNTlE65QHWxsNigfz8BeC1PWPeuKK-A/viewform"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center"
                >
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Host an Event
                </a>
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