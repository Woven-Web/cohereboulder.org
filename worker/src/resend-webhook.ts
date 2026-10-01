// Resend/Svix webhook: verify raw bytes before JSON parsing. No provider calls.
// Event ledger + send/person effects commit in one D1 batch transaction, so
// concurrent replays and crashes cannot leave a claimed-but-unapplied event.
import { redactEmails } from "./newsletter";

export interface ResendWebhookEnv {
  cohere: D1Database;
  RESEND_WEBHOOK_SECRET?: string;
}
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 256 * 1024;
const EVENT_RETENTION_DAYS = 60;
const SVIX_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
// ------------------------------------------------------------ signature

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** The key bytes from "whsec_<base64>", or null if the secret is malformed. */
export function webhookKeyBytes(secret: string): Uint8Array | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith("whsec_")) return null;
  const encoded = trimmed.slice("whsec_".length);
  const bytes = base64ToBytes(encoded);
  return bytes && bytes.length >= 16 ? bytes : null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing headers" | "bad timestamp" | "stale timestamp" | "bad signature" };

/**
 * Svix verification. `body` is the raw request bytes — re-serialised JSON
 * would not match. Any one valid `v1,` entry passes.
 */
export async function verifySvixSignature(
  key: Uint8Array,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: Uint8Array,
  nowSeconds: number,
): Promise<VerifyResult> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !SVIX_ID_RE.test(id)) return { ok: false, reason: "missing headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: "stale timestamp" };

  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

  for (const entry of signature.split(/\s+/)) {
    const comma = entry.indexOf(",");
    if (comma === -1 || entry.slice(0, comma) !== "v1") continue;
    const sig = base64ToBytes(entry.slice(comma + 1));
    if (!sig || sig.length !== 32) continue;
    // HMAC verify compares in constant time.
    if (await crypto.subtle.verify("HMAC", cryptoKey, sig, signed)) return { ok: true };
  }
  return { ok: false, reason: "bad signature" };
}

// -------------------------------------------------------------- payload
export interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: unknown;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    tags?: { newsletter_id?: string; person_id?: string };
  };
}
export type Effect = "tagged-undeliverable" | "soft-bounce-recorded" | "unsubscribed" |
  "delivered" | "delay-recorded" | "unknown-recipient" | "ignored";
export interface WebhookOutcome { effect: Effect; personIds: string[]; sendRows: number; duplicate?: boolean }
export function isHardBounce(event: ResendEvent): boolean {
  return (event.data?.bounce?.type ?? "").trim().toLowerCase() === "permanent";
}
function noteLine(date: string, what: string, event: ResendEvent): string {
  const clean = (value: string) => redactEmails(value.replace(/\s+/g, " ").trim());
  const subject = clean(event.data?.subject ?? "").slice(0, 120);
  const bounce = event.data?.bounce;
  const kind = bounce ? clean([bounce.type, bounce.subType].filter(Boolean).join("/")) : "";
  const reason = clean(bounce?.message ?? "").slice(0, 200);
  return `${date}: ${what}${kind ? ` (${kind})` : ""}${subject ? ` on “${subject}”` : ""}${reason ? ` — ${reason}` : ""}`;
}

/** One transaction, with every mutation gated on this event's pending claim.
 * Ledger insertion, effects, and marking applied are atomic. A failed batch
 * rolls back all statements; a duplicate batch sees a non-null effect and
 * writes nothing. No separate KV check/write or crash-sensitive claim.
 */
