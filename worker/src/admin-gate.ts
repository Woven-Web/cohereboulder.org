// Who may use the admin portal: a regenOS user whose role in the COhere scene
// is builder or higher. "Admins are users" — there is no separate admin
// account to sign in to.
//
// The visitor's regenOS session arrives as the relayed `__Host-rs_` cookie
// (worker/src/regenos-auth.ts). Two upstream reads decide the answer:
//   * getSession (the visitor's own cookie, no bearer) → who they are;
//   * getSceneMembers (the site's service token, no cookie) → their role.
// The result is cached in KV for 60 seconds, keyed by a hash of the cookie, so
// a page that fires a dozen API calls asks regenOS once — and a revoked role
// or expired session stops working in about one to two minutes (KV is
// eventually consistent, so another edge can serve the entry a little past expiry).
//
// The old email-code login survives behind ADMIN_EMAIL_LOGIN="true" for one
// release, as a rollback. Anything but that exact string leaves a
// `cohere_session` cookie worthless.

import { currentSession, sha256, type AuthEnv, type Session } from "./auth";
import { readVerifiedSessionEmail, relayableCookies, type RegenosAuthEnv } from "./regenos-auth";
import { fetchRoster, type RegenosServiceEnv } from "./regenos-service";

export interface AdminGateEnv extends AuthEnv, RegenosAuthEnv, RegenosServiceEnv {
  /** Rollback switch for the retired email-code login. Only "true" enables it. */
  ADMIN_EMAIL_LOGIN?: string;
}

export { isOwnTest, sessionMailbox, testSentLabel } from "./admin-identity";

export const BUILDER_RANK = 20;
export const STEWARD_RANK = 40;

const ROLE_RANK: Record<string, number> = { member: 10, builder: 20, facilitator: 30, steward: 40 };

/** Short on purpose: it bounds how long a revoked role or ended session keeps working. */
const CACHE_TTL_SECONDS = 60;
const UPSTREAM_TIMEOUT_MS = 8_000;

export type AdminAccess =
  | { state: "organizer"; session: Session }
  | { state: "notOrganizer"; handle: string | null; role: string | null }
  | { state: "signedOut" };

export function emailLoginEnabled(env: { ADMIN_EMAIL_LOGIN?: string }): boolean {
  return env.ADMIN_EMAIL_LOGIN?.trim() === "true";
}

/** Stewards manage who may host; builders and facilitators do not. */
export function canManageAccess(session: Session): boolean {
  return (session.rank ?? 0) >= STEWARD_RANK;
}

interface Resolved {
  did: string;
  handle: string | null;
  role: string | null;
  contactEmail: string | null;
}

async function fetchSession(base: string, request: Request, cookie: string): Promise<{ did: string; handle: string | null } | null> {
  const headers = new Headers({ Accept: "application/json", Cookie: cookie });
  for (const name of ["Origin", "Sec-Fetch-Site"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(`${base}/xrpc/social.scenius.getSession`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("getSession unavailable");
  const data = (await response.json()) as { did?: unknown; handle?: unknown };
  if (typeof data.did !== "string" || !data.did.startsWith("did:")) return null;
  return { did: data.did, handle: typeof data.handle === "string" ? data.handle : null };
}

/** null means "regenOS says nobody is signed in"; a throw means "couldn't find out". */
async function resolveFromRegenos(env: AdminGateEnv, request: Request, cookie: string): Promise<Resolved | null> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  const scene = env.REGENOS_COLLECTIVE_DID?.trim();
  const token = env.REGENOS_SERVICE_TOKEN?.trim();
  if (!base || !scene || !token) throw new Error("regenOS is not configured");

  const who = await fetchSession(base, request, cookie);
  if (!who) return null;

  const roster = await fetchRoster(base, token, scene);
  if (!roster.ok) throw new Error("roster unavailable");
  const member = (roster.data.members ?? []).find((m) => m?.did === who.did);
  const role = typeof member?.role === "string" ? member.role : null;
  const handle = who.handle ?? (typeof member?.handle === "string" ? member.handle : null);

  // Only worth a mailbox lookup for people we're about to let in.
  let contactEmail: string | null = null;
  if ((ROLE_RANK[role ?? ""] ?? 0) >= BUILDER_RANK) {
    contactEmail = await readVerifiedSessionEmail(request, env).catch(() => null);
  }
  return { did: who.did, handle, role, contactEmail };
}

function sessionFor(resolved: Resolved, rank: number): Session {
  const handle = resolved.handle;
  return {
    email: resolved.contactEmail ?? (handle ? `@${handle}` : resolved.did),
    name: handle,
    createdAt: new Date().toISOString(),
    source: "regenos",
    did: resolved.did,
    handle,
    role: resolved.role ?? undefined,
    rank,
    contactEmail: resolved.contactEmail,
  };
}

export async function resolveAdminAccess(env: AdminGateEnv, request: Request): Promise<AdminAccess> {
  const cookie = relayableCookies(request.headers.get("Cookie"));
  let resolved: Resolved | null | undefined;
  if (cookie) {
    const key = `orgsess:${await sha256(cookie)}`;
    const cached = await env.COHERE_AUTH.get(key);
    if (cached) {
      resolved = JSON.parse(cached) as Resolved;
    } else {
      try {
        resolved = await resolveFromRegenos(env, request, cookie);
      } catch {
        // Fail closed, and don't cache the failure: the next request retries.
        resolved = undefined;
      }
      if (resolved) await env.COHERE_AUTH.put(key, JSON.stringify(resolved), { expirationTtl: CACHE_TTL_SECONDS });
    }
    if (resolved) {
      const rank = ROLE_RANK[resolved.role ?? ""] ?? 0;
      if (rank >= BUILDER_RANK) return { state: "organizer", session: sessionFor(resolved, rank) };
    }
  }

  // Rollback path: the retired email-code session. Checked even for someone
  // holding a below-builder regenOS session, or the rollback locks them out.
  if (emailLoginEnabled(env)) {
    const legacy = await currentSession(env, request);
    if (legacy) return { state: "organizer", session: { ...legacy, source: "email", rank: STEWARD_RANK } };
  }
  if (resolved) return { state: "notOrganizer", handle: resolved.handle, role: resolved.role };
  return { state: "signedOut" };
}

// ------------------------------------------------------------------ pages

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function plainPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · COhere Boulder</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#f4f4f1; color:#1c2723; margin:0; }
  main { max-width: 32rem; margin: 6rem auto; padding: 0 1.5rem; line-height: 1.55; }
  .brand { font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:#36558F; }
  a { color:#36558F; }
</style></head>
<body><main>
  <p class="brand">COhere Boulder</p>
  <h1>${title}</h1>
  ${body}
  <p style="margin-top:2rem"><a href="/">Back to cohereboulder.org</a></p>
</main></body></html>`;
}

/** Signed in to regenOS, but below builder in the COhere scene. */
export function notOrganizerPage(handle: string | null): string {
  const who = handle ? `@${escapeHtml(handle)}` : "your regenOS account";
  return plainPage(
    "Organizers only",
    `<p>You're signed in as ${who}, but you're not an organizer of COhere's scene. Ask a steward to give you the builder role.</p>`,
  );
}

/** Neither sign-in route is switched on for this deployment. */
export function signInUnavailablePage(): string {
  return plainPage("Sign-in isn't available", `<p>Organizer sign-in isn't switched on for this deployment.</p>`);
}
