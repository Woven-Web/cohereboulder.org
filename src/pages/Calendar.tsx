import { RegistrationAction } from "@/components/RegistrationAction";
import { useEffect, useMemo, useState } from "react";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { HexTrail } from "@/components/almanac/HexTrail";
import { YourNextStrip } from "@/components/almanac/YourNextStrip";
import { EventRow } from "@/components/almanac/EventRow";
import { fill, useMedia } from "@/components/almanac/format";
import { CalendarWeek } from "@/components/almanac/CalendarWeek";
import { seatOf } from "@/components/almanac/seat";
import { FESTIVAL_DATES, formatDay, isFestivalDate, practiceDoneDays } from "@/lib/festival";
import { useLook } from "@/lib/look";
import { currentDenverDate } from "@/lib/companion";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { LumaCalendar } from "@/components/LumaCalendar";
import { RegenosSignInPanel } from "@/components/RegenosSignInPanel";
import { CommunityEventForm } from "@/components/CommunityEventForm";
import { CalendarMonthView } from "@/components/CalendarMonthView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { useAuthState, useMyRegistration } from "@/hooks/useRegenos";
import { describeWriteError, fetchSceneRoster, xrpcPost } from "@/lib/regenos";
import { canHostScene } from "@/lib/hostAccess";
import { buildDeleteEventInput } from "@/lib/eventForm";
import { useMyEvents, removeMyEvent, eventKey } from "@/lib/myEvents";
import { fetchCommunityCalendar, type CommunityEvent, denverDateKey } from "@/lib/events";

const VIEW_KEY = "cohere.calendar.view";
/** How long a first paint waits for a member's RSVP lookups before showing the list without them. */
const SEAT_WAIT_MS = 1200;
function readView(): "day" | "week" | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "day" || v === "week" ? v : null;
  } catch { return null; }
}

