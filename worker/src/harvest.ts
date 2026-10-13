// Harvests: a COhere member's few words (and optionally one photo) about an
// event they went to, shown to every member on that event's page.
//
//   GET    /api/harvests?event=<did>/<rkey>   the event's harvests          (member)
//   GET    /api/harvests/mine                 which events I have shared on  (member)
//   GET    /api/harvests/recent               events that ended in the last 2 days (member), for the Today card
//   POST   /api/harvests                      write one                      (member)
//   PATCH  /api/harvests/:id                  edit mine
//   DELETE /api/harvests/:id                  delete mine
//   GET    /api/harvests/:id/photo            the photo                      (member)
//
// Members only, to read and to write: the person is the regenOS session's DID
// and must be on the COhere roster. There are no anonymous harvests.
//
// Why D1 and not a regenOS circle post like the Board: a harvest needs (1) an
// event reference, (2) an optional photo, and (3) editing with an "Edited"
// marker. The circle-post lexicon the proxy lends us has no photo, no update
// verb (only create/delete), and an event reference would need a strong ref we
// cannot verify without writing to scenius.social. Reports and steward hiding
// reuse the Board's tables: a harvest is `board_reports` / `board_moderation`
// row keyed by `cohere:harvest/<id>`.

import { rateLimited, type AuthEnv } from "./auth";
import { refuseCrossSiteWrite } from "./csrf";
import { eventEndMs } from "./notify-core";
import { fetchSceneEvents } from "./notify-send";
import { readVerifiedSessionDid, type RegenosAuthEnv } from "./regenos-auth";
import { isRosterMember, type RosterEnv } from "./roster";
import { lookupLiveEvent } from "./rsvps";
import type { EventsEnv } from "./events";

export type HarvestEnv = AuthEnv & RegenosAuthEnv & RosterEnv & EventsEnv & { cohere: D1Database };

export const HARVEST_TEXT_MAX = 600;
/** The decoded JPEG, after the browser has shrunk and re-encoded it. */
export const HARVEST_PHOTO_MAX_BYTES = 400_000;
const WRITES_PER_HOUR = 20;
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,2048}$/;
const RKEY_RE = /^[A-Za-z0-9._~:-]{1,512}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const harvestUri = (id: string) => `cohere:harvest/${id}`;
export const HARVEST_URI_RE = /^cohere:harvest\/[0-9a-f-]{36}$/;

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The signed-in COhere member's DID, or the Response that refuses them. */
async function memberDid(request: Request, env: HarvestEnv): Promise<{ did: string } | { refusal: Response }> {
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return { refusal: json({ error: "Sign in to see harvests." }, 401) };
  const member = await isRosterMember(env, did);
  if (member === null) return { refusal: json({ error: "We can’t check membership right now. Try again shortly." }, 503) };
  if (!member) return { refusal: json({ error: "Harvests are for COhere members." }, 403) };
  return { did };
}

/** A data: URL for a JPEG → the base64 payload, if it really is a small JPEG. */
export function readPhoto(value: unknown): { ok: true; data: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "photo must be an image" };
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { ok: false, error: "The photo has to be a JPEG." };
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, error: "That photo couldn’t be read." };
  }
  if (bytes.length > HARVEST_PHOTO_MAX_BYTES) return { ok: false, error: "That photo is too big." };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, error: "That doesn’t look like a JPEG." };
  return { ok: true, data: match[1] };
}

export interface HarvestRow {
  id: string;
  event_did: string;
  event_rkey: string;
  event_name: string;
  event_ends_at: string | null;
  author_did: string;
  body: string;
  prompt: string;
  lang: string;
  has_photo: number;
  created_at: string;
  edited_at: string | null;
}

const shape = (row: HarvestRow, viewer: string, moderation: string | undefined) => ({
  id: row.id, eventDid: row.event_did, eventRkey: row.event_rkey, eventName: row.event_name, authorDid: row.author_did,
  body: row.body, prompt: row.prompt, lang: row.lang, hasPhoto: row.has_photo === 1, createdAt: row.created_at, editedAt: row.edited_at,
  mine: row.author_did === viewer, ...(moderation ? { moderation } : {}),
});

