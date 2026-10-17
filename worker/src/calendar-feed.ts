// GET /calendar.ics: the community calendar as a subscribable feed, on our own domain.
//
// regenOS (scenius.social) already publishes the scene's feed, but at a URL with
// raw colons in the DID, which Google's one-tap subscribe link cannot carry. So
// the Worker reads it anonymously, drops the "TEST" events organizers make while
// trying the event form, and serves it here with a 15-minute edge cache.
// Calendar apps poll on their own schedule (Google every several hours), so a
// fresher copy would buy nothing.

import { calendarIcsUrl, type EventsEnv } from "./events";

export const CALENDAR_FEED_PATH = "/calendar.ics";
const CACHE_SECONDS = 900;
const UPSTREAM_TIMEOUT_MS = 8_000;

const edgeCache = (caches as unknown as { default: Cache }).default;

export const feedHeaders = (): Record<string, string> => ({
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": 'inline; filename="cohere-boulder.ics"',
  "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
  "X-Content-Type-Options": "nosniff",
});

/** One property's value, with RFC 5545 folded lines already joined. */
function propertyValue(lines: string[], name: string): string | null {
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).split(";")[0].toUpperCase();
    if (key === name) return line.slice(colon + 1);
  }
  return null;
}

/**
 * The feed minus events titled exactly "TEST", plus a refresh hint for the apps
 * that honour one. Anything that is not a calendar comes back as null.
 */
export function cleanFeed(ics: string): string | null {
  // Unfold first (a CRLF or LF followed by a space or tab continues the line), so a long
  // SUMMARY split across lines is still read whole. Output is re-joined with CRLF.
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "BEGIN:VCALENDAR") return null;
  const out: string[] = [];
  let event: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      event = [line];
      continue;
    }
    if (event) {
      event.push(line);
      if (line === "END:VEVENT") {
        if (propertyValue(event, "SUMMARY")?.trim() !== "TEST") out.push(...event);
        event = null;
      }
      continue;
    }
    if (line === "") continue;
    out.push(line);
    if (line.startsWith("X-WR-CALNAME") && !lines.some((l) => l.startsWith("X-PUBLISHED-TTL"))) {
      out.push("X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    }
  }
  if (out.at(-1) !== "END:VCALENDAR") return null;
  return `${out.join("\r\n")}\r\n`;
}

export async function handleCalendarFeed(request: Request, env: EventsEnv): Promise<Response> {
  const source = calendarIcsUrl(env);
  if (!source) return new Response("No calendar is configured.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const head = request.method === "HEAD";
  const cacheKey = new Request(new URL(CALENDAR_FEED_PATH, request.url).toString());
  const cached = await edgeCache.match(cacheKey);
  if (cached) return head ? new Response(null, { headers: cached.headers }) : cached;

  let body: string | null = null;
  try {
    const res = await fetch(source, { headers: { accept: "text/calendar" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (res.ok) body = cleanFeed(await res.text());
    else console.warn(`calendar feed upstream returned ${res.status}`);
  } catch (err) {
    console.warn("calendar feed upstream failed:", err instanceof Error ? err.message : err);
  }
  // A calendar app that gets an error keeps the copy it has, which beats an empty calendar.
  if (body === null) return new Response("The calendar is unavailable right now.", { status: 502, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });

  const response = new Response(body, { headers: feedHeaders() });
  await edgeCache.put(cacheKey, response.clone()).catch(() => {});
  return head ? new Response(null, { headers: response.headers }) : response;
}
