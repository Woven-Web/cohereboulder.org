import { describe, expect, it } from "vitest";
import { calendarSubscribeLinks, googleCalendarEventUrl } from "./calendarLinks";
import type { CommunityEvent } from "./events";

const event = {
  did: "did:plc:test", rkey: "one", name: "Circle & song", description: "Bring a friend + tea",
  startsAt: "2026-10-16T18:00:00.000Z", endsAt: "2026-10-16T20:00:00.000Z",
  location: { name: "Hall", street: "123 Main St", locality: "Boulder", region: "CO" },
  status: "scheduled", mode: "inperson",
} as CommunityEvent;

describe("Google Calendar event link", () => {
  it("prepares a UTC event with encoded text, details and location", () => {
    const url = new URL(googleCalendarEventUrl(event)!);
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.pathname).toBe("/calendar/r/eventedit");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261016T180000Z/20261016T200000Z");
    expect(url.searchParams.get("text")).toBe("Circle & song");
    expect(url.searchParams.get("details")).toBe("Bring a friend + tea");
    expect(url.searchParams.get("location")).toContain("123 Main St");
  });
  it("does not offer Google Calendar for undated or invalid events", () => {
    expect(googleCalendarEventUrl({ ...event, startsAt: null })).toBeNull();
    expect(googleCalendarEventUrl({ ...event, startsAt: "oops" })).toBeNull();
  });
});

describe("calendar subscribe links", () => {
  it("Apple gets webcal://, Google gets the webcal URL encoded in cid", () => {
    expect(calendarSubscribeLinks("https://cohereboulder.org/calendar.ics")).toEqual({
      webcal: "webcal://cohereboulder.org/calendar.ics",
      google: "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fcohereboulder.org%2Fcalendar.ics",
    });
  });
  it("the Google link carries the whole feed URL back out, with no raw colon or slash in the query", () => {
    const { google } = calendarSubscribeLinks("https://cohere-signup-staging.unforced.workers.dev/calendar.ics");
    const url = new URL(google);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.search.slice(1)).not.toMatch(/[:/]/);
    expect(url.searchParams.get("cid")).toBe("webcal://cohere-signup-staging.unforced.workers.dev/calendar.ics");
  });
});
