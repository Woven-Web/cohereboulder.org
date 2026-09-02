import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { denverDateKey, eventPath, type CommunityEvent } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * A hand-rolled month grid — no calendar library, just the JS Date API.
 *
 * The only place a timezone matters is (a) which day is "today" and (b)
 * which calendar day an event's instant falls on — both go through
 * `denverDateKey`, so an event at 11pm MDT lands on the right square even
 * though the browser rendering the page may be anywhere. The grid's own day
 * numbers need no timezone conversion at all: "the 15th of October" is the
 * 15th of October everywhere, so the days-in-month / weekday-of-1st math
 * below just uses plain local `Date` arithmetic.
 */

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function firstWeekday(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay(); // 0 = Sunday
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function gridDayKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function addMonths(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];
const MAX_VISIBLE_PER_DAY = 3;

export function CalendarMonthView({ events }: { events: CommunityEvent[] }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const todayKey = denverDateKey(new Date().toISOString());
  const [today] = useState(() => {
    const [y, m] = (todayKey ?? "1970-01-01").split("-").map(Number);
    return { year: y, monthIndex: m - 1 };
  });
  const [cursor, setCursor] = useState(today);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CommunityEvent[]>();
    for (const event of events) {
      const key = denverDateKey(event.startsAt);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    }
    return map;
  }, [events]);

  const monthLabel = new Intl.DateTimeFormat(language === "es" ? "es" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(cursor.year, cursor.monthIndex, 1));

  const weekdayLabels = WEEKDAY_INDEXES.map((i) =>
    new Intl.DateTimeFormat(language === "es" ? "es" : "en-US", { weekday: "short" }).format(
      new Date(2024, 0, 7 + i), // a known Sunday
    ),
  );

  const totalDays = daysInMonth(cursor.year, cursor.monthIndex);
  const leadingBlanks = firstWeekday(cursor.year, cursor.monthIndex);
  const cells: Array<{ day: number; key: string } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => ({
      day: i + 1,
      key: gridDayKey(cursor.year, cursor.monthIndex, i + 1),
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthHasEvents = cells.some((cell) => cell && (eventsByDay.get(cell.key)?.length ?? 0) > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          aria-label={tr("calendar.events.prevMonth")}
          onClick={() => setCursor((c) => addMonths(c.year, c.monthIndex, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
        <Button
          variant="outline"
          size="icon"
          aria-label={tr("calendar.events.nextMonth")}
          onClick={() => setCursor((c) => addMonths(c.year, c.monthIndex, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs font-medium text-muted-foreground">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="min-h-[84px] rounded-md bg-transparent" />;
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={i}
              className={cn(
                "min-h-[84px] rounded-md border p-1 sm:p-1.5 bg-card",
                isToday && "ring-2 ring-primary border-primary",
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium mb-1",
                  isToday ? "text-primary font-bold" : "text-foreground",
                )}
              >
                {cell.day}
              </p>
              <div className="space-y-1">
                {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((event) => (
                  <Link
                    key={`${event.did}/${event.rkey}`}
                    to={eventPath(event)}
                    title={event.name}
                    className="block truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] sm:text-[11px] leading-tight text-primary hover:bg-primary/20 transition-colors"
                  >
                    {event.name}
                  </Link>
                ))}
                {dayEvents.length > MAX_VISIBLE_PER_DAY && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    +{dayEvents.length - MAX_VISIBLE_PER_DAY} {tr("calendar.events.more")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!monthHasEvents && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          {tr("calendar.events.noEventsThisMonth")}
        </p>
      )}
    </div>
  );
}
