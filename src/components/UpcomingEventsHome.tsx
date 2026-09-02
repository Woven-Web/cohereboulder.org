import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/EventCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { fetchCommunityCalendar } from "@/lib/events";

/** How many cards the homepage teaser shows before pointing to /calendar. */
const HOME_EVENT_COUNT = 4;

/**
 * The homepage's "What's coming up" teaser. Renders nothing at all —
 * no heading, no empty card — when there is no regenOS-backed event to
 * show, so a quiet calendar never leaves a hollow section on the landing
 * page. (The Luma fallback lives on /calendar itself, not here.)
 */
export function UpcomingEventsHome() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const { data } = useQuery({
    queryKey: ["community-calendar"],
    queryFn: fetchCommunityCalendar,
  });

  if (!data || data.source !== "regenos" || data.events.length === 0) return null;

  const upcoming = data.events.slice(0, HOME_EVENT_COUNT);

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
