// One-origin XRPC proxy — cohereboulder.org's door onto the regenOS AppView.
//
// Ported from regenhub-boulder's app/xrpc/[...nsid]/route.ts (itself ported
// from regenOS's own frontends), re-idiomised for a Cloudflare Worker.
//
// WHY IT MUST EXIST: the AppView's session cookie is `__Host-rs_session` (and
// the signup wizard's `__Host-rs_pending`), and the `__Host-` prefix FORBIDS a
// `Domain` attribute — the cookie can only ever land on the origin that
// emitted the response. So the browser has to talk to regenOS through
// cohereboulder.org's own origin, or this site never sees a regenOS session.
//
// GATED ON REGENOS_LOGIN_ENABLED: unless the var is exactly "true", every
// /xrpc route 404s — enabling the calendar's read path must never silently
// open an auth surface (regenhub's rationale, kept verbatim).
//
// NOT A GENERAL-PURPOSE OPEN PROXY: only the NSIDs the login flow and the
// on-site event manager need are forwarded; everything else 404s. The
// upstream frontends forward the whole namespace because they ARE the regenOS
// frontend; we are a third origin borrowing two flows, so the smallest hole
// is the right hole.
//
// The relay contract (each piece is load-bearing — see the research notes):
//   * Origin and Sec-Fetch-Site are forwarded VERBATIM — the AppView's CSRF
//     guard reads them, and its magic links are built against the calling
//     app's Origin (ALLOWED_APP_ORIGINS upstream).
//   * Cookies cross in BOTH directions, but only regenOS's own `__Host-rs_`
//     ones. This origin also carries the admin portal's `cohere_session`
//     (Path=/, so the browser attaches it here too); forwarding that to a
//     third party would hand an organizer's live session to a system this
//     repo does not control, and accepting arbitrary Set-Cookie back would
//     let upstream overwrite it. The filter is the whole point of the
//     allowlist — the `__Host-rs_` pair is all the AppView ever needs.
//   * Each surviving Set-Cookie is re-emitted from getSetCookie() — a flat
//     header copy would coalesce multiple cookies into one broken value.
//   * redirect: "manual", and same-origin 3xx passes through — a returning
//     user's verifyEmail link answers `302 Location: /` WITH the session
//     cookie, and both must reach the browser or sign-in silently fails.
//   * Never cached, in either direction.

import { moderateRecords, type CircleRecord, type ModerationEnv } from "./board-moderation";

export interface RegenosAuthEnv {
  /** Base URL of regenOS's public /xrpc surface, no trailing slash (shared with events.ts). */
  REGENOS_BASE_URL?: string;
  /** Master switch. Anything but the exact string "true" keeps every /xrpc route a 404. */
  REGENOS_LOGIN_ENABLED?: string;
  /** The COhere collective. Circle (members area) calls are pinned to it. */
  REGENOS_COLLECTIVE_DID?: string;
  /** Board moderation state. Optional so the bare proxy still works without it. */
  cohere?: D1Database;
}

/** A slow AppView must never hold a sign-in click hostage for long. */
const UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * The login flow and event writes — nothing else.
 *  - beginSignup / verifySignup / setSignupProfile / createCustodialAccount —
 *    the custodial signup wizard (src/pages/Login.tsx walks it)
 *  - verifyEmail — a RETURNING user's magic-link redemption; upstream answers
 *    `302 /` with the session cookie, which is why 3xx must pass through
 *  - getSession / logout — whoami + sign-out
 *  - createEvent / updateEvent / deleteEvent — the only event writes; each is
 *    re-gated server-side by the AppView (Builder+ of the event's authority
 *    for the event writes), so the proxy widens
 *    reach, never authority.
 *  - rsvp — a signed-in visitor's own RSVP (intent going / notgoing). The
 *    AppView requires a signed-in user and writes the claim into THAT user's
 *    repo; it derives the seat itself and ignores client-sent attendance.
 *  - getEventAttendance — read back the caller's own `mySeat` for the
 *    "You're going" state. Public events answer anonymously too; the roster
 *    beyond confirmed guests stays host-only upstream.
 */
const ALLOWED_NSIDS = new Set([
  "social.scenius.beginSignup",
  "social.scenius.verifySignup",
  "social.scenius.setSignupProfile",
  "social.scenius.createCustodialAccount",
  "social.scenius.verifyEmail",
  "social.scenius.getSession",
  "social.scenius.logout",
  "social.scenius.createEvent",
  "social.scenius.updateEvent",
  "social.scenius.deleteEvent",
  "social.scenius.rsvp",
  "social.scenius.getEventAttendance",
  "social.scenius.getSceneMembers",
  // The members area (regenOS circle content). Pinned to our collective below;
  // reads are filtered through board-moderation.ts on the way out.
  "social.scenius.createCirclePost",
  "social.scenius.deleteCirclePost",
  "social.scenius.listCirclePosts",
  "social.scenius.getCircleThread",
]);

