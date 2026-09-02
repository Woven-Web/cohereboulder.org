// The regenOS account lane — sign-in, the signup wizard, and sign-out.
//
// Everything here talks to OUR OWN Worker's /xrpc proxy
// (worker/src/regenos-auth.ts), never to regenOS directly: the AppView's
// session cookie is `__Host-rs_session`, which can only land on the origin
// that emitted the response, so same-origin is the only origin there is.
// The cookies are HttpOnly and ride along on their own; no code here ever
// sees or stores a credential.
//
// The whole lane is inert until the Worker's REGENOS_LOGIN_ENABLED flag is
// "true" — /api/config (fetchSiteConfig) is how the SPA finds out, and every
// hook and component gates on it.
//
// The magic-link state machine (see worker/src/regenos-auth.ts for the flow):
//   beginSignup {email}
//     → stage "login"        returning user, session already live — done.
//     → stage "checkEmail"   a link was emailed; `returningUser` picks the copy.
//                            NEW users' links open /login?token=… (our wizard);
//                            RETURNING users' links hit verifyEmail and land
//                            them on "/" already signed in.
//     → stage "chooseHandle" ownership already proven (beta mode) — go
//                            straight to the wizard's handle step.
//   verifySignup?token=…  → flips the pending signup to verified (wizard step 1)
//   setSignupProfile      → claims a handle (wizard step 2)
//   createCustodialAccount→ mints the account + session cookie (wizard step 3)

import { API_BASE } from "./api";

/** What /api/config says about this deployment. */
export interface SiteConfig {
  regenosLoginEnabled: boolean;
  /** The COhere collective's DID — the authority new events are created under. */
  collectiveDid: string | null;
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) throw new Error(`/api/config answered ${res.status}`);
  const data = (await res.json()) as { regenosLoginEnabled?: boolean; collectiveDid?: string | null };
  return {
    regenosLoginEnabled: data.regenosLoginEnabled === true,
    collectiveDid: typeof data.collectiveDid === "string" ? data.collectiveDid : null,
  };
}

/** An upstream XRPC failure, with enough shape to say something useful. */
export class XrpcError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * One human sentence for a failed event write; the raw upstream message when
 * it has one. A 403/401 is the standing problem (creating under the collective
 * needs Builder+ there), so it gets the "ask the organizers" copy.
 */
export function describeWriteError(err: unknown, tr: (path: string) => string): string {
  if (err instanceof XrpcError) {
    if (err.status === 403 || err.status === 401) return tr("calendar.host.notAllowed");
    if (err.status === 502) return tr("calendar.host.unreachable");
    return err.message || tr("calendar.host.genericError");
  }
  return tr("calendar.host.genericError");
}

async function throwXrpcError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  throw new XrpcError(
    res.status,
    body?.error ?? null,
    body?.message || body?.error || `regenOS answered ${res.status}`,
  );
}

async function xrpcGet<T>(nsid: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${API_BASE}/xrpc/${nsid}${query}`, { cache: "no-store" });
  if (!res.ok) await throwXrpcError(res);
  return res.json() as Promise<T>;
}

export async function xrpcPost<T>(nsid: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/xrpc/${nsid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) await throwXrpcError(res);
  return res.json() as Promise<T>;
}

// ------------------------------------------------------------------- session

/** Who this browser is on regenOS. Anonymous callers get `{}` upstream → both null. */
export interface RegenosSession {
  did: string | null;
  handle: string | null;
}

export async function fetchRegenosSession(): Promise<RegenosSession> {
  const data = await xrpcGet<{ did?: string; handle?: string }>("social.scenius.getSession");
  return {
    did: typeof data.did === "string" ? data.did : null,
    handle: typeof data.handle === "string" ? data.handle : null,
  };
}

export async function signOut(): Promise<void> {
  await xrpcPost("social.scenius.logout");
}

// --------------------------------------------------------------- magic link

export interface BeginSignupResult {
  stage: "login" | "checkEmail" | "chooseHandle";
  returningUser: boolean;
}

export async function beginSignup(email: string): Promise<BeginSignupResult> {
  const data = await xrpcPost<{ stage?: string; returningUser?: boolean }>(
    "social.scenius.beginSignup",
    { email },
  );
  const stage =
    data.stage === "login" || data.stage === "chooseHandle" ? data.stage : "checkEmail";
  return { stage, returningUser: data.returningUser === true };
}

/** Redeem a new user's emailed link (the `?token=` on /login). */
export async function verifySignupToken(token: string): Promise<void> {
  await xrpcGet("social.scenius.verifySignup", { token });
}

/** Claim a handle for the pending signup. Returns the full address (e.g. `ana.scenius.social`). */
export async function setSignupProfile(handle: string): Promise<string> {
  const data = await xrpcPost<{ handle?: string }>("social.scenius.setSignupProfile", { handle });
  return data.handle ?? handle;
}

/** The final wizard step: mint the account. The session cookie lands with the response. */
export async function createCustodialAccount(): Promise<RegenosSession> {
  const data = await xrpcPost<{ did?: string; handle?: string }>(
    "social.scenius.createCustodialAccount",
  );
  return { did: data.did ?? null, handle: data.handle ?? null };
}
