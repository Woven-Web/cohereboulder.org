import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { denverDateKey, eventPath } from "@/lib/events";
import { formatDay } from "@/lib/festival";
import type { ProfileRsvp } from "@/lib/api";

/** Events a member is going to, as links to their pages. */
export function ProfileRsvpList({ rsvps }: { rsvps: ProfileRsvp[] }) {
  const { language } = useLanguage();
  return (
    <ul className="going-list" style={{ listStyle: "none", padding: 0 }}>
      {rsvps.map((rsvp) => {
        const day = denverDateKey(rsvp.startsAt);
        return (
          <li key={rsvp.uri} className="vis" data-testid="going-event">
            <div>
              <Link className="ev__title" to={eventPath(rsvp)}>{rsvp.name}</Link>
              {day && <p>{formatDay(day, language)}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
