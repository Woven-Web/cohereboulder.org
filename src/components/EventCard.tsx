import { useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, CheckCircle2, Download, Clock, Loader2, MapPin } from "lucide-react";
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
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { fetchMySeat, rsvpOnRegenos } from "@/lib/regenos";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(laneOn);
  const signedIn = laneOn && Boolean(session?.did);
  const [rsvp, setRsvp] = useState<"idle" | "busy" | "going" | "requested" | "waitlisted" | "error">("idle");
  const upcoming = Boolean(event.startsAt) && new Date(event.startsAt ?? 0).getTime() > Date.now();

  // The card is one big link, so no form lives inside it: the button opens
  // the detail page with its RSVP panel expanded (EventRsvp reads #rsvp).
  // Signed in on regenOS, the card RSVPs in one click (same call and cache
  // key as the detail page's panel). Anonymous visitors still need the email
  // form, which lives on the detail page.
  async function handleRsvp(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      navigate(`${eventPath(event)}#rsvp`);
      return;
    }
    if (rsvp === "busy") return;
    setRsvp("busy");
    const key = ["regenos-my-seat", event.did, event.rkey];
    try {
      const current = await fetchMySeat(event.did, event.rkey);
      let seat = current.seat;
      if (seat !== "confirmed" && seat !== "requested" && seat !== "waitlisted") {
        seat = await rsvpOnRegenos(event.did, event.rkey, "going", current.attendance);
      }
      queryClient.setQueryData(key, { seat, attendance: current.attendance });
      setRsvp(seat === "confirmed" ? "going" : seat === "requested" ? "requested" : seat === "waitlisted" ? "waitlisted" : "error");
    } catch {
      setRsvp("error");
    }
  }

  const rsvpDone = rsvp === "going" || rsvp === "requested" || rsvp === "waitlisted";

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
            <div className="pt-1 flex flex-wrap gap-x-1">
              {upcoming && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 -ml-2.5 text-primary hover:text-primary"
                  onClick={handleRsvp}
                  // Not `disabled`: a disabled button gets pointer-events:none,
                  // so a second click would fall through to the card's Link.
                  // handleRsvp ignores clicks while busy instead.
                  aria-disabled={rsvp === "busy"}
                  aria-live="polite"
                  data-testid="card-rsvp"
                >
                  {rsvp === "busy" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : rsvpDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <BellRing className="h-3.5 w-3.5" />
                  )}
                  {rsvpDone
                    ? tr(`calendar.rsvp.${rsvp}`)
                    : rsvp === "error"
                      ? tr("calendar.rsvp.error")
                      : tr("calendar.rsvp.button")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1.5 text-muted-foreground hover:text-foreground ${upcoming ? "" : "-ml-2.5"}`}
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
