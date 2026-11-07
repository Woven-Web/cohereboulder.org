import { eventImageUrl, imageVersions, type EventImagesEnv } from "./event-images";
// The community calendar read proxy — regenOS (scenius.social) → this Worker → the SPA.
//
// Why a proxy at all: the regenOS AppView sends no CORS headers on any /xrpc
// path, so the browser cannot call it directly. The Worker fetches server-side,
// anonymously — `getEvents` takes no viewer input, so every caller gets
// byte-identical public rows and no credentials are ever forwarded — trims the
// payload to what the calendar page renders, and caches the trimmed listing
// briefly at the edge (the read is viewer-independent, so a shared cache is
// honest).
//
// SAME CONTRACT AS THE SITE'S OTHER DEGRADED PATHS: the list handler never
// throws and never 500s. regenOS being down, unconfigured, or mid-migration
// must never break /calendar — the frontend sees `degraded`/`unconfigured` and
// falls back to the Luma embed (src/lib/events.ts).
//
// ENDED EVENTS come from the collective's PDS, not the AppView. regenOS's getEvents and getEvent
// stop serving an event once it has ended (`not_ended_sql` in its xrpc/scene.rs), and offer no
// past option, but the public records stay in the collective's repo. So `?past=1` and the event
// page read `com.atproto.repo` there, anonymously. Reading the repo exposes nothing new: regenOS
// routes a private event to the invite space INSTEAD of the repo, never to both. The AppView still
// alone decides what is upcoming; a record joins the list only once it has ended.

export interface EventsEnv extends EventImagesEnv {
  /** Base URL of regenOS's public /xrpc surface, no trailing slash. */
  REGENOS_BASE_URL?: string;
  /**
   * DID of the COhere collective (scene). Deliberately unset until the scene
   * exists — /api/events answers `{ events: [], unconfigured: true }` meanwhile.
   */
  REGENOS_COLLECTIVE_DID?: string;
  /** Public regenOS web origin, used only for the subscribable calendar.ics link. */
  REGENOS_WEB_URL?: string;
  /** The collective's PDS, no trailing slash. Unset: no ended events, the calendar behaves as before. */
  REGENOS_PDS_URL?: string;
  /**
   * The DID that PDS hosts. The URL only counts while this matches REGENOS_COLLECTIVE_DID, so a
   * local stack pointed at a mock scene can never call the real PDS on the config it inherits.
   */
  REGENOS_PDS_DID?: string;
  /**
   * Hermetic e2e only (`wrangler dev --var`): the ISO instant the listing treats as now, so a lane
   * that pins its browser to a festival day gets a Worker that agrees. No wrangler config sets it,
   * and it counts only against a loopback regenOS mock (see listingNow), so production runs on the real clock.
   */
  E2E_LISTING_NOW?: string;
}

/** The borrowed event collection every regenOS event lives in. */
const EVENT_COLLECTION = "community.lexicon.calendar.event";
/** The AppView clamps `limit` to 200; ask for the whole calendar and trim locally. */
const FETCH_LIMIT = 200;
/** A slow commons must never stall the page for long. */
const UPSTREAM_TIMEOUT_MS = 8_000;
/** How long the edge may serve one trimmed listing before re-reading upstream. */
const CACHE_SECONDS = 300;
/**
 * The edge's two copies of the listing, both dropped after a write. Separate so the plain one never
 * waits on the PDS: home and the sitemap only want what is upcoming.
 */
export const EVENT_LISTING_PATHS = ["/api/events", "/api/events?past=1"];
/** A listing missing its ended events is retried sooner. */
const PARTIAL_CACHE_SECONDS = 60;
/** The PDS's largest page, and enough pages for years of calendars. */
const PDS_PAGE_SIZE = 100;
const PDS_MAX_PAGES = 10;
/** The whole PDS walk. The AppView is read alongside it, so this is what a slow PDS can cost a page. */
const PDS_TIMEOUT_MS = 6_000;

