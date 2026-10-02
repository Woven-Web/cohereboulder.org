// Door check-in: who actually arrived at a COhere event.
//
// Organizers (anyone in `admins`) open /admin/checkin on a phone at the door,
// pick the event, and tap people in. The list they tap from merges the two
// ways people RSVP:
//
//   * email RSVPs from D1 `event_rsvps` (worker/src/rsvps.ts), and
//   * regenOS confirmed guests, read anonymously with getEventAttendance —
//     the same call the Events tab makes. That roster is partial (confirmed
//     guests only, no emails), and if regenOS is down the list degrades to
//     email RSVPs alone rather than failing.
//
// 2026 registrants can be searched and checked in too, and anyone else is a
// walk-in. One row per arrival in `event_checkins`
// (worker/migrations/0006_event_checkins.sql).
//
// Bad wifi is the normal case at a venue, so a check-in is idempotent: the
// phone mints the row id, retries until it lands, and a repeat of the same id
// (or the same email / regenOS guest at the same event) is a no-op that
// answers with the row already stored.
//
// No email is ever sent from here. A walk-in joins `people` only when they
// tick "add me to the COhere email list", and even then someone who already
// unsubscribed stays unsubscribed. Check-in rows are deleted by the daily
// cron 30 days after the event starts; a walk-in's opted-in `people` row is
// the mailing list and is kept.
//
// Routes (wired in index.ts, all behind the admin session gate):
//   GET    /api/admin/checkin/events                   pick-an-event list
//   GET    /api/admin/checkin/registrants?q=…          2026 registrant search
//   GET    /api/admin/checkin/:did/:rkey               expected + arrived + counts
//   POST   /api/admin/checkin/:did/:rkey               check someone in
//   DELETE /api/admin/checkin/:did/:rkey/:id           undo
//   GET    /api/admin/checkin/:did/:rkey/export.csv    the arrivals, as CSV

import type { RsvpEnv } from "./rsvps";
import { EVENT_TZ, RETENTION_DAYS, lookupLiveEvent, zonedDayWindow, type LiveLookup } from "./rsvps";
import type { RegenosServiceEnv } from "./regenos-service";
import { handleAdminEventAttendance, handleAdminEventsList } from "./regenos-service";

export interface CheckinEnv extends RsvpEnv, RegenosServiceEnv {}

export const CHECKIN_SOURCES = ["rsvp_email", "rsvp_regenos", "registrant", "walkin"] as const;
export type CheckinSource = (typeof CHECKIN_SOURCES)[number];

/** The form whose registrants are searchable at the door. */
export const REGISTRANT_FORM = "register-2026";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const GUEST_DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,2048}$/;

export interface CheckinRow {
  id: string;
  event_did: string;
  event_rkey: string;
  event_name: string;
  event_starts_at: string;
  email: string | null;
  guest_did: string | null;
  name: string | null;
  source: CheckinSource;
  person_id: string | null;
  checked_in_by: string;
  checked_in_at: string;
}

function json(data: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// ------------------------------------------------------------ event picker

export interface PickerEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  where: string | null;
  /** Starts on today's date in Boulder. */
  today: boolean;
  /** Under way right now (start ≤ now ≤ end, or within 3h of an open-ended start). */
  now: boolean;
  isPast: boolean;
}

interface AdminListEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  isPast?: boolean;
  location?: { name?: string; locality?: string } | null;
  mode?: string;
}

const OPEN_ENDED_MS = 3 * 60 * 60 * 1000;

/**
 * Annotate the calendar for the door: what's on today in Boulder, what's
 * happening right now, and which one the page should open on. Order: today
 * (soonest first), then upcoming, then the past — most recent first — so a
 * late CSV export is still a tap away.
 */
