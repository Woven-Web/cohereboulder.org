import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { LumaCalendar } from "@/components/LumaCalendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, Clock, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  eventPath,
  fetchCommunityCalendar,
  formatEventDate,
  formatEventTimeRange,
  locationLine,
  type CommunityEvent,
} from "@/lib/events";

/** The statuses worth a badge; anything else renders as a plain event. */
const BADGED_STATUSES = new Set(["cancelled", "postponed", "rescheduled"]);

/** The modes we have words for; an unknown upstream fragment renders no badge. */
const KNOWN_MODES = new Set(["inperson", "virtual", "hybrid"]);

function EventCard({ event }: { event: CommunityEvent }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const date = formatEventDate(event.startsAt, language);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, language);
  const where = locationLine(event.location);
  const badged = event.status && BADGED_STATUSES.has(event.status);
  const cancelled = event.status === "cancelled";

  return (
    <Link to={eventPath(event)} className="block group">
      <Card className="hover:shadow-warm transition-shadow">
        <CardHeader className="pb-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {date ?? tr("calendar.events.undated")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              className={`text-xl group-hover:underline ${cancelled ? "line-through opacity-70" : ""}`}
            >
              {event.name}
            </CardTitle>
            {badged && (
              <Badge variant={cancelled ? "destructive" : "secondary"}>
                {tr(`calendar.events.status.${event.status}`)}
              </Badge>
            )}
            {event.mode && event.mode !== "inperson" && KNOWN_MODES.has(event.mode) && (
              <Badge variant="outline">{tr(`calendar.events.mode.${event.mode}`)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {time && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {time}
            </p>
          )}
          {where && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {where}
            </p>
          )}
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
              {event.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CalendarPage() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const { data, isLoading } = useQuery({
    queryKey: ["community-calendar"],
    queryFn: fetchCommunityCalendar,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              {tr("calendar.events.title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {tr("calendar.events.subtitle")}
            </p>
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-16">
              {tr("calendar.events.loading")}
            </p>
          ) : data?.source === "regenos" ? (
            <>
              {data.icsUrl && (
                <div className="text-center mb-8">
                  <Button asChild variant="community" size="lg" className="gap-2">
                    <a href={data.icsUrl}>
                      <CalendarPlus className="h-4 w-4" />
                      {tr("calendar.events.subscribe")}
                    </a>
                  </Button>
                </div>
              )}
              <div className="max-w-3xl mx-auto space-y-6">
                {data.events.map((event) => (
                  <EventCard key={`${event.did}/${event.rkey}`} event={event} />
                ))}
              </div>
            </>
          ) : (
            <LumaCalendar />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
