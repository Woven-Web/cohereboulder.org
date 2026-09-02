// The organizers' lane onto regenOS — server-side writes with a service token.
//
// WHY A SERVICE TOKEN AND NOT THE ORGANIZER'S OWN LOGIN: Aaron, Benya and
// Eileen sign in to /admin with an email link (worker/src/auth.ts). They do
// not have regenOS accounts, and asking them to grow one before they can put
// an event on their own calendar is the whole friction this removes. So the
// SITE holds one identity on the commons — `cohere-site.scenius.social`, a
// steward of the COhere collective — and acts as it, server-side, for anyone
// who has already passed the portal's admin gate. The token never reaches a
// browser, is never logged, and never appears in a response body.
//
// THE SCOPE ASYMMETRY IS REAL AND SHAPES THIS FILE. Verified against
// production on 2026-09-01, the agent token authorises exactly:
//   createEvent, updateEvent, deleteEvent,
//   getSceneMembers, setMembership, revokeMembership, proposeInvite
// and is REFUSED (`NotAuthorized (scope check)`) on getEvents, getEvent and
// getEventAttendance. Reads are public anyway, so every read below is
// deliberately ANONYMOUS — sending the bearer would turn a working call into
// a 403. Do not "tidy" that by adding the header everywhere.
//
// WHAT AN EDIT MUST SEND: `updateEvent` reuses `CreateEventInput` and re-runs
// the whole create fan-out, so an omitted field is a DELETED field. Every
// update therefore resends the complete record, prefilled from the stored
// event (the same rule src/lib/eventForm.ts documents for the on-site form).
//
// `publicFace: "exact"` on every write: the default `rough` face routes street
// / postal / place name into a gated record this token cannot read back, so a
// rough event would silently lose its address on the first edit. COhere events
// are public invitations at published addresses.

import { toCommunityEvent, type CommunityEvent, type GetEventsRow } from "./events";

export interface RegenosServiceEnv {
  /** Base URL of regenOS's /xrpc surface, no trailing slash (shared with events.ts). */
  REGENOS_BASE_URL?: string;
  /** DID of the COhere collective — the repo every event created here lands in. */
  REGENOS_COLLECTIVE_DID?: string;
  /**
   * Lane-A agent token for `cohere-site.scenius.social`. A Worker secret, set
   * by the deploy workflow from the repo secret of the same name. Never log
   * it, never echo it, never put it in an error message.
   */
  REGENOS_SERVICE_TOKEN?: string;
}

/** A slow commons must never hold an organizer's click for long. */
const UPSTREAM_TIMEOUT_MS = 8_000;
/** The AppView clamps `limit` to 200; the admin list wants the whole calendar. */
const FETCH_LIMIT = 200;
const EVENT_COLLECTION = "community.lexicon.calendar.event";

const EVENT_MODES = new Set(["inperson", "virtual", "hybrid"]);
const ATTENDANCE_MODES = new Set(["open", "approval"]);

/**
 * regenOS's membership roles, and the `confersRole` claim values an invite
 * carries (regenos-lexicons/src/claims.rs). `member` is not offered by the
 * invite form — the point of an invite from this portal is event hosting,
 * which starts at builder — but the mapping is complete so a role select can
 * grow without touching the wire format.
 */
const ROLE_CLAIM: Record<string, number> = {
  member: 10,
  builder: 20,
  facilitator: 30,
  steward: 40,
};

/**
 * Two identities on the roster are infrastructure, not people:
 * `cohere-site` is the token this very file authenticates as (revoking it
 * would break the portal from inside the portal), and `claudeji` is the
 * account that minted the collective. Both are refused here, server-side —
 * the UI also hides their controls, but that is a courtesy, not the guard.
 */
const PROTECTED_HANDLES: Record<string, string> = {
  "cohere-site.scenius.social": "site service account",
  "claudeji.scenius.social": "ClaudeJi",
};

// ----------------------------------------------------------------- plumbing

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const UNREACHABLE = "Can't reach regenOS right now.";
const UNCONFIGURED = "Event management isn't configured on this deployment yet.";

