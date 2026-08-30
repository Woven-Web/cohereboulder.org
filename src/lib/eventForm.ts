// The wire shape of the on-site event form — pure, so the tricky parts
// (datetime conversion, payload assembly) are testable without a browser.
//
// Ported from regenhub-boulder's lib/regenos/eventForm.ts and re-cut for this
// site's form (which exposes locality/region, and a mode picker). Everything
// mirrors `CreateEventInput` in regenOS's
// crates/regenos-appview/src/xrpc/event.rs. Two upstream facts shape it:
//
//  * `updateEvent` reuses the SAME input struct and re-runs the whole create
//    fan-out — **an edit must resend every field it wants to keep**. An
//    omitted street is a deleted street. That is why the edit form prefills
//    from the stored event rather than starting blank.
//
//  * `publicFace: "exact"` — the default `rough` face routes street / postal /
//    place name into a gated record we can't read back, so a rough event
//    would silently lose its address on the first edit. COhere events are
//    public community invitations at published addresses; exact is honest
//    and lossless.
//
// NOT here, deliberately: external links. The lexicon's `uris` field exists on
// stored events, but `CreateEventInput` has no way to set it (the fan-out
// writes `uris: None`, fanout.rs) — a links field would silently discard what
// people typed. Put the link in the description until upstream grows the field.

import type { CommunityEvent } from "./events";

export type EventMode = "inperson" | "virtual" | "hybrid";

/** The field set, in the browser's own vocabulary (datetime-local strings). */
export interface EventFormValues {
  name: string;
  description: string;
  /** `YYYY-MM-DDTHH:mm`, local — what `<input type="datetime-local">` yields. */
  startsAt: string;
  endsAt: string;
  mode: EventMode;
  placeName: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
}

/** COhere is a Boulder thing; the address starts there and stays editable. */
export const EMPTY_EVENT_FORM: EventFormValues = {
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
  mode: "inperson",
  placeName: "",
  street: "",
  locality: "Boulder",
  region: "CO",
  postalCode: "",
};

/**
 * `YYYY-MM-DDTHH:mm` (local, no offset) → RFC 3339 UTC. The AppView 400s on a
 * datetime with no timezone, and `new Date(local).toISOString()` is exactly
 * the "in the viewer's own timezone" reading a datetime-local input means.
 * Empty/unparseable ⇒ null (omitted from the payload).
 */
export function localInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** The inverse, for prefilling an edit form. Empty string when there's nothing to show. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A fresh base record key for `createEvent`. Time-ordered so the collection
 * sorts sensibly, and inside atproto's rkey charset (`[A-Za-z0-9._:~-]`).
 */
export function mintRkey(): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `ev-${stamp}${noise}`;
}

/** Trim, and treat blank as absent — an omitted field reads clearer on the wire. */
function present(value: string): string | undefined {
  const t = value.trim();
  return t ? t : undefined;
}

export interface EventInputTarget {
  /**
   * The repo the event record lives in. New events use the COhere collective
   * DID (from /api/config) so they land on the community calendar; edits use
   * the DID the event already lives under.
   */
  authority: string;
  rkey: string;
}

/** The descriptive half `createEvent` and `updateEvent` share. */
function describedEvent(values: EventFormValues, target: EventInputTarget): Record<string, unknown> {
  const input: Record<string, unknown> = {
    authority: target.authority,
    rkey: target.rkey,
    name: values.name.trim(),
    mode: values.mode,
    publicFace: "exact",
  };
  const description = present(values.description);
  if (description) input.description = description;
  const startsAt = localInputToIso(values.startsAt);
  if (startsAt) input.startsAt = startsAt;
  const endsAt = localInputToIso(values.endsAt);
  if (endsAt) input.endsAt = endsAt;
  const placeName = present(values.placeName);
  if (placeName) input.placeName = placeName;
  const street = present(values.street);
  if (street) input.street = street;
  const locality = present(values.locality);
  if (locality) input.locality = locality;
  const region = present(values.region);
  if (region) input.region = region;
  const postalCode = present(values.postalCode);
  if (postalCode) input.postalCode = postalCode;
  // The adopted address lexicon REQUIRES a country whenever any other
  // component is present; this is a Boulder calendar, so it's always US.
  if (placeName || street || locality || region || postalCode) input.country = "US";
  return input;
}

/** The `createEvent` request body. This calendar is public by construction. */
export function buildCreateEventInput(
  values: EventFormValues,
  target: EventInputTarget,
): Record<string, unknown> {
  return { ...describedEvent(values, target), visibility: "public" };
}

/**
 * The `updateEvent` request body — the same struct minus `visibility`, which
 * updateEvent ignores (an edit never moves an event between stores). Sending
 * it anyway would be a lie on the wire, so we don't.
 */
export function buildUpdateEventInput(
  values: EventFormValues,
  target: EventInputTarget,
): Record<string, unknown> {
  return describedEvent(values, target);
}

/** The `deleteEvent` request body — `{authority, rkey}` and nothing else. */
export function buildDeleteEventInput(target: EventInputTarget): Record<string, unknown> {
  return { authority: target.authority, rkey: target.rkey };
}

const KNOWN_MODES = new Set<EventMode>(["inperson", "virtual", "hybrid"]);

/**
 * Read a listed event back into form values, for editing. The Worker's
 * trimmed shape (worker/src/events.ts) carries everything the form
 * round-trips: name, description, both times, mode, and the public address.
 */
export function eventToFormValues(event: CommunityEvent): EventFormValues {
  return {
    name: event.name,
    description: event.description ?? "",
    startsAt: isoToLocalInput(event.startsAt),
    endsAt: isoToLocalInput(event.endsAt),
    mode: KNOWN_MODES.has(event.mode as EventMode) ? (event.mode as EventMode) : "inperson",
    placeName: event.location?.name ?? "",
    street: event.location?.street ?? "",
    locality: event.location?.locality ?? "",
    region: event.location?.region ?? "",
    postalCode: event.location?.postalCode ?? "",
  };
}
