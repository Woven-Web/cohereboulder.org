// Registration and sign-in, woven together (T-138).
//
// The registration form is public, so a submit proves nothing about who owns
// the email in it. Two rules follow, both enforced by the submit route in
// index.ts using what this file answers:
//   * Signed in on regenOS with a verified email: the registration is theirs.
//     The email comes from the session (getMyContactPref), never the body, and
//     they may edit their own answers.
//   * Anyone else: a new registration is stored as before, but an email that
//     already has one for this form is never overwritten — the page asks them
//     to sign in instead.
//
// GET /api/me/registration answers the signed-in caller about their own row
// only: `registered`, and with ?detail=1 the saved answers to prefill the form.
//
// AUTO_MEMBER_ON_SIGNIN (default off): on that same signed-in read, a DID whose
// verified email is registered for register-2026, and who is not yet on the
// COhere scene's roster, is added as a `member` with the site's service token.

import { fetchRoster, protectedHandle, type RegenosServiceEnv } from "./regenos-service";
import {
  handleXrpcProxy,
  readVerifiedSession,
  readVerifiedSessionEmail,
  relayableCookies,
  type RegenosAuthEnv,
} from "./regenos-auth";

export const REGISTRATION_FORM = "register-2026";

export type Registrant =
  /** No session, or a session with no verified email on file. */
  | { kind: "anonymous" }
  | { kind: "verified"; did: string; handle: string | null; email: string }
  /** A session exists but its email could not be read right now. */
  | { kind: "unavailable" };

/** Who is submitting, as far as regenOS can vouch for it. */
export async function readRegistrant(request: Request, env: RegenosAuthEnv): Promise<Registrant> {
  if (!relayableCookies(request.headers.get("Cookie"))) return { kind: "anonymous" };
  const session = await readVerifiedSession(request, env);
  if (!session) return { kind: "anonymous" };
  let email: string | null;
  try {
    email = await readVerifiedSessionEmail(request, env);
  } catch {
    return { kind: "unavailable" };
  }
  return email ? { kind: "verified", did: session.did, handle: session.handle, email } : { kind: "anonymous" };
}

type Env = RegenosAuthEnv & RegenosServiceEnv & {
  cohere: D1Database;
  COHERE_AUTH?: KVNamespace;
  AUTO_MEMBER_ON_SIGNIN?: string;
};

interface SavedRow {
  name: string | null;
  phone: string | null;
  orgs: string | null;
  subscribed: number | null;
  data: string | null;
}

export async function handleMyRegistration(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "GET") return json({ error: "MethodNotAllowed" }, 405);
  const url = new URL("/xrpc/social.scenius.getSession", request.url);
  const response = await handleXrpcProxy(new Request(url, { headers: request.headers }), env, url);
  if (!response.ok) return json({ error: "SessionUnavailable" }, response.status);
  const session = await response.json() as { did?: string; handle?: string };
  if (!session.did) return json({ error: "Unauthorized" }, 401);
  let email: string | null;
  try { email = await readVerifiedSessionEmail(request, env); }
  catch { return json({ error: "RegistrationUnavailable" }, 502); }
  if (!email) return json({ registered: null });
  const detail = new URL(request.url).searchParams.get("detail") === "1";
  const row = await env.cohere
    .prepare(
      `SELECT p.name, p.phone, p.orgs, p.subscribed, s.data FROM people p
       LEFT JOIN submissions s ON s.person_id = p.id AND s.form_slug = '${REGISTRATION_FORM}'
       WHERE p.email = ?1 LIMIT 1`,
    )
    .bind(email)
    .first<SavedRow>();
  const registered = typeof row?.data === "string";
  if (registered && autoMemberEnabled(env)) {
    const work = autoMember(env, session.did, typeof session.handle === "string" ? session.handle : null);
    if (ctx) ctx.waitUntil(work);
    else await work;
  }
  if (!detail) return json({ registered });
  let answers: Record<string, unknown> = {};
  if (registered) {
    try { answers = JSON.parse(row!.data as string) as Record<string, unknown>; } catch { answers = {}; }
  }
  return json({
    registered,
    email,
    name: row?.name ?? null,
    phone: row?.phone ?? null,
    orgs: row?.orgs ?? null,
    subscribed: row?.subscribed === null || row?.subscribed === undefined ? null : row.subscribed === 1,
    answers,
  });
}

// ------------------------------------------------------- auto-membership

export function autoMemberEnabled(env: { AUTO_MEMBER_ON_SIGNIN?: string }): boolean {
  return env.AUTO_MEMBER_ON_SIGNIN?.trim() === "true";
}

/** One attempt per DID per day; a landed (or unneeded) one is never repeated. */
const RETRY_TTL_SECONDS = 24 * 60 * 60;
const markerKey = (did: string) => `automember:${did}`;

/**
 * Add a registered, signed-in person to the COhere scene as a `member`.
 * Never changes anyone already on the roster (so never a downgrade), never
 * touches the site's own accounts, and never throws: any failure is a quiet
 * no-op that may be retried a day later.
 */
export async function autoMember(env: Env, did: string, handle: string | null): Promise<void> {
  try {
    const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
    const scene = env.REGENOS_COLLECTIVE_DID?.trim();
    const token = env.REGENOS_SERVICE_TOKEN?.trim();
    if (!base || !scene || !token || !env.COHERE_AUTH || !did.startsWith("did:")) return;
    if (handle && protectedHandle(handle)) return;
    const key = markerKey(did);
    if (await env.COHERE_AUTH.get(key)) return;
    // Claimed before the call, so parallel page loads make one attempt.
    await env.COHERE_AUTH.put(key, "pending", { expirationTtl: RETRY_TTL_SECONDS });

    const roster = await fetchRoster(base, token, scene);
    if (!roster.ok) return;
    // Anyone already on the roster keeps the role they have.
    if ((roster.data.members ?? []).some((m) => m?.did === did)) {
      await env.COHERE_AUTH.put(key, "already");
      return;
    }

    const res = await fetch(`${base}/xrpc/social.scenius.setMembership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene, member: did, role: "member" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) await env.COHERE_AUTH.put(key, "added");
    else console.warn(`auto-membership: setMembership returned ${res.status}`);
  } catch (err) {
    console.warn("auto-membership failed:", err instanceof Error ? err.name : "error");
  }
}
