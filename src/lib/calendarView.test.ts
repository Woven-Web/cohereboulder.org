import { describe, expect, it } from "vitest";
import { calendarView, spread } from "./calendarView";
import type { CommunityEvent } from "./events";

const AFTER = "2026-11-06";
const NOW = Date.parse("2026-11-06T19:00:00Z");
const event = (rkey: string, startsAt: string | null, extra: Partial<CommunityEvent> = {}): CommunityEvent => ({
  did: "did:plc:scene", rkey, name: rkey, imageUrl: null, startsAt,
  endsAt: startsAt ? new Date(Date.parse(startsAt) + 3_600_000).toISOString() : null,
  description: null, status: null, mode: null, location: null, ...extra,
});
const keys = (list: CommunityEvent[]) => list.map((e) => e.rkey);

const opening = event("opening", "2026-10-15T23:30:00Z");
const closing = event("closing", "2026-10-25T22:00:00Z");
const nextMonth = event("next-month", "2026-12-05T18:00:00Z");

describe("calendarView", () => {
  it("after the festival with nothing upcoming, the festival's events are the page", () => {
    const view = calendarView([opening, closing], AFTER, NOW);
    expect(view.mode).toBe("happened");
    expect(keys(view.shown)).toEqual(["opening", "closing"]);
  });

  it("anything upcoming comes first, and the festival stays below it", () => {
    const view = calendarView([opening, closing, nextMonth], AFTER, NOW);
    expect(view.mode).toBe("upcoming-first");
    expect(keys(view.upcoming)).toEqual(["next-month"]);
    expect(keys(view.happened)).toEqual(["opening", "closing"]);
  });

  it("an event under way counts as upcoming", () => {
    const underWay = event("under-way", "2026-11-06T18:30:00Z");
    expect(calendarView([opening, underWay], AFTER, NOW).mode).toBe("upcoming-first");
  });

  it("an undated event counts as upcoming", () => {
    expect(calendarView([opening, event("undated", null)], AFTER, NOW).mode).toBe("upcoming-first");
  });

  it("a cancelled future event doesn't hold the look back off the page, or appear in it", () => {
    const view = calendarView([opening, event("called-off", "2026-12-05T18:00:00Z", { status: "cancelled" })], AFTER, NOW);
    expect(view.mode).toBe("happened");
    expect(keys(view.shown)).toEqual(["opening"]);
  });

  it("a cancelled festival event isn't part of what happened", () => {
    const view = calendarView([opening, event("called-off", "2026-10-20T18:00:00Z", { status: "cancelled" })], AFTER, NOW);
    expect(keys(view.happened)).toEqual(["opening"]);
  });

  it("a postponed festival event isn't part of what happened", () => {
    const view = calendarView([opening, event("moved", "2026-10-20T18:00:00Z", { status: "postponed" })], AFTER, NOW);
    expect(keys(view.happened)).toEqual(["opening"]);
  });

  it("files a late-evening event under its Boulder day, not its UTC day", () => {
    // Oct 26 03:00 UTC is still the evening of Oct 25 in Boulder.
    const view = calendarView([event("late", "2026-10-26T03:00:00Z")], AFTER, NOW);
    expect(keys(view.happened)).toEqual(["late"]);
  });

  it("an ended event outside the festival isn't presented as part of it", () => {
    expect(calendarView([event("november", "2026-11-02T18:00:00Z")], AFTER, NOW).mode).toBe("live");
    expect(keys(calendarView([opening, event("november", "2026-11-02T18:00:00Z")], AFTER, NOW).happened)).toEqual(["opening"]);
  });

  it("with nothing to look back on, it stays the plain calendar", () => {
    const view = calendarView([nextMonth], AFTER, NOW);
    expect(view.mode).toBe("live");
    expect(keys(view.shown)).toEqual(["next-month"]);
  });

  it("during the festival it is the calendar as it always was, ended events included", () => {
    const during = Date.parse("2026-10-20T19:00:00Z");
    const view = calendarView([opening, closing], "2026-10-20", during);
    expect(view.mode).toBe("live");
    expect(keys(view.shown)).toEqual(["opening", "closing"]);
  });

  it("drops records older than the festival from the live calendar", () => {
    const before = Date.parse("2026-10-01T19:00:00Z");
    expect(keys(calendarView([event("old", "2025-10-17T18:00:00Z"), opening], "2026-10-01", before).shown)).toEqual(["opening"]);
  });
});

describe("spread", () => {
  it("runs from first to last, evenly", () => {
    expect(spread([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([1, 3, 5, 7]);
  });
  it("hands back a short list as it is", () => {
    expect(spread([1, 2], 4)).toEqual([1, 2]);
  });
});
