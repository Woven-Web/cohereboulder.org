// "Events I'm going to" — one source of truth for the Calendar's My events
// filter and the Today page's "Your next" line.
//
// Two sources, merged:
//   • Email RSVPs (no account) — recorded on this device in localStorage the
//     moment /api/rsvp succeeds. Dropping one here only forgets it locally; the
//     RSVP itself is cancelled from the link in the confirmation email.
//   • regenOS RSVPs (signed in) — there is no "list my RSVPs" upstream, only
//     getEventAttendance.mySeat per event, so we ask about the next few
//     upcoming events with bounded concurrency. RSVPs made here are also
//     recorded locally so they show instantly.
//
// Nothing here is sent anywhere: the list lives in this browser.

import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { fetchMySeat } from "./regenos";
import type { CommunityEvent } from "./events";

export const MY_EVENTS_KEY = "cohere.myEvents.v1";
export const MY_EVENTS_CAP = 200;
/** How many upcoming events we ask regenOS about, and how many at once. */
export const SEAT_LOOKUP_LIMIT = 40;
export const SEAT_LOOKUP_CONCURRENCY = 4;

export type MySource = "email" | "regenos";
/** Seats that mean "I'm in the picture for this event". */
export type ActiveSeat = "confirmed" | "waitlisted" | "requested";

export interface StoredEvent {
  did: string;
  rkey: string;
  source: MySource;
  /** ISO time the RSVP was recorded. */
  at: string;
  /** regenOS entries only: the seat when recorded. */
  seat?: ActiveSeat;
}

export interface MyEventItem {
  event: CommunityEvent;
  source: MySource;
  seat?: ActiveSeat;
}

/** Query key prefix; invalidate after an RSVP so the seat lookup is re-read. */
export const MY_SEATS_QUERY_KEY = "my-seats";

export const eventKey = (e: { did: string; rkey: string }) => `${e.did}/${e.rkey}`;

export function isActiveSeat(seat: unknown): seat is ActiveSeat {
  return seat === "confirmed" || seat === "waitlisted" || seat === "requested";
}

// ---------------------------------------------------------------- storage

/** Defensive parse: anything unexpected yields fewer entries, never a throw. */
export function parseStored(raw: string | null): StoredEvent[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (data as { items?: unknown } | null)?.items;
  if (!data || (data as { v?: unknown }).v !== 1 || !Array.isArray(list)) return [];
  const out: StoredEvent[] = [];
  for (const item of list) {
    const e = item as Partial<StoredEvent> | null;
    if (!e || typeof e.did !== "string" || typeof e.rkey !== "string" || !e.did || !e.rkey) continue;
    if (e.source !== "email" && e.source !== "regenos") continue;
    const at = typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)) ? e.at : new Date(0).toISOString();
    out.push({
      did: e.did,
      rkey: e.rkey,
      source: e.source,
      at,
      ...(e.source === "regenos" && isActiveSeat(e.seat) ? { seat: e.seat } : {}),
    });
  }
  return normalize(out);
}

/** One entry per event (the most recently recorded wins), newest first, capped. */
export function normalize(items: StoredEvent[]): StoredEvent[] {
  const byKey = new Map<string, StoredEvent>();
  for (const item of items) {
    const prior = byKey.get(eventKey(item));
    if (!prior || Date.parse(item.at) >= Date.parse(prior.at)) byKey.set(eventKey(item), item);
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, MY_EVENTS_CAP);
}

export function addStored(items: StoredEvent[], entry: StoredEvent): StoredEvent[] {
  return normalize([...items, entry]);
}

export function removeStored(items: StoredEvent[], target: { did: string; rkey: string }): StoredEvent[] {
  return items.filter((i) => eventKey(i) !== eventKey(target));
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage (some private modes) — behave as empty
  }
}

const listeners = new Set<() => void>();
let snapshot: { raw: string | null; items: StoredEvent[] } = { raw: null, items: [] };

function getSnapshot(): StoredEvent[] {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(MY_EVENTS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== snapshot.raw) snapshot = { raw, items: parseStored(raw) };
  return snapshot.items;
}

function write(items: StoredEvent[]) {
  try {
    storage()?.setItem(MY_EVENTS_KEY, JSON.stringify({ v: 1, items }));
  } catch {
    // Full or blocked storage: the RSVP itself already succeeded; skip the memo.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MY_EVENTS_KEY || e.key === null) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/**
 * The last seat answers for the signed-in account, kept on this device so a reload can lay out
 * "Your next" at once while the lookups (one regenOS call per upcoming event) run again.
 * Holds no more than the RSVP memo above: event keys and seats, for one DID.
 */
export const MY_SEATS_CACHE_KEY = "cohere.mySeats.v1";

/** Defensive parse: another account's answers, or anything unexpected, yields nothing. */
export function parseSeatCache(raw: string | null, did: string): Record<string, ActiveSeat | null> | undefined {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "");
  } catch {
    return undefined;
  }
  const cached = data as { did?: unknown; seats?: unknown } | null;
  if (!cached || cached.did !== did || !cached.seats || typeof cached.seats !== "object" || Array.isArray(cached.seats)) return undefined;
  const out: Record<string, ActiveSeat | null> = {};
  for (const [key, seat] of Object.entries(cached.seats as Record<string, unknown>)) out[key] = isActiveSeat(seat) ? seat : null;
  return out;
}

function readSeatCache(did: string) {
  try {
    return parseSeatCache(storage()?.getItem(MY_SEATS_CACHE_KEY) ?? null, did);
  } catch {
    return undefined;
  }
}