/** Circle methods carry a `collective`; the proxy only lends us ours. */
const CIRCLE_NSIDS = new Set([
  "social.scenius.createCirclePost",
  "social.scenius.deleteCirclePost",
  "social.scenius.listCirclePosts",
  "social.scenius.getCircleThread",
]);

/** Responses whose `records` pass through the Board's moderation filter. */
const MODERATED_NSIDS = new Set(["social.scenius.listCirclePosts", "social.scenius.getCircleThread"]);

/** A successful one of these stales the edge-cached /api/events listing. */
const EVENT_WRITE_NSIDS = new Set([
  "social.scenius.createEvent",
  "social.scenius.updateEvent",
  "social.scenius.deleteEvent",
]);

// Request headers we must NOT blindly forward (hop-by-hop / host-rewriting /
// Cloudflare's own annotations). Origin and Sec-Fetch-* deliberately survive
// this filter — forwarding them verbatim is the whole point. Cookie is
// rebuilt rather than copied (see relayableCookies).
const STRIP_REQUEST = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "cookie",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-pseudo-ipv4",
  "x-forwarded-proto",
  // Every way Cloudflare spells "the visitor's IP address". Handing a third
  // party the caller's address is not something borrowing two flows should
  // do, and stripping cf-connecting-ip while forwarding x-forwarded-for would
  // just be the same leak under a different name.
  "x-real-ip",
  "x-forwarded-for",
  "true-client-ip",
]);

// Response headers we must NOT copy back (the runtime re-computes encoding
// and length; set-cookie is filtered and re-emitted via getSetCookie below).
const STRIP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "set-cookie",
]);

// ...and the whole access-control-* family, which the AppView answers for its
// OWN frontends. Re-publishing upstream's CORS grant under cohereboulder.org
// would let a third origin make credentialed calls against session-bearing
// endpoints on this domain. Same-origin is the entire design here; the
// browser never needs a preflight to reach its own site.
const STRIP_RESPONSE_PREFIX = "access-control-";

/**
 * regenOS's own cookies, and nothing else. `__Host-rs_session` is the session
 * and `__Host-rs_pending` is the signup wizard's state; the admin portal's
 * `cohere_session` shares this origin and must never leave it.
 */
const RELAY_COOKIE_PREFIX = "__Host-rs_";

/** The subset of the browser's Cookie header the AppView is allowed to see. */
function relayableCookies(header: string | null): string | null {
  if (!header) return null;
  const kept = header
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(RELAY_COOKIE_PREFIX));
  return kept.length ? kept.join("; ") : null;
}

