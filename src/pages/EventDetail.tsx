import { displayHandle } from "@/lib/handles";
import { ShareEvent } from "@/components/ShareEvent";
import { EventRsvp } from "@/components/EventRsvp";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { AddressBlock } from "@/components/almanac/AddressBlock";
import { SeatBadge } from "@/components/almanac/SeatBadge";
import { seatOf } from "@/components/almanac/seat";
import { useMyEvents } from "@/lib/myEvents";
import { formatDay } from "@/lib/festival";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  denverDateKey,
  fetchCommunityEvent,
  formatEventDate,
  formatEventEnd,
  formatEventTimeRange,
  locationLine,
} from "@/lib/events";
import { AddToCalendar } from "@/components/AddToCalendar";
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
  const dayKey = event ? denverDateKey(event.startsAt) : null;
  const time = event ? formatEventTimeRange(event.startsAt, event.endsAt, language) : null;
  const until = event ? formatEventEnd(event.startsAt, event.endsAt, language) : null;
  const where = event ? (event.location?.name?.trim() || locationLine(event.location)) : null;
  const mine = useMyEvents(event ? [event] : undefined);
  const myItem = event ? mine.items.find((i) => i.event.did === event.did && i.event.rkey === event.rkey) : undefined;
  const badged = event?.status && BADGED_STATUSES.has(event.status);
  const cancelled = event?.status === "cancelled";

  const paragraphs = event?.description ? event.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];

  return (
    <AlmanacShell>
      <main className="page" style={{ paddingTop: 0 }}>
        {isLoading ? (
          <p className="small" style={{ padding: "3rem 0", textAlign: "center" }}>{tr("calendar.events.loading")}</p>
        ) : isError ? (
          // Transient failure (the Worker's 503, a network blip): say "try
          // again", not "removed"; the event may be perfectly fine.
          <div className="empty" style={{ marginTop: "1rem" }}>
            <Link className="link" to="/calendar">← {tr("almanac.back")}</Link>
            <h1 className="h3">{tr("calendar.events.unavailableTitle")}</h1>
            <p className="lede">{tr("calendar.events.unavailableBody")}</p>
          </div>
        ) : !event ? (
          <div className="empty" style={{ marginTop: "1rem" }}>
            <Link className="link" to="/calendar">← {tr("almanac.back")}</Link>
            <h1 className="h3">{tr("calendar.events.notFoundTitle")}</h1>
            <p className="lede">{tr("calendar.events.notFoundBody")}</p>
          </div>
        ) : (
          <article className="flow2">
            <div className="flow2__a">
              <header className="o1">
                <Link className="link" to="/calendar" style={{ marginTop: ".4rem" }}>← {tr("almanac.back")}</Link>
                <p className="folio" style={{ marginTop: ".3rem" }}>{dayKey ? formatDay(dayKey, language, true) : date ?? tr("calendar.events.undated")}</p>
                {(time || until) && (
                  <p className="mono" style={{ fontSize: ".85em", color: "var(--deep)" }}>
                    {time}{until && <> · {tr("calendar.events.until")} {until}</>}
                  </p>
                )}
                <h1 className={`h1${cancelled ? " line-through opacity-70" : ""}`} style={{ margin: ".4rem 0 .5rem" }}>{event.name}</h1>
                {(badged || (event.mode && KNOWN_MODES.has(event.mode) && event.mode !== "inperson")) && (
                  <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".4rem" }}>
                    {badged && <Badge className="text-sm" variant={cancelled ? "destructive" : "secondary"}>{tr(`calendar.events.status.${event.status}`)}</Badge>}
                    {event.mode && event.mode !== "inperson" && KNOWN_MODES.has(event.mode) && <Badge className="text-sm" variant="outline">{tr(`calendar.events.mode.${event.mode}`)}</Badge>}
                  </p>
                )}
                {(where || event.hostName) && (
                  <p className="ev__meta" style={{ fontSize: "1em" }}>
                    {where}
                    {event.hostName && <>{where ? " · " : ""}{tr("calendar.events.hostedBy")} {displayHandle(event.hostName)}</>}
                  </p>
                )}
                {myItem && <p style={{ marginTop: ".6rem" }}><SeatBadge seat={seatOf(myItem)} /></p>}
              </header>
              <div className="o3">
                {paragraphs.length > 0 && <div className="eyebrow" style={{ marginTop: "1.6rem" }}>{tr("almanac.about")}</div>}
                {paragraphs.map((p, i) => <p key={i} className="lede whitespace-pre-line" style={{ marginTop: ".8rem", maxWidth: "65ch" }}>{p}</p>)}
                {event.uris.length > 0 && (
                  <div style={{ marginTop: "1.4rem" }}>
                    <h2 className="eyebrow">{tr("calendar.events.links")}</h2>
                    <ul>
                      {event.uris.map((link) => (
                        <li key={link.uri}>
                          <a className="link break-all" href={link.uri} target="_blank" rel="noopener noreferrer">
                            {link.name || link.uri} <ExternalLink className="ml-1 inline h-4 w-4 shrink-0" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="note">{tr("almanac.sourceNote")}</p>
              </div>
            </div>
            <div className="flow2__b">
              <div className="o2" style={{ marginTop: "1rem" }}>
                <EventRsvp key={`rsvp-${event.did}/${event.rkey}`} event={event} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-1">
                  <ShareEvent key={`${event.did}/${event.rkey}`} event={event} />
                  <AddToCalendar event={event} className="h-11 w-full" />
                  {data?.icsUrl && <div className="min-w-0"><CalendarSubscribe feedUrl={data.icsUrl} compact /></div>}
                </div>
              </div>
              <div className="o4" style={{ marginTop: "1.6rem" }}>
                {event.location && <div className="eyebrow" style={{ marginBottom: ".7rem" }}>{tr("almanac.where")}</div>}
                <AddressBlock location={event.location} />
                <figure className="photo photo--always">
                  <div>
                    <img
                      src={event.imageUrl || bannerFor(`${event.did}/${event.rkey}`)}
                      alt={event.imageUrl ? event.name : tr("calendar.events.bannerAlt")}
                      data-testid="event-banner"
                      loading="lazy"
                    />
                  </div>
                </figure>
              </div>
            </div>
          </article>
        )}
      </main>
    </AlmanacShell>
  );
}
