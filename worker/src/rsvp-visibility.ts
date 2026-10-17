// Who sees a member's RSVPs on their profile.
//
//   GET/PUT /api/me/rsvp-visibility    the owner's setting (mode + per-event hides)
//   GET     /api/me/rsvps              the owner's own regenOS RSVPs, with hide flags
//   GET     /api/members/:did/rsvps    what a member sees on someone's profile
//
// Only regenOS RSVPs ever appear: the confirmed guests regenOS reports for each
// upcoming event. Email RSVPs (D1 event_rsvps) are not linked to any account and
// this module never reads them. The setting lives in D1 keyed by the owner's
// DID; every write takes that DID from the verified regenOS session, never from
// the request. The scenius.social RSVP record itself is public there — this
// controls what COhere shows, nothing upstream.

import { toCommunityEvent, type CommunityEvent, type GetEventsRow } from "./events";
import { refuseCrossSiteWrite } from "./csrf";
import { readVerifiedSessionDid, type RegenosAuthEnv } from "./regenos-auth";
import { ATTENDANCE_TTL_SECONDS, attendanceCache, attendanceKey } from "./attendance-cache";
import { readRoster, type RosterEnv } from "./roster";

export interface RsvpVisibilityEnv extends RegenosAuthEnv, RosterEnv {
  cohere: D1Database;
}

export type VisibilityMode = "members" | "nobody";
export interface Visibility {
  mode: VisibilityMode;
  hiddenEvents: string[];
}

const HIDDEN_MAX = 200;
const SCAN_MAX = 60;
const TIMEOUT_MS = 8_000;
const EVENT_URI_RE = /^at:\/\/did:[a-z0-9]+:[A-Za-z0-9._%:-]{1,200}\/community\.lexicon\.calendar\.event\/[A-Za-z0-9._~-]{1,64}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const eventUri = (event: { did: string; rkey: string }) => `at://${event.did}/community.lexicon.calendar.event/${event.rkey}`;

async function readVisibility(db: D1Database, did: string): Promise<Visibility> {
  const row = await db
    .prepare("SELECT mode, hidden_event_uris FROM profile_rsvp_visibility WHERE did = ?1")
    .bind(did)
    .first<{ mode: string; hidden_event_uris: string }>();
  if (!row) return { mode: "members", hiddenEvents: [] };
  let hidden: unknown = [];
  try {
    hidden = JSON.parse(row.hidden_event_uris);
  } catch {
    hidden = [];
  }
  return {
    mode: row.mode === "nobody" ? "nobody" : "members",
    hiddenEvents: Array.isArray(hidden) ? hidden.filter((u): u is string => typeof u === "string") : [],
  };
}

async function writeVisibility(db: D1Database, did: string, next: Visibility): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profile_rsvp_visibility (did, mode, hidden_event_uris, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(did) DO UPDATE SET mode = ?2, hidden_event_uris = ?3, updated_at = ?4`,
    )
    .bind(did, next.mode, JSON.stringify(next.hiddenEvents), new Date().toISOString())
    .run();
}

// ------------------------------------------------------------ regenOS reads

function base(env: RosterEnv): string | null {
  return env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "") || null;
}

/** Upcoming (or in-progress) events on our calendar, soonest first. null = couldn't read. */
async function upcomingEvents(env: RosterEnv): Promise<CommunityEvent[] | null> {
  const origin = base(env);
  const scene = env.REGENOS_COLLECTIVE_DID?.trim();
  if (!origin || !scene) return null;
  try {
    const res = await fetch(`${origin}/xrpc/social.scenius.getEvents?${new URLSearchParams({ scene, limit: "200" })}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: GetEventsRow[] };
    const now = Date.now();
    return (data.events ?? [])
      .flatMap((row) => {
        const event = toCommunityEvent(row);
        return event ? [event] : [];
      })
      .filter((event) => {
        const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
        const end = event.endsAt ? Date.parse(event.endsAt) : NaN;
        return !Number.isNaN(start) && (Number.isNaN(end) ? start : end) >= now;
      })
      .sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""))
      .slice(0, SCAN_MAX);
  } catch {
    return null;
  }
}

/** DIDs regenOS lists as confirmed for one event (anonymous read, cached a minute). Empty if the read fails. */
export async function confirmedGuests(env: RosterEnv, event: CommunityEvent): Promise<Set<string>> {
  return (await confirmedGuestsOrNull(env, event)) ?? new Set();
}

