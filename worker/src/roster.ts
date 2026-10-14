// The COhere collective's roster, read anonymously.
//
// getSceneMembers answers without a session (only the viewer's own `steward`
// flag needs the bearer — see regenos-service.ts), so the members-area checks
// ("is this DID a member?", "is this author a steward?") never need the
// service token and cannot trip its scope rules.

export interface RosterEnv {
  REGENOS_BASE_URL?: string;
  REGENOS_COLLECTIVE_DID?: string;
}

export interface RosterMember {
  did: string;
  role: string;
}

const TIMEOUT_MS = 8_000;

/** The roster, or null when it cannot be read (unconfigured, down, malformed). */
export async function readRoster(env: RosterEnv): Promise<RosterMember[] | null> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  const scene = env.REGENOS_COLLECTIVE_DID?.trim();
  if (!base || !scene) return null;
  try {
    const res = await fetch(`${base}/xrpc/social.scenius.getSceneMembers?${new URLSearchParams({ scene })}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { members?: { did?: unknown; role?: unknown }[] };
    if (!Array.isArray(data.members)) return null;
    return data.members.flatMap((m) =>
      typeof m?.did === "string" ? [{ did: m.did, role: typeof m.role === "string" ? m.role : "member" }] : [],
    );
  } catch {
    return null;
  }
}

export async function readStewardDids(env: RosterEnv): Promise<Set<string>> {
  const roster = await readRoster(env);
  if (!roster) throw new Error("roster unavailable");
  return new Set(roster.filter((m) => m.role === "steward").map((m) => m.did));
}

// A member check runs on every circle call, so the roster is kept for a few
// seconds per isolate. Only a *positive* answer is trusted from the cache: a
// DID that isn't in it triggers a fresh read, so someone who just joined is
// never turned away, and a removed member loses access within the TTL.
const ROSTER_TTL_MS = 30_000;
let cached: { key: string; at: number; dids: Set<string> } | undefined;

export function resetRosterCache(): void {
  cached = undefined;
}

/** true / false, or null when the roster cannot be read (callers fail closed). */
export async function isRosterMember(env: RosterEnv, did: string): Promise<boolean | null> {
  const key = `${env.REGENOS_BASE_URL}|${env.REGENOS_COLLECTIVE_DID}`;
  if (cached && cached.key === key && Date.now() - cached.at < ROSTER_TTL_MS && cached.dids.has(did)) return true;
  const roster = await readRoster(env);
  if (!roster) return null;
  cached = { key, at: Date.now(), dids: new Set(roster.map((m) => m.did)) };
  return cached.dids.has(did);
}