function baseUrl(env: EventsEnv): string | null {
  const raw = env.REGENOS_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function pdsUrl(env: EventsEnv): string | null {
  const raw = env.REGENOS_PDS_URL?.trim();
  return raw && env.REGENOS_PDS_DID?.trim() === collectiveDid(env) ? raw.replace(/\/+$/, "") : null;
}

function collectiveDid(env: EventsEnv): string | null {
  const raw = env.REGENOS_COLLECTIVE_DID?.trim();
  if (!raw) return null;
  // A DID is the only thing we accept — a handle would silently 400 upstream
  // and look like "regenOS is down".
  if (!raw.startsWith("did:")) {
    console.warn(`REGENOS_COLLECTIVE_DID is not a DID (${raw}) — ignoring`);
    return null;
  }
  return raw;
}

/** The collective's feed on the regenOS web app, or null when unconfigured. /calendar.ics proxies it. */
export function calendarIcsUrl(env: EventsEnv): string | null {
  const webBase = env.REGENOS_WEB_URL?.trim().replace(/\/+$/, "");
  const scene = collectiveDid(env);
  if (!webBase || !scene) return null;
  // scenius serves /scenes/<did>/calendar.ics with the DID's colons raw,
  // not percent-encoded — verified against the live app.
  return `${webBase}/scenes/${scene}/calendar.ics`;
}

/** The subscribable feed the site hands out: ours, on the caller's origin (see calendar-feed.ts). */
const feedUrl = (env: EventsEnv, origin: string | undefined): string | null => (origin && calendarIcsUrl(env) ? `${origin}/calendar.ics` : null);

// ---------------------------------------------------------------- wire shapes
// Hand-written and tolerant: prod is ahead of any local checkout, so extra
// fields must pass through unnoticed and missing ones must not crash anything.

interface LocationValue {
  $type?: string;
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
}

interface CalendarEventValue {
  name?: string;
  description?: string;
  createdAt?: string;
  startsAt?: string;
  endsAt?: string;
  /** e.g. "community.lexicon.calendar.event#cancelled" — we keep the fragment. */
  status?: string;
  /** e.g. "community.lexicon.calendar.event#inperson" — we keep the fragment. */
  mode?: string;
  locations?: LocationValue[];
  uris?: { uri?: string; name?: string }[] | string[];
}

export interface GetEventsRow {
  uri?: string;
  value?: CalendarEventValue;
}

// -------------------------------------------------------------- trimmed shape

export interface EventLocation {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
}

/**
 * What a calendar card needs — the list and detail routes share this core,
 * and so does the admin Events tab (worker/src/regenos-service.ts). Exported
 * for that reason: one parse of regenOS's wire shape, not two.
 */
export interface CommunityEvent {
  did: string;
  rkey: string;
  name: string;
  imageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  /** "scheduled" | "planned" | "rescheduled" | "cancelled" | "postponed" | null. */
  status: string | null;
  /** "inperson" | "virtual" | "hybrid" | null. */
  mode: string | null;
  location: EventLocation | null;
}

/** `at://did:plc:xyz/community.lexicon.calendar.event/3k2a` → parts, or null. */
function splitAtUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/[^/]+\/(.+)$/.exec(uri);
  if (!m) return null;
  return { did: m[1], rkey: m[2] };
}

/** "community.lexicon.calendar.event#cancelled" → "cancelled". */
function fragment(value: string | undefined): string | null {
  if (typeof value !== "string" || !value) return null;
  const hash = value.lastIndexOf("#");
  return hash >= 0 ? value.slice(hash + 1) : value;
}

/**
 * The `community.lexicon.location.address` face of an event's `locations`, or
 * null. A `rough` public face publishes a geo cell and no address fields at
 * all; an all-empty address is nothing to show, so say so rather than let the
 * page render blank location text.
 */
function publicAddress(value: CalendarEventValue): EventLocation | null {
  const address = (value.locations ?? []).find(
    (l) => l?.$type === "community.lexicon.location.address",
  );
  if (!address) return null;
  const location: EventLocation = {
    name: address.name,
    street: address.street,
    locality: address.locality,
    region: address.region,
    postalCode: address.postalCode,
  };
  return Object.values(location).some((v) => typeof v === "string" && v.trim()) ? location : null;
}

