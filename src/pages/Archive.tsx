import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Users, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Archive = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-earth-light to-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-6">
                COhere Archive
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Explore the history and evolution of COhere Boulder. Each cycle builds upon the last,
                weaving an ever-stronger community web.
              </p>
            </div>
          </div>
        </section>

        {/* Archive Grid */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">

              {/* 2024 Card */}
              <Card className="hover:shadow-warm transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">Inaugural Year</span>
                  </div>
                  <CardTitle>COhere 2024</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>October 10-20, 2024</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>300+ participants</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>50+ events across Boulder</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Our first 10-day immersive experience. A game about people, place,
                    and cross-pollination that brought Boulder together in unprecedented ways.
                  </p>
                  <Link to="/archive/2024">
                    <Button variant="outline" className="w-full">
                      Explore 2024
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* 2025 Preview Card */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-earth-light/10 to-background">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="text-sm font-semibold text-primary">Current Cycle</span>
                  </div>
                  <CardTitle>COhere 2025</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>September 24 - October 26, 2025</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>Registration opening soon</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>Boulder & beyond</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Building on our learnings, COhere evolves into an ongoing rhythm:
                    Invitation, Invocation, Integration.
                  </p>
                  <Link to="/invitation-2025">
                    <Button variant="community" className="w-full">
                      Join COhere 2025
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Future Placeholder */}
              <Card className="opacity-50">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Future</span>
                  </div>
                  <CardTitle className="text-muted-foreground">COhere 2026+</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Dates TBD</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Growing community</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>Expanding reach</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    The journey continues. Each cycle deepens our connections and
                    expands our collective capacity.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center mb-12">The Evolution of COhere</h2>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                  <div className="w-0.5 h-24 bg-primary/20"></div>
                </div>
                <div className="flex-1 pb-8">
                  <h3 className="font-semibold mb-2">2024: The Beginning</h3>
                  <p className="text-muted-foreground">
                    COhere launched as a 10-day immersive game, bringing together diverse
                    communities across Boulder to weave stronger connections.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 bg-primary rounded-full"></div>
                  <div className="w-0.5 h-24 bg-primary/20"></div>
                </div>
                <div className="flex-1 pb-8">
                  <h3 className="font-semibold mb-2">2025: Evolution to Process</h3>
                  <p className="text-muted-foreground">
                    Learning from our first cycle, COhere evolves into an ongoing community
                    weaving process with three distinct phases: Invitation, Invocation, Integration.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 bg-primary/30 rounded-full"></div>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2 text-muted-foreground">Future: Expanding Rhythms</h3>
                  <p className="text-muted-foreground/80">
                    COhere continues to adapt, potentially moving to quarterly or bi-yearly cycles,
                    spreading the blueprint to other communities.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">Be Part of the Story</h2>
            <p className="text-xl text-muted-foreground mb-8">
              COhere is an ongoing journey of community weaving. Each cycle builds on the last,
              creating an ever-stronger foundation for Boulder's regenerative future.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/invitation-2025">
                <Button size="lg" variant="community">
                  Join COhere 2025
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                Subscribe to Updates
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Archive;