function baseUrl(env: RegenosServiceEnv): string | null {
  const raw = env.REGENOS_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function collectiveDid(env: RegenosServiceEnv): string | null {
  const raw = env.REGENOS_COLLECTIVE_DID?.trim();
  return raw && raw.startsWith("did:") ? raw : null;
}

function serviceToken(env: RegenosServiceEnv): string | null {
  const raw = env.REGENOS_SERVICE_TOKEN?.trim();
  return raw ? raw : null;
}

type Upstream<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * One XRPC call, with every failure already turned into an honest Response.
 *
 * The status mapping is deliberate: an upstream 401/403 is about the SERVICE
 * TOKEN (expired, or missing a scope) — a deployment problem, not the
 * organizer's. Passing it through would make the portal's fetch wrapper read
 * it as "your session ended" and sign a working admin out. So everything 4xx
 * except 404 lands as a 400 carrying upstream's own `message`, which is what
 * an organizer can actually act on ("only a Builder of the collective may…").
 */
async function callUpstream<T>(url: string, init: RequestInit, what: string): Promise<Upstream<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (err) {
    console.warn(`regenOS ${what} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, response: json({ error: UNREACHABLE }, 502) };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
    const code = typeof body.error === "string" ? body.error : "UpstreamError";
    // The status and the error CODE are safe to log; the message may quote
    // request content, and nothing here ever logs the token.
    console.warn(`regenOS ${what} returned ${res.status} (${code})`);
    const status = res.status === 404 ? 404 : res.status < 500 ? 400 : 502;
    return {
      ok: false,
      response: json(
        {
          error: code,
          message:
            typeof body.message === "string" && body.message
              ? body.message
              : `regenOS returned ${res.status}.`,
        },
        status,
      ),
    };
  }
  return { ok: true, data: (await res.json().catch(() => ({}))) as T };
}

/** An anonymous read. See the scope note at the top — the bearer would 403 it. */
function readXrpc<T>(
  base: string,
  nsid: string,
  params: Record<string, string>,
  what: string,
): Promise<Upstream<T>> {
  const url = new URL(`${base}/xrpc/${nsid}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return callUpstream<T>(url.toString(), { headers: { accept: "application/json" } }, what);
}

/** A bearer read — only `getSceneMembers`, which needs the viewer to see roles. */
function readXrpcAs<T>(
  base: string,
  token: string,
  nsid: string,
  params: Record<string, string>,
  what: string,
): Promise<Upstream<T>> {
  const url = new URL(`${base}/xrpc/${nsid}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return callUpstream<T>(
    url.toString(),
    { headers: { accept: "application/json", Authorization: `Bearer ${token}` } },
    what,
  );
}

/**
 * A bearer write. No cookies and no Origin: regenOS's CSRF guard passes a
 * bearer-only request straight through, and sending this site's cookies to a
 * third party would be a leak, not a courtesy.
 */
function writeXrpc<T>(
  base: string,
  token: string,
  nsid: string,
  body: unknown,
  what: string,
): Promise<Upstream<T>> {
  return callUpstream<T>(
    `${base}/xrpc/${nsid}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    what,
  );
}

/** The Cache API's default namespace; workers-types aren't wired in this repo. */
const edgeCache = (caches as unknown as { default: Cache }).default;

/**
 * A landed write makes the edge-cached public listing stale (events.ts caches
 * /api/events for 300s). Drop it here so the calendar shows the change on the
 * next load instead of up to five minutes later.
 */
async function purgeEventsCache(url: URL): Promise<void> {
  await edgeCache.delete(new Request(new URL("/api/events", url).toString())).catch(() => {});
}

// --------------------------------------------------------------- validation

interface EventValues {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  mode: string;
  placeName: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  /**
   * null = "leave whatever is stored alone". Both of these live in the sibling
   * `coop.lexicon.event.config` record, which NO read this Worker can make
   * returns — `getEvents` doesn't carry them, and `getEventAttendance` is the
   * only way to see them at all. So the page sends them back only when it
   * managed to read them first; when that read failed, they are omitted rather
   * than guessed, because a guessed `attendance: "open"` on an approval-only
   * event would quietly open the door. (regenhub's port of this form reads
   * event.rs:469-471 as updateEvent IGNORING both fields; the brief for this
   * PR says it honours them. Omitting is safe under either reading; guessing
   * is only safe under one.)
   */
  attendance: string | null;
  maxAttendees: number | null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * `2026-10-15T18:30:00.000Z` → itself, normalised. The page converts its
 * `datetime-local` inputs with `new Date(v).toISOString()`, so what arrives is
 * already RFC 3339 with an offset; re-parsing here is the check, not the
 * conversion. A datetime with no timezone 400s upstream.
 */
function isoOrNull(value: unknown): string | null {
  const raw = text(value, 64);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Reject on the way in, so a bad field is one clear sentence and not an upstream 400. */
function readEventValues(body: Record<string, unknown>): { values: EventValues } | { error: string } {
  const name = text(body.name, 200);
  if (!name) return { error: "An event needs a name." };

  const startsAt = isoOrNull(body.startsAt);
  if (!startsAt) return { error: "An event needs a valid start date and time." };

  let endsAt = "";
  if (text(body.endsAt, 64)) {
    const parsed = isoOrNull(body.endsAt);
    if (!parsed) return { error: "That end date and time isn't a valid date." };
    if (Date.parse(parsed) < Date.parse(startsAt)) {
      return { error: "The event can't end before it starts." };
    }
    endsAt = parsed;
  }

  const mode = text(body.mode, 20) || "inperson";
  if (!EVENT_MODES.has(mode)) return { error: "Pick in person, virtual, or hybrid." };

  const rawAttendance = text(body.attendance, 20);
  if (rawAttendance && !ATTENDANCE_MODES.has(rawAttendance)) {
    return { error: "RSVPs are either open or by approval." };
  }
  const attendance = rawAttendance || null;

  // 0 means uncapped upstream, and is a real instruction ("remove the cap"),
  // so it is kept distinct from "not sent".
  const rawMax = body.maxAttendees;
  let maxAttendees: number | null = null;
  if (rawMax !== "" && rawMax !== null && rawMax !== undefined) {
    const parsed = Number(rawMax);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
      return { error: "Capacity has to be a whole number between 0 and 10000 (0 means no limit)." };
    }
    maxAttendees = parsed;
  }

  return {
    values: {
      name,
      description: text(body.description, 5000),
      startsAt,
      endsAt,
      mode,
      placeName: text(body.placeName, 200),
      street: text(body.street, 200),
      locality: text(body.locality, 100),
      region: text(body.region, 100),
      postalCode: text(body.postalCode, 20),
      attendance,
      maxAttendees,
    },
  };
}

/**
 * The shared body of `createEvent` and `updateEvent`. Every present field is
 * sent every time — see the fan-out note at the top of the file.
 */
function eventInput(
  values: EventValues,
  target: { authority: string; rkey: string },
  create: boolean,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    authority: target.authority,
    rkey: target.rkey,
    name: values.name,
    mode: values.mode,
    publicFace: "exact",
    startsAt: values.startsAt,
  };
  // A new event has to declare its seat policy; an edit only says so when the
  // page actually knew the current one (see EventValues.attendance).
  if (values.attendance) input.attendance = values.attendance;
  else if (create) input.attendance = "open";
  if (values.description) input.description = values.description;
  if (values.endsAt) input.endsAt = values.endsAt;
  if (values.placeName) input.placeName = values.placeName;
  if (values.street) input.street = values.street;
  if (values.locality) input.locality = values.locality;
  if (values.region) input.region = values.region;
  if (values.postalCode) input.postalCode = values.postalCode;
  // The adopted address lexicon REQUIRES a country whenever any other
  // component is present. This is a Boulder calendar, so it is always US.
  if (values.placeName || values.street || values.locality || values.region || values.postalCode) {
    input.country = "US";
  }
  if (values.maxAttendees !== null) input.maxAttendees = values.maxAttendees;
  // `visibility` is a create-only decision: updateEvent ignores it, because an
  // edit never moves an event between stores. Sending it anyway would be a lie
  // on the wire.
  if (create) input.visibility = "public";
  return input;
}

/** Time-ordered and inside atproto's rkey charset (`[A-Za-z0-9._:~-]`). */
function mintRkey(): string {
  return `ev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// -------------------------------------------------------------- event reads

interface AdminEventRow extends GetEventsRow {
  hostName?: string;
}

/** What the Events tab renders: the public core, plus the two admin-only facts. */
interface AdminEvent extends CommunityEvent {
  hostName: string | null;
  isPast: boolean;
  /** Where this event lives on cohereboulder.org, for the "View" link. */
  publicPath: string;
}

/**
 * Every event on the collective's calendar, past included — the admin list is
 * an archive as well as a work surface, which is why it can't just reuse
 * /api/events (that one drops anything already over).
 *
 * Upcoming soonest-first (undated last), then past most-recent-first: the two
 * halves each read the way you'd scan them.
 */
export async function handleAdminEventsList(env: RegenosServiceEnv): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  if (!base || !scene) return json({ error: UNCONFIGURED }, 503);

  const upstream = await readXrpc<{ events?: AdminEventRow[] }>(
    base,
    "social.scenius.getEvents",
    { scene, limit: String(FETCH_LIMIT) },
    "getEvents",
  );
  // Any failure at all is one honest sentence — the admin page shows it inline
  // and the organizer retries. Never a stack trace, never an upstream body.
  if (!upstream.ok) return json({ error: UNREACHABLE }, 503);

  const now = Date.now();
  const upcoming: { event: AdminEvent; startMs: number }[] = [];
  const undated: AdminEvent[] = [];
  const past: { event: AdminEvent; startMs: number }[] = [];

  for (const row of upstream.data.events ?? []) {
    const core = toCommunityEvent(row);
    if (!core) continue;
    const startMs = core.startsAt ? Date.parse(core.startsAt) : NaN;
    const endMs = core.endsAt ? Date.parse(core.endsAt) : NaN;
    // An event is over when it ENDS, not when it starts.
    const overAt = Number.isNaN(endMs) ? startMs : endMs;
    const isPast = !Number.isNaN(overAt) && overAt < now;
    const event: AdminEvent = {
      ...core,
      hostName: typeof row.hostName === "string" ? row.hostName : null,
      isPast,
      publicPath: `/events/${core.did}/${core.rkey}`,
    };
    if (Number.isNaN(startMs)) undated.push(event);
    else if (isPast) past.push({ event, startMs });
    else upcoming.push({ event, startMs });
  }

  // Sort on the parsed instant, not the string — ISO strings with mixed UTC
  // offsets don't sort lexicographically.
  upcoming.sort((a, b) => a.startMs - b.startMs);
  past.sort((a, b) => b.startMs - a.startMs);

  return json(
    { events: [...upcoming.map((u) => u.event), ...undated, ...past.map((p) => p.event)] },
    200,
  );
}

interface AttendanceResponse {
  confirmed?: number;
  waitlisted?: number;
  requested?: number;
  maxAttendees?: number | null;
  attendance?: string;
  guests?: { did?: string; handle?: string | null }[];
}

/**
 * One event's RSVP picture. Anonymous, and therefore PARTIAL: the AppView only
 * hands the requested/waitlisted ROSTER to the event's own host, so what comes
 * back here is counts plus the confirmed guests. The page says so out loud
 * rather than implying the empty space means nobody asked.
 */
export async function handleAdminEventAttendance(
  env: RegenosServiceEnv,
  did: string,
  rkey: string,
): Promise<Response> {
  const base = baseUrl(env);
  if (!base) return json({ error: UNCONFIGURED }, 503);

  const upstream = await readXrpc<AttendanceResponse>(
    base,
    "social.scenius.getEventAttendance",
    { eventDid: did, eventRkey: rkey },
    "getEventAttendance",
  );
  if (!upstream.ok) return upstream.response;

  const data = upstream.data;
  const guests = (data.guests ?? [])
    .filter((g): g is { did: string; handle?: string | null } => typeof g?.did === "string")
    .map((g) => ({ did: g.did, handle: typeof g.handle === "string" ? g.handle : null }));

  return json(
    {
      confirmed: Number(data.confirmed) || 0,
      waitlisted: Number(data.waitlisted) || 0,
      requested: Number(data.requested) || 0,
      maxAttendees: typeof data.maxAttendees === "number" ? data.maxAttendees : null,
      attendance: typeof data.attendance === "string" ? data.attendance : null,
      guests,
    },
    200,
  );
}

// ------------------------------------------------------------- event writes

interface EventWriteResponse {
  eventUri?: string;
  eventCid?: string;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleAdminEventCreate(
  request: Request,
  env: RegenosServiceEnv,
  url: URL,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);
  const parsed = readEventValues(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const rkey = mintRkey();
  const upstream = await writeXrpc<EventWriteResponse>(
    base,
    token,
    "social.scenius.createEvent",
    eventInput(parsed.values, { authority: scene, rkey }, true),
    "createEvent",
  );
  if (!upstream.ok) return upstream.response;

  await purgeEventsCache(url);
  return json(
    {
      ok: true,
      did: scene,
      rkey,
      eventUri: upstream.data.eventUri ?? `at://${scene}/${EVENT_COLLECTION}/${rkey}`,
      publicPath: `/events/${scene}/${rkey}`,
    },
    200,
  );
}

