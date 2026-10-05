// Which details an event is still missing, for the admin Events tab.
//
// Organizers enter "TBD" as a venue while a host confirms the space. That is
// fine as a working note, but attendees can't plan around it, and before the
// gathering the organizers need one glance at which events still need work.
// The same placeholder test also keeps "TBD" out of reminder emails and link
// previews (rsvps.ts, seo.ts), so every surface agrees on what "missing" means.

export type MissingDetail = "venue" | "street" | "description";

const PLACEHOLDERS = new Set([
  "tbd",
  "tba",
  "to be determined",
  "to be announced",
  "to be confirmed",
  "tbc",
  "por anunciar",
  "por determinar",
  "por confirmar",
]);

/** True for blank values and TBD-style placeholders ("TBD", "T.B.D.", "To be announced", ...). */
export function isPlaceholder(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return normalized === "" || PLACEHOLDERS.has(normalized);
}

interface CompletenessInput {
  mode: string | null;
  description: string | null;
  location: { name?: string; street?: string } | null;
}

/**
 * The gaps an attendee would notice, in the order an organizer should fix them.
 * A virtual event needs no venue; a hybrid one still does.
 */
export function missingDetails(event: CompletenessInput): MissingDetail[] {
  const missing: MissingDetail[] = [];
  if (event.mode !== "virtual") {
    const loc = event.location;
    if (!loc || isPlaceholder(loc.name)) missing.push("venue");
    else if (isPlaceholder(loc.street)) missing.push("street");
  }
  if (isPlaceholder(event.description)) missing.push("description");
  return missing;
}
