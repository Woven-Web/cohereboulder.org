import { useLanguage } from "@/contexts/LanguageContext";
import type { Seat } from "./seat";

/** Going / Requested / Waitlisted. Differs by fill, border style and shape, not just colour. */
export function SeatBadge({ seat }: { seat: Seat }) {
  const { tr } = useLanguage();
  return <span className="tag" data-state={seat}>{tr(`almanac.seat.${seat}`)}</span>;
}