export async function handleAdminEventUpdate(
  request: Request,
  env: RegenosServiceEnv,
  url: URL,
  did: string,
  rkey: string,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);
  // The service identity is a steward of ONE collective. A write aimed
  // anywhere else would either 403 upstream or, worse, succeed somewhere this
  // portal has no business editing.
  if (did !== scene) {
    return json({ error: "only COhere's own events can be edited here" }, 400);
  }

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);
  const parsed = readEventValues(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const upstream = await writeXrpc<EventWriteResponse>(
    base,
    token,
    "social.scenius.updateEvent",
    eventInput(parsed.values, { authority: did, rkey }, false),
    "updateEvent",
  );
  if (!upstream.ok) return upstream.response;

  await purgeEventsCache(url);
  return json({ ok: true, did, rkey, publicPath: `/events/${did}/${rkey}` }, 200);
}

export async function handleAdminEventDelete(
  env: RegenosServiceEnv,
  url: URL,
  did: string,
  rkey: string,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);
  if (did !== scene) {
    return json({ error: "only COhere's own events can be edited here" }, 400);
  }

  const upstream = await writeXrpc<{ deleted?: boolean }>(
    base,
    token,
    "social.scenius.deleteEvent",
    { authority: did, rkey },
    "deleteEvent",
  );
  if (!upstream.ok) return upstream.response;

  await purgeEventsCache(url);
  return json({ ok: true }, 200);
}

