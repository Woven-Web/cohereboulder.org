// The Board's COhere-side hooks: members report posts, stewards act on them.
//
//   POST /api/board/reports            a member reports a post or reply
//   /api/admin/board[/…]               the /admin Board tab (admin session)
//
// The posts themselves are regenOS circle records; see board-moderation.ts for
// how hiding is applied to what the /xrpc proxy returns.

import { rateLimited, type AuthEnv } from "./auth";
import { refuseCrossSiteWrite } from "./csrf";
import { EXCERPT_MAX, getBoardSettings, type ModerationEnv } from "./board-moderation";
import { readVerifiedSessionDid, type RegenosAuthEnv } from "./regenos-auth";
import { readRoster } from "./roster";

export type BoardEnv = ModerationEnv & RegenosAuthEnv & AuthEnv & { cohere: D1Database };

const REASONS = new Set(["spam", "unkind", "private_info", "other"]);
const NOTE_MAX = 500;
const REPORTS_PER_HOUR = 10;
/** Per address, counted before the upstream session call so signed-out spam stays cheap. */
const REPORTS_PER_IP_PER_HOUR = 30;
/** A post's URI: a circle post in someone's repo. Nothing else is reportable or hideable. */
const POST_URI_RE = /^at:\/\/did:[a-z0-9]+:[A-Za-z0-9._%:-]{1,200}\/coop\.lexicon\.post\/[A-Za-z0-9._~-]{1,64}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function authorOf(uri: string): string {
  return uri.slice("at://".length).split("/")[0];
}

// ------------------------------------------------------------------- reports