/** The same, but null when regenOS could not be read, for a caller that must not mistake a failure for "nobody". */
export async function confirmedGuestsOrNull(env: RosterEnv, event: CommunityEvent): Promise<Set<string> | null> {
  const origin = base(env);
  if (!origin) return null;
  const key = attendanceKey(event.did, event.rkey);
  let body = await attendanceCache.match(key).then((hit) => hit?.json() as Promise<{ guests?: { did?: string }[] }> | undefined, () => undefined);
  if (!body) {
    try {
      const res = await fetch(
        `${origin}/xrpc/social.scenius.getEventAttendance?${new URLSearchParams({ eventDid: event.did, eventRkey: event.rkey })}`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) return null;
      body = (await res.json()) as { guests?: { did?: string }[] };
      await attendanceCache
        .put(key, new Response(JSON.stringify(body), { headers: { "Cache-Control": `max-age=${ATTENDANCE_TTL_SECONDS}` } }))
        .catch(() => {});
    } catch {
      return null;
    }
  }
  return new Set((body.guests ?? []).flatMap((g) => (typeof g?.did === "string" ? [g.did] : [])));
}

/** The upcoming events this DID is a confirmed guest of. */
async function goingEvents(env: RosterEnv, did: string): Promise<CommunityEvent[] | null> {
  const events = await upcomingEvents(env);
  if (!events) return null;
  const guests = await Promise.all(events.map((event) => confirmedGuests(env, event)));
  return events.filter((_, i) => guests[i].has(did));
}

const publicShape = (event: CommunityEvent) => ({
  uri: eventUri(event), did: event.did, rkey: event.rkey, name: event.name, startsAt: event.startsAt, endsAt: event.endsAt,
});

// ----------------------------------------------------------------- handlers

export async function handleMyRsvpVisibility(request: Request, env: RsvpVisibilityEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "method not allowed" }, 405);
  if (request.method === "PUT") {
    const refused = refuseCrossSiteWrite(request);
    if (refused) return refused;
  }
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return json({ error: "Sign in first." }, 401);
  const current = await readVisibility(env.cohere, did);
  if (request.method === "GET") return json(current);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const next: Visibility = { mode: current.mode, hiddenEvents: [...current.hiddenEvents] };
  let changed = false;
  if ("mode" in body) {
    if (body.mode !== "members" && body.mode !== "nobody") return json({ error: "mode must be members or nobody" }, 400);
    next.mode = body.mode;
    changed = true;
  }
  if ("event" in body || "hidden" in body) {
    if (typeof body.event !== "string" || !EVENT_URI_RE.test(body.event) || typeof body.hidden !== "boolean") {
      return json({ error: "event must be an event URI and hidden true or false" }, 400);
    }
    const without = next.hiddenEvents.filter((u) => u !== body.event);
    if (body.hidden) {
      if (without.length >= HIDDEN_MAX) return json({ error: "That's more hidden events than we can keep." }, 400);
      next.hiddenEvents = [...without, body.event];
    } else {
      next.hiddenEvents = without;
    }
    changed = true;
  }
  if (!changed) return json({ error: "Nothing to change." }, 400);

  await writeVisibility(env.cohere, did, next);
  return json(next);
}

/** The owner's regenOS RSVPs for the editor and the per-RSVP controls. */
export async function handleMyRsvps(request: Request, env: RsvpVisibilityEnv): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return json({ error: "Sign in first." }, 401);
  const [visibility, going] = await Promise.all([readVisibility(env.cohere, did), goingEvents(env, did)]);
  if (!going) return json({ error: "We can't read your RSVPs right now." }, 503);
  return json({
    visibility,
    rsvps: going.map((event) => ({ ...publicShape(event), hidden: visibility.hiddenEvents.includes(eventUri(event)) })),
  });
}

/** What a member sees on someone's profile — the setting applied, for the owner too. */
export async function handleMemberRsvps(request: Request, env: RsvpVisibilityEnv, targetDid: string): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const viewer = await readVerifiedSessionDid(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const roster = await readRoster(env);
  if (!roster) return json({ error: "We can't check membership right now. Try again shortly." }, 503);
  if (!roster.some((m) => m.did === viewer)) return json({ error: "Members only." }, 403);
  // A person who isn't a current member has no profile here to attach RSVPs to.
  if (!roster.some((m) => m.did === targetDid)) return json({ rsvps: [] });

  const visibility = await readVisibility(env.cohere, targetDid);
  if (visibility.mode === "nobody") return json({ rsvps: [] });
  const going = await goingEvents(env, targetDid);
  if (!going) return json({ error: "We can't read RSVPs right now." }, 503);
  return json({ rsvps: going.filter((event) => !visibility.hiddenEvents.includes(eventUri(event))).map(publicShape) });
}
