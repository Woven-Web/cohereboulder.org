// COhere-side moderation for the members Board.
//
// regenOS owns the posts (member-owned circle records) and enforces who may
// read them. It has no moderation verb for circle posts that we can call —
// `reportContent` does not accept them and `removeContent` is operator-only —
// so hiding is ours: a row in D1 `board_moderation`, applied to every
// listCirclePosts / getCircleThread response as it passes through the /xrpc
// proxy. A hidden post is simply absent from what the Worker returns, except
// to its own author, who sees it marked so they are never left guessing.
//
// The same filter carries the approval hook. With the `approval` setting on,
// posts created after it was switched on are held (state 'pending') until a
// steward approves them; stewards' own posts are exempt. Default: off.
// "Created after" means FIRST SEEN BY THIS WORKER (board_seen), never the
// author-supplied createdAt, which anyone can backdate.

import { readStewardDids, type RosterEnv } from "./roster";

export interface ModerationEnv extends RosterEnv {
  cohere: D1Database;
}

export type ModerationState = "hidden" | "removed" | "pending" | "approved";

/** A regenOS `#circleRecord`, as far as moderation cares. */
export interface CircleRecord {
  uri: string;
  cid?: string;
  author: string;
  record?: { text?: string; createdAt?: string; reply?: { root?: { uri?: string } } };
  /** Added by us for an author looking at their own moderated post. */
  cohereModeration?: ModerationState;
  [key: string]: unknown;
}

export interface ModerationDeps {
  stewards?: () => Promise<Set<string>>;
}

const CHUNK = 40;
export const EXCERPT_MAX = 280;

export async function getBoardSettings(db: D1Database): Promise<{ approval: boolean; since: string | null }> {
  const { results } = await db.prepare("SELECT key, value FROM board_settings WHERE key IN ('approval', 'approval_since')").all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  return { approval: map.get("approval") === "on", since: map.get("approval_since") ?? null };
}

async function loadStates(db: D1Database, uris: string[]): Promise<Map<string, ModerationState>> {
  const out = new Map<string, ModerationState>();
  for (let i = 0; i < uris.length; i += CHUNK) {
    const chunk = uris.slice(i, i + CHUNK);
    const { results } = await db
      .prepare(`SELECT uri, state FROM board_moderation WHERE uri IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ uri: string; state: ModerationState }>();
    for (const row of results) out.set(row.uri, row.state);
  }
  return out;
}

/**
 * Record the first time the Worker sees each post, and return those times.
 * Recorded whether or not approval is on, so switching it on never holds a
 * post that was already on the Board.
 */
async function firstSeen(db: D1Database, uris: string[], now: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < uris.length; i += CHUNK) {
    const chunk = uris.slice(i, i + CHUNK);
    await db.batch(chunk.map((uri) => db.prepare("INSERT OR IGNORE INTO board_seen (uri, first_seen) VALUES (?1, ?2)").bind(uri, now)));
    const { results } = await db
      .prepare(`SELECT uri, first_seen FROM board_seen WHERE uri IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ uri: string; first_seen: string }>();
    for (const row of results) out.set(row.uri, row.first_seen);
  }
  return out;
}

/**
 * Filter one page of circle records for the viewer. Throws if moderation state
 * cannot be read — the caller must answer with an error, never with the
 * unfiltered page.
 */
export async function moderateRecords(
  env: ModerationEnv,
  records: CircleRecord[],
  viewerDid: () => Promise<string | null>,
  deps: ModerationDeps = {},
): Promise<CircleRecord[]> {
  if (records.length === 0) return records;
  const rootOf = (r: CircleRecord) => r.record?.reply?.root?.uri;
  const uris = [...new Set(records.flatMap((r) => [r.uri, rootOf(r)].filter((u): u is string => typeof u === "string")))];
  const [states, settings] = await Promise.all([loadStates(env.cohere, uris), getBoardSettings(env.cohere)]);

  let viewer: Promise<string | null> | undefined;
  const who = () => (viewer ??= viewerDid().catch(() => null));
  let stewards: Promise<Set<string>> | undefined;
  const stewardSet = () => (stewards ??= (deps.stewards ?? (() => readStewardDids(env)))());
  const sinceMs = settings.since ? Date.parse(settings.since) : 0;

  const out: CircleRecord[] = [];
  const now = new Date().toISOString();
  const seen = await firstSeen(env.cohere, [...new Set(records.map((r) => r.uri))], now);
  for (const record of records) {
    let state = states.get(record.uri);

    // Approval hook: a brand-new post from a non-steward is held, once.
    if (settings.approval && state === undefined) {
      const first = Date.parse(seen.get(record.uri) ?? now);
      const isNew = Number.isNaN(first) || first >= sinceMs;
      if (isNew) {
        let steward = false;
        try {
          steward = (await stewardSet()).has(record.author);
        } catch {
          steward = false; // fail closed: if we cannot tell, hold it
        }
        if (!steward) {
          await env.cohere
            .prepare("INSERT OR IGNORE INTO board_moderation (uri, state, author_did, excerpt, created_at, updated_at) VALUES (?1, 'pending', ?2, ?3, ?4, ?4)")
            .bind(record.uri, record.author, (record.record?.text ?? "").slice(0, EXCERPT_MAX), now)
            .run();
          state = "pending";
        }
      }
    }

    // 'pending' only means anything while approval is on.
    const own: ModerationState | undefined = state === "pending" && !settings.approval ? undefined : state;
    const heldOwn = own === "hidden" || own === "removed" || own === "pending";
    if (heldOwn) {
      if ((await who()) === record.author) out.push({ ...record, cohereModeration: own });
      continue;
    }

    // A hidden or held root takes its whole thread with it.
    const root = rootOf(record);
    const rootState = root ? states.get(root) : undefined;
    if (rootState === "hidden" || rootState === "removed" || (rootState === "pending" && settings.approval)) continue;

    out.push(record);
  }
  return out;
}