export function pickerEvents(
  events: AdminListEvent[],
  now: Date,
): { events: PickerEvent[]; defaultKey: string | null } {
  const day = zonedDayWindow(now, 0, EVENT_TZ);
  const dayStart = Date.parse(day.start);
  const dayEnd = Date.parse(day.end);
  const t = now.getTime();
  const out: (PickerEvent & { startMs: number })[] = [];
  for (const e of events) {
    if (!e?.did || !e?.rkey) continue;
    const startMs = e.startsAt ? Date.parse(e.startsAt) : NaN;
    const endMs = e.endsAt ? Date.parse(e.endsAt) : NaN;
    const dated = !Number.isNaN(startMs);
    const end = !Number.isNaN(endMs) ? endMs : startMs + OPEN_ENDED_MS;
    const loc = e.location ?? null;
    const where = loc ? [loc.name, loc.locality].filter(Boolean).join(", ") || null : e.mode === "virtual" ? "Online" : null;
    out.push({
      did: e.did,
      rkey: e.rkey,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      where,
      today: dated && startMs >= dayStart && startMs < dayEnd,
      now: dated && startMs - 30 * 60 * 1000 <= t && t <= end,
      isPast: dated ? end < t : false,
      startMs: dated ? startMs : Number.POSITIVE_INFINITY,
    });
  }
  const rank = (e: PickerEvent) => (e.today || e.now ? 0 : e.isPast ? 2 : 1);
  out.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    return rank(a) === 2 ? b.startMs - a.startMs : a.startMs - b.startMs;
  });
  const current = out.find((e) => e.now) ?? out.find((e) => e.today && !e.isPast) ?? out.find((e) => e.today) ?? null;
  return {
    events: out.map(({ startMs: _s, ...e }) => e),
    defaultKey: current ? `${current.did}|${current.rkey}` : null,
  };
}

export async function handleCheckinEvents(env: CheckinEnv, now = new Date()): Promise<Response> {
  const res = await handleAdminEventsList(env);
  if (!res.ok) return res;
  const data = (await res.json().catch(() => ({}))) as { events?: AdminListEvent[] };
  return json(pickerEvents(data.events ?? [], now), 200);
}

// ---------------------------------------------------------- expected list

export interface EmailRsvp {
  email: string;
  name: string | null;
}

export interface RegenosGuest {
  did: string;
  handle: string | null;
}

export interface ExpectedEntry {
  /** Stable per event: `email:<addr>` or `did:<did>`. */
  key: string;
  source: "rsvp_email" | "rsvp_regenos";
  name: string | null;
  email: string | null;
  guestDid: string | null;
  handle: string | null;
  personId: string | null;
  checkinId: string | null;
  checkedInAt: string | null;
}

export interface MergedRoster {
  expected: ExpectedEntry[];
  /** Arrivals not on the expected list: walk-ins and registrants. */
  others: CheckinRow[];
  counts: { expected: number; checkedIn: number; expectedCheckedIn: number; walkins: number };
}

/**
 * The one list a volunteer taps from. Email RSVPs dedupe on the lowercased
 * address; regenOS guests on their DID. The two can't be cross-matched (the
 * upstream roster carries no email), so someone who RSVP'd both ways appears
 * twice — rare, and checking either one in is correct.
 *
 * A check-in matches an expected entry by email whatever its source (a
 * registrant tapped in from search who also RSVP'd by email is the same
 * person), and by DID for regenOS guests. Everything else is "others".
 */
export function mergeRoster(
  rsvps: EmailRsvp[],
  guests: RegenosGuest[],
  checkins: CheckinRow[],
  people: Map<string, { id: string; name: string | null }> = new Map(),
): MergedRoster {
  const byEmail = new Map<string, CheckinRow>();
  const byDid = new Map<string, CheckinRow>();
  for (const c of checkins) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
    if (c.guest_did) byDid.set(c.guest_did, c);
  }
  const used = new Set<string>();
  const expected: ExpectedEntry[] = [];
  const seen = new Set<string>();

  for (const r of rsvps) {
    const email = (r.email ?? "").trim().toLowerCase();
    if (!email || seen.has(`email:${email}`)) continue;
    seen.add(`email:${email}`);
    const person = people.get(email);
    const hit = byEmail.get(email);
    if (hit) used.add(hit.id);
    expected.push({
      key: `email:${email}`,
      source: "rsvp_email",
      name: r.name || person?.name || null,
      email,
      guestDid: null,
      handle: null,
      personId: person?.id ?? null,
      checkinId: hit?.id ?? null,
      checkedInAt: hit?.checked_in_at ?? null,
    });
  }
  for (const g of guests) {
    if (!g?.did || seen.has(`did:${g.did}`)) continue;
    seen.add(`did:${g.did}`);
    const hit = byDid.get(g.did);
    if (hit) used.add(hit.id);
    expected.push({
      key: `did:${g.did}`,
      source: "rsvp_regenos",
      name: null,
      email: null,
      guestDid: g.did,
      handle: g.handle,
      personId: null,
      checkinId: hit?.id ?? null,
      checkedInAt: hit?.checked_in_at ?? null,
    });
  }
  expected.sort((a, b) =>
    (a.name || a.handle || a.email || a.guestDid || "").localeCompare(b.name || b.handle || b.email || b.guestDid || "", "en", {
      sensitivity: "base",
    }),
  );
  const others = checkins.filter((c) => !used.has(c.id));
  return {
    expected,
    others,
    counts: {
      expected: expected.length,
      checkedIn: checkins.length,
      expectedCheckedIn: used.size,
      walkins: checkins.filter((c) => c.source === "walkin").length,
    },
  };
}

