// What the Calendar page shows, given every event it has and today's date. Pure, so the one rule
// that matters here can be tested: upcoming events always come first, and once the festival is over
// and nothing is upcoming, the page shows what happened rather than going blank.
import { denverDateKey, eventHasEnded, type CommunityEvent } from "./events";
import { FESTIVAL_FIRST, FESTIVAL_LAST, isFestivalDate } from "./festival";

/**
 *  live            before or during the festival, or nothing to look back on: the calendar as it always was
 *  happened        after the festival, nothing upcoming: the festival's events are the page
 *  upcoming-first  after the festival, something upcoming: that first, then the festival's events
 */
export type CalendarMode = "live" | "happened" | "upcoming-first";

export interface CalendarView {
  mode: CalendarMode;
  /** Not ended yet (or undated), in the order given. Listed apart only in `upcoming-first`. */
  upcoming: CommunityEvent[];
  /** The festival's own ended, uncancelled events. */
  happened: CommunityEvent[];
  /** What the day list, week grid and day picker work from. */
  shown: CommunityEvent[];
}

export function calendarView(events: CommunityEvent[], today: string, now: number): CalendarView {
  const upcoming = events.filter((e) => !eventHasEnded(e, now));
  const happened = events.filter((e) => e.status !== "cancelled" && eventHasEnded(e, now) && isFestivalDate(denverDateKey(e.startsAt) ?? ""));
  if (today > FESTIVAL_LAST && happened.length > 0) {
    // A cancelled event is not something to come to, so it doesn't hold the look back off the page.
    const mode = upcoming.some((e) => e.status !== "cancelled") ? "upcoming-first" : "happened";
    return { mode, upcoming: mode === "happened" ? [] : upcoming, happened, shown: happened };
  }
  // A year's old records must not crowd next year's calendar.
  const shown = events.filter((e) => !eventHasEnded(e, now) || (denverDateKey(e.startsAt) ?? "") >= FESTIVAL_FIRST);
  return { mode: "live", upcoming, happened, shown };
}

/** Evenly spaced picks, so a short teaser runs from the festival's opening to its close. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}
