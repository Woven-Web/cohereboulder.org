import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A working edge cache: calendar-feed.ts reads caches.default when it loads.
const store = vi.hoisted(() => {
  const cache = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (req: Request) => cache.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => { cache.set(req.url, res); },
      delete: async (req: Request) => cache.delete(req.url),
    },
  });
  return cache;
});

import { cleanFeed, handleCalendarFeed } from "./calendar-feed";

const SCENE = "did:plc:w54s52ycbw5lreyhlzexredb";
const env = { REGENOS_WEB_URL: "https://scenius.social/", REGENOS_COLLECTIVE_DID: SCENE };
const vevent = (uid: string, summary: string) =>
  ["BEGIN:VEVENT", `UID:${SCENE}/${uid}@scenius.social`, "DTSTAMP:20261017T190808Z", "DTSTART:20261018T180000Z", "DTEND:20261018T190000Z", `SUMMARY:${summary}`, "LOCATION:Boulder\\, CO", "END:VEVENT"];
const feed = (...events: string[][]) =>
  [["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//scenius.social//calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:COhere Boulder"], ...events, ["END:VCALENDAR", ""]].flat().join("\r\n");
const UPSTREAM = feed(vevent("ev-1", "TEST"), vevent("ev-2", "Honoring Water"), vevent("ev-3", "TEST circle"));

let calls: string[];
let upstream: () => Response | Promise<Response>;
beforeEach(() => {
  store.clear();
  calls = [];
  upstream = () => new Response(UPSTREAM, { headers: { "content-type": "text/calendar; charset=utf-8" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(String(url)); return upstream(); }));
});
afterEach(() => vi.unstubAllGlobals());

const get = (method = "GET") => handleCalendarFeed(new Request("https://cohereboulder.org/calendar.ics", { method }), env);

describe("cleanFeed", () => {
  it("drops events titled exactly TEST and keeps everything else, CRLF throughout", () => {
    const out = cleanFeed(UPSTREAM)!;
    expect(out).not.toMatch(/^SUMMARY:TEST\r$/m);
    expect(out).toContain("SUMMARY:Honoring Water\r\n");
    expect(out).toContain("SUMMARY:TEST circle\r\n");
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
    expect(out).toContain("X-WR-CALNAME:COhere Boulder\r\nX-PUBLISHED-TTL:PT1H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
  });
  it("reads a folded SUMMARY whole, and a SUMMARY with parameters", () => {
    const folded = feed(["BEGIN:VEVENT", "UID:a", "SUMMARY:TE", " ST", "END:VEVENT"], ["BEGIN:VEVENT", "UID:b", "SUMMARY;LANGUAGE=en:TEST", "END:VEVENT"], vevent("c", "Soup Night"));
    const out = cleanFeed(folded)!;
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(out).toContain("SUMMARY:Soup Night");
  });
  it("refuses anything that is not a whole calendar", () => {
    expect(cleanFeed("<!doctype html><title>Error</title>")).toBeNull();
    expect(cleanFeed("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:cut off")).toBeNull();
    expect(cleanFeed("")).toBeNull();
  });
});

describe("GET /calendar.ics", () => {
  it("proxies the scene's feed (DID colons raw, as scenius serves it) with calendar headers", async () => {
    const res = await get();
    expect(calls).toEqual([`https://scenius.social/scenes/${SCENE}/calendar.ics`]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=900");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="cohere-boulder.ics"');
    const body = await res.text();
    expect(body).toContain("SUMMARY:Honoring Water");
    expect(body).not.toMatch(/^SUMMARY:TEST\r$/m);
  });
  it("serves the edge copy for 15 minutes instead of asking upstream again", async () => {
    await get();
    const second = await get();
    expect(calls).toHaveLength(1);
    expect(await second.text()).toContain("SUMMARY:Honoring Water");
  });
  it("answers HEAD with the headers and no body", async () => {
    const res = await get("HEAD");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(await res.text()).toBe("");
  });
  it("an upstream error, timeout or non-calendar is a 502 that is not cached, so apps keep their copy", async () => {
    for (const failing of [
      () => new Response("down", { status: 503 }),
      () => Promise.reject(new Error("timeout")),
      () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
    ]) {
      upstream = failing;
      const res = await get();
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(store.size).toBe(0);
    upstream = () => new Response(UPSTREAM);
    expect((await get()).status).toBe(200);
  });
  it("is a 404 when no scene is configured", async () => {
    const res = await handleCalendarFeed(new Request("https://cohereboulder.org/calendar.ics"), { REGENOS_WEB_URL: "https://scenius.social" });
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
