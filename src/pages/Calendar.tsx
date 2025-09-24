import { useState, useEffect } from 'react';
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

interface Event {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  category: string | null;
  is_public: boolean | null;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(2025, 9, 16)); // October 16, 2025
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(2025, 9)); // October 2025

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_public', true)
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Error fetching events:', error);
        toast.error('Failed to load events');
        return;
      }

      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Failed to load events');
    } finally {
      // setLoading(false); // Removed since loading is not used
    }
  };

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);
      return date >= eventStart && date <= eventEnd;
    });
  };

  const handleGoogleCalendar = async (eventId?: string) => {
    try {
      const url = eventId 
        ? `/functions/v1/calendar-feed?format=google&event_id=${eventId}`
        : '/functions/v1/calendar-feed?format=google';
      
      window.open(`https://pnvxrczcygrkbschkvkv.supabase.co${url}`, '_blank');
    } catch (error) {
      toast.error('Failed to open Google Calendar');
    }
  };

  const handleDownloadICal = async (eventId?: string) => {
    try {
      const url = eventId 
        ? `https://pnvxrczcygrkbschkvkv.supabase.co/functions/v1/calendar-feed?event_id=${eventId}`
        : 'https://pnvxrczcygrkbschkvkv.supabase.co/functions/v1/calendar-feed';
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `cohere-events${eventId ? `-${eventId}` : ''}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error('Failed to download calendar file');
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1);
      } else {
        newMonth.setMonth(prev.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];
  const monthEvents = events.filter(event => {
    const eventStart = new Date(event.start_date);
    return eventStart >= startOfMonth(currentMonth) && eventStart <= endOfMonth(currentMonth);
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              COhere Calendar of Events
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto">
              Stay connected with community events and co-creation opportunities throughout the COhere 2025 journey.
            </p>
          </div>
        </section>

        {/* Interactive Calendar Section */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-community-yellow/20 text-primary border-primary/30">
                October 16-26, 2025
              </Badge>
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-6">
                COhere Events Calendar
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Navigate through the months to explore all COhere events and community gatherings.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        {format(currentMonth, 'MMMM yyyy')}
                      </CardTitle>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigateMonth('prev')}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigateMonth('next')}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => setSelectedDate(date)}
                      month={currentMonth}
                      onMonthChange={setCurrentMonth}
                      className="pointer-events-auto"
                      modifiers={{
                        hasEvent: (date) => getEventsForDate(date).length > 0,
                      }}
                      modifiersStyles={{
                        hasEvent: {
                          backgroundColor: 'hsl(var(--primary))',
                          color: 'hsl(var(--primary-foreground))',
                          fontWeight: 'bold',
                        },
                      }}
                    />
                    
                    {monthEvents.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h4 className="font-medium text-sm">Events this month:</h4>
                        <div className="space-y-2">
                          {monthEvents.map((event) => (
                            <div key={event.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                              <div>
                                <div className="font-medium text-sm">{event.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(event.start_date), 'MMM dd, yyyy h:mm a')}
                                </div>
                              </div>
                              <Badge variant={event.category === 'cohere' ? 'default' : 'secondary'}>
                                {event.category}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Add to Your Calendar</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Stay updated with all COhere events by adding our calendar to your preferred calendar app:
                      </p>
                      
                      <div className="space-y-2">
                        <Button 
                          onClick={() => handleGoogleCalendar()}
                          className="w-full justify-start"
                          variant="outline"
                          disabled={events.length === 0}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Add to Google Calendar
                        </Button>
                        
                        <Button 
                          onClick={() => handleDownloadICal()}
                          className="w-full justify-start"
                          variant="outline"
                          disabled={events.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download iCal File
                        </Button>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        The downloaded calendar file can be imported into most calendar applications including Outlook, Apple Calendar, and others.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {selectedDate && selectedDateEvents.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Events on {format(selectedDate, 'MMMM dd, yyyy')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDateEvents.map((event) => (
                        <div key={event.id} className="space-y-2 p-3 bg-muted rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h4 className="font-medium text-sm">{event.title}</h4>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.start_date), 'h:mm a')} - {format(new Date(event.end_date), 'h:mm a')}
                              </p>
                              {event.location && (
                                <p className="text-xs text-muted-foreground">{event.location}</p>
                              )}
                              {event.description && (
                                <p className="text-xs">{event.description}</p>
                              )}
                            </div>
                            <Badge variant={event.category === 'cohere' ? 'default' : 'secondary'}>
                              {event.category}
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => handleGoogleCalendar(event.id)}
                              className="text-xs"
                            >
                              <ExternalLink className="mr-1 h-3 w-3" />
                              Google
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadICal(event.id)}
                              className="text-xs"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              iCal
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* External Resources */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-nature-primary/20 text-nature-primary border-nature-primary/30">
                Community Resources
              </Badge>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
                Boulder Community Calendars
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                Discover other events happening in the Boulder community. These calendars complement the COhere journey.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-earth-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Calendar className="h-8 w-8 text-earth-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Boulder.Earth
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Environmental and sustainability events in Boulder
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open("http://boulder.earth/calendar/", "_blank")
                    }
                  >
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Visit Calendar
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-community-yellow/20 rounded-full flex items-center justify-center mb-6">
                    <Calendar className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Cool Boulder
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Community partners and local events throughout Boulder
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        "https://www.coolboulder.org/cool-boulder-partners-events",
                        "_blank",
                      )
                    }
                  >
                    <ExternalLink className="mr-2 h-5 w-5" />
                    View Events
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-soft hover:shadow-warm transition-all duration-300">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-nature-primary/20 rounded-full flex items-center justify-center mb-6">
                    <Calendar className="h-8 w-8 text-nature-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-4">
                    Boulder Poetry Scene
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Poetry readings, workshops, and literary events
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        "https://boulderpoetryscene.com/calendar/",
                        "_blank",
                      )
                    }
                  >
                    <ExternalLink className="mr-2 h-5 w-5" />
                    Explore Poetry
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}