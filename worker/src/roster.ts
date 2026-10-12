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
