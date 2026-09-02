import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Clock, Download, ExternalLink, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  eventPath,
  fetchCommunityEvent,
  formatEventDate,
  formatEventEnd,
  formatEventTimeRange,
  locationLine,
} from "@/lib/events";
import { downloadEventIcs } from "@/lib/ics";
// The event API doesn't carry a per-event image today, so a detail page
// gets a tasteful COhere still as a banner instead of a blank header — real
// footage, never AI/stock, per Eileen's rule. Picked deterministically per
// event so the same event always shows the same photo.
import gatheringPhoto from "@/assets/photos/gathering.webp";
import coCreatingPhoto from "@/assets/photos/co-creating.webp";
import singingCirclePhoto from "@/assets/photos/singing-circle.webp";
import sharedMealPhoto from "@/assets/photos/shared-meal.webp";
import celebrationPhoto from "@/assets/photos/celebration.webp";
import altarPhoto from "@/assets/photos/altar.webp";

/** The statuses worth a badge; anything else renders as a plain event. */
const BADGED_STATUSES = new Set(["cancelled", "postponed", "rescheduled"]);

/** The modes we have words for; an unknown upstream fragment renders no badge. */
const KNOWN_MODES = new Set(["inperson", "virtual", "hybrid"]);

const BANNER_PHOTOS = [
  gatheringPhoto,
  coCreatingPhoto,
  singingCirclePhoto,
  sharedMealPhoto,
  celebrationPhoto,
  altarPhoto,
];

/** A stable, non-cryptographic pick so one event always gets the same photo. */
function bannerFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return BANNER_PHOTOS[hash % BANNER_PHOTOS.length];
}

/**
 * One community event, at /events/:did/:rkey — the same route shape
 * scenius.social uses, so a link works on either origin.
 */
export default function EventDetail() {
  const { did = "", rkey = "" } = useParams();
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["community-event", did, rkey],
    queryFn: () => fetchCommunityEvent(did, rkey),
    enabled: Boolean(did && rkey),
  });

  const event = data?.event ?? null;
  const date = event ? formatEventDate(event.startsAt, language) : null;
  const time = event ? formatEventTimeRange(event.startsAt, event.endsAt, language) : null;
  const until = event ? formatEventEnd(event.startsAt, event.endsAt, language) : null;
  const where = event ? locationLine(event.location) : null;
  const badged = event?.status && BADGED_STATUSES.has(event.status);
  const cancelled = event?.status === "cancelled";

  function handleAddToCalendar() {
    if (!event) return;
    downloadEventIcs(event, `${window.location.origin}${eventPath(event)}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/calendar"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {tr("calendar.events.backToCalendar")}
          </Link>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-16">
              {tr("calendar.events.loading")}
            </p>
          ) : isError ? (
            // Transient failure (the Worker's 503, a network blip) — say "try
            // again", not "removed"; the event may be perfectly fine.
            <Card>
              <CardContent className="p-8 text-center">
                <h1 className="text-2xl font-bold text-foreground mb-3">
                  {tr("calendar.events.unavailableTitle")}
                </h1>
                <p className="text-muted-foreground">
                  {tr("calendar.events.unavailableBody")}
                </p>
              </CardContent>
            </Card>
          ) : !event ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h1 className="text-2xl font-bold text-foreground mb-3">
                  {tr("calendar.events.notFoundTitle")}
                </h1>
                <p className="text-muted-foreground">
                  {tr("calendar.events.notFoundBody")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <article>
              <div className="relative rounded-lg overflow-hidden shadow-warm mb-8">
                <img
                  src={bannerFor(`${event.did}/${event.rkey}`)}
                  alt=""
                  aria-hidden="true"
                  className="h-48 sm:h-64 w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-canopy" aria-hidden="true" />
              </div>

              <header className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
                  {date ?? tr("calendar.events.undated")}
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <h1
                    className={`text-3xl lg:text-4xl font-bold text-foreground ${cancelled ? "line-through opacity-70" : ""}`}
                  >
                    {event.name}
                  </h1>
                  {badged && (
                    <Badge variant={cancelled ? "destructive" : "secondary"}>
                      {tr(`calendar.events.status.${event.status}`)}
                    </Badge>
                  )}
                  {event.mode && KNOWN_MODES.has(event.mode) && (
                    <Badge variant="outline">{tr(`calendar.events.mode.${event.mode}`)}</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {time && (
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      {time}
                      {until && (
                        <span>
                          · {tr("calendar.events.until")} {until}
                        </span>
                      )}
                    </p>
                  )}
                  {where && (
                    <p className="text-muted-foreground flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {where}
                    </p>
                  )}
                  {event.hostName && (
                    <p className="text-muted-foreground text-sm">
                      {tr("calendar.events.hostedBy")} {event.hostName}
                    </p>
                  )}
                </div>
              </header>

              {event.description && (
                <p className="text-foreground leading-relaxed whitespace-pre-line mb-8">
                  {event.description}
                </p>
              )}

              {event.uris.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    {tr("calendar.events.links")}
                  </h2>
                  <ul className="space-y-2">
                    {event.uris.map((link) => (
                      <li key={link.uri}>
                        <a
                          href={link.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-primary hover:underline break-all"
                        >
                          {link.name || link.uri}
                          <ExternalLink className="h-4 w-4 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(event.startsAt || data?.icsUrl) && (
                <div className="border-t pt-6 flex flex-wrap gap-3">
                  {event.startsAt && !cancelled && (
                    <Button variant="community" className="gap-2" onClick={handleAddToCalendar}>
                      <Download className="h-4 w-4" />
                      {tr("calendar.events.addToCalendar")}
                    </Button>
                  )}
                  {data?.icsUrl && (
                    <Button asChild variant="outline" className="gap-2">
                      <a href={data.icsUrl}>
                        <CalendarPlus className="h-4 w-4" />
                        {tr("calendar.events.subscribe")}
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </article>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
