import type { CommunityEvent } from "./events";
import { locationLine } from "./events";

/** Google Calendar's event editor URL; never mutates a calendar on its own. */
export function googleCalendarEventUrl(event: CommunityEvent): string | null {
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
  if (event.description) url.searchParams.set("details", event.description);
  const where = locationLine(event.location);
  if (where) url.searchParams.set("location", where);
  return url.toString();
}
