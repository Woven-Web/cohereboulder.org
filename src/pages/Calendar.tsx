import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Users, 
  Clock,
  ArrowRight,
  Plus,
  Filter
} from "lucide-react";

const Calendar = () => {
  const upcomingEvents = [
    {
      id: 1,
      title: "Regenerative Community Potluck",
      date: "September 15, 2024",
      time: "5:00 PM - 8:00 PM",
      location: "Community Gardens, Central Boulder",
      type: "Community Gathering",
      attendees: 45,
      description: "Join us for a monthly gathering where we share food, stories, and co-create the future of our regenerative ecosystem."
    },
    {
      id: 2,
      title: "Urban Farming Workshop",
      date: "September 22, 2024",
      time: "10:00 AM - 2:00 PM",
      location: "Boulder Permaculture Center",
      type: "Workshop",
      attendees: 20,
      description: "Learn sustainable growing practices and connect with fellow urban farmers in our community."
    },
    {
      id: 3,
      title: "Collaborative Art Project",
      date: "September 28, 2024",
      time: "2:00 PM - 6:00 PM",
      location: "Pearl Street Mall",
      type: "Co-Creation",
      attendees: 30,
      description: "Create a community mural that represents our shared vision for regenerative Boulder."
    },
    {
      id: 4,
      title: "Mindful Leadership Circle",
      date: "October 5, 2024",
      time: "9:00 AM - 12:00 PM",
      location: "Naropa University",
      type: "Circle",
      attendees: 15,
      description: "Explore conscious leadership practices for regenerative community building."
    },
    {
      id: 5,
      title: "Local Economy Workshop",
      date: "October 12, 2024",
      time: "6:00 PM - 8:30 PM",
      location: "Boulder Public Library",
      type: "Workshop",
      attendees: 25,
      description: "Discover how to strengthen our local economy through collaborative business models."
    }
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Community Gathering":
        return "bg-community-yellow/20 text-primary border-primary/30";
      case "Workshop":
        return "bg-nature-primary/20 text-nature-primary border-nature-primary/30";
      case "Co-Creation":
        return "bg-earth-primary/20 text-earth-primary border-earth-primary/30";
      case "Circle":
        return "bg-purple-100 text-purple-800 border-purple-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <CalendarIcon className="h-16 w-16 mx-auto text-white mb-6" />
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              Community Calendar
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto mb-8">
              Discover upcoming gatherings, workshops, and co-creation opportunities 
              in Boulder's regenerative ecosystem.
            </p>
            <Button variant="outline" size="lg" className="bg-white/20 text-white border-white/30 hover:bg-white hover:text-primary">
              <Plus className="mr-2 h-5 w-5" />
              Add Your Event
            </Button>
          </div>
        </section>

        {/* Filter Section */}
        <section className="py-8 bg-earth-light/20 border-b border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filter by:</span>
                <Button variant="outline" size="sm">All Events</Button>
                <Button variant="ghost" size="sm">Workshops</Button>
                <Button variant="ghost" size="sm">Gatherings</Button>
                <Button variant="ghost" size="sm">Co-Creation</Button>
              </div>
              <Button variant="nature" size="sm">
                Subscribe to Calendar
              </Button>
            </div>
          </div>
        </section>

        {/* Events List */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-6">
              {upcomingEvents.map((event) => (
                <Card key={event.id} className="shadow-soft hover:shadow-warm transition-all duration-300 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="lg:flex">
                      <div className="lg:w-2/3 p-6 lg:p-8">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <Badge className={getTypeColor(event.type)}>
                              {event.type}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{event.attendees} attending</span>
                          </div>
                        </div>
                        
                        <h3 className="text-2xl font-bold text-foreground mb-3">
                          {event.title}
                        </h3>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{event.date}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{event.location}</span>
                          </div>
                        </div>
                        
                        <p className="text-muted-foreground mb-6">
                          {event.description}
                        </p>
                        
                        <div className="flex space-x-3">
                          <Button variant="nature">
                            RSVP Now
                          </Button>
                          <Button variant="outline">
                            Learn More
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="lg:w-1/3 bg-gradient-subtle p-6 lg:p-8 flex items-center justify-center">
                        <div className="text-center text-white">
                          <div className="text-3xl font-bold mb-1">
                            {event.date.split(' ')[1].replace(',', '')}
                          </div>
                          <div className="text-lg font-medium opacity-90">
                            {event.date.split(' ')[0]}
                          </div>
                          <div className="text-sm opacity-75">
                            {event.date.split(' ')[2]}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Monthly View Preview */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                Monthly Overview
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                September 2024
              </h2>
              <p className="text-lg text-muted-foreground">
                Quick view of this month's regenerative community activities
              </p>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-8">
              {/* Calendar header */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="p-3 text-center font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {/* Calendar days - simplified representation */}
              {Array.from({ length: 35 }, (_, i) => {
                const dayNumber = i - 6; // Adjust for September 1st starting position
                const isCurrentMonth = dayNumber > 0 && dayNumber <= 30;
                const hasEvent = [15, 22, 28].includes(dayNumber);
                
                return (
                  <div key={i} className={`
                    p-3 text-center border border-border rounded-lg
                    ${isCurrentMonth ? 'bg-background' : 'bg-muted/30'}
                    ${hasEvent ? 'bg-community-yellow/20 border-primary' : ''}
                  `}>
                    {isCurrentMonth && (
                      <>
                        <div className={`text-sm ${hasEvent ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                          {dayNumber}
                        </div>
                        {hasEvent && (
                          <div className="w-2 h-2 bg-primary rounded-full mx-auto mt-1"></div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-center">
              <Button variant="nature" size="lg">
                View Full Calendar
              </Button>
            </div>
          </div>
        </section>

        {/* Community Submission */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <Card className="shadow-warm overflow-hidden">
              <CardContent className="p-0">
                <div className="bg-gradient-community p-8 lg:p-12">
                  <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-6">
                    <Plus className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                    Share Your Event
                  </h2>
                  <p className="text-xl text-white/90 max-w-2xl mx-auto">
                    Have a regenerative event, workshop, or gathering? 
                    Add it to our community calendar and help weave our ecosystem together.
                  </p>
                </div>
                
                <div className="p-8 lg:p-12">
                  <p className="text-lg text-muted-foreground mb-8">
                    We welcome events that align with our values of regeneration, collaboration, 
                    and community building. Share workshops, gatherings, volunteer opportunities, 
                    and co-creation sessions.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button variant="nature" size="lg">
                      Submit Event
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button variant="outline" size="lg">
                      Event Guidelines
                    </Button>
                  </div>
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

export default Calendar;