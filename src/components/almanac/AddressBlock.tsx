import { useLanguage } from "@/contexts/LanguageContext";
import type { CommunityEventLocation } from "@/lib/events";

/**
 * The typographic address: the street number set large, the place and street
 * beneath, and a link out to the person's maps app. No embedded map, on purpose
 * (no third-party tiles, nothing to load offline).
 */
export function AddressBlock({ location }: { location: CommunityEventLocation | null }) {
  const { tr } = useLanguage();
  const name = location?.name?.trim();
  const street = location?.street?.trim();
  const locality = [location?.locality, location?.region, location?.postalCode].filter(Boolean).join(", ").replace(/, (\d{5})$/, " $1");
  if (!name && !street && !locality) return null;
  const number = street?.match(/^\d+/)?.[0];
  const rest = street?.replace(/^\d+\s*/, "");
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, street, locality].filter(Boolean).join(", "))}`;
  return (
    <div className="addr" data-testid="address-block">
      {/* Screen readers get the whole address once; the large-number split is decoration. */}
      <span className="sr-only">{[name, street, locality].filter(Boolean).join(", ") || tr("almanac.addressTba")}</span>
      <div className="addr__no" aria-hidden="true">{number ?? (street ? "·" : "TBA")}</div>
      <div className="addr__lines" aria-hidden="true">
        {name && <b>{name}</b>}
        {rest && <><span>{rest}</span><br /></>}
        <span>{street || locality ? locality : tr("almanac.addressTba")}</span>
      </div>
      {street ? (
        <a className="link" href={maps} target="_blank" rel="noopener noreferrer">{tr("almanac.openMaps")} ↗</a>
      ) : (
        <span className="small" style={{ gridColumn: "1 / -1" }}>{tr("almanac.noStreet")}</span>
      )}
    </div>
  );
}
