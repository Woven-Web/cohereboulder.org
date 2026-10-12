import { useState } from "react";
import { Link } from "react-router-dom";
import { BottomSheet } from "@/components/almanac/BottomSheet";
import { useShell } from "@/components/almanac/shell-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { eventUriOf, useRsvpVisibility } from "@/hooks/useRsvpVisibility";
import type { CommunityEvent } from "@/lib/events";

/**
 * "Shown on your profile · change" under a regenOS RSVP. One line says what is
 * true now; the control opens a small panel to hide or show this one RSVP.
 * Rendered only for a signed-in member who has a regenOS RSVP on the event —
 * email RSVPs are never shown on profiles, so they get no control.
 *
 * `inline` is for pages outside the Almanac shell (the event detail page),
 * where a bottom sheet would lose its styles: the panel expands in place.
 */
export function RsvpPrivacyControl({ event, inline = false }: { event: CommunityEvent; inline?: boolean }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const { visibility, isError, setHidden } = useRsvpVisibility(true);
  const [open, setOpen] = useState(false);
  if (isError || !visibility) return null;

  const uri = eventUriOf(event);
  const nobody = visibility.mode === "nobody";
  const hidden = visibility.hiddenEvents.includes(uri);
  const state = nobody ? "nobody" : hidden ? "hidden" : "shown";
  const sentence = tr(state === "nobody" ? "members.rsvp.controlNobody" : state === "hidden" ? "members.rsvp.controlHidden" : "members.rsvp.controlShown");

  const panel = (
    <div className={inline ? "mt-2 space-y-2 rounded-md border p-3" : "stack"} data-testid="rsvp-privacy-panel">
      <p className={inline ? "text-sm" : "lede"}>{sentence}</p>
      {!nobody && (
        <button
          type="button"
          className={inline ? "rounded-md border px-3 py-2 text-sm font-medium" : "btn btn--primary btn--block"}
          disabled={setHidden.isPending}
          onClick={() => setHidden.mutate({ uri, hidden: !hidden }, { onError: () => toast(tr("members.rsvp.saveFailed")) })}
        >
          {tr(hidden ? "members.rsvp.sheetShow" : "members.rsvp.sheetHide")}
        </button>
      )}
      <p><Link className={inline ? "text-sm underline" : "link"} to="/profile#rsvps">{tr("members.rsvp.sheetAll")}</Link></p>
      <button type="button" className={inline ? "text-sm underline" : "btn btn--quiet btn--block"} onClick={() => setOpen(false)}>{tr("members.rsvp.sheetDone")}</button>
    </div>
  );

  return (
    <div data-testid="rsvp-privacy" data-state={state}>
      <button
        type="button"
        className={inline ? "text-sm text-muted-foreground underline underline-offset-2" : "link"}
        style={inline ? undefined : { fontSize: "var(--fs-small)" }}
        aria-expanded={inline ? open : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {tr(state === "nobody" ? "members.rsvp.nobodyLink" : state === "hidden" ? "members.rsvp.hiddenLink" : "members.rsvp.shownLink")}
      </button>
      {inline
        ? open && panel
        : <BottomSheet open={open} onOpenChange={setOpen} title={tr("members.rsvp.sheetTitle")}>{panel}</BottomSheet>}
    </div>
  );
}
