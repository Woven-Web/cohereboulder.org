import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventPath, type CommunityEvent } from "@/lib/events";

export function ShareEvent({ event }: { event: CommunityEvent }) {
  const { tr } = useLanguage();
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [busy, setBusy] = useState(false);
  // Share only the public event path, without query strings or fragments.
  const url = `${window.location.origin}${eventPath(event)}`;

  async function share() {
    setBusy(true);
    setStatus("idle");
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: event.name, url });
          return;
        } catch (error) {
          // Dismissing the system sheet should not copy anything unexpectedly.
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      } catch {
        // Clipboard access can be unavailable or denied. Keep the link usable.
        setStatus("manual");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 max-w-full">
      <Button variant="outline" className="gap-2" onClick={share} disabled={busy}>
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {tr("calendar.events.share")}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {status === "copied" && tr("calendar.events.linkCopied")}
        {status === "manual" && tr("calendar.events.copyLinkManually")}
      </p>
      {status === "manual" && (
        <input
          aria-label={tr("calendar.events.eventLink")}
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
