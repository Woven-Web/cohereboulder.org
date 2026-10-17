import { useState } from "react";
import { CalendarSync } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { calendarSubscribeLinks } from "@/lib/calendarLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShell } from "@/components/almanac/shell-context";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** One tap for Google and Apple; the plain address for any other calendar app. */
export function CalendarSubscribe({ feedUrl, compact = false }: { feedUrl: string; compact?: boolean }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const { container } = useShell();
  const { webcal, google } = calendarSubscribeLinks(feedUrl);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      // No clipboard (an insecure context or a refused permission): the address is selectable.
    }
  }

  return (
    <Dialog onOpenChange={() => setCopied(false)}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "sm" : "default"} className={compact ? "h-11 w-full gap-2" : "h-11 gap-2"}>
          <CalendarSync className="h-4 w-4" aria-hidden="true" />
          {tr("calendar.events.subscribe")}
        </Button>
      </DialogTrigger>
      {/* Portalled into the shell, like the sign-in dialog, so it wears the page's type and colours. */}
      <DialogContent container={container} closeLabel={tr("nav.closeDialog")} className="signin-dlg subscribe-dlg max-w-md w-[calc(100%-2rem)] rounded-lg [&>button]:min-h-12 [&>button]:min-w-12 [&>button]:right-0 [&>button]:top-0 [&>button]:flex [&>button]:items-center [&>button]:justify-center">
        <DialogHeader>
          <DialogTitle className="px-5 sm:pl-0">{tr("calendar.events.subscribe")}</DialogTitle>
          <DialogDescription>{tr("calendar.events.subscribeCaption")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <a href={google} target="_blank" rel="noopener noreferrer" data-testid="subscribe-google">{tr("calendar.events.googleCalendar")}</a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <a href={webcal} data-testid="subscribe-apple">{tr("calendar.events.appleCalendar")}</a>
          </Button>
          <div className="space-y-2 pt-2">
            <label className="text-sm text-muted-foreground" htmlFor="calendar-feed-url">{tr("calendar.events.feedUrlLabel")}</label>
            <div className="flex gap-2">
              <Input id="calendar-feed-url" value={feedUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {tr(copied ? "calendar.events.feedCopied" : "calendar.events.feedCopy")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
