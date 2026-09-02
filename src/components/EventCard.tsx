import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Download, Clock, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  eventPath,
  formatEventDate,
  formatEventTimeRange,
  locationLine,
  type CommunityEvent,
} from "@/lib/events";
import { downloadEventIcs } from "@/lib/ics";

/** The statuses worth a badge; anything else renders as a plain event. */
const BADGED_STATUSES = new Set(["cancelled", "postponed", "rescheduled"]);

/** The modes we have words for; an unknown upstream fragment renders no badge. */
const KNOWN_MODES = new Set(["inperson", "virtual", "hybrid"]);

/**
 * One event card — shared by the homepage's upcoming section, the calendar's
 * upcoming list, and anywhere else a community event needs the same look, so
 * the three surfaces can't drift apart.
 */
export function EventCard({ event }: { event: CommunityEvent }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const date = formatEventDate(event.startsAt, language);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, language);
  const where = locationLine(event.location);
  const badged = event.status && BADGED_STATUSES.has(event.status);
  const cancelled = event.status === "cancelled";

  function handleAddToCalendar(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    downloadEventIcs(event, `${window.location.origin}${eventPath(event)}`);
  }

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
          {event.startsAt && !cancelled && (
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 -ml-2.5 text-muted-foreground hover:text-foreground"
                onClick={handleAddToCalendar}
              >
                <Download className="h-3.5 w-3.5" />
                {tr("calendar.events.addToCalendar")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
