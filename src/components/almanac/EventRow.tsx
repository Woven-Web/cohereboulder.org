import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { denverDateKey, eventPath, locationLine, type CommunityEvent } from "@/lib/events";
import { denverMinutes, formatMinutes } from "@/lib/festival";
import { useReminders } from "@/lib/reminders";
import { useEventRsvp } from "@/lib/useEventRsvp";
import { useInstallOffer } from "@/lib/useInstallOffer";
import { AddToCalendar } from "@/components/AddToCalendar";
import { RsvpPrivacyControl } from "@/components/members/RsvpPrivacyControl";
import { fill } from "./format";
import type { MyEventItem } from "@/lib/myEvents";
import { SeatBadge } from "./SeatBadge";
import { seatOf, type Seat } from "./seat";
import { useShell } from "./shell-context";

interface Props {
  event: CommunityEvent;
  /** This event's entry on your list, when it has one. */
  item?: MyEventItem | null;
  /** Say where the RSVP lives ("this device" / "scenius.social"). */
  showSource?: boolean;
  /** Clip the description to this many characters. */
  descLimit?: number;
  compact?: boolean;
  /** Edit / delete for hosts, and any extra row-level action. */
  hostControls?: ReactNode;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : text);

/**
 * One event: time column, title (opens the detail page), place, a clipped
 * description, and the three actions: RSVP, Add to calendar, Remind me. Used by
 * Today ("Later today") and Calendar.
 */
export function EventRow({ event, item = null, showSource = false, descLimit = 110, compact = false, hostControls }: Props) {
  const seat: Seat | null = item ? seatOf(item) : null;
  const source = showSource ? item?.source ?? null : null;
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const navigate = useNavigate();
  const { rsvp, pending, upcoming, rsvpDone, handleRsvp } = useEventRsvp(event);
  const { subscribed } = useReminders();
  const { offer } = useInstallOffer();

  const start = event.startsAt ? new Date(event.startsAt) : null;
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const sameDay = valid && end && !Number.isNaN(end.getTime()) && denverDateKey(event.startsAt) === denverDateKey(event.endsAt);
  const now = Date.now();
  const cancelled = event.status === "cancelled";
  const status: "past" | "now" | "later" | "undated" = !valid ? "undated" : (end && !Number.isNaN(end.getTime()) ? end.getTime() : start.getTime() + 3_600_000) <= now ? "past" : start.getTime() <= now ? "now" : "later";
  const minutesUntil = valid ? Math.round((start.getTime() - now) / 60000) : 0;
  const soon = status === "later" && minutesUntil > 0 && minutesUntil < 180 ? fill(tr("almanac.inMinutes"), { n: minutesUntil }) : "";

  const time = valid ? formatMinutes(denverMinutes(start), language) : "";
  const [t1, t2] = time ? [time.slice(0, time.indexOf(" ")), time.slice(time.indexOf(" ") + 1)] : ["", ""];
  const where = locationLine(event.location);
  const meta = [
    where,
    sameDay && end ? fill(tr("almanac.untilTime"), { t: formatMinutes(denverMinutes(end), language) }) : null,
    source ? (source === "regenos" ? "scenius.social" : tr("almanac.sourceDevice")) : null,
  ].filter(Boolean).join(" · ");

  // An emailed RSVP can only be undone from the email, so the row shows the
  // badge instead of an RSVP button; a regenOS RSVP is the button's own state.
  const viaEmail = item?.source === "email";
  const showButton = upcoming && !viaEmail;
  const seatShown: Seat | null = seat ?? (rsvpDone ? (rsvp as Seat) : null);
  const badgeShown = seatShown && !(showButton && rsvpDone);
  const rsvpLabel = rsvpDone ? tr(rsvp === "going" ? "calendar.events.cardGoing" : `calendar.rsvp.${rsvp}`).replace(/^✓ /, "") : rsvp === "error" ? tr("calendar.rsvp.error") : tr("calendar.events.cardRsvp");

  function remind() {
    if (subscribed) { toast(tr("almanac.remindersOnToast")); return; }
    // Nothing to offer here (push unsupported, or already handled): More explains why.
    if (!offer("manual")) navigate("/more");
  }

  return (
    <article className={`ev${compact ? " ev--compact" : ""}${status === "past" ? " is-past" : ""}${status === "now" ? " is-now" : ""}`} data-testid="event-card">
      <div className="ev__time">{t1}<small>{t2}</small></div>
      <div>
        <h3 className={`ev__title${cancelled ? " line-through opacity-70" : ""}`}>
          {(status === "now" || soon) && <span className="ev__soon">{status === "now" ? tr("almanac.underway") : soon}</span>}
          <Link to={eventPath(event)}>{event.name}</Link>
        </h3>
        {(meta || badgeShown) && (
          <p className="ev__meta">
            {meta}
            {badgeShown && seatShown && <>{meta ? " " : ""}<SeatBadge seat={seatShown} /></>}
          </p>
        )}
        {event.description && descLimit > 0 && <p className="ev__desc" data-testid="card-description">{clip(event.description.replace(/\s+/g, " ").trim(), descLimit)}</p>}
        {valid && !cancelled && (
          <div className="ev__acts">
            {showButton && (
              <button
                type="button"
                className="btn btn--line btn--sm"
                data-testid="card-rsvp"
                data-state={rsvpDone ? rsvp : undefined}
                aria-pressed={rsvpDone}
                aria-disabled={pending}
                aria-busy={pending}
                aria-live="polite"
                title={rsvpDone ? tr("calendar.events.cancelHint") : undefined}
                aria-label={rsvpDone ? `${rsvpLabel}. ${tr("calendar.events.cancelHint")}` : undefined}
                onClick={handleRsvp}
              >
                {rsvp === "going" && <Check className="h-4 w-4" aria-hidden />}
                {rsvpLabel}
              </button>
            )}
            <AddToCalendar event={event} quiet />
            {status !== "past" && (
              <button type="button" className="link" aria-pressed={subscribed} onClick={remind}>
                {subscribed ? tr("almanac.remindersOn") : tr("almanac.remindMe")}
              </button>
            )}
          </div>
        )}
        {/* Only a regenOS RSVP can appear on a profile; an emailed one never does. */}
        {rsvpDone && !viaEmail && <RsvpPrivacyControl event={event} />}
        {hostControls && <div className="ev__acts">{hostControls}</div>}
      </div>
    </article>
  );
}
