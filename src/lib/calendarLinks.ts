import type { CommunityEvent } from "./events";
import { locationLine } from "./events";

/** Google Calendar's event editor URL; never mutates a calendar on its own. */
/** `pageUrl`, when given, is appended to the details so the entry links back to the event page. */
export function googleCalendarEventUrl(event: CommunityEvent, pageUrl?: string): string | null {
  if (!event.startsAt) return null;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const candidateEnd = event.endsAt ? new Date(event.endsAt) : null;
  const end = candidateEnd && !Number.isNaN(candidateEnd.getTime()) && candidateEnd > start
    ? candidateEnd : new Date(start.getTime() + 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const url = new URL("https://calendar.google.com/calendar/r/eventedit");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("dates", `${stamp(start)}/${stamp(end)}`);
  url.searchParams.set("text", event.name);
  const details = [event.description, pageUrl].filter(Boolean).join("\n\n");
  if (details) url.searchParams.set("details", details);
  const where = locationLine(event.location);
  if (where) url.searchParams.set("location", where);
  return url.toString();
}

/**
 * One-tap subscribe links for the calendar feed (an https URL on our own domain).
 * Apple opens `webcal://` itself; Google takes the same webcal URL in `cid` and
 * shows its own "Add calendar?" confirmation.
 */
export function calendarSubscribeLinks(feedUrl: string): { webcal: string; google: string } {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  return { webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}