async function eventCheckins(env: CheckinEnv, did: string, rkey: string): Promise<CheckinRow[]> {
  const { results } = await env.cohere
    .prepare(`SELECT * FROM event_checkins WHERE event_did = ?1 AND event_rkey = ?2 ORDER BY checked_in_at`)
    .bind(did, rkey)
    .all<CheckinRow>();
  return results;
}

/** regenOS confirmed guests, or null when that read failed (the page says so). */
async function regenosGuests(env: CheckinEnv, did: string, rkey: string): Promise<RegenosGuest[] | null> {
  try {
    const res = await handleAdminEventAttendance(env, did, rkey);
    if (!res.ok) return null;
    const data = (await res.json()) as { guests?: RegenosGuest[] };
    return Array.isArray(data.guests) ? data.guests : [];
  } catch {
    return null;
  }
}

export interface CheckinDeps {
  lookup?: (env: CheckinEnv, did: string, rkey: string) => Promise<LiveLookup>;
  guests?: (env: CheckinEnv, did: string, rkey: string) => Promise<RegenosGuest[] | null>;
  now?: () => Date;
}

/** `GET /api/admin/checkin/:did/:rkey` */
export async function handleCheckinRoster(
  env: CheckinEnv,
  did: string,
  rkey: string,
  deps: CheckinDeps = {},
): Promise<Response> {
  const lookup = deps.lookup ?? lookupLiveEvent;
  const readGuests = deps.guests ?? regenosGuests;
  const [live, guests] = await Promise.all([
    lookup(env, did, rkey).catch((): LiveLookup => ({ kind: "unavailable" })),
    readGuests(env, did, rkey).catch(() => null),
  ]);
  const { results: rsvpRows } = await env.cohere
    .prepare(`SELECT email, name FROM event_rsvps WHERE event_did = ?1 AND event_rkey = ?2`)
    .bind(did, rkey)
    .all<EmailRsvp>();
  const checkins = await eventCheckins(env, did, rkey);

  const emails = [...new Set(rsvpRows.map((r) => r.email.toLowerCase()))];
  const people = new Map<string, { id: string; name: string | null }>();
  for (let i = 0; i < emails.length; i += 90) {
    const chunk = emails.slice(i, i + 90);
    const { results } = await env.cohere
      .prepare(`SELECT id, email, name FROM people WHERE email IN (${chunk.map((_, j) => `?${j + 1}`).join(", ")})`)
      .bind(...chunk)
      .all<{ id: string; email: string; name: string | null }>();
    for (const p of results) people.set(p.email, { id: p.id, name: p.name });
  }

  const roster = mergeRoster(rsvpRows, guests ?? [], checkins, people);
  const event =
    live.kind === "ok"
      ? { did, rkey, name: live.event.name, startsAt: live.event.startsAt, endsAt: live.event.endsAt, where: live.event.where }
      : (await snapshotFor(env, did, rkey)) ?? { did, rkey, name: null, startsAt: null, endsAt: null, where: null };
  return json(
    {
      event,
      eventGone: live.kind === "gone",
      regenos: guests === null ? { ok: false } : { ok: true, confirmed: guests.length },
      ...roster,
    },
    200,
  );
}

