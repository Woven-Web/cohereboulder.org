import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventPath, denverDateKey, type CommunityEvent } from "@/lib/events";
import { denverMinutes, formatDay, formatMinutes, weekdayTwo } from "@/lib/festival";
import { fill, weekOf } from "./format";

/** The wide screen's week: one column per day, each event a link to its page. */
export function CalendarWeek({ events, day, today, onPick }: { events: CommunityEvent[]; day: string; today: string; onPick: (date: string) => void }) {
  const { tr, language } = useLanguage();
  const days = weekOf(day);
  const live = events.filter((e) => e.status !== "cancelled");
  return (
    <section className="week" aria-label={fill(tr("look.weekOf"), { a: formatDay(days[0], language), b: formatDay(days[days.length - 1], language) })} data-testid="calendar-week">
      <ol className="week__cols" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((date) => {
          const list = live.filter((e) => denverDateKey(e.startsAt) === date).sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""));
          return (
            <li key={date} className="week__col" data-today={date === today ? "" : undefined}>
              <button type="button" className="week__head" aria-current={date === today ? "date" : undefined} onClick={() => onPick(date)}>
                <span>{weekdayTwo(date, language)}</span><b>{date.slice(8)}</b>
              </button>
              {list.length === 0 && <p className="week__none">{tr("look.weekEmpty")}</p>}
              {list.map((e) => (
                <Link key={`${e.did}/${e.rkey}`} className="week__ev" to={eventPath(e)}>
                  <span className="mono">{e.startsAt ? formatMinutes(denverMinutes(new Date(e.startsAt)), language) : ""}</span>
                  <b>{e.name}</b>
                </Link>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
