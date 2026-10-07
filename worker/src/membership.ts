import { isRegenosLoginEnabled, readVerifiedSessionEmail, type RegenosAuthEnv } from "./regenos-auth";
import { ensureCollectiveMember, type RegenosServiceEnv } from "./regenos-service";

type Env = RegenosAuthEnv & RegenosServiceEnv & { cohere: D1Database };
export interface MembershipResult { registered: boolean | null; email?: string; membership?: "member" | "pending"; }

/** Email is read owner-only from regenOS, never trusted from a request body.
 * D1 stores a receipt; the scene-authored claim remains the authority.
 * Failure is deliberately nonfatal and retried on subsequent session reads.
 */
export async function reconcileMembership(request: Request, env: Env, did: string): Promise<MembershipResult> {
  if (!isRegenosLoginEnabled(env)) return { registered: null };
  const email = await readVerifiedSessionEmail(request, env);
  if (!email) return { registered: null };
  const person = await env.cohere.prepare(`SELECT p.id FROM people p JOIN submissions s ON s.person_id = p.id WHERE p.email = ?1 AND s.form_slug = 'register-2026' LIMIT 1`).bind(email).first<{ id: string }>();
  if (!person) return { registered: false, email };
  const result: MembershipResult = { registered: true, email, membership: "pending" };
  const link = await env.cohere.prepare("SELECT did,status FROM membership_links WHERE person_id = ?1").bind(person.id).first<{ did: string; status: string }>();
  // Never silently replace an established identity with a different account.
  if (link && link.did !== did) return result;
  if (link?.status === "member") return { ...result, membership: "member" };
  await env.cohere.prepare(`INSERT INTO membership_links(person_id,did,status,updated_at) VALUES(?1,?2,'pending',?3) ON CONFLICT DO NOTHING`).bind(person.id, did, new Date().toISOString()).run();
  // Recheck the winning identity if two accounts sign in concurrently.
  const winner = await env.cohere.prepare("SELECT did FROM membership_links WHERE person_id = ?1").bind(person.id).first<{ did: string }>();
  if (winner?.did !== did) return result;
  try {
    const role = await ensureCollectiveMember(env, did);
    await env.cohere.prepare("UPDATE membership_links SET status = 'member', role = ?2, updated_at = ?3 WHERE person_id = ?1 AND did = ?4").bind(person.id, role, new Date().toISOString(), did).run();
    return { ...result, membership: "member" };
  } catch { return result; }
}

/** Count only. No email addresses, upstream account discovery, or writes. */
export async function membershipDryRun(env: Env): Promise<Response> {
  const counts = await env.cohere.prepare(`SELECT COUNT(*) AS registrants,
    COALESCE(SUM(CASE WHEN l.person_id IS NULL THEN 1 ELSE 0 END), 0) AS awaitingVerifiedSignIn,
    COALESCE(SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
    COALESCE(SUM(CASE WHEN l.status = 'member' THEN 1 ELSE 0 END), 0) AS linked
    FROM people p JOIN submissions s ON s.person_id = p.id AND s.form_slug = 'register-2026'
    LEFT JOIN membership_links l ON l.person_id = p.id`).first();
  return Response.json({ dryRun: true, ...counts }, { headers: { "Cache-Control": "no-store" } });
}