export function toCommunityEvent(row: GetEventsRow): CommunityEvent | null {
  const v = row.value;
  if (!row.uri || !v?.name) return null;
  const parts = splitAtUri(row.uri);
  if (!parts) return null;
  return {
    did: parts.did,
    rkey: parts.rkey,
    name: v.name,
    imageUrl: null,
    startsAt: typeof v.startsAt === "string" ? v.startsAt : null,
    endsAt: typeof v.endsAt === "string" ? v.endsAt : null,
    description: typeof v.description === "string" ? v.description : null,
    status: fragment(v.status),
    mode: fragment(v.mode),
    location: publicAddress(v),
  };
}

/**
 * Event records are community-authored remote content, and the detail page
 * renders `uris[].uri` as `<a href>` on the same origin as the admin portal —
 * so only schemes that cannot run script may pass. Anything unparseable or on
 * another scheme (javascript:, data:, …) is dropped here, server-side.
 */
const SAFE_URI_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeUri(uri: string): boolean {
  try {
    return SAFE_URI_SCHEMES.has(new URL(uri).protocol);
  } catch {
    return false;
  }
}

/** `uris` has carried both bare strings and { uri, name } objects; take either, but only on a safe scheme. */
function safeLinks(value: CalendarEventValue): { uri: string; name?: string }[] {
  const uris: { uri: string; name?: string }[] = [];
  for (const entry of Array.isArray(value.uris) ? value.uris : []) {
    const link: { uri?: unknown; name?: unknown } =
      typeof entry === "string" ? { uri: entry } : (entry ?? {});
    if (typeof link.uri !== "string" || !isSafeUri(link.uri)) continue;
    uris.push({ uri: link.uri, name: typeof link.name === "string" ? link.name : undefined });
  }
  return uris;
}