/** A Set-Cookie line is relayed only if it names one of regenOS's own cookies. */
function isRelayableSetCookie(line: string): boolean {
  return line.trimStart().startsWith(RELAY_COOKIE_PREFIX);
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function isRegenosLoginEnabled(env: RegenosAuthEnv): boolean {
  return env.REGENOS_LOGIN_ENABLED?.trim() === "true";
}

/** The Cache API's default namespace (workers-types aren't wired in this repo). */
const edgeCache = (caches as unknown as { default: Cache }).default;

/**
 * GET/POST /xrpc/:nsid → the regenOS AppView, cookies and all.
 * Everything that isn't an allowlisted method on an enabled flag is one
 * uniform 404 — indistinguishable from the route not existing.
 */
export async function handleXrpcProxy(
  request: Request,
  env: RegenosAuthEnv,
  url: URL,
): Promise<Response> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  if (!isRegenosLoginEnabled(env) || !base) {
    return json({ error: "NotFound" }, 404);
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "NotFound" }, 404);
  }

  const nsid = url.pathname.slice("/xrpc/".length);
  if (!ALLOWED_NSIDS.has(nsid)) {
    return json({ error: "NotFound" }, 404);
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  const cookie = relayableCookies(request.headers.get("Cookie"));
  if (cookie) headers.set("Cookie", cookie);

  let postBody: ArrayBuffer | undefined;
  if (request.method === "POST") postBody = await request.arrayBuffer();

  if (CIRCLE_NSIDS.has(nsid)) {
    const pinned = env.REGENOS_COLLECTIVE_DID?.trim();
    let asked: unknown;
    if (request.method === "POST") {
      try {
        asked = (JSON.parse(new TextDecoder().decode(postBody)) as { collective?: unknown }).collective;
      } catch {
        asked = undefined;
      }
    } else {
      asked = url.searchParams.get("collective");
    }
    if (!pinned) return json({ error: "NotConfigured", message: "The members area isn't set up yet." }, 503);
    if (asked !== pinned) return json({ error: "InvalidRequest", message: "That isn't our collective." }, 400);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    // 3xx passes through to the browser — verifyEmail's `302 /` carries the
    // session cookie, and only the browser may follow it.
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  if (postBody) init.body = postBody;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/xrpc/${nsid}${url.search}`, init);
  } catch {
    // Same posture as the site's other upstream failures: a human-readable
    // 502, never a stack trace.
    return json({ error: "UpstreamUnavailable", message: "Can't reach regenOS right now." }, 502);
  }

  // Returning-user redirects belong on this origin. Never relay an external
  // Location (or its cookies) from an upstream response into the browser.
  const location = upstream.headers.get("Location");
  let redirect: URL | undefined;
  if (location !== null) {
    try {
      redirect = new URL(location, url);
      if (redirect.origin !== url.origin || redirect.username || redirect.password) {
        throw new Error("External redirect");
      }
    } catch {
      await upstream.body?.cancel().catch(() => {});
      return json({ error: "InvalidUpstreamRedirect", message: "Invalid sign-in redirect." }, 502);
    }
  }

  // A landed event write makes the edge-cached /api/events listing stale;
  // drop it here, where the write flows through, so the calendar page's next
  // refetch shows the change (worker/src/events.ts caches for 300s).
  if (EVENT_WRITE_NSIDS.has(nsid) && upstream.ok) {
    await edgeCache.delete(new Request(new URL("/api/events", url).toString())).catch(() => {});
  }

  let outBody: BodyInit | null = upstream.body;
  if (MODERATED_NSIDS.has(nsid) && upstream.ok && env.cohere) {
    // Hidden/held posts leave here, never reach the browser. If we cannot
    // read moderation state we answer an error, not the unfiltered page.
    try {
      const page = (await upstream.json()) as { records?: CircleRecord[] } & Record<string, unknown>;
      if (Array.isArray(page.records)) {
        page.records = await moderateRecords(env as ModerationEnv, page.records, () => readVerifiedSessionDid(request, env));
      }
      outBody = JSON.stringify(page);
    } catch {
      return json({ error: "ModerationUnavailable", message: "The Board can't load right now." }, 502);
    }
  }
  const out = new Response(outBody, { status: upstream.status });
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_RESPONSE.has(lower) || lower.startsWith(STRIP_RESPONSE_PREFIX)) return;
    out.headers.set(key, value);
  });
  if (redirect) {
    if (nsid === "social.scenius.verifyEmail" && upstream.status >= 300 && upstream.status < 400 && redirect.pathname === "/") redirect.searchParams.set("signedIn", "1");
    out.headers.set("Location", redirect.href);
  }
  // Auth responses must never be cached by anything between here and the tab.
  out.headers.set("Cache-Control", "no-store");
  // getSetCookie() preserves multiple Set-Cookie headers where a flat copy
  // would coalesce them — relay each of the AppView's OWN `__Host-rs_`
  // cookies onto cohereboulder.org, and drop anything else it tries to set
  // on this origin.
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const line of setCookies) {
    if (isRelayableSetCookie(line)) out.headers.append("Set-Cookie", line);
  }
  return out;
}

/** Who regenOS says this browser is — the DID, from the verified session, or null. */
export async function readVerifiedSessionDid(request: Request, env: RegenosAuthEnv): Promise<string | null> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  if (!isRegenosLoginEnabled(env) || !base) return null;
  const headers = new Headers();
  const cookie = relayableCookies(request.headers.get("Cookie"));
  if (!cookie) return null;
  headers.set("Cookie", cookie);
  for (const name of ["Origin", "Sec-Fetch-Site"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(`${base}/xrpc/social.scenius.getSession`, {
      headers, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { did?: unknown };
    return typeof data.did === "string" ? data.did : null;
  } catch {
    return null;
  }
}

/** Owner-only read for the registration lookup; never expose contact data through the proxy. */
export async function readVerifiedSessionEmail(request: Request, env: RegenosAuthEnv): Promise<string | null> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  if (!isRegenosLoginEnabled(env) || !base) return null;
  const headers = new Headers();
  const cookie = relayableCookies(request.headers.get("Cookie"));
  if (cookie) headers.set("Cookie", cookie);
  for (const name of ["Origin", "Sec-Fetch-Site"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(`${base}/xrpc/social.scenius.getMyContactPref`, {
    headers, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Contact read unavailable");
  const data = await response.json() as { channels?: { kind?: string; address?: string; verified?: boolean }[] };
  const email = data.channels?.find(channel => channel.kind === "email" && channel.verified === true && typeof channel.address === "string")?.address;
  return email?.trim().toLowerCase() || null;
}