function writeSeatCache(did: string, seats: Record<string, ActiveSeat | null>) {
  try {
    storage()?.setItem(MY_SEATS_CACHE_KEY, JSON.stringify({ did, seats }));
  } catch {
    // Full or blocked storage: the next load just waits for the lookups.
  }
}

/** Remember an email RSVP on this device (call after createEmailRsvp succeeds). */
export function recordEmailRsvp(event: { did: string; rkey: string }) {
  write(addStored(getSnapshot(), { did: event.did, rkey: event.rkey, source: "email", at: new Date().toISOString() }));
}

/**
 * Remember the result of rsvpOnRegenos. An active seat is recorded; anything
 * else ("none", "declined") forgets the event.
 */
export function recordRegenosRsvp(event: { did: string; rkey: string }, state: string) {
  const current = getSnapshot();
  if (!isActiveSeat(state)) {
    write(removeStored(current, event));
    return;
  }
  write(addStored(current, { did: event.did, rkey: event.rkey, source: "regenos", at: new Date().toISOString(), seat: state }));
}

/** Drop an event from this device's list. Does NOT cancel the RSVP anywhere. */
export function removeMyEvent(event: { did: string; rkey: string }) {
  write(removeStored(getSnapshot(), event));
}

// ------------------------------------------------------------------ logic

function startMs(e: CommunityEvent): number {
  const t = Date.parse(e.startsAt ?? "");
  return Number.isNaN(t) ? Infinity : t;
}

/** Still ahead of us or under way (no end time → an hour). */
export function isUpcoming(e: CommunityEvent, now: number): boolean {
  const start = startMs(e);
  if (start === Infinity) return false;
  const end = Date.parse(e.endsAt ?? "");
  return (Number.isNaN(end) || end <= start ? start + 3600_000 : end) > now;
}

/** The events worth asking regenOS about: upcoming, not cancelled, soonest first. */
export function seatLookupCandidates(events: CommunityEvent[], now: number, limit = SEAT_LOOKUP_LIMIT) {
  return events
    .filter((e) => e.status !== "cancelled" && isUpcoming(e, now))
    .sort((a, b) => startMs(a) - startMs(b))
    .slice(0, limit);
}

/** Map with at most `limit` calls in flight; preserves input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Ask regenOS for my seat on each event. A failed lookup is skipped, not fatal. */
export async function lookupSeats(
  events: CommunityEvent[],
  fetchSeat: (did: string, rkey: string) => Promise<{ seat: string | null }> = fetchMySeat,
): Promise<Record<string, ActiveSeat | null>> {
  const found: Record<string, ActiveSeat | null> = {};
  await mapLimit(events, SEAT_LOOKUP_CONCURRENCY, async (e) => {
    try {
      const { seat } = await fetchSeat(e.did, e.rkey);
      found[eventKey(e)] = isActiveSeat(seat) ? seat : null;
    } catch {
      // unknown: leave out so a local record still shows
    }
  });
  return found;
}

/**
 * Merge the sources against the events we can actually show.
 * `seats` is authoritative for events it covers (null = not going, which also
 * hides a stale local regenos record); the local regenos records fill in the
 * rest while signed in. Email RSVPs always count. Sorted by start.
 */
export function mergeMyEvents(args: {
  events: CommunityEvent[];
  stored: StoredEvent[];
  seats: Record<string, ActiveSeat | null>;
  signedIn: boolean;
}): MyEventItem[] {
  const { events, stored, seats, signedIn } = args;
  const byKey = new Map(events.map((e) => [eventKey(e), e]));
  const out = new Map<string, MyEventItem>();
  for (const s of stored) {
    const event = byKey.get(eventKey(s));
    if (!event) continue;
    if (s.source === "email") out.set(eventKey(s), { event, source: "email" });
    else if (signedIn && !(eventKey(s) in seats)) out.set(eventKey(s), { event, source: "regenos", seat: s.seat });
  }
  if (signedIn) {
    for (const [key, seat] of Object.entries(seats)) {
      const event = byKey.get(key);
      if (event && seat) out.set(key, { event, source: "regenos", seat });
    }
  }
  return [...out.values()].sort((a, b) => startMs(a.event) - startMs(b.event));
}

export function nextEvent(items: MyEventItem[], now: number): CommunityEvent | null {
  return items.find((i) => i.event.status !== "cancelled" && isUpcoming(i.event, now))?.event ?? null;
}

// ------------------------------------------------------------------- hook

export interface UseMyEvents {
  items: MyEventItem[];
  next: CommunityEvent | null;
  isLoading: boolean;
}

export function useMyEvents(events: CommunityEvent[] | undefined): UseMyEvents {
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => []);
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(laneOn);
  const did = laneOn ? (session?.did ?? null) : null;
  const signedIn = Boolean(did);

  const list = events;
  const candidates = useMemo(() => (list && signedIn ? seatLookupCandidates(list, Date.now()) : []), [list, signedIn]);
  const candidateIds = candidates.map(eventKey).join(",");
  const seatsQuery = useQuery({
    queryKey: [MY_SEATS_QUERY_KEY, did, candidateIds],
    queryFn: async () => {
      const seats = await lookupSeats(candidates);
      if (did) writeSeatCache(did, seats);
      return seats;
    },
    // Last visit's answers while this visit's are read: the page lays out right the first time.
    placeholderData: () => (did ? readSeatCache(did) : undefined),
    enabled: signedIn && candidates.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const seats = seatsQuery.data;
  const items = useMemo(
    () => mergeMyEvents({ events: list ?? [], stored, seats: seats ?? {}, signedIn }),
    [list, stored, seats, signedIn],
  );
  const next = useMemo(() => nextEvent(items, Date.now()), [items]);
  return { items, next, isLoading: signedIn && candidates.length > 0 && seatsQuery.isLoading };
}