async function states(db: D1Database, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { results } = await db
    .prepare(`SELECT uri, state FROM board_moderation WHERE uri IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids.map(harvestUri))
    .all<{ uri: string; state: string }>();
  for (const r of results) out.set(r.uri.slice("cohere:harvest/".length), r.state);
  return out;
}

/** A hidden or removed harvest is gone for everyone but its author, who sees it marked. */
const visible = (state: string | undefined, mine: boolean) => !(state === "hidden" || state === "removed") || mine;

async function list(env: HarvestEnv, did: string, event: string): Promise<Response> {
  const [eventDid, eventRkey] = event.split("/");
  if (!eventDid || !eventRkey || !DID_RE.test(eventDid) || !RKEY_RE.test(eventRkey)) return json({ error: "unknown event" }, 400);
  const { results } = await env.cohere
    .prepare("SELECT * FROM harvests WHERE event_did = ?1 AND event_rkey = ?2 ORDER BY created_at ASC LIMIT 500")
    .bind(eventDid, eventRkey)
    .all<HarvestRow>();
  const moderated = await states(env.cohere, results.map((r) => r.id));
  return json({
    harvests: results
      .filter((r) => visible(moderated.get(r.id), r.author_did === did))
      .map((r) => shape(r, did, moderated.get(r.id) === "hidden" || moderated.get(r.id) === "removed" ? moderated.get(r.id) : undefined)),
  });
}

async function mine(env: HarvestEnv, did: string): Promise<Response> {
  const { results } = await env.cohere
    .prepare("SELECT id, event_did, event_rkey FROM harvests WHERE author_did = ?1 ORDER BY created_at DESC LIMIT 200")
    .bind(did)
    .all<{ id: string; event_did: string; event_rkey: string }>();
  return json({ harvests: results.map((r) => ({ id: r.id, eventDid: r.event_did, eventRkey: r.event_rkey })) });
}

const RECENT_HOURS = 48;

/** Events that have just ended; the public calendar listing drops an event the moment it ends. */
async function recent(env: HarvestEnv, deps: { events?: typeof fetchSceneEvents }): Promise<Response> {
  const events = await (deps.events ?? fetchSceneEvents)(env as never);
  if (!events) return json({ error: "The calendar isn’t responding right now." }, 503);
  const now = Date.now();
  return json({
    events: events
      .flatMap((e) => {
        const end = eventEndMs(e);
        return !Number.isNaN(end) && end <= now && now - end <= RECENT_HOURS * 3600_000
          ? [{ did: e.did, rkey: e.rkey, name: e.name, startsAt: e.startsAt, endsAt: e.endsAt, where: e.location?.name ?? null }]
          : [];
      })
      .sort((a, b) => Date.parse(b.endsAt ?? b.startsAt ?? "") - Date.parse(a.endsAt ?? a.startsAt ?? "")),
  });
}

function validBody(value: unknown): string | null {
  return typeof value === "string" && value.trim() && Array.from(value.trim()).length <= HARVEST_TEXT_MAX ? value.trim() : null;
}

async function create(request: Request, env: HarvestEnv, did: string, lookup: typeof lookupLiveEvent): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "invalid JSON" }, 400);
  const text = validBody(body.body);
  if (!text) return json({ error: `Write a few words first (up to ${HARVEST_TEXT_MAX} characters).` }, 400);
  const eventDid = typeof body.eventDid === "string" ? body.eventDid : "";
  const eventRkey = typeof body.eventRkey === "string" ? body.eventRkey : "";
  if (!DID_RE.test(eventDid) || !RKEY_RE.test(eventRkey)) return json({ error: "unknown event" }, 400);
  const prompt = body.prompt === "inquiry" ? "inquiry" : "event";
  const lang = body.lang === "es" ? "es" : "en";
  let photo: string | null = null;
  if (body.photo !== undefined && body.photo !== null) {
    const read = readPhoto(body.photo);
    if (!read.ok) return json({ error: read.error }, 400);
    photo = read.data;
  }
  if (await rateLimited(env, `harvest-write:${did}`, WRITES_PER_HOUR, 3600)) return json({ error: "That’s a lot of harvests. Please try again later." }, 429);

  const live = await lookup(env, eventDid, eventRkey);
  if (live.kind === "gone") return json({ error: "unknown event" }, 404);
  if (live.kind === "unavailable") return json({ error: "The calendar isn’t responding right now. Try again in a moment." }, 503);
  const endMs = eventEndMs(live.event);
  if (live.event.status === "cancelled") return json({ error: "This event was cancelled." }, 400);
  if (Number.isNaN(endMs) || endMs > Date.now()) return json({ error: "Harvests open when the event ends." }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await env.cohere
    .prepare(
      `INSERT INTO harvests (id, event_did, event_rkey, event_name, event_ends_at, author_did, body, prompt, lang, has_photo, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ON CONFLICT (event_did, event_rkey, author_did) DO NOTHING`,
    )
    .bind(id, eventDid, eventRkey, live.event.name, new Date(endMs).toISOString(), did, text, prompt, lang, photo ? 1 : 0, now)
    .run();
  if (!inserted.meta.changes) return json({ error: "You already shared a harvest for this event. Edit it instead." }, 409);
  if (photo) await env.cohere.prepare("INSERT INTO harvest_photos (harvest_id, mime, data) VALUES (?1, 'image/jpeg', ?2)").bind(id, photo).run();
  const row = (await env.cohere.prepare("SELECT * FROM harvests WHERE id = ?1").bind(id).first<HarvestRow>())!;
  return json({ harvest: shape(row, did, undefined) }, 201);
}

async function ownRow(env: HarvestEnv, did: string, id: string): Promise<HarvestRow | Response> {
  if (!ID_RE.test(id)) return json({ error: "not found" }, 404);
  const row = await env.cohere.prepare("SELECT * FROM harvests WHERE id = ?1").bind(id).first<HarvestRow>();
  if (!row) return json({ error: "not found" }, 404);
  if (row.author_did !== did) return json({ error: "That isn’t yours to change." }, 403);
  return row;
}

async function edit(request: Request, env: HarvestEnv, did: string, id: string): Promise<Response> {
  const row = await ownRow(env, did, id);
  if (row instanceof Response) return row;
  const body = await readJson(request);
  if (!body) return json({ error: "invalid JSON" }, 400);
  const text = "body" in body ? validBody(body.body) : row.body;
  if (!text) return json({ error: "A harvest can’t be empty. Delete it instead." }, 400);
  const now = new Date().toISOString();
  const statements = [];
  let hasPhoto = row.has_photo;
  if (body.photo === null) {
    hasPhoto = 0;
    statements.push(env.cohere.prepare("DELETE FROM harvest_photos WHERE harvest_id = ?1").bind(id));
  } else if (body.photo !== undefined) {
    const read = readPhoto(body.photo);
    if (!read.ok) return json({ error: read.error }, 400);
    hasPhoto = 1;
    statements.push(env.cohere.prepare("INSERT INTO harvest_photos (harvest_id, mime, data) VALUES (?1, 'image/jpeg', ?2) ON CONFLICT(harvest_id) DO UPDATE SET data = ?2").bind(id, read.data));
  }
  const changed = text !== row.body || hasPhoto !== row.has_photo || body.photo !== undefined;
  if (changed) {
    if (await rateLimited(env, `harvest-write:${did}`, WRITES_PER_HOUR, 3600)) return json({ error: "That’s a lot of edits. Please try again later." }, 429);
    statements.push(env.cohere.prepare("UPDATE harvests SET body = ?2, has_photo = ?3, edited_at = ?4 WHERE id = ?1").bind(id, text, hasPhoto, now));
    await env.cohere.batch(statements);
  }
  const next = (await env.cohere.prepare("SELECT * FROM harvests WHERE id = ?1").bind(id).first<HarvestRow>())!;
  return json({ harvest: shape(next, did, undefined) });
}

async function remove(env: HarvestEnv, did: string, id: string): Promise<Response> {
  const row = await ownRow(env, did, id);
  if (row instanceof Response) return row;
  const now = new Date().toISOString();
  await env.cohere.batch([
    env.cohere.prepare("DELETE FROM harvest_photos WHERE harvest_id = ?1").bind(id),
    env.cohere.prepare("DELETE FROM harvests WHERE id = ?1").bind(id),
    // An open report of something that no longer exists closes itself.
    env.cohere.prepare("UPDATE board_reports SET status = 'dismissed', resolved_at = ?2, resolved_by = 'author deleted it' WHERE post_uri = ?1 AND status = 'open'").bind(harvestUri(id), now),
    env.cohere.prepare("DELETE FROM board_moderation WHERE uri = ?1 AND state IN ('hidden', 'pending', 'approved')").bind(harvestUri(id)),
  ]);
  return json({ ok: true });
}

async function photo(env: HarvestEnv, did: string, id: string): Promise<Response> {
  if (!ID_RE.test(id)) return json({ error: "not found" }, 404);
  const row = await env.cohere
    .prepare("SELECT h.author_did, p.mime, p.data FROM harvests h JOIN harvest_photos p ON p.harvest_id = h.id WHERE h.id = ?1")
    .bind(id)
    .first<{ author_did: string; mime: string; data: string }>();
  if (!row) return json({ error: "not found" }, 404);
  const state = (await states(env.cohere, [id])).get(id);
  if (!visible(state, row.author_did === did)) return json({ error: "not found" }, 404);
  const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
  // Members only, and private to this browser: a shared cache must never hold it.
  return new Response(bytes, { headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
}

/** Routes under /api/harvests. Null for any other path. */
export async function handleHarvests(request: Request, env: HarvestEnv, url: URL, deps: { lookup?: typeof lookupLiveEvent; events?: typeof fetchSceneEvents } = {}): Promise<Response | null> {
  const path = url.pathname;
  if (path !== "/api/harvests" && !path.startsWith("/api/harvests/")) return null;
  const method = request.method;
  if (method !== "GET") {
    const refused = refuseCrossSiteWrite(request, { json: method !== "DELETE" });
    if (refused) return refused;
  }
  const who = await memberDid(request, env);
  if ("refusal" in who) return who.refusal;

  if (path === "/api/harvests") {
    if (method === "GET") return list(env, who.did, url.searchParams.get("event") ?? "");
    if (method === "POST") return create(request, env, who.did, deps.lookup ?? lookupLiveEvent);
    return json({ error: "method not allowed" }, 405);
  }
  if (path === "/api/harvests/mine" && method === "GET") return mine(env, who.did);
  if (path === "/api/harvests/recent" && method === "GET") return recent(env, deps);
  const one = /^\/api\/harvests\/([^/]+)(\/photo)?$/.exec(path);
  if (one) {
    if (one[2]) return method === "GET" ? photo(env, who.did, one[1]) : json({ error: "method not allowed" }, 405);
    if (method === "PATCH") return edit(request, env, who.did, one[1]);
    if (method === "DELETE") return remove(env, who.did, one[1]);
  }
  return json({ error: "not found" }, 404);
}
