// "Bringing / Offering / Curious about": three optional lines on a member's profile.
//
//   GET/PUT /api/me/profile-extras     the owner's lines (written only from the verified session's DID)
//   GET     /api/members/profile-extras  every current member's lines, for People (members only)
//
// They sit in D1 beside the circle profile, which stays untouched, so People can
// filter on them server-side and only roster members can read them. A person who
// has left the roster is dropped from reads; their row is not served.

import { refuseCrossSiteWrite } from "./csrf";
import { readVerifiedSessionDid, type RegenosAuthEnv } from "./regenos-auth";
import { readRoster, type RosterEnv } from "./roster";

export interface ProfileExtrasEnv extends RegenosAuthEnv, RosterEnv {
  cohere: D1Database;
}

export const EXTRA_KEYS = ["bringing", "offering", "curious"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export type Extras = Record<ExtraKey, string>;
export const EXTRA_MAX = 120;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const graphemeCount = (text: string): number => {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length : Array.from(text).length;
};

/** Plain text only: no control characters, whitespace collapsed to single spaces. */
// eslint-disable-next-line no-control-regex
const tidy = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim();

/** Body → three clean strings ("" = empty), or an error sentence. A missing key counts as empty. */
export function validateExtras(body: unknown): { extras: Extras } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid JSON" };
  const input = body as Record<string, unknown>;
  const extras = { bringing: "", offering: "", curious: "" } as Extras;
  for (const key of EXTRA_KEYS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return { error: `${key} must be text` };
    const clean = tidy(value);
    if (graphemeCount(clean) > EXTRA_MAX) return { error: `${key} can be at most ${EXTRA_MAX} characters` };
    extras[key] = clean;
  }
  return { extras };
}

interface Row { did: string; bringing: string | null; offering: string | null; curious: string | null }
const fromRow = (row: Row | null | undefined): Extras => ({
  bringing: row?.bringing ?? "", offering: row?.offering ?? "", curious: row?.curious ?? "",
});

const missingTable = (err: unknown): boolean => /no such table/i.test(String((err as Error)?.message ?? err));
const unavailable = () => json({ error: "Not available yet." }, 503);

export async function handleMyProfileExtras(request: Request, env: ProfileExtrasEnv): Promise<Response> {
  try { return await myExtras(request, env); } catch (err) { if (missingTable(err)) return unavailable(); throw err; }
}
export async function handleMemberProfileExtras(request: Request, env: ProfileExtrasEnv): Promise<Response> {
  try { return await memberExtras(request, env); } catch (err) { if (missingTable(err)) return unavailable(); throw err; }
}

async function myExtras(request: Request, env: ProfileExtrasEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "method not allowed" }, 405);
  if (request.method === "PUT") {
    const refused = refuseCrossSiteWrite(request);
    if (refused) return refused;
  }
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return json({ error: "Sign in first." }, 401);
  const roster = await readRoster(env);
  if (!roster) return json({ error: "We can't check membership right now. Try again shortly." }, 503);
  if (!roster.some((m) => m.did === did)) return json({ error: "Members only." }, 403);

  if (request.method === "GET") {
    const row = await env.cohere.prepare("SELECT did, bringing, offering, curious FROM profile_extras WHERE did = ?1").bind(did).first<Row>();
    return json(fromRow(row));
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const result = validateExtras(parsed);
  if ("error" in result) return json({ error: result.error }, 400);
  const { extras } = result;
  await env.cohere
    .prepare(
      `INSERT INTO profile_extras (did, bringing, offering, curious, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(did) DO UPDATE SET bringing = ?2, offering = ?3, curious = ?4, updated_at = ?5`,
    )
    .bind(did, extras.bringing || null, extras.offering || null, extras.curious || null, new Date().toISOString())
    .run();
  return json(extras);
}

/** { extras: { [did]: {bringing, offering, curious} } } for current members who have set any line. */
async function memberExtras(request: Request, env: ProfileExtrasEnv): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const viewer = await readVerifiedSessionDid(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const roster = await readRoster(env);
  if (!roster) return json({ error: "We can't check membership right now. Try again shortly." }, 503);
  const members = new Set(roster.map((m) => m.did));
  if (!members.has(viewer)) return json({ error: "Members only." }, 403);

  const { results } = await env.cohere
    .prepare("SELECT did, bringing, offering, curious FROM profile_extras WHERE bringing IS NOT NULL OR offering IS NOT NULL OR curious IS NOT NULL")
    .all<Row>();
  const extras: Record<string, Extras> = {};
  for (const row of results ?? []) if (members.has(row.did)) extras[row.did] = fromRow(row);
  return json({ extras });
}
