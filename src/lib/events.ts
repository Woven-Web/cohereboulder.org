// The community-calendar seam: ONE shape the calendar page renders, TWO
// possible sources, chosen by what the Worker answers.
//
//   /api/events healthy with events  → real event cards from regenOS.
//   unconfigured / degraded / empty  → the Luma embed, exactly as before.
//
// The Worker (worker/src/events.ts) already never throws and never 500s; this
// module keeps the same contract on the client so the live site can only get
// better, never worse, from regenOS existing.

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
 * The upcoming community calendar, soonest first. Never throws: any failure,
 * misconfiguration, or plain quiet calendar means the Luma fallback.
 */
export async function fetchCommunityCalendar(): Promise<CommunityCalendar> {
  try {
    const res = await fetch(`${API_BASE}/api/events`);
    if (!res.ok) return LUMA_FALLBACK;
    const data = (await res.json()) as {
      events?: CommunityEvent[];
      icsUrl?: string | null;
      degraded?: boolean;
      unconfigured?: boolean;
    };
    const events = Array.isArray(data.events) ? data.events.filter((e) => e && e.name) : [];
    if (data.degraded || data.unconfigured || events.length === 0) return LUMA_FALLBACK;
    return {
      source: "regenos",
      events,
      icsUrl: typeof data.icsUrl === "string" ? data.icsUrl : null,
    };
  } catch {
    return LUMA_FALLBACK;
  }
}

export interface CommunityEventPage {
  event: CommunityEventDetail;
  icsUrl: string | null;
}

/** One public event, or null for anything that isn't one. Never throws. */
export async function fetchCommunityEvent(did: string, rkey: string): Promise<CommunityEventPage | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/events/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { event?: CommunityEventDetail; icsUrl?: string | null };
    if (!data.event?.name) return null;
    return { event: data.event, icsUrl: typeof data.icsUrl === "string" ? data.icsUrl : null };
  } catch {
    return null;
  }
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