export async function applyResendEvent(
  env: ResendWebhookEnv, event: ResendEvent, now: Date, svixId: string = crypto.randomUUID(),
): Promise<WebhookOutcome> {
  const at = now.toISOString();
  const emailId = event.data?.email_id ?? null;
  const bounceType = event.type === "email.bounced" ? event.data?.bounce?.type ?? "unknown" : null;
  const to = Array.isArray(event.data?.to) ? event.data.to : [];
  const recipients = [...new Set(to.filter((v): v is string => typeof v === "string").map((v) => {
    const angle = v.match(/<([^>]+)>/);
    return (angle ? angle[1] : v).trim().toLowerCase();
  }))];
  const hard = event.type === "email.bounced" && isHardBounce(event);
  const complaint = event.type === "email.complained";
  const bounced = event.type === "email.bounced";
  const delivered = event.type === "email.delivered";
  const delayed = event.type === "email.delivery_delayed";
  const next = complaint ? "complained" : hard ? "bounced" : delivered ? "delivered" : null;
  const effect: Effect = complaint ? "unsubscribed" : hard ? "tagged-undeliverable" : bounced ? "soft-bounce-recorded" :
    delivered ? "delivered" : delayed ? "delay-recorded" : "ignored";
  const lastEvent = bounced ? `bounced:${bounceType}` : event.type.replace(/^email\./, "");
  const note = hard ? noteLine(at.slice(0, 10), "Resend hard bounce, tagged undeliverable", event) :
    complaint ? noteLine(at.slice(0, 10), "marked a newsletter as spam (Resend complaint), unsubscribed", event) : null;
  // Bind all data; payloads are never interpolated into SQL or logs.
  const args = [svixId, event.type, emailId, bounceType, at, JSON.stringify(recipients), next, lastEvent, effect, note,
    event.data?.tags?.newsletter_id ?? null, event.data?.tags?.person_id ?? null];
  const pending = `EXISTS (SELECT 1 FROM resend_webhook_events WHERE svix_id = ?1 AND effect IS NULL)`;
  // Prefer the send ledger's person_id; fallback handles tests/admin notices.
  const matches = `(id IN (SELECT person_id FROM newsletter_sends WHERE resend_id = ?3)
    OR (NOT EXISTS (SELECT 1 FROM newsletter_sends WHERE resend_id = ?3)
        AND LOWER(email) IN (SELECT value FROM json_each(?6))))`;
  const stmt = (sql: string) => env.cohere.prepare(sql).bind(...args);
  // Unused numbered binds are intentional: statements share one param vector.
  // ?12 ensures D1/SQLite accept the same bind vector for every statement.
  const statements = [stmt(`INSERT INTO resend_webhook_events (svix_id, type, email_id, bounce_type, received_at)
    SELECT ?1, ?2, ?3, ?4, ?5 WHERE ?12 IS ?12 ON CONFLICT(svix_id) DO NOTHING`)];
  statements.push(stmt(`UPDATE newsletter_sends SET
    status = CASE
      WHEN ?7 = 'complained' THEN 'complained'
      WHEN ?7 = 'bounced' AND status != 'complained' THEN 'bounced'
      WHEN ?7 = 'delivered' AND status NOT IN ('bounced', 'complained') THEN 'delivered'
      ELSE status END,
    last_event = ?8, last_event_at = ?5, updated_at = ?5,
    resend_id = COALESCE(resend_id, ?3)
    WHERE (resend_id = ?3 OR (newsletter_id = ?11 AND person_id = ?12
      AND resend_id IS NULL AND ?3 IS NOT NULL
      AND LOWER(email) IN (SELECT value FROM json_each(?6)))) AND ${pending} AND ?9 != 'ignored' AND ?12 IS ?12
    RETURNING person_id`));
  statements.push(stmt(`UPDATE people SET
    tags = CASE WHEN ?9 = 'tagged-undeliverable'
      AND instr(',' || REPLACE(REPLACE(LOWER(TRIM(COALESCE(tags, ''))), ', ', ','), ' ,', ',') || ',', ',undeliverable,') = 0
      THEN CASE WHEN TRIM(COALESCE(tags, '')) = '' THEN 'undeliverable' ELSE RTRIM(TRIM(tags), ',') || ',undeliverable' END
      ELSE tags END,
    subscribed = CASE WHEN ?9 = 'unsubscribed' THEN 0 ELSE subscribed END,
    internal_notes = CASE WHEN ?10 IS NULL THEN internal_notes
      WHEN TRIM(COALESCE(internal_notes, '')) = '' THEN ?10 ELSE internal_notes || char(10) || ?10 END,
    updated_at = CASE WHEN ?10 IS NULL THEN updated_at ELSE ?5 END
    WHERE ${matches} AND ${pending} AND ?12 IS ?12 AND ?9 IN ('tagged-undeliverable', 'unsubscribed', 'soft-bounce-recorded')
    RETURNING id`));
  statements.push(stmt(`UPDATE resend_webhook_events SET
    effect = CASE WHEN ?9 IN ('tagged-undeliverable', 'unsubscribed', 'soft-bounce-recorded')
      AND NOT EXISTS (SELECT 1 FROM people WHERE ${matches}) THEN 'unknown-recipient' ELSE ?9 END,
    person_id = (SELECT id FROM people WHERE ${matches} LIMIT 1)
    WHERE svix_id = ?1 AND effect IS NULL AND ?12 IS ?12 RETURNING effect`));
  const results = await env.cohere.batch(statements);
  if (!results[0].meta?.changes) return { effect, personIds: [], sendRows: 0, duplicate: true };
  return {
    effect: (results[3].results[0] as { effect: Effect }).effect,
    personIds: results[2].results.map((r: Record<string, unknown>) => String(r.id)),
    sendRows: results[1].results.length,
  };
}