function json(data: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/** Failure answers must not be cached anywhere — recovery should be immediate. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The edge cache holds ONE copy per URL and ignores `Vary`, so a cached
 * listing must stay CORS-neutral — the allowed origin is decided per request,
 * on the way out.
 */
function withCors(response: Response, cors: Record<string, string>): Response {
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  for (const [name, value] of Object.entries(cors)) out.headers.set(name, value);
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long an ended event stays in the list behind `?past=1`. */
const RECENT_PAST_DAYS = 14;

/**
 * The listing's clock: the real one, unless a local e2e lane pinned E2E_LISTING_NOW while the
 * Worker reads a loopback regenOS mock. Production reads scenius.social, so a stray var can never
 * move what it calls upcoming. (Not the request's host: wrangler dev rewrites it to the route's.)
 */
export function listingNow(env: EventsEnv): number {
  const pinned = env.E2E_LISTING_NOW ? Date.parse(env.E2E_LISTING_NOW) : NaN;
  const mock = /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(baseUrl(env) ?? "");
  return mock && !Number.isNaN(pinned) ? pinned : Date.now();
}

/** Drops ended events from a full listing unless the caller asked for the recent past. */
async function shapeListing(res: Response, withPast: boolean, now: number): Promise<Response> {
  if (withPast) return res;
  const body = (await res.clone().json()) as { events: CommunityEvent[] };
  const events = body.events.filter((e) => {
    const start = e.startsAt ? Date.parse(e.startsAt) : NaN;
    if (Number.isNaN(start)) return true;
    const end = e.endsAt ? Date.parse(e.endsAt) : NaN;
    return (Number.isNaN(end) ? start : end) >= now;
  });
  const out = new Response(JSON.stringify({ ...body, events }), res);
  out.headers.set("content-type", "application/json");
  return out;
}

/** The Cache API's default namespace; workers-types aren't wired in this repo. */
const edgeCache = (caches as unknown as { default: Cache }).default;

// ------------------------------------------------------------- ended events

/** What organizers title an event while trying the form. "Testing the Waters" is a real event. */
const isTestRecord = (name: string) => /^test(\s+event)?(\s+\d+)?$/i.test(name.trim());

/** The instant a dated event is over (its start, when it gives no end), or null when undated. */
function endedAtMs(event: { startsAt: string | null; endsAt: string | null }): number | null {
  const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
  if (Number.isNaN(start)) return null;
  const end = event.endsAt ? Date.parse(event.endsAt) : NaN;
  return Number.isNaN(end) ? start : end;
}

/**
 * A PDS record as a calendar event, or null unless it is one worth keeping: ended, real, not
 * cancelled or postponed. A PDS need not validate a record against the lexicon, so a malformed one is skipped
 * here. Left to throw, one bad record would take the whole calendar down with it.
 */
function toEndedEvent(row: GetEventsRow, now: number): CommunityEvent | null {
  try {
    const event = toCommunityEvent(row);
    // Postponed joins cancelled: neither took place, and regenOS's own not-ended rule hides both.
    if (!event || event.status === "cancelled" || event.status === "postponed" || isTestRecord(event.name)) return null;
    const ended = endedAtMs(event);
    return ended !== null && ended < now ? event : null;
  } catch {
    return null;
  }
}

/**
 * The AppView's list plus the collective's ended PDS records, soonest first, undated last. One row
 * per event, and the AppView's copy wins. A record that has not ended stays out: the AppView alone
 * says what is upcoming. Ended records can't be checked the same way: the AppView's listing records
 * aren't in the repo, so an ended event record in the repo counts as a calendar event, and an ended
 * event from another author's repo isn't seen. Today's records match the scene's .ics exactly.
 */
export function mergePastEvents(listed: CommunityEvent[], records: GetEventsRow[], now: number): CommunityEvent[] {
  const byEvent = new Map(listed.map((event) => [`${event.did}/${event.rkey}`, event]));
  for (const row of records) {
    const event = toEndedEvent(row, now);
    if (event && !byEvent.has(`${event.did}/${event.rkey}`)) byEvent.set(`${event.did}/${event.rkey}`, event);
  }
  const startOf = (event: CommunityEvent) => {
    const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
    return Number.isNaN(start) ? Infinity : start;
  };
  // Sort on the parsed instant, not the string: ISO strings with mixed UTC offsets don't sort lexicographically.
  return [...byEvent.values()].sort((a, b) => startOf(a) - startOf(b));
}

/**
 * Every event record in the collective's repo, or null if the read failed. Never throws, and never
 * returns part of a walk: half a festival looks like the truth, where an error gets retried. The
 * PDS hands back a cursor even on its last page, so an empty page ends the walk too.
 */
async function readRepoEvents(env: EventsEnv, scene: string): Promise<GetEventsRow[] | null> {
  const pds = pdsUrl(env);
  if (!pds) return [];
  const records: GetEventsRow[] = [];
  const signal = AbortSignal.timeout(PDS_TIMEOUT_MS);
  try {
    let cursor: string | undefined;
    for (let page = 0; page < PDS_MAX_PAGES; page++) {
      const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
      url.searchParams.set("repo", scene);
      url.searchParams.set("collection", EVENT_COLLECTION);
      url.searchParams.set("limit", String(PDS_PAGE_SIZE));
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { headers: { accept: "application/json" }, signal });
      if (!res.ok) {
        console.warn(`PDS listRecords returned ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { records?: GetEventsRow[]; cursor?: string };
      const rows = data.records ?? [];
      records.push(...rows);
      if (!data.cursor || rows.length === 0) break;
      cursor = data.cursor;
    }
    return records;
  } catch (err) {
    console.warn("PDS listRecords failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * GET /api/events — the collective's upcoming public calendar, soonest first,
 * undated events last. `?past=1` also keeps ended events: the collective's PDS
 * records (see mergePastEvents), and anything the AppView itself still returns
 * from the last RECENT_PAST_DAYS. The Calendar page shows them, their harvests
 * and the festival's earlier days. Never 500s:
 *   unconfigured (no scene yet)     → { events: [], unconfigured: true }
 *   upstream failure of any kind    → { events: [], degraded: true }
 *   PDS failed, `past`, none listed → { events: [], degraded: true }
 *   otherwise                       → { events, icsUrl }
 */
export async function handleEventsList(
  request: Request,
  env: EventsEnv,
  cors: Record<string, string>,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  if (!base || !scene) {
    return json({ events: [], unconfigured: true }, 200, { ...cors, ...NO_STORE });
  }

  // The listing is viewer-independent by design, so edge-cached copies per
  // hostname serve everyone. (The Cache API is a no-op on workers.dev — it
  // engages on the real domain.) The plain copy carries whatever recent past
  // the AppView returns and is filtered down per request; the past copy adds
  // the PDS's ended events. See EVENT_LISTING_PATHS.
  const pastParam = new URL(request.url).searchParams.get("past");
  const withPast = pastParam === "1" || pastParam === "true";
  const now = listingNow(env);
  const cacheKey = new Request(new URL(EVENT_LISTING_PATHS[withPast ? 1 : 0], request.url).toString());
  /** A past view whose ended events could not be read has only a blank to show: say so, and retry. */
  const answer = async (listing: Response): Promise<Response> => {
    if (withPast) {
      const body = (await listing.clone().json()) as { events: CommunityEvent[]; pastUnavailable?: boolean };
      if (body.pastUnavailable && body.events.length === 0) return json({ events: [], degraded: true }, 200, { ...cors, ...NO_STORE });
    }
    return withCors(await shapeListing(listing, withPast, now), cors);
  };
  const cached = await edgeCache.match(cacheKey);
  if (cached) return answer(cached);

  const upstream = new URL(`${base}/xrpc/social.scenius.getEvents`);
  upstream.searchParams.set("scene", scene);
  upstream.searchParams.set("limit", String(FETCH_LIMIT));

  try {
    // Together, so a healthy PDS adds no wait.
    const [res, repoEvents] = await Promise.all([
      fetch(upstream.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }),
      withPast ? readRepoEvents(env, scene) : [],
    ]);
    if (!res.ok) {
      console.warn(`regenOS getEvents returned ${res.status} — degrading`);
      return json({ events: [], degraded: true }, 200, { ...cors, ...NO_STORE });
    }

    const data = (await res.json()) as { events?: GetEventsRow[] };
    const versions = await imageVersions(env);
    const listed: CommunityEvent[] = [];
    for (const row of data.events ?? []) {
      const event = toCommunityEvent(row);
      if (!event) continue;
      const ended = endedAtMs(event);
      if (ended === null) {
        // No start time (both are optional in the lexicon) — keep it, last,
        // but only while its createdAt is under 60 days old, so it can't linger forever.
        const createdMs = Date.parse(row.value?.createdAt ?? "");
        if (now - createdMs <= 60 * 24 * 60 * 60 * 1000) listed.push(event);
        continue;
      }
      // "Upcoming" includes in-progress: an event ends when it ends, not when
      // it starts. Rows come back in index order, NOT start order — the merge sorts.
      if (ended < now - RECENT_PAST_DAYS * DAY_MS) continue;
      listed.push(event);
    }

    const events = mergePastEvents(listed, repoEvents ?? [], now);
    for (const event of events) event.imageUrl = eventImageUrl(versions, event.did, event.rkey);

    const response = json(
      { events, icsUrl: feedUrl(env, new URL(request.url).origin), ...(repoEvents ? {} : { pastUnavailable: true }) },
      200,
      { "Cache-Control": `public, max-age=${repoEvents ? CACHE_SECONDS : PARTIAL_CACHE_SECONDS}` },
    );
    await edgeCache.put(cacheKey, response.clone());
    return answer(response);
  } catch (err) {
    console.warn("regenOS getEvents failed — degrading:", err instanceof Error ? err.message : err);
    return json({ events: [], degraded: true }, 200, { ...cors, ...NO_STORE });
  }
}

/**
 * GET /api/events/:did/:rkey — one public event, for the in-site detail page.
 *
 * Anonymous, like the list. Upstream, a PUBLIC event reads for anyone; a
 * PRIVATE one 401s an anonymous caller without leaking that it exists. So an
 * upstream 401 and 404 are the same answer — not a public event — and we say
 * one honest 404 for both (and, defensively, for any non-"public" visibility
 * that does come back). An upstream failure is NOT "not found": that answers
 * 503 `{ degraded: true }` so the page can say "try again" instead of
 * "removed". Never throws.
 */
export async function handleEventDetail(
  env: EventsEnv,
  did: string,
  rkey: string,
  cors: Record<string, string>,
  /** The site's origin, for the feed link. Internal callers that only want the event leave it out. */
  origin?: string,
): Promise<Response> {
  const base = baseUrl(env);
  if (!base || !did.startsWith("did:") || !rkey) {
    return json({ error: "not found" }, 404, { ...cors, ...NO_STORE });
  }

  const atUri = `at://${did}/${EVENT_COLLECTION}/${rkey}`;
  const upstream = new URL(`${base}/xrpc/social.scenius.getEvent`);
  upstream.searchParams.set("uri", atUri);

  try {
    const res = await fetch(upstream.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 401) {
        return json({ error: "not found" }, 404, { ...cors, ...NO_STORE });
      }
      console.warn(`regenOS getEvent returned ${res.status} — degraded`);
      return json({ degraded: true }, 503, { ...cors, ...NO_STORE });
    }

    const data = (await res.json()) as {
      uri?: string;
      value?: CalendarEventValue;
      visibility?: string;
      hostName?: string;
    };
    const v = data.value;
    if (!v?.name) return json({ error: "not found" }, 404, { ...cors, ...NO_STORE });
    if (data.visibility !== undefined && data.visibility !== "public") {
      return json({ error: "not found" }, 404, { ...cors, ...NO_STORE });
    }

    const core = toCommunityEvent({ uri: data.uri ?? atUri, value: v });
    if (!core) return json({ error: "not found" }, 404, { ...cors, ...NO_STORE });

    core.imageUrl = eventImageUrl(await imageVersions(env), core.did, core.rkey);

    return json(
      {
        event: { ...core, uris: safeLinks(v), hostName: typeof data.hostName === "string" ? data.hostName : null },
        icsUrl: feedUrl(env, origin),
      },
      200,
      { ...cors, "Cache-Control": "public, max-age=0, must-revalidate" },
    );
  } catch (err) {
    console.warn("regenOS getEvent failed — degraded:", err instanceof Error ? err.message : err);
    return json({ degraded: true }, 503, { ...cors, ...NO_STORE });
  }
}

/**
 * The public event page's read: the AppView, then, once it has stopped serving the event, the
 * record in the collective's repo. Separate from handleEventDetail on purpose, because the RSVP and
 * check-in paths (rsvps.ts, checkins.ts) need "gone" to keep meaning gone. The AppView's 401 and 404 both arrive here as
 * 404, which is safe: a private event's record is not in the repo. Only ended, real, uncancelled
 * records open, the same ones the list shows, and only from the collective's own repo. A PDS
 * failure answers 503, so the page says "try again" and not "removed". Never throws.
 */
export async function handleEventDetailWithArchive(
  env: EventsEnv,
  did: string,
  rkey: string,
  cors: Record<string, string>,
  origin?: string,
): Promise<Response> {
  const live = await handleEventDetail(env, did, rkey, cors, origin);
  const pds = pdsUrl(env);
  if (live.status !== 404 || !pds || did !== collectiveDid(env)) return live;

  const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", EVENT_COLLECTION);
  url.searchParams.set("rkey", rkey);
  try {
    const res = await fetch(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    // A missing record is the PDS's 400 RecordNotFound.
    if (res.status === 400 || res.status === 404) return live;
    if (!res.ok) {
      console.warn(`PDS getRecord returned ${res.status} — degraded`);
      return json({ degraded: true }, 503, { ...cors, ...NO_STORE });
    }
    const row = (await res.json()) as GetEventsRow;
    const event = toEndedEvent(row, Date.now());
    if (!event) return live;
    event.imageUrl = eventImageUrl(await imageVersions(env), event.did, event.rkey);
    return json(
      { event: { ...event, uris: safeLinks(row.value ?? {}), hostName: null }, icsUrl: feedUrl(env, origin) },
      200,
      { ...cors, "Cache-Control": "public, max-age=0, must-revalidate" },
    );
  } catch (err) {
    console.warn("PDS getRecord failed — degraded:", err instanceof Error ? err.message : err);
    return json({ degraded: true }, 503, { ...cors, ...NO_STORE });
  }
}
