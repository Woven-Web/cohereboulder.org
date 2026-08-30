// The community-calendar seam: ONE shape the calendar page renders, TWO
// possible sources, chosen by what the Worker answers.
//
//   /api/events healthy with events      → real event cards from regenOS.
//   unconfigured, or healthy but empty   → the Luma embed, exactly as before.
//   degraded / network failure           → THROW, so react-query retries and
//                                          keeps previously fetched events.
//
// Throwing on the transient cases matters: with react-query's defaults a
// window refocus refetches, and a fetcher that "successfully" returned the
// Luma fallback during a blip would hot-swap real rendered cards for the
// iframe. An error keeps the last good data; only when there has never been
// good data does the page fall back to Luma (Calendar.tsx renders Luma
// whenever it has no regenOS data, so /calendar always shows something).

import { API_BASE } from "./api";

export interface CommunityEventLocation {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
}

/** One event as the Worker trims it — see worker/src/events.ts. */
export interface CommunityEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  /** "scheduled" | "planned" | "rescheduled" | "cancelled" | "postponed" | null. */
  status: string | null;
  /** "inperson" | "virtual" | "hybrid" | null. */
  mode: string | null;
  location: CommunityEventLocation | null;
}

export interface CommunityEventDetail extends CommunityEvent {
  uris: { uri: string; name?: string }[];
  hostName: string | null;
}

export type CalendarSource = "regenos" | "luma";

export interface CommunityCalendar {
  source: CalendarSource;
  events: CommunityEvent[];
  /** The collective's subscribable .ics feed, when the Worker knows it. */
  icsUrl: string | null;
}

const LUMA_FALLBACK: CommunityCalendar = { source: "luma", events: [], icsUrl: null };

/**
 * The upcoming community calendar, soonest first. Resolves to the Luma
 * fallback only on the definite answers — unconfigured (no scene yet) or a
 * healthy-but-empty calendar. Throws on anything transient (degraded upstream,
 * bad status, network failure) so react-query retries and keeps prior data.
 */
export async function fetchCommunityCalendar(): Promise<CommunityCalendar> {
  const res = await fetch(`${API_BASE}/api/events`);
  if (!res.ok) throw new Error(`/api/events answered ${res.status}`);
  const data = (await res.json()) as {
    events?: CommunityEvent[];
    icsUrl?: string | null;
    degraded?: boolean;
    unconfigured?: boolean;
  };
  if (data.unconfigured) return LUMA_FALLBACK;
  if (data.degraded) throw new Error("/api/events is degraded");
  const events = Array.isArray(data.events) ? data.events.filter((e) => e && e.name) : [];
  if (events.length === 0) return LUMA_FALLBACK;
  return {
    source: "regenos",
    events,
    icsUrl: typeof data.icsUrl === "string" ? data.icsUrl : null,
  };
}

export interface CommunityEventPage {
  event: CommunityEventDetail;
  icsUrl: string | null;
}

/**
 * One public event, or null when it definitely isn't one (removed, private,
 * bad link → the Worker's 404). Throws on anything transient (the Worker's
 * 503 `degraded`, network failure) so react-query retries and the page can
 * say "try again" instead of "removed".
 */
export async function fetchCommunityEvent(did: string, rkey: string): Promise<CommunityEventPage | null> {
  const res = await fetch(
    `${API_BASE}/api/events/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/events/:did/:rkey answered ${res.status}`);
  const data = (await res.json()) as { event?: CommunityEventDetail; icsUrl?: string | null };
  if (!data.event?.name) return null;
  return { event: data.event, icsUrl: typeof data.icsUrl === "string" ? data.icsUrl : null };
}

/** In-site event page, mirroring scenius.social's route shape so links stay portable. */
export function eventPath(event: Pick<CommunityEvent, "did" | "rkey">): string {
  return `/events/${encodeURIComponent(event.did)}/${encodeURIComponent(event.rkey)}`;
}

// ------------------------------------------------------------- date rendering
// Events don't carry a timezone on the wire; the calendar is a Boulder thing,
// so everything renders in America/Denver.

const EVENT_TIME_ZONE = "America/Denver";

type Language = "en" | "es";

function locale(language: Language): string {
  return language === "es" ? "es" : "en-US";
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thursday, October 15, 2026" (or the Spanish equivalent), or null. */
export function formatEventDate(iso: string | null, language: Language): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat(locale(language), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(d);
}

function formatTime(d: Date, language: Language, withZone: boolean): string {
  return new Intl.DateTimeFormat(locale(language), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
    ...(withZone ? { timeZoneName: "short" as const } : {}),
  }).format(d);
}

function denverDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(d);
}

/**
 * "6:00 PM – 8:00 PM MDT" when the event ends the same Denver day,
 * "6:00 PM MDT" otherwise (a multi-day end gets its own line — see
 * formatEventEnd), or null for an undated event.
 */
export function formatEventTimeRange(
  startsAt: string | null,
  endsAt: string | null,
  language: Language,
): string | null {
  const start = parseDate(startsAt);
  if (!start) return null;
  const end = parseDate(endsAt);
  if (end && denverDay(start) === denverDay(end)) {
    return `${formatTime(start, language, false)} – ${formatTime(end, language, true)}`;
  }
  return formatTime(start, language, true);
}

/** For a multi-day event: "Sunday, October 25, 2026 · 3:00 PM MDT", else null. */
export function formatEventEnd(
  startsAt: string | null,
  endsAt: string | null,
  language: Language,
): string | null {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);
  if (!start || !end || denverDay(start) === denverDay(end)) return null;
  return `${formatEventDate(endsAt, language)} · ${formatTime(end, language, true)}`;
}

/**
 * One line of place, or null. The Worker already withholds geo-only ("rough")
 * faces — this just re-guards so a blank never renders.
 */
export function locationLine(location: CommunityEventLocation | null): string | null {
  if (!location) return null;
  const parts = [location.name, location.street, location.locality].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