/** A name/start for the event without calling regenOS, from rows we already hold. */
async function snapshotFor(
  env: CheckinEnv,
  did: string,
  rkey: string,
): Promise<{ did: string; rkey: string; name: string; startsAt: string; endsAt: null; where: string | null } | null> {
  const row =
    (await env.cohere
      .prepare(`SELECT event_name AS name, event_starts_at AS startsAt, NULL AS \`where\` FROM event_checkins WHERE event_did = ?1 AND event_rkey = ?2 LIMIT 1`)
      .bind(did, rkey)
      .first<{ name: string; startsAt: string; where: string | null }>()) ??
    (await env.cohere
      .prepare(`SELECT event_name AS name, event_starts_at AS startsAt, event_where AS \`where\` FROM event_rsvps WHERE event_did = ?1 AND event_rkey = ?2 LIMIT 1`)
      .bind(did, rkey)
      .first<{ name: string; startsAt: string; where: string | null }>());
  return row ? { did, rkey, name: row.name, startsAt: row.startsAt, endsAt: null, where: row.where } : null;
}

// --------------------------------------------------------- registrant search

/** `GET /api/admin/checkin/registrants?q=` — at most 20 matches, 2+ characters. */
export async function handleRegistrantSearch(env: CheckinEnv, q: string): Promise<Response> {
  const query = q.trim().toLowerCase().slice(0, 100);
  if (query.length < 2) return json({ registrants: [] }, 200);
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { results } = await env.cohere
    .prepare(
      `SELECT p.id AS personId, p.name, p.email FROM people p
       JOIN submissions s ON s.person_id = p.id AND s.form_slug = ?1
       WHERE lower(p.email) LIKE ?2 ESCAPE '\\' OR lower(COALESCE(p.name, '')) LIKE ?2 ESCAPE '\\'
       ORDER BY p.name COLLATE NOCASE LIMIT 20`,
    )
    .bind(REGISTRANT_FORM, like)
    .all<{ personId: string; name: string | null; email: string }>();
  return json({ registrants: results }, 200);
}

// --------------------------------------------------------------- check in

export interface CheckinInput {
  id: string;
  source: CheckinSource;
  email: string | null;
  guestDid: string | null;
  name: string | null;
  subscribe: boolean;
  event: { name: string | null; startsAt: string | null };
}

/** Validate a check-in body. Exported for the unit tests. */
export function readCheckinInput(body: Record<string, unknown>): { input: CheckinInput } | { error: string } {
  const id = text(body.id, 64);
  if (!ID_RE.test(id)) return { error: "missing or malformed id" };
  const source = text(body.source, 20) as CheckinSource;
  if (!CHECKIN_SOURCES.includes(source)) return { error: "unknown source" };
  const rawEmail = text(body.email, 320).toLowerCase();
  if (rawEmail && (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254)) {
    return { error: "That doesn't look like an email address." };
  }
  const email = rawEmail || null;
  const guestDid = text(body.guestDid, 2100) || null;
  if (guestDid && !GUEST_DID_RE.test(guestDid)) return { error: "malformed guest" };
  const name = text(body.name, 200) || null;

  if ((source === "rsvp_email" || source === "registrant") && !email) return { error: "an email is required" };
  if (source === "rsvp_regenos" && !guestDid) return { error: "a regenOS guest is required" };
  if (source !== "rsvp_regenos" && guestDid) return { error: "only regenOS guests carry a DID" };
  if (source === "walkin" && !name && !email) return { error: "A walk-in needs a name or an email." };
  const subscribe = source === "walkin" && body.subscribe === true;
  if (subscribe && !email) return { error: "Joining the email list needs an email address." };

  const ev = (body.event && typeof body.event === "object" ? body.event : {}) as Record<string, unknown>;
  const evStart = text(ev.startsAt, 64);
  return {
    input: {
      id,
      source,
      email,
      guestDid,
      name,
      subscribe,
      event: {
        name: text(ev.name, 300) || null,
        startsAt: evStart && !Number.isNaN(Date.parse(evStart)) ? new Date(evStart).toISOString() : null,
      },
    },
  };
}

/**
 * A walk-in who asked to join the email list. New address: a subscribed
 * `people` row, source `walkin:<rkey>`, with an unsubscribe token minted the
 * same way upsertPerson (index.ts) mints one. Known address: fill a missing
 * name, and leave `subscribed` exactly as it is — an earlier unsubscribe
 * wins over a checkbox ticked at a door.
 */
