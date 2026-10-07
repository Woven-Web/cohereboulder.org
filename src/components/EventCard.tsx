import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { Check, Download, Clock, Loader2, MapPin } from "lucide-react";
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
export function EventCard({ event, hostControls }: { event: CommunityEvent; hostControls?: ReactNode }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    const measure = () => setDescriptionOverflows(element.scrollHeight > element.clientHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [event.description, language]);

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
  const [rsvp, setRsvp] = useState<"idle" | "going" | "requested" | "waitlisted" | "error">("idle");
  // Attendance refetches may change the seat during a write, never its lock.
  // The ref also blocks a second click before React has rendered pending.
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const { data: mySeat } = useQuery({
    queryKey: ["regenos-my-seat", event.did, event.rkey],
    queryFn: () => fetchMySeat(event.did, event.rkey),
    enabled: signedIn,
    staleTime: 30_000,
  });
  useEffect(() => {
    setRsvp(!signedIn ? "idle" : mySeat?.seat === "confirmed" ? "going" : mySeat?.seat === "requested" ? "requested" : mySeat?.seat === "waitlisted" ? "waitlisted" : "idle");
  }, [mySeat, signedIn]);
  const upcoming = Boolean(event.startsAt) && new Date(event.startsAt ?? 0).getTime() > Date.now();

  // The button opens
  // the detail page with its RSVP panel expanded (EventRsvp reads #rsvp).
  // Signed in on regenOS, the card RSVPs in one click (same call and cache
  // key as the detail page's panel). Anonymous visitors still need the email
  // form, which lives on the detail page.
  async function handleRsvp(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pendingRef.current) return;
    if (!signedIn) {
      navigate(`${eventPath(event)}#rsvp`);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    const key = ["regenos-my-seat", event.did, event.rkey];
    try {
      const current = await fetchMySeat(event.did, event.rkey);
      let seat = current.seat;
      if (rsvp === "going" || rsvp === "requested" || rsvp === "waitlisted") {
        seat = await rsvpOnRegenos(event.did, event.rkey, "notgoing", current.attendance);
      } else if (seat !== "confirmed" && seat !== "requested" && seat !== "waitlisted") {
        seat = await rsvpOnRegenos(event.did, event.rkey, "going", current.attendance);
      }
      queryClient.setQueryData(key, { seat, attendance: current.attendance });
      setRsvp(seat === "confirmed" ? "going" : seat === "requested" ? "requested" : seat === "waitlisted" ? "waitlisted" : seat === "declined" || seat === "none" ? "idle" : "error");
    } catch {
      setRsvp("error");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const rsvpDone = rsvp === "going" || rsvp === "requested" || rsvp === "waitlisted";

  function handleAddToCalendar(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    downloadEventIcs(event, `${window.location.origin}${eventPath(event)}`);
  }

  return (
    <div className="block group" data-testid="event-card">
      <Card className="hover:shadow-warm transition-shadow">
        <CardHeader className="space-y-1 p-4 pb-2 sm:p-6 sm:pb-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {date ?? tr("calendar.events.undated")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              className={`text-lg group-hover:underline ${cancelled ? "line-through opacity-70" : ""}`}
            >
              <Link to={eventPath(event)} className="inline-flex min-h-11 items-center leading-6 py-2.5 -my-2.5">{event.name}</Link>
            </CardTitle>
            {badged && (
              <Badge className="text-sm" variant={cancelled ? "destructive" : "secondary"}>
                {tr(`calendar.events.status.${event.status}`)}
              </Badge>
            )}
            {event.mode && event.mode !== "inperson" && KNOWN_MODES.has(event.mode) && (
              <Badge className="text-sm" variant="outline">{tr(`calendar.events.mode.${event.mode}`)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {time && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 shrink-0" />
              {time}
            </p>
          )}
          {where && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {where}
            </p>
          )}
          {event.description && (
            <div className="mt-3">
              <p ref={descriptionRef} data-testid="card-description" className="text-[15px] leading-6 max-w-[65ch] text-muted-foreground line-clamp-3">
                {event.description.replace(/\s+/g, " ").trim()}
              </p>
              {descriptionOverflows && <Link to={eventPath(event)} aria-label={`${tr("calendar.events.cardMoreAbout")} ${event.name}`} className="inline-flex min-h-11 min-w-11 items-center text-sm text-primary underline">
                {tr("calendar.events.cardMore")}
              </Link>}
            </div>
          )}
          {event.startsAt && !cancelled && (
            <div className="mt-4 flex flex-wrap gap-2">
              {upcoming && (
                <Button
                  variant={rsvpDone ? "going" : "rsvp"}
                  className="h-11 min-w-[88px] px-4 gap-1.5"
                  onClick={handleRsvp}
                  // Keep receiving busy clicks so handleRsvp can ignore them
                  // without allowing click-through or duplicate writes.
                  aria-disabled={pending}
                  aria-live="polite"
                  title={rsvpDone ? tr("calendar.events.cancelHint") : undefined}
                  aria-label={rsvpDone ? `${tr(rsvp === "going" ? "calendar.events.cardGoing" : `calendar.rsvp.${rsvp}`)}. ${tr("calendar.events.cancelHint")}` : undefined}
                  data-testid="card-rsvp"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {rsvp === "going" && <Check className="h-4 w-4" aria-hidden />}
                  {rsvpDone
                    ? tr(rsvp === "going" ? "calendar.events.cardGoing" : `calendar.rsvp.${rsvp}`).replace(/^✓ /, "")
                    : rsvp === "error"
                      ? tr("calendar.rsvp.error")
                      : tr("calendar.events.cardRsvp")}
                </Button>
              )}
              <Button
                variant="outline"
                className="min-h-11 px-3 gap-1.5"
                onClick={handleAddToCalendar}
              >
                <Download className="h-3.5 w-3.5" />
                {tr("calendar.events.addToCalendar")}
              </Button>
            </div>
          )}
          {hostControls && <div className="mt-4 border-t pt-4 flex flex-wrap gap-2">{hostControls}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
