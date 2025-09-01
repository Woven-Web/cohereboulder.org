import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, ExternalLink, Users } from "lucide-react";

const Calendar = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              [CO]here Calendar of Events
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto">
              Stay connected with community events and co-creation opportunities.
            </p>
          </div>
        </section>

        {/* Calendar Integration */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                Stay Connected
              </Badge>
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-6">
                Add Our Calendar
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Never miss a [CO]here event by syncing our calendar with your preferred platform.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-16">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-community-yellow/20 rounded-full flex items-center justify-center mb-6">
                    <CalendarIcon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Google Calendar
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Add this Calendar on Google Calendar to stay up to date with all [CO]here events.
                  </p>
                  <Button variant="outline" size="lg" className="w-full">
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Add to Google Calendar
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6">
                    <CalendarIcon className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    iCal/Outlook
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Download the iCal file to sync with Apple Calendar, Outlook, or other calendar apps.
                  </p>
                  <Button variant="nature" size="lg" className="w-full">
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Download iCal File
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Calendar Display Area */}
            <Card className="shadow-warm">
              <CardContent className="p-8 lg:p-12">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-foreground mb-6">
                    September 2025
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-8 mb-8">
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                        <div key={i} className="text-center font-medium text-muted-foreground p-2">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {Array.from({ length: 30 }, (_, i) => (
                        <div key={i} className="aspect-square flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded cursor-pointer">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" size="lg">
                    Print Calendar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* External Resources */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-nature-primary/20 text-nature-primary border-nature-primary/30">
                Want More?
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Existing Community Calendars
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                Some of our favorite ways to find out about community events and volunteer opportunities are:
              </p>
              <p className="text-lg text-muted-foreground">
                We truly are here to AMPLIFY the already-rooted, beautiful opportunities across Boulder.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-earth-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-8 w-8 text-earth-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Boulder.Earth
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Environmental events and sustainability initiatives throughout Boulder.
                  </p>
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Visit Boulder.Earth
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-community-yellow/20 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Cool Boulder
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Community events and volunteer opportunities from Cool Boulder partners.
                  </p>
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Visit Cool Boulder
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Boulder Poetry Scene
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Literary events, poetry readings, and creative gatherings.
                  </p>
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Visit Poetry Scene
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-warm">
              <CardContent className="p-8 text-center">
                <h3 className="text-2xl font-bold text-foreground mb-4">
                  More resources coming soon!
                </h3>
                <p className="text-lg text-muted-foreground">
                  We'll be adding a lot more resources in the coming weeks. Check back 🙂
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Calendar;