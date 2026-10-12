import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventPath, type CommunityEvent } from "@/lib/events";
import { downloadEventIcs } from "@/lib/ics";
import { googleCalendarEventUrl } from "@/lib/calendarLinks";

/** Google Calendar link or an .ics download, built in the browser from the event. */
export function AddToCalendar({ event, className = "" }: { event: CommunityEvent; className?: string }) {
  const { tr } = useLanguage();
  if (!event.startsAt || Number.isNaN(Date.parse(event.startsAt)) || event.status === "cancelled") return null;
  const pageUrl = `${typeof window === "undefined" ? "https://cohereboulder.org" : window.location.origin}${eventPath(event)}`;
  const google = googleCalendarEventUrl(event, pageUrl);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={`min-h-11 gap-2 ${className}`} data-testid="add-to-calendar">
          <CalendarPlus className="h-4 w-4" aria-hidden />
          {tr("calendar.events.addToCalendar")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {google && (
          <DropdownMenuItem className="min-h-11" asChild>
            <a href={google} target="_blank" rel="noopener noreferrer">
              {tr("calendar.events.googleCalendar")}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="min-h-11" onSelect={() => downloadEventIcs(event, pageUrl)}>
          {tr("calendar.events.appleOtherCalendar")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
