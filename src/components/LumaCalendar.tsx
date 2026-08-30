import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";

/**
 * The Luma calendar embed, demoted to fallback: /calendar renders this whenever
 * the regenOS calendar is unconfigured, unreachable, or simply empty
 * (src/lib/events.ts decides), so the live site never gets worse.
 */
export function LumaCalendar() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  return (
    <>
      <div className="text-center mb-8">
        <Button asChild variant="community" size="lg" className="gap-2">
          <a
            href="https://luma.com/cohere-boulder"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("calendar.events.subscribe")}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <div className="w-full flex justify-center">
        <iframe
          src="https://luma.com/embed/calendar/cal-cMHRL58OxzwDCw7/events"
          title={tr("calendar.events.lumaTitle")}
          className="w-full max-w-6xl rounded-lg border border-border"
          style={{
            minHeight: "600px",
            height: "calc(100vh - 300px)",
          }}
          frameBorder="0"
          allowFullScreen
          aria-hidden="false"
          tabIndex={0}
        />
      </div>
    </>
  );
}
