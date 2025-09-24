import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  ExternalLink,
  Download,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  category: string | null;
  is_public: boolean | null;
  registration_url?: string | null;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_public", true)
        .order("start_date", { ascending: true });

      if (error) {
        toast.error("Failed to load events");
        return;
      }

      setEvents(data || []);
    } catch (error) {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const start = startOfWeek(startOfMonth(date));
    const end = endOfWeek(endOfMonth(date));
    return eachDayOfInterval({ start, end });
  };

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);
      const eventStartDay = new Date(
        eventStart.getFullYear(),
        eventStart.getMonth(),
        eventStart.getDate(),
      );
      const eventEndDay = new Date(
        eventEnd.getFullYear(),
        eventEnd.getMonth(),
        eventEnd.getDate(),
      );
      const checkDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );

      return checkDay >= eventStartDay && checkDay <= eventEndDay;
    });
  };

  const getUpcomingEvents = () => {
    const now = new Date();
    return events
      .filter((event) => new Date(event.start_date) > now)
      .sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
  };

  const handleGoogleCalendar = (eventId: string) => {
    if (!eventId) {
      toast.error("Please select an event to add to Google Calendar");
      return;
    }

    try {
      // Find the event
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        toast.error("Event not found");
        return;
      }

      // Format dates for Google Calendar
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);

      const formatGoogleDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
      };

      // Build Google Calendar URL
      const googleUrl = new URL("https://calendar.google.com/calendar/render");
      googleUrl.searchParams.set("action", "TEMPLATE");
      googleUrl.searchParams.set("text", event.title);
      googleUrl.searchParams.set(
        "dates",
        `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
      );

      if (event.description) {
        googleUrl.searchParams.set("details", event.description);
      }
      if (event.location) {
        googleUrl.searchParams.set("location", event.location);
      }

      // Open Google Calendar in new tab
      window.open(googleUrl.toString(), "_blank");
      toast.success("Opening Google Calendar");
    } catch (error) {
      console.error("Google Calendar error:", error);
      toast.error("Failed to add to Google Calendar");
    }
  };

  const handleDownloadICal = async (eventId: string) => {
    if (!eventId) {
      toast.error("Please select an event to download");
      return;
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const url = `${supabaseUrl}/functions/v1/calendar-feed?event_id=${eventId}`;

      // Fetch the iCal data with authentication
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch calendar data");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      // Find the event to use its title in the filename
      const event = events.find((e) => e.id === eventId);
      const filename = event
        ? `${event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`
        : `event-${eventId}.ics`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL
      window.URL.revokeObjectURL(downloadUrl);

      toast.success("Event added to calendar");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download calendar event");
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + (direction === "prev" ? -1 : 1));
      return newMonth;
    });
  };

  const monthDays = getDaysInMonth(currentMonth);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Community Calendar
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join us for events and gatherings throughout Boulder's
              regenerative journey.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xl font-semibold">
                    {format(currentMonth, "MMMM yyyy")}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => navigateMonth("prev")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentMonth(new Date())}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => navigateMonth("next")}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-muted-foreground">
                        Loading events...
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                        {/* Week days header */}
                        {weekDays.map((day) => (
                          <div
                            key={day}
                            className="bg-muted p-2 text-center text-sm font-medium"
                          >
                            {day}
                          </div>
                        ))}

                        {/* Calendar days */}
                        {monthDays.map((day, idx) => {
                          const dayEvents = getEventsForDate(day);
                          const isCurrentMonth = isSameMonth(day, currentMonth);
                          const isSelected =
                            selectedDate && isSameDay(day, selectedDate);
                          const isToday = isSameDay(day, new Date());

                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedDate(day)}
                              className={cn(
                                "relative min-h-[80px] p-2 text-left bg-background hover:bg-accent transition-colors",
                                !isCurrentMonth &&
                                  "text-muted-foreground bg-muted/30",
                                isSelected && "ring-2 ring-primary",
                                isToday && "bg-primary/5",
                              )}
                            >
                              <div
                                className={cn(
                                  "text-sm",
                                  isToday && "font-bold text-primary",
                                )}
                              >
                                {format(day, "d")}
                              </div>

                              {/* Event indicators */}
                              {dayEvents.length > 0 && (
                                <div className="mt-1 space-y-1">
                                  {dayEvents.slice(0, 2).map((event, i) => (
                                    <div
                                      key={i}
                                      className="text-xs truncate px-1 rounded bg-primary/10 text-primary"
                                    >
                                      {event.title}
                                    </div>
                                  ))}
                                  {dayEvents.length > 2 && (
                                    <div className="text-xs text-muted-foreground px-1">
                                      +{dayEvents.length - 2} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Selected Date Events */}
              {selectedDate && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {format(selectedDate, "MMMM d, yyyy")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {getEventsForDate(selectedDate).length > 0 ? (
                      <div className="space-y-4">
                        {getEventsForDate(selectedDate).map((event) => (
                          <div
                            key={event.id}
                            className="space-y-2 pb-4 border-b last:border-0"
                          >
                            <h4 className="font-semibold text-sm">
                              {event.title}
                            </h4>

                            <div className="space-y-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {format(new Date(event.start_date), "h:mm a")}{" "}
                                  -{format(new Date(event.end_date), " h:mm a")}
                                </span>
                              </div>

                              {event.location && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  <span>{event.location}</span>
                                </div>
                              )}
                            </div>

                            {event.description && (
                              <p className="text-sm text-muted-foreground">
                                {event.description}
                              </p>
                            )}

                            <div className="flex gap-2 pt-2">
                              {event.registration_url && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    window.open(
                                      event.registration_url,
                                      "_blank",
                                    )
                                  }
                                  className="flex-1"
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Register
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGoogleCalendar(event.id)}
                                className="flex-1"
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                Google
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadICal(event.id)}
                                className="flex-1"
                              >
                                <Download className="mr-1 h-3 w-3" />
                                iCal
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No events scheduled for this day.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Upcoming Events */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Upcoming Events
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Click on any event to add it to your calendar.
                  </p>

                  {getUpcomingEvents().length > 0 ? (
                    <div className="space-y-2">
                      {getUpcomingEvents()
                        .slice(0, 5)
                        .map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                            onClick={() =>
                              setSelectedDate(new Date(event.start_date))
                            }
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {event.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.start_date), "MMM d")}
                                {event.registration_url && " • Register"}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No upcoming events scheduled.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
