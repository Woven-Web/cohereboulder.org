import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { EventRow } from "@/components/almanac/EventRow";
import { useLanguage } from "@/contexts/LanguageContext";
import { companionEvents } from "@/lib/api";
import { currentDenverDate } from "@/lib/companion";
import { denverDateKey } from "@/lib/events";
import { formatDay } from "@/lib/festival";
import { eventKey, useMyEvents } from "@/lib/myEvents";

const tomorrowOf = (today: string) => new Date(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/**
 * Where the 8 PM note lands: tomorrow's events, the ones you RSVP'd to first,
 * each with its own RSVP button (EventRow already carries it).
 */
export default function Tomorrow() {
  const { tr, language } = useLanguage();
  const events = useQuery({ queryKey: ["companion-events"], queryFn: companionEvents, retry: 1 });
  const mine = useMyEvents(events.data);
  const date = tomorrowOf(currentDenverDate());
  const tomorrow = (events.data ?? []).filter((e) => e.status !== "cancelled" && denverDateKey(e.startsAt) === date);
  const mineKeys = new Set(mine.items.map((i) => eventKey(i.event)));
  const going = tomorrow.filter((e) => mineKeys.has(eventKey(e)));
  const also = tomorrow.filter((e) => !mineKeys.has(eventKey(e)));
  const itemOf = (e: (typeof tomorrow)[number]) => mine.items.find((i) => eventKey(i.event) === eventKey(e)) ?? null;

  return (
    <AlmanacShell>
      <main className="page" style={{ paddingTop: 0 }}>
        <div className="folio" style={{ marginTop: ".9rem" }}>{tr("notify.tomorrow.folio")} · {formatDay(date, language, true)}</div>
        <h1 className="h1" style={{ margin: ".4rem 0" }}>{tr("notify.tomorrow.title")}</h1>
        <p className="small">{tr("notify.tomorrow.lede")}</p>
        {events.isLoading && <p className="small" role="status">{tr("notify.loading")}</p>}
        {events.isError && <p className="small" role="status">{tr("companion.offline")}</p>}
        {going.length > 0 && <div className="eyebrow" style={{ marginTop: "1.4rem" }}>{tr("notify.tomorrow.going")}</div>}
        {going.map((e) => <EventRow key={eventKey(e)} event={e} item={itemOf(e)} descLimit={0} />)}
        {also.length > 0 && <div className="eyebrow" style={{ marginTop: "1.4rem" }}>{tr(going.length ? "notify.tomorrow.also" : "notify.tomorrow.title")}</div>}
        {also.map((e) => <EventRow key={eventKey(e)} event={e} descLimit={0} />)}
        {!events.isLoading && !events.isError && tomorrow.length === 0 && <p className="lede" style={{ marginTop: "1rem" }}>{tr("notify.tomorrow.empty")}</p>}
        <p className="note"><Link className="link" style={{ minHeight: 0 }} to="/more/notifications">{tr("notify.tomorrow.settings")}</Link></p>
      </main>
    </AlmanacShell>
  );
}
