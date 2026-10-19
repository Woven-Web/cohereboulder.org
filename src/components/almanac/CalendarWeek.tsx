import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventPath, denverDateKey, type CommunityEvent } from "@/lib/events";
import { FESTIVAL_DATES, denverMinutes, formatDay, formatMinutes, weekdayTwo } from "@/lib/festival";
import { fill, weekOf } from "./format";

interface Props {
  events: CommunityEvent[];
  /** `did/rkey` of the events on my list, marked in the grid. */
  mineKeys?: Set<string>;
  day: string;
  today: string;
  /** A day header was pressed: open that day. */
  onPick: (date: string) => void;
  /** Step to the other week of the festival. */
  onWeek: (date: string) => void;
}

/**
 * The wide screen's week: one column per day, each event a compact chip (time
 * and title) that opens its page. The festival's ten days fall in two
 * weeks, so the arrows step between them.
 */
export function CalendarWeek({ events, mineKeys, day, today, onPick, onWeek }: Props) {
  const { tr, language } = useLanguage();
  const days = weekOf(day);
  const first = FESTIVAL_DATES.indexOf(days[0]) === 0;
  const other = first ? FESTIVAL_DATES[7] : FESTIVAL_DATES[0];
  const now = Date.now();
  const live = events.filter((e) => e.status !== "cancelled");
  const label = fill(tr("look.weekOf"), { a: formatDay(days[0], language), b: formatDay(days[days.length - 1], language) });
  return (
    <section className="week" aria-label={label} data-testid="calendar-week">
      <div className="week__bar">
        <span className="mono">{label}</span>
        <button type="button" className="link" onClick={() => onWeek(other)} data-testid="week-step">
          {first ? `${tr("look.weekNext")} →` : `← ${tr("look.weekPrev")}`}
        </button>
      </div>
      <ol className="week__cols" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((date) => {
          const list = live.filter((e) => denverDateKey(e.startsAt) === date).sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""));
          return (
            <li key={date} className="week__col" data-today={date === today ? "" : undefined}>
              <button type="button" className="week__head" aria-current={date === today ? "date" : undefined} onClick={() => onPick(date)}>
                <span>{weekdayTwo(date, language)}</span><b>{date.slice(8)}</b>
                {list.length > 0 && <em>{list.length}</em>}
              </button>
              {list.length === 0 && <p className="week__none" aria-label={tr("look.weekEmpty")}>·</p>}
              {list.map((e) => (
                <Link key={`${e.did}/${e.rkey}`} className="week__ev" to={eventPath(e)} title={e.name} data-mine={mineKeys?.has(`${e.did}/${e.rkey}`) ? "" : undefined} data-past={Date.parse(e.endsAt ?? e.startsAt ?? "") < now ? "" : undefined}>
                  <span className="mono">{e.startsAt ? formatMinutes(denverMinutes(new Date(e.startsAt)), language) : ""}</span>
                  {/* Each word is its own box: lines break between words only, and a word wider than the chip ends in "…" in every browser. */}
                  <b>{e.name.split(/(\s+)/).filter(Boolean).map((part, i) => (/^\s+$/.test(part) ? " " : <span key={i} className="week__word">{part}</span>))}</b>
                </Link>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
