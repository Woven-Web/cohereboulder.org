import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventPath, type CommunityEvent } from "@/lib/events";
import { denverMinutes, formatDay, formatMinutes } from "@/lib/festival";
import { denverDateKey } from "@/lib/events";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { openSignInDialog } from "@/lib/signin";
import { fill } from "./format";
import { SeatBadge } from "./SeatBadge";
import type { Seat } from "./seat";

export interface NextItem { event: CommunityEvent; seat: Seat }

interface Props {
  items: NextItem[];
  /** How many events are on your list in all (including past ones). */
  total: number;
  today: string;
}

/**
 * "Your next": the events you said yes to, soonest first. A swipeable rail on
 * phones, a wrapping row on the Daylight. Empty, it says how to fill it.
 */
export function YourNextStrip({ items, total, today }: Props) {
  const { tr, language } = useLanguage();
  const now = Date.now();
  const { data: config } = useSiteConfig();
  const loginOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(loginOn);
  if (items.length === 0 && !session?.did) {
    // Nobody to keep a list for yet: point at the two ways to become someone.
    return (
      <section className="next" aria-label={tr("almanac.yourNextLabel")} data-testid="next-signed-out">
        <div className="eyebrow">{tr("almanac.yourNext")}</div>
        <p className="small" style={{ marginTop: ".5rem" }}>{tr("look.home.nextSignedOut")}</p>
        <p className="small" style={{ marginTop: ".3rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Link className="link" to="/register">{tr("members.gate.join")}</Link>
          {loginOn && <button type="button" className="link" onClick={openSignInDialog}>{tr("look.home.nextSignIn")}</button>}
          <Link className="link" to="/calendar">{tr("almanac.browseCalendar")}</Link>
        </p>
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section className="next" aria-label={tr("almanac.yourNextLabel")}>
        <div className="eyebrow">{tr("almanac.yourNext")}</div>
        <p className="small" style={{ marginTop: ".5rem" }}>
          {tr("almanac.yourNextEmpty")} <Link className="link" to="/calendar">{tr("almanac.browseCalendar")}</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="next" aria-label={tr("almanac.yourNextLabel")} data-testid="your-next">
      <div className="next__head"><div className="eyebrow" style={{ flex: 1 }}>{tr("almanac.yourNext")}</div></div>
      <ul className="next__rail">
        {items.map(({ event, seat }) => {
          const date = denverDateKey(event.startsAt);
          const start = event.startsAt ? new Date(event.startsAt) : null;
          const minutesUntil = start ? Math.round((start.getTime() - now) / 60000) : 0;
          const when = minutesUntil > 0 && minutesUntil < 180 ? fill(tr("almanac.inMinutes"), { n: minutesUntil }) : date === today ? tr("almanac.todayLower") : date ? formatDay(date, language) : "";
          return (
            <li key={`${event.did}/${event.rkey}`} className="next__cell">
              <Link className="next__item" to={eventPath(event)}>
                <div className="next__when">
                  <span>{start ? formatMinutes(denverMinutes(start), language) : ""}</span>
                  <em>{when}</em>
                </div>
                <div className="next__title">{event.name}</div>
                {event.location?.name && <div className="next__meta">{event.location.name}</div>}
                <div className="next__foot"><SeatBadge seat={seat} /><span className="small">{tr("almanac.details")} →</span></div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="small" style={{ marginTop: ".2rem" }}>
        <Link className="link" to="/calendar">{fill(tr("almanac.allMine"), { n: total })} →</Link>
      </p>
    </section>
  );
}