export default function CalendarPage() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["community-calendar", "with-past"],
    queryFn: () => fetchCommunityCalendar({ past: true }),
  });

  // The regenOS hosting lane — entirely absent until the Worker's
  // REGENOS_LOGIN_ENABLED flag is on (useSiteConfig reads /api/config), so
  // this page renders its pre-phase-2 self by default.
  const { config, laneOn: hostingOn, session, signedIn, pending: authPending } = useAuthState();
  const { data: registration, isLoading: registrationLoading } = useMyRegistration();
  const today = currentDenverDate();
  const mine = useMyEvents(data?.events);
  const [params, setParams] = useSearchParams();
  const dayParam = isFestivalDate(params.get("day") ?? "") ? params.get("day") : null;
  // Every date is listed by default; "My events" narrows the same day's list to what you RSVP'd to.
  const [mode, setMode] = useState<"my" | "all">(params.get("mine") === "1" ? "my" : "all");
  // "My events · n" under Your next links here with ?mine=1, also from this page.
  const mineParam = params.get("mine") === "1";
  useEffect(() => { if (mineParam) setMode("my"); }, [mineParam]);
  const [allDates, setAllDates] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  // Week is the default from 1024px, Day on phones and tablets; a choice the visitor makes sticks.
  const [chosenView, setChosenView] = useState<"day" | "week" | null>(readView);
  // The view lives in the URL (?view=day|week), so a reload or a shared link shows what was on screen.
  // With no ?view, picking a day (picker, trail, the week's header, or a link with ?day=) shows that day, whichever view is the default.
  const viewParam = params.get("view");
  const urlView = viewParam === "day" || viewParam === "week" ? viewParam : null;
  const xl = useMedia("(min-width: 1024px)");
  // Only the ecology look defaults to the week; every other look keeps the day list unless the visitor picks the week.
  const eco = useLook() === "ecology";
  const view: "day" | "week" = urlView ?? (dayParam ? "day" : chosenView ?? (xl && eco ? "week" : "day"));
  function setView(next: "day" | "week") {
    setChosenView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* private mode: the choice just lasts this visit */ }
    setParams(dayParam ? { day: dayParam, view: next } : { view: next }, { replace: true });
  }
  const hasMine = mine.items.length > 0;
  const showingMine = hasMine && mode === "my";
  // Inside the festival the picker opens on today; outside it, every date.
  const selectedDay = dayParam ?? (allDates ? null : isFestivalDate(today) ? today : null);
  const done = useMemo(() => practiceDoneDays(), []);
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of mine.items) { const d = denverDateKey(i.event.startsAt); if (d) out[d] = (out[d] ?? 0) + 1; }
    return out;
  }, [mine.items]);
  const nextItems = useMemo(() => mine.items
    .filter((i) => i.event.status !== "cancelled" && i.event.startsAt && Date.parse(i.event.endsAt ?? i.event.startsAt) > Date.now())
    .map((i) => ({ event: i.event, seat: seatOf(i) })), [mine.items]);

  function pickDay(date: string) {
    setAllDates(false);
    setParams({ day: date }, { replace: true });
  }
  function showEveryDate() {
    setAllDates(true);
    // Every date is a Day-view list; on a laptop, where Week may be the default, say so in the URL.
    setParams(xl ? { view: "day" } : {}, { replace: true });
  }

  const allEvents = data?.events ?? [];
  const weekMode = xl && view === "week";
  // The week needs a day to anchor on: the chosen one, today in the festival, else day one.
  const weekDay = selectedDay ?? (isFestivalDate(today) ? today : FESTIVAL_DATES[0]);
  const dayEvents = selectedDay ? allEvents.filter((e) => denverDateKey(e.startsAt) === selectedDay) : allEvents;
  const mineKeys = new Set(mine.items.map((i) => eventKey(i.event)));
  const dayMineCount = dayEvents.filter((e) => mineKeys.has(eventKey(e))).length;
  const listed = showingMine ? dayEvents.filter((e) => mineKeys.has(eventKey(e))) : dayEvents;
  const itemFor = (event: CommunityEvent) => mine.items.find((i) => i.event.rkey === event.rkey && i.event.did === event.did);
  const byDay = new Map<string, CommunityEvent[]>();
  for (const e of listed) { const k = denverDateKey(e.startsAt) ?? ""; byDay.set(k, [...(byDay.get(k) ?? []), e]); }
  const groups = [...byDay.entries()].sort(([x], [y]) => x.localeCompare(y));
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["scene-roster", config?.collectiveDid, session?.did],
    queryFn: () => fetchSceneRoster(config!.collectiveDid!),
    enabled: hostingOn && signedIn && Boolean(config?.collectiveDid),
    staleTime: 30_000,
  });
  const canHostCollective = canHostScene(session?.did ?? null, roster);
  const canCreate = hostingOn && signedIn && Boolean(config?.collectiveDid) && canHostCollective;
  // First paint: the trail and a loading line until the events, who this is and (signed in) their RSVPs are
  // all in, then the list arrives whole. The host card and the footer wait too: drawn early, they would sit
  // in view under "Loading events…" and be pushed down when the list lands.
  // Once in, they stay: a later refetch (after a delete, a sign-in, a new RSVP) must not blank the page again.
  // A device with no remembered RSVPs (myEvents' seat cache) waits for the lookups, but not for long:
  // they are one regenOS call per upcoming event, and the list matters more than a still layout.
  const [listSeen, setListSeen] = useState(false);
  const [allSeen, setAllSeen] = useState(false);
  const [seatWaitOver, setSeatWaitOver] = useState(false);
  const basicsIn = !isLoading && !authPending;
  useEffect(() => {
    if (!basicsIn || !mine.isLoading) return;
    const timer = window.setTimeout(() => setSeatWaitOver(true), SEAT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [basicsIn, mine.isLoading]);
  const listReady = listSeen || (basicsIn && (!mine.isLoading || seatWaitOver));
  const ready = allSeen || (listReady && !authPending && (!signedIn || (!rosterLoading && !registrationLoading)));
  if (listReady && !listSeen) setListSeen(true);
  if (ready && !allSeen) setAllSeen(true);

  /** Which host surface is open: the sign-in panel, the create form, or an edit. */
  const [panel, setPanel] = useState<"none" | "signIn" | "create">("none");
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [deletingRkey, setDeletingRkey] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  // The public "Propose an event" path is available to everyone. Only
  // builders and stewards of the collective see direct create/edit controls;
  // the AppView remains the final authority on writes.
  const canManage = (event: CommunityEvent): boolean =>
    signedIn && canHostCollective && (event.did === session?.did || event.did === config?.collectiveDid);

  async function handleDelete(event: CommunityEvent) {
    if (!window.confirm(tr("calendar.host.confirmDelete"))) return;
    setDeletingRkey(event.rkey);
    setManageError(null);
    try {
      await xrpcPost(
        "social.scenius.deleteEvent",
        buildDeleteEventInput({ authority: event.did, rkey: event.rkey }),
      );
      if (editing?.rkey === event.rkey) setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["community-calendar"] });
    } catch (err) {
      setManageError(describeWriteError(err, tr));
    } finally {
      setDeletingRkey(null);
    }
  }

  const trail = <HexTrail variant="pick" today={today} done={done} counts={counts} selected={selectedDay} onSelect={pickDay} />;

  const countLabel = (n: number) => (n === 1 ? tr("almanac.eventCountOne") : fill(tr("almanac.eventsCount"), { n }));

  const hostControlsFor = (event: CommunityEvent) => canManage(event) && (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 gap-2"
        onClick={() => {
          setPanel("none");
          setEditing(event);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
        {tr("calendar.host.editButton")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 gap-2 text-destructive"
        disabled={deletingRkey === event.rkey}
        onClick={() => handleDelete(event)}
      >
        {deletingRkey === event.rkey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {tr("calendar.host.deleteButton")}
      </Button>
    </>
  );

  const row = (event: CommunityEvent) => {
    const item = itemFor(event);
    return (
      <div key={`${event.did}/${event.rkey}`}>
        <EventRow
          event={event}
          item={item ?? null}
          showSource={showingMine}
          descLimit={showingMine ? 100 : 120}
          hostControls={hostControlsFor(event) || undefined}
        />
        {showingMine && item?.source === "email" && (
          <Button variant="ghost" size="sm" className="-mt-1 mb-2 text-muted-foreground" onClick={() => removeMyEvent(event)} data-testid="my-events-remove">
            {tr("calendar.events.myEventsRemove")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <AlmanacShell footer={ready}>
      <main className="page" style={{ paddingTop: 0 }}>
        <div style={{ paddingTop: ".9rem", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
          <h1 className="h1">{tr("almanac.calTitle")}</h1>
          <span className="mono small" style={{ fontSize: ".78em", whiteSpace: "nowrap" }}>{tr("almanac.boulderTime")}</span>
        </div>

        {/* A host's create/edit form stays on top: Edit scrolls here. */}
        {hostingOn && signedIn && (panel === "create" || editing) && (
          <div className="my-6 space-y-4">
            {panel === "create" && config?.collectiveDid && canCreate && (
              <CommunityEventForm authority={config.collectiveDid} event={null} onDone={() => setPanel("none")} onCancel={() => setPanel("none")} />
            )}
            {editing && (
              <CommunityEventForm authority={editing.did} event={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
            )}
          </div>
        )}

        {!listReady ? (
          <>
            {trail}
            <p className="small" role="status" style={{ padding: "3rem 0", textAlign: "center" }} data-testid="calendar-loading">{tr("calendar.events.loading")}</p>
          </>
        ) : data?.source === "regenos" ? (
          <>
            {trail}
            <div className={`flow2 flow2--side${hasMine ? "" : " flow2--solo"}`} style={{ marginTop: ".4rem" }}>
              {hasMine && <div className="flow2__a">
                <div className="o1">
                  {hasMine && (
                    <div data-testid="my-events-toggle">
                      <div className="seg" role="group" aria-label={tr("almanac.segLabel")}>
                        <button type="button" aria-pressed={!showingMine} onClick={() => setMode("all")}>{tr("almanac.allEvents")}<span className="count">{dayEvents.length}</span></button>
                        <button type="button" aria-pressed={showingMine} onClick={() => setMode("my")}>{tr("calendar.events.myEventsFilter")}<span className="count">{dayMineCount}</span></button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="o2">{hasMine && <YourNextStrip items={nextItems} total={mine.items.length} today={today} />}</div>
                <div className="o4">
                  {hasMine && (
                    <p className="note">
                      {tr("calendar.events.myEventsSource")}
                      {showingMine && <> {tr("calendar.events.myEventsRemoveNote")}</>}
                    </p>
                  )}
                </div>
              </div>}
              <div className="flow2__b">
                <div className="o3">
                  {xl && (
                    <div className="seg cal-view" role="group" aria-label={tr("look.calView")}>
                      <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>{tr("look.calDay")}</button>
                      <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>{tr("look.calWeek")}</button>
                    </div>
                  )}
                  {weekMode ? (
                    <CalendarWeek
                      events={showingMine ? allEvents.filter((e) => mineKeys.has(eventKey(e))) : allEvents}
                      mineKeys={showingMine ? undefined : mineKeys}
                      day={weekDay}
                      today={today}
                      onPick={pickDay}
                      onWeek={(date) => { setAllDates(false); setParams({ day: date, view: "week" }, { replace: true }); }}
                    />
                  ) : selectedDay ? (
                    <>
                      <div className="agenda-head">
                        <h2 className="h2" style={{ fontSize: "calc(1.5 * var(--u))" }}>{formatDay(selectedDay, language, true)}</h2>
                        <span className="mono small" style={{ fontSize: ".78em", whiteSpace: "nowrap" }} data-testid="agenda-count">
                          {hasMine && <>{tr(showingMine ? "calendar.events.myEventsFilter" : "almanac.allEvents")} · </>}{countLabel(listed.length)}
                        </span>
                      </div>
                      {listed.length === 0 && <p className="lede" style={{ marginTop: ".8rem" }}>{tr(showingMine && dayEvents.length > 0 ? "almanac.emptyMineDay" : "almanac.emptyDay")}</p>}
                      <div className="cal-list">{listed.map(row)}</div>
                      <button type="button" className="link" style={{ marginTop: ".6rem", display: "block" }} onClick={showEveryDate}>{tr("almanac.showEveryDate")}</button>
                    </>
                  ) : (
                    groups.map(([date, list]) => (
                      <section key={date || "undated"} className="daygroup" id={`g-${date}`}>
                        <div className="daygroup__head">
                          <h2>{date ? formatDay(date, language, true) : tr("calendar.events.undated")}</h2>
                          <span>{countLabel(list.length)}</span>
                        </div>
                        <div className="cal-list">{list.map(row)}</div>
                      </section>
                    ))
                  )}
                  {!weekMode && groups.length === 0 && !selectedDay && <p className="lede" style={{ marginTop: ".8rem" }}>{tr("almanac.emptyDay")}</p>}
                  <button type="button" className="link" style={{ marginTop: ".8rem", display: "block" }} aria-expanded={showMonth} onClick={() => setShowMonth((v) => !v)}>{tr("almanac.monthView")}</button>
                  {showMonth && <div className="mt-3"><CalendarMonthView events={allEvents} /></div>}
                  {data.icsUrl && <div style={{ marginTop: ".6rem" }}><CalendarSubscribe feedUrl={data.icsUrl} /></div>}
                </div>
              </div>
            </div>
          </>
        ) : (
          <LumaCalendar />
        )}

        {/* Until we know who this is, nothing: the signed-out wording must not flash at a member. */}
        {ready && <div data-testid="calendar-host">
          {/* Propose an event: no account needed, lands in the organizers'
              approval queue. */}
          {!canCreate && <Card className="w-full mx-auto mt-12 bg-paper-3 border-ink/40 shadow-none">
            <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <Sparkles className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
              <p className="text-sm text-ink-2 flex-1">{tr(signedIn ? "calendar.proposeCallout.signedInText" : "calendar.proposeCallout.text")}</p>
              <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
                <Link to="/propose">{tr("calendar.proposeCallout.button")}</Link>
              </Button>
            </CardContent>
          </Card>}

          {/* Hosting: only exists when the regenOS lane is enabled. */}
          {hostingOn && (
            <div className={signedIn ? "mt-12 space-y-4" : "mt-2 space-y-4"}>
              {signedIn ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {!registration?.registered && <RegistrationAction className="btn btn--primary" />}
                    {/* No collective DID means nothing to create an event
                        under, so don't offer a button that does nothing. */}
                    {panel !== "create" && !editing && canCreate && (
                      <Button variant="community" size="sm" className="min-h-11 gap-2" onClick={() => { setEditing(null); setPanel("create"); }}>
                        <CalendarPlus className="h-4 w-4" />
                        {tr("calendar.host.addEvent")}
                      </Button>
                    )}
                  </div>
                  {manageError && <p className="text-sm text-destructive text-center">{manageError}</p>}
                </>
              ) : panel === "signIn" ? (
                <RegenosSignInPanel />
              ) : (
                <div className="text-center space-y-2">
                  <span className="text-sm">{tr("calendar.proposeCallout.accountPrompt")}</span>{" "}
                  <Button variant="link" size="sm" className="min-h-11 px-1 underline font-semibold" onClick={() => setPanel("signIn")}>
                    {tr("calendar.proposeCallout.signIn")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>}
      </main>
    </AlmanacShell>
  );
}