export async function handleCreateReport(request: Request, env: BoardEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const refused = refuseCrossSiteWrite(request);
  if (refused) return refused;
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip && (await rateLimited(env, `board-report-ip:${ip}`, REPORTS_PER_IP_PER_HOUR, 3600))) {
    return json({ error: "That's a lot of reports. Please try again later." }, 429);
  }
  const body = await readJson(request);
  if (!body) return json({ error: "invalid JSON" }, 400);

  const uri = typeof body.uri === "string" ? body.uri : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!POST_URI_RE.test(uri)) return json({ error: "That isn't a Board post." }, 400);
  if (!REASONS.has(reason)) return json({ error: "Pick a reason." }, 400);
  if (typeof body.note === "string" && body.note.trim().length > NOTE_MAX) {
    return json({ error: `Keep the note under ${NOTE_MAX} characters.` }, 400);
  }

  // The reporter is whoever regenOS says is signed in — never a field of the body.
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return json({ error: "Sign in to report a post." }, 401);

  const roster = await readRoster(env);
  if (!roster) return json({ error: "We can't check membership right now. Try again shortly." }, 503);
  if (!roster.some((m) => m.did === did)) return json({ error: "Only COhere members can report posts." }, 403);

  if (await rateLimited(env, `board-report:${did}`, REPORTS_PER_HOUR, 3600)) {
    return json({ error: "That's a lot of reports. Please try again later." }, 429);
  }

  await env.cohere
    .prepare(
      `INSERT OR IGNORE INTO board_reports (post_uri, post_author_did, reporter_did, reason, note, excerpt, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(uri, authorOf(uri), did, reason, text(body.note, NOTE_MAX), text(body.excerpt, EXCERPT_MAX), new Date().toISOString())
    .run();
  return json({ ok: true });
}

// --------------------------------------------------------------------- admin

interface ReportGroup {
  id: number;
  postUri: string;
  authorDid: string | null;
  reason: string;
  reasons: string[];
  reporters: number;
  notes: string[];
  excerpt: string | null;
  firstAt: string;
  state: string | null;
}

async function boardOverview(env: BoardEnv): Promise<Response> {
  const db = env.cohere;
  const { results: open } = await db
    .prepare(
      `SELECT r.id, r.post_uri, r.post_author_did, r.reason, r.note, r.excerpt, r.created_at, m.state
         FROM board_reports r LEFT JOIN board_moderation m ON m.uri = r.post_uri
        WHERE r.status = 'open' ORDER BY r.created_at ASC`,
    )
    .all<{ id: number; post_uri: string; post_author_did: string | null; reason: string; note: string | null; excerpt: string | null; created_at: string; state: string | null }>();

  const groups = new Map<string, ReportGroup>();
  for (const row of open) {
    const group = groups.get(row.post_uri);
    if (group) {
      group.reporters += 1;
      if (!group.reasons.includes(row.reason)) group.reasons.push(row.reason);
      if (row.note) group.notes.push(row.note);
      group.excerpt ??= row.excerpt;
    } else {
      groups.set(row.post_uri, {
        id: row.id, postUri: row.post_uri, authorDid: row.post_author_did, reason: row.reason, reasons: [row.reason],
        reporters: 1, notes: row.note ? [row.note] : [], excerpt: row.excerpt, firstAt: row.created_at, state: row.state,
      });
    }
  }

  const { results: hidden } = await db
    .prepare("SELECT uri, state, author_did, reason, note, excerpt, actor, updated_at FROM board_moderation WHERE state IN ('hidden', 'removed') ORDER BY updated_at DESC")
    .all();
  const { results: pending } = await db
    .prepare("SELECT uri, author_did, excerpt, created_at FROM board_moderation WHERE state = 'pending' ORDER BY created_at ASC")
    .all();
  const settings = await getBoardSettings(db);
  return json({ reports: [...groups.values()], hidden, pending, settings: { approval: settings.approval } });
}

async function setState(env: BoardEnv, uri: string, state: "hidden" | "removed" | "approved", actor: string, reason: string | null, note: string | null): Promise<void> {
  const now = new Date().toISOString();
  const excerpt = (
    await env.cohere.prepare("SELECT excerpt FROM board_reports WHERE post_uri = ?1 AND excerpt IS NOT NULL LIMIT 1").bind(uri).first<{ excerpt: string }>()
  )?.excerpt ?? null;
  await env.cohere
    .prepare(
      `INSERT INTO board_moderation (uri, state, author_did, reason, note, excerpt, actor, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(uri) DO UPDATE SET state = ?2, reason = ?4, note = ?5, actor = ?7, updated_at = ?8,
         excerpt = COALESCE(board_moderation.excerpt, ?6)`,
    )
    .bind(uri, state, authorOf(uri), reason, note, excerpt, actor, now)
    .run();
  if (state !== "approved") {
    await env.cohere
      .prepare("UPDATE board_reports SET status = 'actioned', resolved_at = ?2, resolved_by = ?3 WHERE post_uri = ?1 AND status = 'open'")
      .bind(uri, now, actor)
      .run();
  }
}

/** Routes under /api/admin/board. Returns null for any other path. The admin session is checked by the caller. */
export async function handleAdminBoard(request: Request, env: BoardEnv, path: string, actor: string): Promise<Response | null> {
  if (path !== "/api/admin/board" && !path.startsWith("/api/admin/board/")) return null;
  const method = request.method;

  if (method === "GET" && path === "/api/admin/board") return boardOverview(env);

  if (method === "PUT" && path === "/api/admin/board/settings") {
    const body = await readJson(request);
    if (!body || typeof body.approval !== "boolean") return json({ error: "approval must be true or false" }, 400);
    const now = new Date().toISOString();
    const put = (key: string, value: string) =>
      env.cohere
        .prepare("INSERT INTO board_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4")
        .bind(key, value, now, actor);
    const before = await getBoardSettings(env.cohere);
    // Only a fresh switch-on moves the clock, so saving "on" twice never
    // re-holds posts already let through, and the back catalogue is never held.
    const statements = [put("approval", body.approval ? "on" : "off")];
    if (body.approval && !before.approval) statements.push(put("approval_since", now));
    await env.cohere.batch(statements);
    return json({ ok: true, approval: body.approval });
  }

  const dismiss = /^\/api\/admin\/board\/reports\/(\d+)\/dismiss$/.exec(path);
  if (method === "POST" && dismiss) {
    const row = await env.cohere.prepare("SELECT post_uri FROM board_reports WHERE id = ?1").bind(Number(dismiss[1])).first<{ post_uri: string }>();
    if (!row) return json({ error: "not found" }, 404);
    // One post, one queue entry: dismissing it closes every open report of it.
    await env.cohere
      .prepare("UPDATE board_reports SET status = 'dismissed', resolved_at = ?2, resolved_by = ?3 WHERE post_uri = ?1 AND status = 'open'")
      .bind(row.post_uri, new Date().toISOString(), actor)
      .run();
    return json({ ok: true });
  }

  if (method === "POST" && ["hide", "unhide", "remove", "approve"].some((a) => path === `/api/admin/board/${a}`)) {
    const body = await readJson(request);
    const uri = typeof body?.uri === "string" ? body.uri : "";
    if (!body || !POST_URI_RE.test(uri)) return json({ error: "That isn't a Board post." }, 400);
    const action = path.slice("/api/admin/board/".length);
    const current = await env.cohere.prepare("SELECT state FROM board_moderation WHERE uri = ?1").bind(uri).first<{ state: string }>();

    if (action === "hide") {
      if (current?.state === "removed") return json({ error: "That post was removed for good." }, 409);
      await setState(env, uri, "hidden", actor, text(body.reason, 40), text(body.note, NOTE_MAX));
    } else if (action === "remove") {
      const note = text(body.note, NOTE_MAX);
      if (!note) return json({ error: "Say why it's being removed." }, 400);
      await setState(env, uri, "removed", actor, text(body.reason, 40), note);
    } else if (action === "unhide") {
      if (current?.state === "removed") return json({ error: "A removed post stays removed." }, 409);
      if (current?.state !== "hidden") return json({ error: "That post isn't hidden." }, 404);
      await env.cohere.prepare("DELETE FROM board_moderation WHERE uri = ?1").bind(uri).run();
    } else {
      if (current?.state !== "pending") return json({ error: "That post isn't waiting for approval." }, 404);
      await setState(env, uri, "approved", actor, null, null);
    }
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}