// ---------------------------------------------------------------- route
export async function handleResendWebhook(
  request: Request, env: ResendWebhookEnv, deps: { now?: () => Date } = {},
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const now = (deps.now ?? (() => new Date()))();
  if (!env.RESEND_WEBHOOK_SECRET) return json({ error: "webhook not configured" }, 503);
  const key = webhookKeyBytes(env.RESEND_WEBHOOK_SECRET);
  if (!key) return json({ error: "webhook not configured" }, 503);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
  const svixId = request.headers.get("svix-id");
  const verified = await verifySvixSignature(key, {
    id: svixId, timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"),
  }, body, Math.floor(now.getTime() / 1000));
  if (!verified.ok) return json({ error: "invalid signature" }, 401);
  let event: ResendEvent;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.type !== "string" || parsed.type.length > 64) throw new Error("shape");
    const d = parsed.data;
    if (d !== undefined && (!d || typeof d !== "object" || Array.isArray(d))) throw new Error("data");
    if (d) {
      if (d.email_id !== undefined && (typeof d.email_id !== "string" || d.email_id.length > 200)) throw new Error("id");
      if (d.subject !== undefined && typeof d.subject !== "string") throw new Error("subject");
      if (d.to !== undefined && (!Array.isArray(d.to) || d.to.length > 100 || d.to.some((v: unknown) => typeof v !== "string"))) throw new Error("to");
      if (d.tags !== undefined) {
        if (!d.tags || typeof d.tags !== "object" || Array.isArray(d.tags)) throw new Error("tags");
        for (const field of ["newsletter_id", "person_id"]) {
          if (d.tags[field] !== undefined && (typeof d.tags[field] !== "string" || d.tags[field].length > 200)) throw new Error("tag field");
        }
      }
      if (d.tags !== undefined) {
        if (!d.tags || typeof d.tags !== "object" || Array.isArray(d.tags)) throw new Error("tags");
        for (const field of ["newsletter_id", "person_id"]) {
          if (d.tags[field] !== undefined && (typeof d.tags[field] !== "string" || d.tags[field].length > 200)) throw new Error("tag field");
        }
      }
      if (d.bounce !== undefined) {
        if (!d.bounce || typeof d.bounce !== "object" || Array.isArray(d.bounce)) throw new Error("bounce");
        for (const field of ["type", "subType", "message"]) {
          if (d.bounce[field] !== undefined && typeof d.bounce[field] !== "string") throw new Error("bounce field");
        }
      }
    }
    event = parsed;
  } catch { return json({ error: "invalid payload" }, 400); }
  try {
    const outcome = await applyResendEvent(env, event, now, svixId!);
    return json(outcome.duplicate ? { ok: true, duplicate: true } : { ok: true, effect: outcome.effect }, 200);
  } catch {
    // Do not print exceptions or payload-derived values: they may contain PII.
    console.error("resend webhook: D1 transaction failed");
    return json({ error: "temporary failure" }, 500);
  }
}

/** Daily retention beyond Svix's retry window (no raw payloads/addresses stored). */
export async function purgeWebhookEvents(env: ResendWebhookEnv, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86400000).toISOString();
  const result = await env.cohere.prepare(`DELETE FROM resend_webhook_events WHERE received_at < ?1`).bind(cutoff).run();
  return Number(result.meta?.changes ?? 0);
}
