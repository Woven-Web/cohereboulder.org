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

export interface EventsEnv {
  /** Base URL of regenOS's public /xrpc surface, no trailing slash. */
  REGENOS_BASE_URL?: string;
  /**
   * DID of the COhere collective (scene). Deliberately unset until the scene
   * exists — /api/events answers `{ events: [], unconfigured: true }` meanwhile.
   */
  REGENOS_COLLECTIVE_DID?: string;
  /** Public regenOS web origin, used only for the subscribable calendar.ics link. */
  REGENOS_WEB_URL?: string;
}

/** The borrowed event collection every regenOS event lives in. */
const EVENT_COLLECTION = "community.lexicon.calendar.event";
/** The AppView clamps `limit` to 200; ask for the whole calendar and trim locally. */
const FETCH_LIMIT = 200;
/** A slow commons must never stall the page for long. */
const UPSTREAM_TIMEOUT_MS = 8_000;
/** How long the edge may serve one trimmed listing before re-reading upstream. */
const CACHE_SECONDS = 300;

function baseUrl(env: EventsEnv): string | null {
  const raw = env.REGENOS_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
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

/** The collective's subscribable feed on the regenOS web app, or null when unconfigured. */
function calendarIcsUrl(env: EventsEnv): string | null {
  const webBase = env.REGENOS_WEB_URL?.trim().replace(/\/+$/, "");
  const scene = collectiveDid(env);
  if (!webBase || !scene) return null;
  // scenius serves /scenes/<did>/calendar.ics with the DID's colons raw,
  // not percent-encoded — verified against the live app.
  return `${webBase}/scenes/${scene}/calendar.ics`;
}

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
  for (const [name, value] of Object.entries(cors)) out.headers.set(name, value);
  return out;
}

/** The Cache API's default namespace; workers-types aren't wired in this repo. */
const edgeCache = (caches as unknown as { default: Cache }).default;

/**
 * GET /api/events — the collective's upcoming public calendar, soonest first,
 * undated events last. Never 500s:
 *   unconfigured (no scene yet)  → { events: [], unconfigured: true }
 *   upstream failure of any kind → { events: [], degraded: true }
 *   otherwise                    → { events, icsUrl }
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

  // The listing is viewer-independent by design, so one edge-cached copy per
  // hostname serves everyone. (The Cache API is a no-op on workers.dev — it
  // engages on the real domain.)
  const cacheKey = new Request(new URL("/api/events", request.url).toString());
  const cached = await edgeCache.match(cacheKey);
  if (cached) return withCors(cached, cors);

  const upstream = new URL(`${base}/xrpc/social.scenius.getEvents`);
  upstream.searchParams.set("scene", scene);
  upstream.searchParams.set("limit", String(FETCH_LIMIT));

  try {
    const res = await fetch(upstream.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`regenOS getEvents returned ${res.status} — degrading`);
      return json({ events: [], degraded: true }, 200, { ...cors, ...NO_STORE });
    }

    const data = (await res.json()) as { events?: GetEventsRow[] };
    const now = Date.now();
    const dated: { event: CommunityEvent; startMs: number }[] = [];
    const undated: CommunityEvent[] = [];
    for (const row of data.events ?? []) {
      const event = toCommunityEvent(row);
      if (!event) continue;
      const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
      if (Number.isNaN(startMs)) {
        // No start time (both are optional in the lexicon) — keep it, last,
        // but only while its createdAt is under 60 days old, so it can't linger forever.
        const createdMs = Date.parse(row.value?.createdAt ?? "");
        if (now - createdMs <= 60 * 24 * 60 * 60 * 1000) undated.push(event);
        continue;
      }
      const endMs = event.endsAt ? Date.parse(event.endsAt) : NaN;
      // "Upcoming" includes in-progress: an event ends when it ends, not when
      // it starts. Rows come back in index order, NOT start order — sort here.
      if ((Number.isNaN(endMs) ? startMs : endMs) < now) continue;
      dated.push({ event, startMs });
    }
    // Sort on the parsed instant, not the string — ISO strings with mixed UTC
    // offsets don't sort lexicographically.
    dated.sort((a, b) => a.startMs - b.startMs);

    const response = json(
      { events: [...dated.map((d) => d.event), ...undated], icsUrl: calendarIcsUrl(env) },
      200,
      { "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    );
    await edgeCache.put(cacheKey, response.clone());
    return withCors(response, cors);
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

    // `uris` has carried both bare strings and { uri, name } objects; take
    // either, but only on a safe scheme — see SAFE_URI_SCHEMES.
    const uris: { uri: string; name?: string }[] = [];
    for (const entry of v.uris ?? []) {
      const link: { uri?: unknown; name?: unknown } =
        typeof entry === "string" ? { uri: entry } : (entry ?? {});
      if (typeof link.uri !== "string" || !isSafeUri(link.uri)) continue;
      uris.push({ uri: link.uri, name: typeof link.name === "string" ? link.name : undefined });
    }

    return json(
      {
        event: { ...core, uris, hostName: typeof data.hostName === "string" ? data.hostName : null },
        icsUrl: calendarIcsUrl(env),
      },
      200,
      { ...cors, "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    );
  } catch (err) {
    console.warn("regenOS getEvent failed — degraded:", err instanceof Error ? err.message : err);
    return json({ degraded: true }, 503, { ...cors, ...NO_STORE });
  }
}