export async function optInWalkin(
  env: CheckinEnv,
  email: string,
  name: string | null,
  rkey: string,
  now: Date,
): Promise<{ personId: string; subscribed: boolean; created: boolean }> {
  const stamp = now.toISOString();
  const inserted = await env.cohere
    .prepare(
      `INSERT INTO people (id, email, name, subscribed, unsubscribe_token, source, created_at, updated_at)
       VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?6)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), email, name, crypto.randomUUID(), `walkin:${rkey}`.slice(0, 600), stamp)
    .run();
  const created = Boolean(inserted.meta?.changes);
  if (!created && name) {
    await env.cohere
      .prepare(`UPDATE people SET name = ?2, updated_at = ?3 WHERE email = ?1 AND (name IS NULL OR name = '')`)
      .bind(email, name, stamp)
      .run();
  }
  const row = await env.cohere
    .prepare(`SELECT id, subscribed FROM people WHERE email = ?1`)
    .bind(email)
    .first<{ id: string; subscribed: number }>();
  return { personId: row!.id, subscribed: Boolean(row!.subscribed), created };
}

/** `POST /api/admin/checkin/:did/:rkey` */
export async function handleCheckin(
  request: Request,
  env: CheckinEnv,
  did: string,
  rkey: string,
  checkedInBy: string,
  deps: CheckinDeps = {},
): Promise<Response> {
  const lookup = deps.lookup ?? lookupLiveEvent;
  const now = (deps.now ?? (() => new Date()))();
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const read = readCheckinInput(body);
  if ("error" in read) return json({ error: read.error }, 400);
  const input = read.input;

  // A retried tap whose first attempt landed: answer with what's stored.
  const prior = await env.cohere.prepare(`SELECT * FROM event_checkins WHERE id = ?1`).bind(input.id).first<CheckinRow>();
  if (prior) {
    if (prior.event_did !== did || prior.event_rkey !== rkey) return json({ error: "id already used" }, 409);
    return json({ ok: true, already: true, checkin: prior }, 200);
  }

  // The event snapshot, cheapest source first: rows we already hold, then
  // one anonymous regenOS read, then (regenOS down) what the page sent.
  let snapshot: { name: string; startsAt: string } | null = await snapshotFor(env, did, rkey);
  if (!snapshot) {
    const live = await lookup(env, did, rkey).catch((): LiveLookup => ({ kind: "unavailable" }));
    if (live.kind === "gone") return json({ error: "unknown event" }, 404);
    if (live.kind === "ok" && live.event.startsAt && !Number.isNaN(Date.parse(live.event.startsAt))) {
      snapshot = { name: live.event.name, startsAt: new Date(live.event.startsAt).toISOString() };
    } else if (input.event.name && input.event.startsAt) {
      snapshot = { name: input.event.name, startsAt: input.event.startsAt };
    } else if (live.kind === "ok") {
      // An undated event: retention counts from the day of the check-in.
      snapshot = { name: live.event.name, startsAt: now.toISOString() };
    } else {
      return json({ error: "The calendar isn't responding right now. Try again in a moment." }, 503);
    }
  }

  let personId: string | null = null;
  let subscribed: boolean | null = null;
  if (input.email) {
    if (input.subscribe) {
      const joined = await optInWalkin(env, input.email, input.name, rkey, now);
      personId = joined.personId;
      subscribed = joined.subscribed;
    } else {
      const known = await env.cohere
        .prepare(`SELECT id, subscribed FROM people WHERE email = ?1`)
        .bind(input.email)
        .first<{ id: string; subscribed: number }>();
      personId = known?.id ?? null;
      subscribed = known ? Boolean(known.subscribed) : null;
    }
  }

  const inserted = await env.cohere
    .prepare(
      `INSERT INTO event_checkins
         (id, event_did, event_rkey, event_name, event_starts_at, email, guest_did, name,
          source, person_id, checked_in_by, checked_in_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      input.id,
      did,
      rkey,
      snapshot.name,
      snapshot.startsAt,
      input.email,
      input.guestDid,
      input.name,
      input.source,
      personId,
      checkedInBy,
      now.toISOString(),
    )
    .run();

  const stored = await env.cohere
    .prepare(
      `SELECT * FROM event_checkins WHERE id = ?1
         OR (event_did = ?2 AND event_rkey = ?3 AND ?4 IS NOT NULL AND email = ?4)
         OR (event_did = ?2 AND event_rkey = ?3 AND ?5 IS NOT NULL AND guest_did = ?5)
       LIMIT 1`,
    )
    .bind(input.id, did, rkey, input.email, input.guestDid)
    .first<CheckinRow>();
  return json({ ok: true, already: !inserted.meta?.changes, checkin: stored, subscribed }, 200);
}

/** `DELETE /api/admin/checkin/:did/:rkey/:id` — undo. Idempotent. */
export async function handleUndoCheckin(env: CheckinEnv, did: string, rkey: string, id: string): Promise<Response> {
  const res = await env.cohere
    .prepare(`DELETE FROM event_checkins WHERE id = ?1 AND event_did = ?2 AND event_rkey = ?3`)
    .bind(id, did, rkey)
    .run();
  return json({ ok: true, deleted: res.meta?.changes ?? 0 }, 200);
}

// ------------------------------------------------------------------ export

/**
 * Quote for CSV, and defuse spreadsheet formulas: a walk-in can type their
 * own name, so a cell starting with = + - @ (or a tab/CR) gets a leading
 * apostrophe before an organizer opens the file in a spreadsheet.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const SOURCE_LABEL: Record<CheckinSource, string> = {
  rsvp_email: "email RSVP",
  rsvp_regenos: "regenOS RSVP",
  registrant: "2026 registrant",
  walkin: "walk-in",
};

/** `GET /api/admin/checkin/:did/:rkey/export.csv` */
export async function handleCheckinCsv(env: CheckinEnv, did: string, rkey: string): Promise<Response> {
  const rows = await eventCheckins(env, did, rkey);
  const header = ["name", "email", "regenos_guest", "source", "checked_in_at", "checked_in_by", "event", "event_starts_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, r.email, r.guest_did, SOURCE_LABEL[r.source] ?? r.source, r.checked_in_at, r.checked_in_by, r.event_name, r.event_starts_at]
        .map(csvCell)
        .join(","),
    );
  }
  const safe = rkey.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checkins-${safe}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// --------------------------------------------------------------- retention

/**
 * Delete check-ins whose event started 30+ days ago — the same window as
 * email RSVPs. Only `event_checkins` is touched: a walk-in who opted in to
 * the email list lives in `people`, which is the mailing list, not event data.
 */
export async function runCheckinRetention(env: CheckinEnv, now: Date): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();
  const res = await env.cohere.prepare(`DELETE FROM event_checkins WHERE event_starts_at < ?1`).bind(cutoff).run();
  return { deleted: res.meta?.changes ?? 0 };
}

