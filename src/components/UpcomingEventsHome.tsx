import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/EventCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { eventPath, fetchCommunityCalendar, formatEventDate, formatEventTimeRange, locationLine } from "@/lib/events";
import { calendarView, spread } from "@/lib/calendarView";
import { currentDenverDate } from "@/lib/companion";
import { FESTIVAL_LAST } from "@/lib/festival";
import { useLook } from "@/lib/look";
import { duringGathering, fill } from "@/components/almanac/format";

/** How many cards the homepage teaser shows before pointing to /calendar. */
const HOME_EVENT_COUNT = 4;

/**
 * The homepage's "What's coming up" teaser. After the festival, with nothing
 * upcoming, it looks back at what happened instead, from the opening to the
 * close. Otherwise it renders nothing at all — no heading, no empty card — when
 * there is no regenOS-backed event to show, so a quiet calendar never leaves a
 * hollow section on the landing page. (The Luma fallback lives on /calendar
 * itself, not here.)
 */
export function UpcomingEventsHome() {
  const { language } = useLanguage();
  const look = useLook();
  const almanac = look !== "classic";
  const eco = look === "ecology";
  const tr = (key: string) => getTranslation(key, language);

  const { data } = useQuery({
    queryKey: ["community-calendar"],
    queryFn: () => fetchCommunityCalendar(),
  });

  // Only an empty upcoming list after the festival asks for the ended events: the common path stays one read.
  const today = currentDenverDate();
  const nothingUpcoming = data?.source === "luma";
  const { data: withPast } = useQuery({
    queryKey: ["community-calendar", "with-past"],
    queryFn: () => fetchCommunityCalendar({ past: true }),
    enabled: nothingUpcoming && today > FESTIVAL_LAST,
  });

  const lookBack = nothingUpcoming && withPast ? calendarView(withPast.events, today, Date.now()) : null;
  if (lookBack?.mode === "happened") {
    const picks = spread(lookBack.happened, HOME_EVENT_COUNT);
    if (almanac) {
      return (
        <section className="band" data-testid="home-happened">
          <h2 className="h2">{tr("almanac.happenedTitle")}</h2>
          <p className="lede">{fill(tr("almanac.happenedShort"), { n: lookBack.happened.length })}</p>
          <ul className="upnext">
            {picks.map((event) => (
              <li key={`${event.did}/${event.rkey}`} className="upnext__item">
                <p className="upnext__when mono">{formatEventDate(event.startsAt, language)}</p>
                <h3 className="ev__title"><Link to={eventPath(event)}>{event.name}</Link></h3>
              </li>
            ))}
          </ul>
          <Link className="link" to="/calendar">{tr("almanac.happenedSee")} <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Link>
        </section>
      );
    }
    return (
      <section className="py-20 bg-white" data-testid="home-happened">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">{tr("almanac.happenedTitle")}</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{fill(tr("almanac.happenedShort"), { n: lookBack.happened.length })}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 mb-8">
            {picks.map((event) => <EventCard key={`${event.did}/${event.rkey}`} event={event} />)}
          </div>
          <div className="text-center">
            <Link to="/calendar">
              <Button size="lg" variant="outline" className="gap-2">{tr("almanac.happenedSee")}<ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!data || data.source !== "regenos" || data.events.length === 0) return null;

  // Under the ecology look this is the "what's on" strip near the top: events that
  // have not finished, soonest first, so today's come before the rest.
  const now = Date.now();
  const unfinished = eco ? data.events.filter((e) => e.status !== "cancelled" && Date.parse(e.endsAt ?? e.startsAt ?? "") >= now) : data.events;
  const upcoming = (unfinished.length > 0 ? unfinished : data.events).slice(0, HOME_EVENT_COUNT);

  if (almanac) {
    return (
      <section className="band" data-testid="home-events">
        <h2 className="h2">{eco ? tr(duringGathering() ? "look.home.onToday" : "look.home.comingUp") : tr("home.upcomingEvents.title")}</h2>
        <p className="lede">{tr("home.upcomingEvents.subtitle")}</p>
        <ul className="upnext">
          {upcoming.map((event) => {
            const where = locationLine(event.location);
            return (
              <li key={`${event.did}/${event.rkey}`} className="upnext__item">
                <p className="upnext__when mono">{[formatEventDate(event.startsAt, language), formatEventTimeRange(event.startsAt, event.endsAt, language)].filter(Boolean).join(" · ")}</p>
                <h3 className="ev__title"><Link to={eventPath(event)}>{event.name}</Link></h3>
                {where && !eco && <p className="ev__meta">{where}</p>}
              </li>
            );
          })}
        </ul>
        <Link className="link" to="/calendar">{tr("home.upcomingEvents.seeFullCalendar")} <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Link>
      </section>
    );
  }

  return (
    <section className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl lg:text-4xl font-bold mb-3">
            {tr("home.upcomingEvents.title")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {tr("home.upcomingEvents.subtitle")}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          {upcoming.map((event) => (
            <EventCard key={`${event.did}/${event.rkey}`} event={event} />
          ))}
        </div>

        <div className="text-center">
          <Link to="/calendar">
            <Button size="lg" variant="outline" className="gap-2">
              {tr("home.upcomingEvents.seeFullCalendar")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