// ------------------------------------------------------------------- access

interface SceneMember {
  did?: string;
  handle?: string | null;
  kind?: string;
  name?: string | null;
  role?: string;
}

async function fetchRoster(
  base: string,
  token: string,
  scene: string,
): Promise<Upstream<{ members?: SceneMember[]; steward?: boolean }>> {
  return readXrpcAs<{ members?: SceneMember[]; steward?: boolean }>(
    base,
    token,
    "social.scenius.getSceneMembers",
    { scene },
    "getSceneMembers",
  );
}

/**
 * Who can put things on the calendar. `getSceneMembers` answers anonymously
 * too, but only a bearer call carries the viewer's own `steward` flag — which
 * is the site's honest answer to "can this deployment actually change roles".
 */
export async function handleAdminAccessList(env: RegenosServiceEnv): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);

  const upstream = await fetchRoster(base, token, scene);
  if (!upstream.ok) return json({ error: UNREACHABLE }, 503);

  const members = (upstream.data.members ?? [])
    .filter((m): m is SceneMember & { did: string } => typeof m?.did === "string")
    .map((m) => {
      const handle = typeof m.handle === "string" ? m.handle : null;
      const label = handle ? PROTECTED_HANDLES[handle] : undefined;
      return {
        did: m.did,
        handle,
        name: typeof m.name === "string" ? m.name : null,
        kind: typeof m.kind === "string" ? m.kind : null,
        role: typeof m.role === "string" ? m.role : null,
        protected: Boolean(label),
        protectedLabel: label ?? null,
      };
    });

  return json({ members, steward: upstream.data.steward === true }, 200);
}