// ------------------------------------------------------------------ router

/**
 * Everything under /api/admin/checkin. The caller has ALREADY passed the
 * admin session gate; `adminEmail` is that session's address.
 */
export async function routeCheckin(
  request: Request,
  env: CheckinEnv,
  url: URL,
  adminEmail: string,
): Promise<Response> {
  const rest = url.pathname.slice("/api/admin/checkin".length).replace(/^\//, "");
  let parts: string[];
  try {
    parts = rest ? rest.split("/").map(decodeURIComponent) : [];
  } catch {
    return json({ error: "not found" }, 404);
  }
  const method = request.method;
  if (parts.length === 1 && parts[0] === "events" && method === "GET") return handleCheckinEvents(env);
  if (parts.length === 1 && parts[0] === "registrants" && method === "GET") {
    return handleRegistrantSearch(env, url.searchParams.get("q") ?? "");
  }
  if (parts.length >= 2 && (!GUEST_DID_RE.test(parts[0]) || !/^[A-Za-z0-9._~:-]{1,512}$/.test(parts[1]))) {
    return json({ error: "not found" }, 404);
  }
  if (parts.length === 2) {
    const [did, rkey] = parts;
    if (method === "GET") return handleCheckinRoster(env, did, rkey);
    if (method === "POST") return handleCheckin(request, env, did, rkey, adminEmail);
  }
  if (parts.length === 3 && parts[2] === "export.csv" && method === "GET") {
    return handleCheckinCsv(env, parts[0], parts[1]);
  }
  if (parts.length === 3 && method === "DELETE") {
    if (!ID_RE.test(parts[2])) return json({ error: "not found" }, 404);
    return handleUndoCheckin(env, parts[0], parts[1], parts[2]);
  }
  return json({ error: "not found" }, 404);
}
