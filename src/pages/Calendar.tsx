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

  const handleGoogleCalendar = async (eventId?: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = eventId
      ? `/functions/v1/calendar-feed?format=google&event_id=${eventId}`
      : "/functions/v1/calendar-feed?format=google";

    window.open(`${supabaseUrl}${url}`, "_blank");
  };

  const handleDownloadICal = async (eventId?: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = eventId
      ? `${supabaseUrl}/functions/v1/calendar-feed?event_id=${eventId}`
      : `${supabaseUrl}/functions/v1/calendar-feed`;

    const link = document.createElement("a");
    link.href = url;
    link.download = `cohere-events${eventId ? `-${eventId}` : ""}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                                      className={cn(
                                        "text-xs truncate px-1 rounded",
                                        event.category === "cohere"
                                          ? "bg-orange-100 text-orange-700"
                                          : event.category === "workshop"
                                            ? "bg-blue-100 text-blue-700"
                                            : event.category === "community"
                                              ? "bg-green-100 text-green-700"
                                              : "bg-gray-100 text-gray-700",
                                      )}
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
                            <div className="flex items-start justify-between">
                              <h4 className="font-semibold text-sm">
                                {event.title}
                              </h4>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-xs",
                                  event.category === "cohere" &&
                                    "bg-orange-100 text-orange-700",
                                  event.category === "workshop" &&
                                    "bg-blue-100 text-blue-700",
                                  event.category === "community" &&
                                    "bg-green-100 text-green-700",
                                )}
                              >
                                {event.category}
                              </Badge>
                            </div>

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

              {/* Calendar Sync */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Sync Calendar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Add all COhere events to your calendar:
                  </p>

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
                </CardContent>
              </Card>

              {/* Upcoming Events */}
              {events.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Upcoming Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {events
                        .filter(
                          (event) => new Date(event.start_date) >= new Date(),
                        )
                        .slice(0, 3)
                        .map((event) => (
                          <div
                            key={event.id}
                            className="flex items-start gap-3"
                          >
                            <div className="text-xs text-muted-foreground pt-1">
                              <div className="font-semibold">
                                {format(new Date(event.start_date), "MMM")}
                              </div>
                              <div className="text-lg leading-none">
                                {format(new Date(event.start_date), "d")}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {event.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.start_date), "h:mm a")}
                              </p>
                            </div>
                          </div>
                        ))}

                      {events.filter(
                        (e) => new Date(e.start_date) >= new Date(),
                      ).length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No upcoming events scheduled.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
