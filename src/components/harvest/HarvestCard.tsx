import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/components/almanac/shell-context";
import { HarvestMenu } from "@/components/harvest/HarvestMenu";
import { fill } from "@/components/almanac/format";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { currentDenverDate } from "@/lib/companion";
import { eventPath, type CommunityEvent } from "@/lib/events";
import { HARVESTS_KEY, MY_HARVESTS_KEY, RECENT_EVENTS_KEY, dismissHarvestCard, dismissedHarvestCards, fetchMyHarvests, fetchRecentEvents } from "@/lib/harvest";
import { eventKey, lookupSeats, useMyEvents } from "@/lib/myEvents";
import { shortName } from "@/components/harvest/names";

const denver = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "";

/**
 * "Yesterday you went to …": on Today, the morning after an event you RSVP'd
 * to, until you share or tap Not now. Members only (harvests are), and only
 * for events that ended in the last two days.
 */
export function HarvestCard() {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useCircleAccess();
  const member = access.status === "member";
  const recent = useQuery({ queryKey: RECENT_EVENTS_KEY, queryFn: fetchRecentEvents, enabled: member, staleTime: 60_000, retry: 1 });
  const mine = useQuery({ queryKey: MY_HARVESTS_KEY, queryFn: fetchMyHarvests, enabled: member, staleTime: 30_000, retry: 1 });
  const events: CommunityEvent[] = (recent.data ?? []).map((e) => ({
    did: e.did, rkey: e.rkey, name: e.name, imageUrl: null, startsAt: e.startsAt, endsAt: e.endsAt, description: null, status: null, mode: null,
    location: e.where ? { name: e.where } : null,
  }));
  const stored = useMyEvents(events);
  // regenOS RSVPs made on another phone aren't in this device's memory: ask regenOS about the few recent events.
  const seats = useQuery({
    queryKey: ["harvest-recent-seats", access.did, events.map(eventKey).join(",")],
    queryFn: () => lookupSeats(events),
    enabled: member && events.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const [dismissed, setDismissed] = useState<string[]>(dismissedHarvestCards);

  if (!member || !recent.data || !mine.data) return null;
  const went = new Set<string>([
    ...stored.items.filter((i) => i.source === "email" || i.seat === "confirmed").map((i) => eventKey(i.event)),
    ...Object.entries(seats.data ?? {}).filter(([, seat]) => seat === "confirmed").map(([key]) => key),
  ]);
  const shared = new Map(mine.data.map((h) => [`${h.eventDid}/${h.eventRkey}`, h.id]));
  const target = events.find((e) => went.has(eventKey(e)) && !dismissed.includes(eventKey(e)));
  if (!target) return null;

  const done = shared.has(eventKey(target));
  const name = shortName(target.name);
  const ended = denver(target.endsAt ?? target.startsAt);
  const today = currentDenverDate();
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const heading = tr(ended === today ? "notify.harvest.cardToday" : ended === yesterday ? "notify.harvest.cardYesterday" : "notify.harvest.cardEarlier");
  const base = eventPath(target);

  // Shared: say so once, then get out of the way (until the person dismisses it).
  if (done) {
    return (
      <section className="hvcard" aria-label={tr("notify.harvest.eyebrow")} data-testid="harvest-card" data-state="shared">
        <div className="eyebrow">{tr("notify.harvest.eyebrow")}</div>
        <h2>{fill(tr("notify.harvest.cardDone"), { name })}</h2>
        <div className="hvcard__acts">
          <Link className="btn btn--line btn--sm" to={`${base}#mine`}>{tr("notify.harvest.cardSee")}</Link>
          <button type="button" className="link" onClick={() => setDismissed(dismissHarvestCard(eventKey(target)))}>{tr("notify.harvest.cardNotNow")}</button>
          <HarvestMenu
            harvestId={shared.get(eventKey(target))!}
            onEdit={() => navigate(`${base}#edit`)}
            onDeleted={() => {
              void queryClient.invalidateQueries({ queryKey: HARVESTS_KEY });
              void queryClient.invalidateQueries({ queryKey: MY_HARVESTS_KEY });
              toast(tr("notify.harvest.deleted"));
            }}
          />
        </div>
      </section>
    );
  }
  return (
    <section className="hvcard" aria-label={tr("notify.harvest.eyebrow")} data-testid="harvest-card" data-state="invite">
      <div className="eyebrow">{tr("notify.harvest.eyebrow")}</div>
      <h2>{fill(heading, { name })}</h2>
      <p>{fill(tr("notify.harvest.promptEvent"), { name })}</p>
      <div className="hvcard__acts">
        <Link className="btn btn--primary" to={`${base}#composer`} data-testid="harvest-card-share">{tr("notify.harvest.cardShare")}</Link>
        <button type="button" className="link" data-testid="harvest-card-dismiss" onClick={() => setDismissed(dismissHarvestCard(eventKey(target)))}>{tr("notify.harvest.cardNotNow")}</button>
      </div>
    </section>
  );
}
