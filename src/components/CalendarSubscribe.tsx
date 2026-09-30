import { CalendarPlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Keep the feed URL visible: Google requires a manual "From URL" subscription. */
export function CalendarSubscribe({ feedUrl, compact = false }: { feedUrl: string; compact?: boolean }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const appleUrl = feedUrl.replace(/^https?:\/\//, "webcal://");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "sm" : "default"} className={compact ? "flex-1 gap-2" : "gap-2"}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {tr("calendar.events.subscribe")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("calendar.events.subscribe")}</DialogTitle>
          <DialogDescription>{tr("calendar.events.subscribeCaption")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button asChild className="w-full">
            <a href={appleUrl}>{tr("calendar.events.appleCalendar")}</a>
          </Button>
          <p className="text-sm text-muted-foreground">{tr("calendar.events.googleSubscribeHint")}</p>
          <Input
            aria-label={tr("calendar.events.feedUrlLabel")}
            value={feedUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button asChild variant="outline" className="w-full">
            <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener noreferrer">
              {tr("calendar.events.googleCalendar")}
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
