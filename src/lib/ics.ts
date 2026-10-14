// A minimal, dependency-free per-event .ics builder. The collective's own
// subscribable feed (events.ts's `icsUrl`, from the Worker) is the canonical
// calendar; this is just a one-event courtesy for someone who wants THIS
// event on their phone without subscribing to everything.

import { locationLine, type CommunityEvent } from "./events";
import { icsEscape, icsJoin, icsTime } from "./icsCore";

function icsAddressLine(location: CommunityEvent["location"]): string | null {
  if (!location) return null;
  return locationLine(location);
}

/**
 * A single-event `.ics` file for one CommunityEvent. Falls back to a
 * one-hour duration when the event has no end time — most calendar clients
 * expect a DTEND, and the source data doesn't always carry one.
 */
export function buildEventIcs(
  event: Pick<CommunityEvent, "did" | "rkey" | "name" | "startsAt" | "endsAt" | "description" | "location">,
  siteUrl: string,
): string | null {
  if (!event.startsAt) return null;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const end = event.endsAt && !Number.isNaN(new Date(event.endsAt).getTime())
    ? new Date(event.endsAt)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const uid = `${event.rkey}.${event.did}@cohereboulder.org`;
  const stamp = icsTime(new Date().toISOString());
  const where = icsAddressLine(event.location);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//COhere Boulder//Community Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(start.toISOString())}`,
    `DTEND:${icsTime(end.toISOString())}`,
    `SUMMARY:${icsEscape(event.name)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
    `URL:${siteUrl}`,
    // A day-before reminder travels with the file, so someone who adds the
    // event gets nudged without handing us an email address.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`Tomorrow: ${event.name}`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return icsJoin(lines);
}

/** Filesystem-safe-ish filename stem from an event name. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event";
}

/** Builds the file, triggers a browser download, and revokes the object URL. */
export function downloadEventIcs(
  event: Pick<CommunityEvent, "did" | "rkey" | "name" | "startsAt" | "endsAt" | "description" | "location">,
  siteUrl: string,
): boolean {
  const contents = buildEventIcs(event, siteUrl);
  if (!contents) return false;

  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(event.name)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