/**
 * The roster is the only place a DID's handle is known, so the guard reads it
 * from there. Returns the refusal sentence, or null when the DID is fair game.
 */
async function protectedReason(
  base: string,
  token: string,
  scene: string,
  did: string,
): Promise<string | null> {
  const roster = await fetchRoster(base, token, scene);
  if (!roster.ok) return null;
  const member = (roster.data.members ?? []).find((m) => m?.did === did);
  const handle = typeof member?.handle === "string" ? member.handle : null;
  if (!handle || !(handle in PROTECTED_HANDLES)) return null;
  return `${handle} keeps this site working — it's managed outside this portal.`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Invite someone to host. regenOS emails them; the link carries `origin`, so
 * it lands back on cohereboulder.org rather than on scenius.social (regenOS's
 * allowlist gained this origin on 2026-09-01).
 *
 * THE RESPONSE CARRIES THE RAW INVITE TOKEN. It is redemption material —
 * whoever holds it becomes a builder of the collective. It never leaves this
 * function: no response body, no log line. The caller gets `{ok:true}`.
 */
export async function handleAdminAccessInvite(
  request: Request,
  env: RegenosServiceEnv,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);

  const email = text(body.email, 320).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "That doesn't look like an email address." }, 400);

  const role = text(body.role, 20) || "builder";
  // `member` is not on offer here: an invite from this tab is an invitation to
  // host, and hosting starts at builder.
  if (role !== "builder" && role !== "facilitator" && role !== "steward") {
    return json({ error: "Pick builder, facilitator, or steward." }, 400);
  }

  const headline = text(body.headline, 200);
  const upstream = await writeXrpc<Record<string, unknown>>(
    base,
    token,
    "social.scenius.proposeInvite",
    {
      space: `at://${scene}/coop.lexicon.space.scene.member/self`,
      confersRole: ROLE_CLAIM[role],
      inviteeEmail: email,
      ...(headline ? { headline } : {}),
      origin: "https://cohereboulder.org",
    },
    "proposeInvite",
  );
  if (!upstream.ok) return upstream.response;

  // Deliberately not spreading upstream.data — see the note above.
  return json({ ok: true }, 200);
}

