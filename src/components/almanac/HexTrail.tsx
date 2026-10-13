import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { FESTIVAL_DATES, formatDayA11y, trailState, weekdayTwo, type TrailState } from "@/lib/festival";
import { useLook, useTrailVariant } from "@/lib/look";
import { EcoRidges } from "./EcoRidges";
import { useWide } from "@/hooks/useWide";
import { fill } from "./format";
import { BottomSheet } from "./BottomSheet";

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
 *  - `pick` is Calendar's day picker, a horizontal listbox (arrows move focus;
 *    Enter, Space or a tap selects). Tick marks show how many of your events fall on each day.
 *
 * State is never colour alone: done = sun fill + check, today = ink fill + berry
 * ring, past/future = outline; the accessible name says it too.
 */
export function HexTrail({ variant, ...props }: Props & { variant: "fit" | "pick" }) {
  return variant === "fit" ? <FitSwitch {...props} /> : <PickTrail {...props} />;
}

/** ?trail=row swaps the phone's two zigzag rows for one compact row behind a day sheet; the Daylight keeps its straight row of links either way. */
function FitSwitch(props: Props) {
  const variant = useTrailVariant();
  const wide = useWide();
  const eco = useLook() === "ecology";
  if (variant === "row" && !wide) return <>{eco && <EcoRidges variant="trail" />}<RowTrail {...props} /></>;
  return <FitTrail {...props} />;
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
  const eco = useLook() === "ecology";
  return (
    <nav className="trail trail--fit" aria-label={tr("almanac.trailFit")}>
      {eco && <EcoRidges variant="trail" />}
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
  const homeIndex = Math.max(0, selected ? FESTIVAL_DATES.indexOf(selected) : FESTIVAL_DATES.indexOf(today));
  // Roving tabindex: arrows move this (and focus), they never select. Enter,
  // Space and click select, so passing over a day can't change the view.
  const [focusIndex, setFocusIndex] = useState(homeIndex);
  useEffect(() => setFocusIndex(homeIndex), [homeIndex]);

  function move(event: KeyboardEvent<HTMLElement>, index: number) {
    const last = FESTIVAL_DATES.length - 1;
    const next = event.key === "ArrowRight" ? Math.min(last, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    setFocusIndex(next);
    listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[next]?.focus();
  }

  const eco = useLook() === "ecology";
  return (
    <>
    {eco && <EcoRidges variant="trail" />}
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
    </>
  );
}

/**
 * The compact phone trail (?trail=row): eleven small marks in one row, drawn
 * for the eye only. The whole row is a single button; it opens a sheet whose
 * day links are 44px targets, so no hexagon needs a thumb of its own.
 */
function RowTrail({ today, done = [], counts = {} }: Props) {
  const { language, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const facts = FESTIVAL_DATES.map((date) => dayFacts(date, today, done, counts, language, tr));
  const todayFacts = facts.find((_, i) => FESTIVAL_DATES[i] === today);
  const label = [tr("almanac.trailFit"), todayFacts ? todayFacts.label : "", tr("look.trailOpen")].filter(Boolean).join(". ");
  return (
    <div className="trail trail--row">
      <button type="button" ref={openerRef} className="trail__open" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        <span className="trail__line" aria-hidden="true" />
        <span className="trail__marks" aria-hidden="true">
          {FESTIVAL_DATES.map((date, i) => (
            <span key={date} className="trail__mark" data-state={facts[i].state}>
              <span className="trail__hex"><span>{facts[i].state === "done" ? "✓" : ""}</span></span>
            </span>
          ))}
        </span>
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={tr("look.trailSheet")} onCloseAutoFocus={(event) => { event.preventDefault(); openerRef.current?.focus(); }}>
        <nav aria-label={tr("almanac.trailFit")}>
          <ol className="trail__sheetlist">
            {FESTIVAL_DATES.map((date, i) => (
              <li key={date}>
                <Link
                  to={`/calendar?day=${date}`}
                  className="trail__day trail__day--row"
                  data-state={facts[i].state}
                  aria-label={facts[i].label}
                  aria-current={date === today ? "date" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="trail__hex" aria-hidden="true"><span>{facts[i].state === "done" ? "✓" : 15 + i}</span></span>
                  <span className="trail__rowlab" aria-hidden="true">{formatDayA11y(date, language)}</span>
                  <span className="trail__rowflag" aria-hidden="true">{date === today ? tr("almanac.flagToday") : facts[i].state === "done" ? tr("almanac.flagDone") : ""}</span>
                  <Ticks n={facts[i].n} />
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <Link className="btn btn--line btn--block" to="/calendar" onClick={() => setOpen(false)}>{tr("look.trailCalendar")}</Link>
      </BottomSheet>
    </div>
  );
}
