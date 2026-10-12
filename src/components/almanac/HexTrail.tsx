import { useRef, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { FESTIVAL_DATES, formatDayA11y, trailState, weekdayTwo, type TrailState } from "@/lib/festival";
import { fill } from "./format";

interface Props {
  /** Denver calendar day, "YYYY-MM-DD". */
  today: string;
  /** Days whose practice was marked done on this device. */
  done?: string[];
  /** Your RSVP count per day, drawn as berry ticks. */
  counts?: Record<string, number>;
  /** pick only: the selected day, or null when showing every date. */
  selected?: string | null;
  onSelect?: (date: string) => void;
}

/**
 * The festival's spine: eleven hexagons, one per day (the logo's shape).
 *
 *  - `fit`  is Today's progress header, a <nav> of links. The hexes zigzag over
 *    two rows so every link is a 44px target even with all eleven on a 360px
 *    screen.
 *  - `pick` is Calendar's day picker, a horizontal listbox (arrows move and
 *    select). Tick marks show how many of your events fall on each day.
 *
 * State is never colour alone: done = sun fill + check, today = ink fill + berry
 * ring, past/future = outline; the accessible name says it too.
 */
export function HexTrail({ variant, ...props }: Props & { variant: "fit" | "pick" }) {
  return variant === "fit" ? <FitTrail {...props} /> : <PickTrail {...props} />;
}

function dayFacts(date: string, today: string, done: string[], counts: Record<string, number>, lang: "en" | "es", tr: (k: string) => string) {
  const state: TrailState = trailState(date, today, done);
  const n = counts[date] ?? 0;
  const bits = [formatDayA11y(date, lang)];
  if (date === today) bits.push(tr("almanac.flagToday"));
  if (done.includes(date)) bits.push(tr("almanac.flagDone"));
  if (n) bits.push(fill(tr("almanac.yourEventsCount"), { n }));
  return { state, n, label: bits.join(", ") };
}

function Hex({ children }: { children: React.ReactNode }) {
  return <span className="trail__hex"><span>{children}</span></span>;
}

function Ticks({ n }: { n: number }) {
  return (
    <span className="trail__ticks" aria-hidden="true">
      {Array.from({ length: Math.min(n, 3) }, (_, i) => <i key={i} />)}
    </span>
  );
}

function FitTrail({ today, done = [], counts = {} }: Props) {
  const { language, tr } = useLanguage();
  return (
    <nav className="trail trail--fit" aria-label={tr("almanac.trailFit")}>
      <svg className="trail__path" viewBox="0 0 11 2" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <polyline points={FESTIVAL_DATES.map((_, i) => `${i + 0.5},${i % 2 ? 1.33 : 0.33}`).join(" ")} />
      </svg>
      <ol className="trail__days">
        {FESTIVAL_DATES.map((date, i) => {
          const f = dayFacts(date, today, done, counts, language, tr);
          const isToday = date === today;
          return (
            <li key={date} className={i % 2 ? "r2" : "r1"} style={{ gridColumn: i + 1 }}>
              <Link
                to={`/calendar?day=${date}`}
                className="trail__day"
                data-state={f.state}
                aria-label={f.label}
                aria-current={isToday ? "date" : undefined}
              >
                <Hex>{f.state === "done" ? "✓" : 15 + i}</Hex>
                <span className="trail__lab">{isToday ? tr("almanac.labToday") : weekdayTwo(date, language)}</span>
                <Ticks n={f.n} />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PickTrail({ today, done = [], counts = {}, selected = null, onSelect }: Props) {
  const { language, tr } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const focusIndex = Math.max(0, selected ? FESTIVAL_DATES.indexOf(selected) : FESTIVAL_DATES.indexOf(today));

  function move(event: KeyboardEvent<HTMLElement>, index: number) {
    const last = FESTIVAL_DATES.length - 1;
    const next = event.key === "ArrowRight" ? Math.min(last, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    onSelect?.(FESTIVAL_DATES[next]);
    window.requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[next]?.focus());
  }

  return (
    <div className="trail trail--pick" id="trail">
      <span className="trail__line" aria-hidden="true" />
      <div ref={listRef} className="trail__days" role="listbox" aria-orientation="horizontal" aria-label={tr("almanac.trailPick")}>
        {FESTIVAL_DATES.map((date, i) => {
          const f = dayFacts(date, today, done, counts, language, tr);
          const isSelected = selected === date;
          return (
            <button
              key={date}
              type="button"
              role="option"
              className="trail__day"
              data-state={f.state}
              aria-selected={isSelected}
              aria-label={f.label}
              tabIndex={i === focusIndex ? 0 : -1}
              onClick={() => onSelect?.(date)}
              onKeyDown={(e) => move(e, i)}
            >
              <Hex>{15 + i}</Hex>
              <span className="trail__lab">{date === today ? tr("almanac.labToday") : weekdayTwo(date, language)}</span>
              <Ticks n={f.n} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