export async function handleAdminAccessRole(
  request: Request,
  env: RegenosServiceEnv,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);

  const did = text(body.did, 200);
  if (!did.startsWith("did:")) return json({ error: "That isn't a member id." }, 400);
  const role = text(body.role, 20);
  if (!(role in ROLE_CLAIM)) {
    return json({ error: "Pick member, builder, facilitator, or steward." }, 400);
  }

  const refusal = await protectedReason(base, token, scene, did);
  if (refusal) return json({ error: refusal }, 400);

  const upstream = await writeXrpc<Record<string, unknown>>(
    base,
    token,
    "social.scenius.setMembership",
    { scene, member: did, role },
    "setMembership",
  );
  if (!upstream.ok) return upstream.response;
  return json({ ok: true }, 200);
}

export async function handleAdminAccessRevoke(
  request: Request,
  env: RegenosServiceEnv,
): Promise<Response> {
  const base = baseUrl(env);
  const scene = collectiveDid(env);
  const token = serviceToken(env);
  if (!base || !scene || !token) return json({ error: UNCONFIGURED }, 503);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);

  const did = text(body.did, 200);
  if (!did.startsWith("did:")) return json({ error: "That isn't a member id." }, 400);

  const refusal = await protectedReason(base, token, scene, did);
  if (refusal) return json({ error: refusal }, 400);

  const upstream = await writeXrpc<Record<string, unknown>>(
    base,
    token,
    "social.scenius.revokeMembership",
    { scene, member: did },
    "revokeMembership",
  );
  // Already gone is the state the organizer asked for. Upstream answers 404
  // when the membership isn't there, and that is a success from here.
  if (!upstream.ok && upstream.response.status !== 404) return upstream.response;
  return json({ ok: true }, 200);
}
