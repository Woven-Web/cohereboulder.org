// Newsletters: written, tested, confirmed and sent from /admin's Newsletter
// tab, delivered through Resend — never through the Cloudflare transport that
// carries sign-in codes (its FAQ calls it transactional-only, and complaints
// from a blast must not throttle organizer sign-in).
//
// Safeguards against a mis-click, agreed with the organizers:
//   a. Send stays locked until the organizer sends a TEST of this exact draft
//      to their own admin address. The lock is a hash of (subject, body); any
//      edit changes the hash and re-locks it.
//   b. The confirm step shows the live recipient count and the organizer must
//      type that number.
//   c. A confirmed send waits HOLD_MINUTES as `scheduled`. Every admin is
//      emailed a Cancel link (works without sign-in, POST-confirmed); any admin
//      can also cancel from the tab.
//   d. `newsletter_sends` has one row per (newsletter, person): queued, claimed,
//      then sent/failed/skipped. A crash or re-run can never send twice, and
//      Resend's Idempotency-Key (newsletter:<id>:<person>) covers the window
//      between Resend accepting a message and us recording it.
//   e. Every newsletter records who created, tested, confirmed and cancelled
//      it, and the audience it went to.
//
// Sending: the every-minute cron (wrangler.jsonc) calls runNewsletterCron,
// which moves due `scheduled` newsletters to `sending` (snapshotting the
// audience into newsletter_sends at that moment, so anyone who unsubscribed
// during the hold is left out) and sends at most MAX_SENDS_PER_TICK messages,
// one POST /emails each. Per-recipient requests (rather than /emails/batch)
// are deliberate: each gets its own Idempotency-Key and its own List-
// Unsubscribe header, and one bad address fails alone. 40 a minute is 2,400 an
// hour — inside Resend's default 10 req/s and well inside a Worker
// invocation's subrequest budget.
//
// Routes (wired in index.ts; /api/admin/* is already behind the session gate):
//   GET    /api/admin/newsletters                 list
//   POST   /api/admin/newsletters                 create a draft
//   GET    /api/admin/newsletters/audiences       forms + tags to pick from
//   POST   /api/admin/newsletters/count           live count for an audience
//   GET    /api/admin/newsletters/:id             one, with lock state
//   PUT    /api/admin/newsletters/:id             edit a draft
//   DELETE /api/admin/newsletters/:id             delete a draft nobody received
//   GET    /api/admin/newsletters/:id/preview     rendered HTML (as JSON)
//   POST   /api/admin/newsletters/:id/test        send a test to yourself
//   POST   /api/admin/newsletters/:id/send        confirm {confirm_count}
//   POST   /api/admin/newsletters/:id/cancel      cancel a scheduled/sending one
//   POST   /api/admin/newsletters/:id/reopen      cancelled → draft (re-test needed)
//   POST   /api/admin/import/beehiiv              {csv, apply} dry run / apply
//   GET|POST /newsletter/cancel?token=…           public cancel link (admins' email)

import type { AuthEnv, Session } from "./auth";
import { mailShell, rateLimited } from "./auth";

export interface NewsletterEnv extends AuthEnv {
  cohere: D1Database;
  /** Defaults to https://api.resend.com; the e2e points it at a local mock. */
  RESEND_API_BASE?: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
}

export const HOLD_MINUTES = 15;
export const MAX_SENDS_PER_TICK = 40;
/** A claimed row older than this is assumed orphaned by a crashed run. */
const STALE_CLAIM_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Keep below Resend's default 10 requests/second. */
const MIN_SEND_INTERVAL_MS = 120;
export const DEFAULT_FROM = "COhere Boulder <hello@news.cohereboulder.org>";
export const DEFAULT_REPLY_TO = "COhere@wovenweb.org";
const UNDELIVERABLE_TAG = "undeliverable";
/** newsletter_sends statuses that follow `sent`, set by the Resend webhook. */
const DELIVERY_STATUSES = ["delivered", "bounced", "complained"];
const MAX_SUBJECT = 200;
const MAX_TEXT = 50_000;
/** Rows written per import request; the page loops until nothing is pending. */
export const IMPORT_PAGE = 200;
const MAX_IMPORT_BYTES = 5_000_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORM_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TAG_RE = /^[a-z0-9][a-z0-9:._-]{0,63}$/;
/** Audience tags match an existing tag as typed (case-insensitive), spaces allowed. */
const AUDIENCE_TAG_RE = /^[^,]{1,64}$/;

// --------------------------------------------------------------- helpers

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Provider error text can echo the recipient; logs must not carry member addresses. */
export function redactEmails(value: string): string {
  return value.replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, "<email>");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What the test-send lock compares: the exact subject and body. */
export function contentHash(subject: string, text: string): Promise<string> {
  return sha256Hex(JSON.stringify([subject, text]));
}

function baseUrl(env: NewsletterEnv, url?: URL): string {
  return (env.PUBLIC_BASE_URL || url?.origin || "https://cohereboulder.org").replace(/\/$/, "");
}

/** Lowercase, spaces → hyphens, only tag-safe characters. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:._-]/g, "");
}

export function splitTags(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Append tags not already present (compared normalized); keeps existing spelling. */
export function mergeTags(existing: string | null | undefined, add: string[]): string | null {
  const current = splitTags(existing);
  const seen = new Set(current.map(normalizeTag));
  for (const tag of add) {
    const n = normalizeTag(tag);
    if (n && !seen.has(n)) {
      current.push(n);
      seen.add(n);
    }
  }
  return current.length ? current.join(",") : null;
}

// -------------------------------------------------------------- audience

export type Audience = { kind: "all" } | { kind: "form"; form: string } | { kind: "tag"; tag: string };

export function parseAudience(raw: unknown): Audience | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  if (a.kind === "all") return { kind: "all" };
  if (a.kind === "form" && typeof a.form === "string" && FORM_RE.test(a.form)) return { kind: "form", form: a.form };
  if (a.kind === "tag" && typeof a.tag === "string") {
    const tag = tagKey(a.tag);
    if (AUDIENCE_TAG_RE.test(tag) && tag !== UNDELIVERABLE_TAG) return { kind: "tag", tag };
  }
  return null;
}

export function describeAudience(a: Audience): string {
  if (a.kind === "all") return "everyone on the list";
  if (a.kind === "form") return `registrants of ${a.form}`;
  return `people tagged ${a.tag}`;
}

/** How a stored tag is compared: trimmed and lowercased. */
export function tagKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * `,tag one,tag2,` — lowercased, the space after/before each comma dropped —
 * so instr() matches whole tags the way tagKey() spells them.
 */
const TAGS_EXPR = `(',' || REPLACE(REPLACE(LOWER(TRIM(COALESCE(p.tags, ''))), ', ', ','), ' ,', ',') || ',')`;

/**
 * WHERE clause over `people p`. Always: subscribed, and never anyone tagged
 * `undeliverable`. Parameters are numbered from `first`.
 */
export function audienceWhere(a: Audience, first = 1): { sql: string; params: unknown[] } {
  const base = `p.subscribed = 1 AND instr(${TAGS_EXPR}, ',${UNDELIVERABLE_TAG},') = 0`;
  if (a.kind === "form") {
    return {
      sql: `${base} AND EXISTS (SELECT 1 FROM submissions s WHERE s.person_id = p.id AND s.form_slug = ?${first})`,
      params: [a.form],
    };
  }
  if (a.kind === "tag") {
    return { sql: `${base} AND instr(${TAGS_EXPR}, ',' || ?${first} || ',') > 0`, params: [a.tag] };
  }
  return { sql: base, params: [] };
}

export async function countAudience(env: NewsletterEnv, a: Audience): Promise<number> {
  const where = audienceWhere(a);
  const row = await env.cohere
    .prepare(`SELECT COUNT(*) AS n FROM people p WHERE ${where.sql}`)
    .bind(...where.params)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

// ------------------------------------------------------------- rendering

const SAFE_HREF = /^(https?:\/\/|mailto:)[^\s<>"']+$/i;
const SAFE_IMG = /^https:\/\/[^\s<>"']+$/i;

/** Inline markdown on raw text: [text](url), **bold**, *italic*. Output is escaped. */
function renderInline(raw: string): string {
  const out: string[] = [];
  const link = /\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const emphasis = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  while ((match = link.exec(raw))) {
    out.push(emphasis(raw.slice(last, match.index)));
    const [, label, href] = match;
    out.push(
      SAFE_HREF.test(href)
        ? `<a href="${escapeHtml(href)}" style="color:#36558F">${emphasis(label)}</a>`
        : emphasis(match[0]),
    );
    last = match.index + match[0].length;
  }
  out.push(emphasis(raw.slice(last)));
  return out.join("");
}

const P = `style="margin:0 0 14px;line-height:1.6"`;

/**
 * The organizer's body → email HTML. Deliberately tiny: paragraphs (blank
 * line), `## heading`, `- list`, `![alt](https://image)`, links, bold,
 * italic. Everything is escaped first; only https images and http(s)/mailto
 * links are emitted. No raw HTML passes through.
 */
export function renderNewsletterBody(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = block.match(/^#{1,3}\s+(.+)$/);
      if (heading && lines.length === 1) {
        return `<h2 style="font-size:18px;line-height:1.3;margin:22px 0 10px">${renderInline(heading[1])}</h2>`;
      }
      const image = block.match(/^!\[([^\]\n]{0,300})\]\(([^)\s]+)\)$/);
      if (image) {
        return SAFE_IMG.test(image[2])
          ? `<p ${P}><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}" style="max-width:100%;height:auto;border-radius:4px"></p>`
          : `<p ${P}>${escapeHtml(block)}</p>`;
      }
      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        return `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.6">${lines
          .map((l) => `<li>${renderInline(l.replace(/^[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }
      return `<p ${P}>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("\n");
}

export interface NewsletterContent {
  subject: string;
  html: string;
  text: string;
}

export interface OutgoingMessage {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export function unsubscribeUrl(base: string, token: string): string {
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** One recipient's message: the body in the site's mail shell, their own unsubscribe link. */
export function newsletterMessage(nl: NewsletterContent, unsubscribe: string, test = false): OutgoingMessage {
  const footer =
    `You're receiving this because you're on the COhere Boulder email list. ` +
    `<a href="${escapeHtml(unsubscribe)}" style="color:#36558F">Unsubscribe</a>.`;
  return {
    subject: test ? `[TEST] ${nl.subject}` : nl.subject,
    html: mailShell(escapeHtml(nl.subject), nl.html, footer),
    text: `${nl.text}\n\n--\nYou're receiving this because you're on the COhere Boulder email list.\nUnsubscribe: ${unsubscribe}\n`,
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

// ---------------------------------------------------------------- Resend

export class ResendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
  /** Worth retrying later: rate limit, server error, or no response at all. */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface ResendSend {
  to: string;
  message: OutgoingMessage;
  idempotencyKey?: string;
  /** Authenticated correlation for webhooks arriving before the HTTP response. */
  tags?: { newsletter_id: string; person_id: string };
}

export type ResendSender = (env: NewsletterEnv, send: ResendSend) => Promise<{ id: string | null }>;

export const sendViaResend: ResendSender = async (env, { to, message, idempotencyKey, tags }) => {
  if (!env.RESEND_API_KEY) throw new ResendError("RESEND_API_KEY is not set", 503);
  const base = (env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.NEWSLETTER_FROM || DEFAULT_FROM,
        to: [to],
        reply_to: env.NEWSLETTER_REPLY_TO || DEFAULT_REPLY_TO,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        ...(tags ? { tags: Object.entries(tags).map(([name, value]) => ({ name, value })) } : {}),
      }),
    });
  } catch (error) {
    throw new ResendError(`network: ${error instanceof Error ? error.message : "fetch failed"}`, 0);
  }
  if (!response.ok) {
    // Resend's error body names the problem, not the recipient; still capped.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ResendError(`resend ${response.status}: ${detail}`, response.status);
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: typeof body.id === "string" ? body.id : null };
};

// ------------------------------------------------------------------ rows

export interface NewsletterRow {
  id: string;
  subject: string;
  html: string;
  text: string;
  audience: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  created_by: string;
  test_sent_hash: string | null;
  test_sent_to: string | null;
  test_sent_at: string | null;
  scheduled_for: string | null;
  cancel_token: string | null;
  recipient_count_confirmed: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

async function getNewsletter(env: NewsletterEnv, id: string): Promise<NewsletterRow | null> {
  return env.cohere.prepare(`SELECT * FROM newsletters WHERE id = ?1`).bind(id).first<NewsletterRow>();
}

async function sendCounts(env: NewsletterEnv, id: string): Promise<Record<string, number>> {
  const { results } = await env.cohere
    .prepare(`SELECT status, COUNT(*) AS n FROM newsletter_sends WHERE newsletter_id = ?1 GROUP BY status`)
    .bind(id)
    .all<{ status: string; n: number }>();
  // `sent` is everything Resend accepted. Resend's webhook (resend-webhook.ts)
  // later moves a row on to delivered / bounced / complained; those are
  // reported separately AND still counted in `sent`.
  const counts: Record<string, number> = {
    queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, delivered: 0, bounced: 0, complained: 0,
  };
  for (const r of results) {
    const n = Number(r.n);
    counts[r.status] = (counts[r.status] ?? 0) + n;
    if (DELIVERY_STATUSES.includes(r.status)) counts.sent += n;
  }
  return counts;
}

/** The JSON the admin page sees. Never includes the cancel token. */
async function publicView(env: NewsletterEnv, row: NewsletterRow, viewer: string) {
  const hash = await contentHash(row.subject, row.text);
  const tested = row.test_sent_hash === hash;
  const testedByViewer = tested && row.test_sent_to === viewer;
  const { cancel_token: _omit, ...rest } = row;
  void _omit;
  return {
    ...rest,
    audience: parseAudience(row.audience),
    tested,
    send_unlocked: row.status === "draft" && testedByViewer,
    lock_reason:
      row.status !== "draft"
        ? `This newsletter is ${row.status}.`
        : !tested
          ? "Send yourself a test of this exact version first."
          : !testedByViewer
            ? `The last test went to ${row.test_sent_to}. Send yourself a test before sending.`
            : null,
    counts: await sendCounts(env, row.id),
  };
}

function readSubjectText(body: Record<string, unknown>): { subject: string; text: string } | string {
  const subject = typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim() : "";
  const text = typeof body.text === "string" ? body.text.replace(/\r\n?/g, "\n").trim() : "";
  if (!subject) return "subject is required";
  if (subject.length > MAX_SUBJECT) return `subject is too long (${MAX_SUBJECT} characters)`;
  if (!text) return "the body is empty";
  if (text.length > MAX_TEXT) return `the body is too long (${MAX_TEXT} characters)`;
  return { subject, text };
}

// ------------------------------------------------------------ admin API

export interface NewsletterDeps {
  send?: ResendSender;
  now?: () => Date;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Every route under /api/admin/newsletters plus the Beehiiv import. Caller has checked the session. */
export async function handleNewsletterAdmin(
  request: Request,
  env: NewsletterEnv,
  url: URL,
  session: Session,
  deps: NewsletterDeps = {},
): Promise<Response> {
  const send = deps.send ?? sendViaResend;
  const now = deps.now ?? (() => new Date());
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/import/beehiiv" && method === "POST") {
    return handleBeehiivImport(request, env);
  }

  const rest = path.slice("/api/admin/newsletters".length).replace(/^\//, "");
  let parts: string[];
  try {
    parts = rest ? rest.split("/").map(decodeURIComponent) : [];
  } catch {
    return json({ error: "not found" }, 404);
  }

  if (parts.length === 0 && method === "GET") {
    const { results } = await env.cohere
      .prepare(
        `SELECT n.id, n.subject, n.audience, n.status, n.created_by, n.confirmed_by, n.scheduled_for,
                n.sent_at, n.created_at, n.updated_at, n.recipient_count_confirmed, n.cancelled_by,
                (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id
                   AND s.status IN ('sent', 'delivered', 'bounced', 'complained')) AS sent_count,
                (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id AND s.status = 'failed') AS failed_count,
                (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id AND s.status = 'delivered') AS delivered_count,
                (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id AND s.status = 'bounced') AS bounced_count,
                (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id AND s.status = 'complained') AS complained_count
         FROM newsletters n ORDER BY n.created_at DESC LIMIT 200`,
      )
      .all<Record<string, unknown>>();
    return json(
      { newsletters: results.map((r) => ({ ...r, audience: parseAudience(r.audience) })), hold_minutes: HOLD_MINUTES },
      200,
    );
  }

  if (parts.length === 0 && method === "POST") {
    const body = await readJson(request);
    if (!body) return json({ error: "invalid JSON" }, 400);
    const fields = readSubjectText(body);
    if (typeof fields === "string") return json({ error: fields }, 400);
    const audience = parseAudience(body.audience ?? { kind: "all" });
    if (!audience) return json({ error: "invalid audience" }, 400);
    const id = crypto.randomUUID();
    const at = now().toISOString();
    await env.cohere
      .prepare(
        `INSERT INTO newsletters (id, subject, html, text, audience, status, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?7)`,
      )
      .bind(id, fields.subject, renderNewsletterBody(fields.text), fields.text, JSON.stringify(audience), session.email, at)
      .run();
    const row = await getNewsletter(env, id);
    return json({ newsletter: await publicView(env, row!, session.email) }, 200);
  }

  if (parts.length === 1 && parts[0] === "audiences" && method === "GET") {
    const { results: forms } = await env.cohere
      .prepare(`SELECT slug, title FROM forms ORDER BY active DESC, created_at DESC`)
      .all<{ slug: string; title: string }>();
    const { results: tagRows } = await env.cohere
      .prepare(`SELECT tags FROM people WHERE tags IS NOT NULL AND tags != ''`)
      .all<{ tags: string }>();
    const tags = new Map<string, number>();
    for (const r of tagRows) {
      for (const t of splitTags(r.tags)) {
        const n = tagKey(t);
        if (n && n !== UNDELIVERABLE_TAG) tags.set(n, (tags.get(n) ?? 0) + 1);
      }
    }
    return json(
      {
        forms: forms.filter((f) => FORM_RE.test(f.slug)),
        tags: [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tag, people]) => ({ tag, people })),
      },
      200,
    );
  }

  if (parts.length === 1 && parts[0] === "count" && method === "POST") {
    const body = await readJson(request);
    const audience = parseAudience(body?.audience);
    if (!audience) return json({ error: "invalid audience" }, 400);
    return json({ count: await countAudience(env, audience), audience }, 200);
  }

  if (parts.length < 1 || parts.length > 2) return json({ error: "not found" }, 404);
  const row = await getNewsletter(env, parts[0]);
  if (!row) return json({ error: "no such newsletter" }, 404);
  const action = parts[1];

  if (!action && method === "GET") {
    return json({ newsletter: await publicView(env, row, session.email) }, 200);
  }

  if (!action && method === "PUT") {
    if (row.status !== "draft") return json({ error: `a ${row.status} newsletter can't be edited` }, 409);
    const body = await readJson(request);
    if (!body) return json({ error: "invalid JSON" }, 400);
    const fields = readSubjectText(body);
    if (typeof fields === "string") return json({ error: fields }, 400);
    const audience = body.audience === undefined ? parseAudience(row.audience) : parseAudience(body.audience);
    if (!audience) return json({ error: "invalid audience" }, 400);
    const result = await env.cohere
      .prepare(
        `UPDATE newsletters SET subject = ?2, html = ?3, text = ?4, audience = ?5, updated_at = ?6
         WHERE id = ?1 AND status = 'draft'`,
      )
      .bind(row.id, fields.subject, renderNewsletterBody(fields.text), fields.text, JSON.stringify(audience), now().toISOString())
      .run();
    if (!result.meta?.changes) return json({ error: "this newsletter is no longer a draft" }, 409);
    return json({ newsletter: await publicView(env, (await getNewsletter(env, row.id))!, session.email) }, 200);
  }

  if (!action && method === "DELETE") {
    const counts = await sendCounts(env, row.id);
    if (row.status !== "draft" && row.status !== "cancelled") {
      return json({ error: `a ${row.status} newsletter can't be deleted` }, 409);
    }
    if (counts.sent || counts.failed) return json({ error: "some people already received this one; it stays in the log" }, 409);
    await env.cohere.prepare(`DELETE FROM newsletter_sends WHERE newsletter_id = ?1`).bind(row.id).run();
    await env.cohere.prepare(`DELETE FROM newsletters WHERE id = ?1`).bind(row.id).run();
    return json({ ok: true }, 200);
  }

  if (action === "preview" && method === "GET") {
    const message = newsletterMessage(row, unsubscribeUrl(baseUrl(env, url), "preview"));
    return json({ subject: message.subject, html: message.html, text: message.text }, 200);
  }

  if (action === "test" && method === "POST") {
    if (row.status !== "draft") return json({ error: `a ${row.status} newsletter can't be tested` }, 409);
    if (await rateLimited(env, `newsletter-test:${session.email}`, 10, 15 * 60)) {
      return json({ error: "too many test sends — wait a few minutes" }, 429);
    }
    const person = await env.cohere
      .prepare(`SELECT unsubscribe_token FROM people WHERE email = ?1`)
      .bind(session.email)
      .first<{ unsubscribe_token: string }>();
    const message = newsletterMessage(row, unsubscribeUrl(baseUrl(env, url), person?.unsubscribe_token ?? "test"), true);
    try {
      await send(env, { to: session.email, message });
    } catch (error) {
      console.error("newsletter test send failed:", redactEmails(error instanceof Error ? error.message : "unknown"));
      return json(
        {
          error:
            error instanceof ResendError && error.status === 503
              ? "Newsletter sending isn't configured yet (RESEND_API_KEY)."
              : "The test email couldn't be sent. Try again in a minute.",
        },
        502,
      );
    }
    const at = now().toISOString();
    await env.cohere
      .prepare(
        `UPDATE newsletters SET test_sent_hash = ?2, test_sent_to = ?3, test_sent_at = ?4, updated_at = ?4
         WHERE id = ?1 AND status = 'draft' AND subject = ?5 AND text = ?6`,
      )
      .bind(row.id, await contentHash(row.subject, row.text), session.email, at, row.subject, row.text)
      .run();
    return json({ newsletter: await publicView(env, (await getNewsletter(env, row.id))!, session.email) }, 200);
  }

  if (action === "send" && method === "POST") {
    if (row.status !== "draft") return json({ error: `this newsletter is already ${row.status}` }, 409);
    const view = await publicView(env, row, session.email);
    if (!view.send_unlocked) return json({ error: view.lock_reason, locked: true }, 409);
    const audience = parseAudience(row.audience);
    if (!audience) return json({ error: "invalid audience" }, 400);
    const body = await readJson(request);
    const count = await countAudience(env, audience);
    if (count === 0) return json({ error: "nobody is in this audience" }, 400);
    const typed = typeof body?.confirm_count === "number" ? body.confirm_count : Number(String(body?.confirm_count ?? "").trim());
    if (!Number.isInteger(typed) || typed !== count) {
      return json({ error: `Type the exact number of recipients (${count}) to confirm.`, count }, 400);
    }
    const token = randomToken();
    const at = now();
    const scheduledFor = new Date(at.getTime() + HOLD_MINUTES * 60 * 1000).toISOString();
    const result = await env.cohere
      .prepare(
        `UPDATE newsletters SET status = 'scheduled', scheduled_for = ?2, cancel_token = ?3,
           recipient_count_confirmed = ?4, confirmed_by = ?5, confirmed_at = ?6, updated_at = ?6,
           cancelled_by = NULL, cancelled_at = NULL
         WHERE id = ?1 AND status = 'draft' AND test_sent_hash = ?7`,
      )
      .bind(row.id, scheduledFor, await sha256Hex(token), count, session.email, at.toISOString(), await contentHash(row.subject, row.text))
      .run();
    if (!result.meta?.changes) return json({ error: "this newsletter changed while you were confirming — reload" }, 409);
    const notified = await notifyAdmins(env, send, row, audience, count, scheduledFor, session.email, `${baseUrl(env, url)}/newsletter/cancel?token=${token}`);
    return json(
      { newsletter: await publicView(env, (await getNewsletter(env, row.id))!, session.email), notified },
      200,
    );
  }

  if (action === "cancel" && method === "POST") {
    const ok = await cancelNewsletter(env, row.id, session.email, now());
    if (!ok) return json({ error: `a ${row.status} newsletter can't be cancelled` }, 409);
    return json({ newsletter: await publicView(env, (await getNewsletter(env, row.id))!, session.email) }, 200);
  }

  if (action === "reopen" && method === "POST") {
    // Back to a draft that must be tested again. Anyone already sent to keeps
    // their newsletter_sends row, so a later send skips them.
    const result = await env.cohere
      .prepare(
        `UPDATE newsletters SET status = 'draft', test_sent_hash = NULL, scheduled_for = NULL, cancel_token = NULL,
           updated_at = ?2 WHERE id = ?1 AND status = 'cancelled'`,
      )
      .bind(row.id, now().toISOString())
      .run();
    if (!result.meta?.changes) return json({ error: "only a cancelled newsletter can be reopened" }, 409);
    return json({ newsletter: await publicView(env, (await getNewsletter(env, row.id))!, session.email) }, 200);
  }

  return json({ error: "not found" }, 404);
}

/** Tell every admin a send is coming, with a cancel link. Returns how many were told. */
async function notifyAdmins(
  env: NewsletterEnv,
  send: ResendSender,
  row: NewsletterRow,
  audience: Audience,
  count: number,
  scheduledFor: string,
  by: string,
  cancelLink: string,
): Promise<number> {
  const { results: admins } = await env.cohere.prepare(`SELECT email FROM admins ORDER BY email`).all<{ email: string }>();
  const when = new Date(scheduledFor).toLocaleString("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
  const subject = `Newsletter going out at ${when}: ${row.subject}`;
  const html = mailShell(
    "A newsletter is about to go out",
    `<p style="margin:0 0 14px;line-height:1.6"><b>${escapeHtml(row.subject)}</b></p>
     <p style="margin:0 0 14px;line-height:1.6">${escapeHtml(by)} confirmed it for ${count} people (${escapeHtml(
       describeAudience(audience),
     )}). It sends at ${escapeHtml(when)} Boulder time, ${HOLD_MINUTES} minutes after confirming.</p>
     <p style="margin:0 0 14px;line-height:1.6">If it shouldn't go out, cancel it — any organizer can, no sign-in needed:</p>
     <p style="margin:0 0 24px"><a href="${escapeHtml(cancelLink)}" style="display:inline-block;background:#c2562a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px">Cancel this send</a></p>`,
    "Sent to every COhere admin whenever a newsletter is confirmed.",
  );
  const text = `${by} confirmed "${row.subject}" for ${count} people (${describeAudience(audience)}).\nIt sends at ${when} Boulder time.\n\nCancel it (no sign-in needed): ${cancelLink}\n`;
  let told = 0;
  for (const admin of admins) {
    try {
      await send(env, { to: admin.email, message: { subject, html, text, headers: {} } });
      told += 1;
    } catch (error) {
      console.error("newsletter admin notice failed:", redactEmails(error instanceof Error ? error.message : "unknown"));
    }
  }
  return told;
}

/**
 * Stop a scheduled or sending newsletter. Rows not yet sent are removed so a
 * reopened draft starts clean; sent rows stay, so nobody is sent it twice.
 */
export async function cancelNewsletter(env: NewsletterEnv, id: string, by: string, at: Date): Promise<boolean> {
  const result = await env.cohere
    .prepare(
      `UPDATE newsletters SET status = 'cancelled', cancelled_by = ?2, cancelled_at = ?3, updated_at = ?3
       WHERE id = ?1 AND status IN ('scheduled', 'sending')`,
    )
    .bind(id, by, at.toISOString())
    .run();
  if (!result.meta?.changes) return false;
  await env.cohere
    .prepare(`DELETE FROM newsletter_sends WHERE newsletter_id = ?1 AND status = 'queued'`)
    .bind(id)
    .run();
  return true;
}

// ------------------------------------------------- public cancel link

function cancelPage(state: "confirm" | "done" | "unknown", subject = "", token = "", detail = ""): string {
  const body =
    state === "done"
      ? `<h1>Send cancelled</h1>
         <p><b>${escapeHtml(subject)}</b> won't go out. An organizer can reopen it from the admin portal's Newsletter tab.</p>`
      : state === "confirm"
        ? `<h1>Cancel this newsletter?</h1>
           <p><b>${escapeHtml(subject)}</b></p>
           <p>${escapeHtml(detail)}</p>
           <form method="POST" action="/newsletter/cancel?token=${encodeURIComponent(token)}">
             <button type="submit">Yes, cancel the send</button>
           </form>`
        : `<h1>Nothing to cancel</h1>
           <p>This newsletter has already gone out, was already cancelled, or the link isn't valid.
           Check the Newsletter tab in the <a href="/admin">admin portal</a>.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,"><title>COhere Boulder — cancel newsletter</title>
<style>
  body { margin:0; background:#f4f7f4; color:#1b2430;
         font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; line-height:1.6; }
  main { max-width:32rem; margin:0 auto; padding:4rem 1.5rem; }
  h1 { font-size:1.5rem; line-height:1.25; margin:0 0 1rem; letter-spacing:-0.02em; }
  p { color:#4a5560; }
  button { font:inherit; cursor:pointer; background:#c2562a; color:#fff; border:0;
           border-radius:4px; padding:0.7rem 1.2rem; margin-top:0.5rem; }
  a { color:#36558F; }
  .brand { font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:#489FB5; margin-bottom:0.5rem; }
</style></head>
<body><main>
  <p class="brand">COhere Boulder</p>
  ${body}
</main></body></html>`;
}

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

/**
 * GET shows what would be cancelled and a button; only POST cancels, so a
 * mail scanner prefetching the link can't stop a send. No auto-submit here:
 * cancelling is a deliberate act by an organizer.
 */
export async function handleNewsletterCancelLink(request: Request, env: NewsletterEnv, url: URL): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  const row = /^[a-f0-9]{64}$/.test(token)
    ? await env.cohere
        .prepare(`SELECT id, subject, status, scheduled_for, recipient_count_confirmed FROM newsletters WHERE cancel_token = ?1`)
        .bind(await sha256Hex(token))
        .first<{ id: string; subject: string; status: string; scheduled_for: string | null; recipient_count_confirmed: number | null }>()
    : null;
  const live = row && (row.status === "scheduled" || row.status === "sending");
  if (!row || !live) return new Response(cancelPage("unknown"), { status: 404, headers: HTML_HEADERS });
  if (request.method === "POST") {
    const ok = await cancelNewsletter(env, row.id, "email-link", new Date());
    return new Response(ok ? cancelPage("done", row.subject) : cancelPage("unknown"), {
      status: ok ? 200 : 404,
      headers: HTML_HEADERS,
    });
  }
  const detail =
    row.status === "sending"
      ? "It has started sending; cancelling stops it for everyone not yet reached."
      : `Scheduled for ${row.recipient_count_confirmed ?? "?"} people; it hasn't gone out yet.`;
  return new Response(cancelPage("confirm", row.subject, token, detail), { status: 200, headers: HTML_HEADERS });
}

// ------------------------------------------------------------------ cron

export interface NewsletterCronResult {
  started: number;
  aborted: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  completed: number;
}

/**
 * One tick: start due newsletters, then send up to MAX_SENDS_PER_TICK.
 * Safe to run concurrently and repeatedly: every transition is a guarded
 * UPDATE, and each recipient row is claimed before its message is sent.
 */
export async function runNewsletterCron(
  env: NewsletterEnv,
  now: Date,
  deps: { send?: ResendSender; sleep?: (ms: number) => Promise<void>; limit?: number } = {},
): Promise<NewsletterCronResult> {
  const send = deps.send ?? sendViaResend;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limit = deps.limit ?? MAX_SENDS_PER_TICK;
  const at = now.toISOString();
  const result: NewsletterCronResult = { started: 0, aborted: 0, sent: 0, failed: 0, skipped: 0, retried: 0, completed: 0 };

  // 1. Due → sending, snapshotting the audience as of now.
  const { results: due } = await env.cohere
    .prepare(`SELECT * FROM newsletters WHERE status = 'scheduled' AND scheduled_for <= ?1 ORDER BY scheduled_for`)
    .bind(at)
    .all<NewsletterRow>();
  for (const nl of due) {
    const claimed = await env.cohere
      .prepare(`UPDATE newsletters SET status = 'sending', updated_at = ?2 WHERE id = ?1 AND status = 'scheduled'`)
      .bind(nl.id, at)
      .run();
    if (!claimed.meta?.changes) continue;
    const audience = parseAudience(nl.audience);
    if (!audience) {
      await cancelNewsletter(env, nl.id, "system: invalid audience", now);
      result.aborted += 1;
      continue;
    }
    const where = audienceWhere(audience, 3);
    await env.cohere
      .prepare(
        `INSERT OR IGNORE INTO newsletter_sends (newsletter_id, person_id, email, status, created_at, updated_at)
         SELECT ?1, p.id, p.email, 'queued', ?2, ?2 FROM people p WHERE ${where.sql}`,
      )
      .bind(nl.id, at, ...where.params)
      .run();
    // The organizer typed a number. If the list grew a lot during the hold
    // (an import, say), that number no longer describes this send: stop.
    const queued = (await sendCounts(env, nl.id)).queued;
    const confirmed = nl.recipient_count_confirmed ?? 0;
    if (queued > confirmed + Math.max(10, Math.ceil(confirmed * 0.1))) {
      await cancelNewsletter(env, nl.id, `system: audience grew from ${confirmed} to ${queued} during the hold`, now);
      result.aborted += 1;
      continue;
    }
    result.started += 1;
  }

  // 2. Recover claims orphaned by a crashed run. Resend's Idempotency-Key
  //    makes the retry safe if the crash came after Resend accepted it.
  await env.cohere
    .prepare(`UPDATE newsletter_sends SET status = 'queued', updated_at = ?1 WHERE status = 'sending' AND updated_at < ?2`)
    .bind(at, new Date(now.getTime() - STALE_CLAIM_MS).toISOString())
    .run();

  // 3. Send, oldest newsletter first, within this tick's budget.
  const { results: sending } = await env.cohere
    .prepare(`SELECT * FROM newsletters WHERE status = 'sending' ORDER BY scheduled_for`)
    .all<NewsletterRow>();
  let budget = limit;
  let throttled = false;
  for (const nl of sending) {
    if (budget <= 0 || throttled) break;
    const { results: claimed } = await env.cohere
      .prepare(
        `UPDATE newsletter_sends SET status = 'sending', updated_at = ?2
         WHERE newsletter_id = ?1 AND status = 'queued' AND person_id IN (
           SELECT person_id FROM newsletter_sends WHERE newsletter_id = ?1 AND status = 'queued'
           ORDER BY person_id LIMIT ?3)
         RETURNING person_id, email, attempts`,
      )
      .bind(nl.id, at, budget)
      .all<{ person_id: string; email: string; attempts: number }>();
    budget -= claimed.length;
    const base = baseUrl(env);

    for (const [index, row] of claimed.entries()) {
      if (throttled) {
        await setSendStatus(env, nl.id, row.person_id, "queued", null, null, at, false);
        continue;
      }
      // Re-check at send time: an unsubscribe or a bounce during sending wins.
      const person = await env.cohere
        .prepare(
          `SELECT p.unsubscribe_token FROM people p
           WHERE p.id = ?1 AND p.subscribed = 1 AND instr(${TAGS_EXPR}, ',${UNDELIVERABLE_TAG},') = 0`,
        )
        .bind(row.person_id)
        .first<{ unsubscribe_token: string }>();
      if (!person) {
        await setSendStatus(env, nl.id, row.person_id, "skipped", null, "unsubscribed or undeliverable at send time", at, false);
        result.skipped += 1;
        continue;
      }
      if (index > 0) await sleep(MIN_SEND_INTERVAL_MS);
      try {
        const { id } = await send(env, {
          to: row.email,
          message: newsletterMessage(nl, unsubscribeUrl(base, person.unsubscribe_token)),
          idempotencyKey: `newsletter:${nl.id}:${row.person_id}`,
          tags: { newsletter_id: nl.id, person_id: row.person_id },
        });
        await setSendStatus(env, nl.id, row.person_id, "sent", id, null, at, true);
        result.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
        const transient = error instanceof ResendError ? error.transient : true;
        if (transient && row.attempts + 1 < MAX_ATTEMPTS) {
          await setSendStatus(env, nl.id, row.person_id, "queued", null, message, at, true);
          result.retried += 1;
          if (error instanceof ResendError && (error.status === 429 || error.status === 503)) throttled = true;
        } else {
          await setSendStatus(env, nl.id, row.person_id, "failed", null, message, at, true);
          result.failed += 1;
        }
        // Never log the address — the newsletter id and error are enough.
        console.error(`newsletter ${nl.id} send failed:`, redactEmails(message));
      }
    }
  }

  // 4. Done when nothing is left queued or in flight.
  const { results: finished } = await env.cohere
    .prepare(
      `UPDATE newsletters SET status = 'sent', sent_at = ?1, updated_at = ?1
       WHERE status = 'sending' AND NOT EXISTS (
         SELECT 1 FROM newsletter_sends s WHERE s.newsletter_id = newsletters.id AND s.status IN ('queued', 'sending'))
       RETURNING id`,
    )
    .bind(at)
    .all<{ id: string }>();
  result.completed = finished.length;
  return result;
}

async function setSendStatus(
  env: NewsletterEnv,
  newsletterId: string,
  personId: string,
  status: string,
  resendId: string | null,
  error: string | null,
  at: string,
  attempted: boolean,
): Promise<void> {
  await env.cohere
    .prepare(
      // A webhook can arrive before the provider's send response is recorded.
      // Reconcile the atomic event ledger when attaching resend_id, and don't
      // downgrade an already-delivered/bounced/complained row back to sent.
      `UPDATE newsletter_sends SET status = CASE
         WHEN status IN ('delivered', 'bounced', 'complained') THEN status
         WHEN ?3 = 'sent' THEN COALESCE((
           SELECT CASE type WHEN 'email.complained' THEN 'complained'
             WHEN 'email.bounced' THEN 'bounced' ELSE 'delivered' END
           FROM resend_webhook_events WHERE email_id = ?4 AND effect IS NOT NULL
             AND (type IN ('email.delivered', 'email.complained')
                  OR (type = 'email.bounced' AND LOWER(TRIM(bounce_type)) = 'permanent'))
           ORDER BY CASE type WHEN 'email.complained' THEN 3 WHEN 'email.bounced' THEN 2 ELSE 1 END DESC LIMIT 1
         ), ?3) ELSE ?3 END,
         resend_id = COALESCE(?4, resend_id), error = ?5,
         attempts = attempts + ?6, updated_at = ?7
       WHERE newsletter_id = ?1 AND person_id = ?2`,
    )
    .bind(newsletterId, personId, status, resendId, error, attempted ? 1 : 0, at)
    .run();
}

// --------------------------------------------------------- Beehiiv import

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, BOM tolerated. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Beehiiv writes tags as a JSON-ish list or a comma list; accept either. */
export function parseBeehiivTags(raw: string): string[] {
  return raw
    .replace(/[[\]"']/g, "")
    .split(/[,;]/)
    .map(normalizeTag)
    .filter((t) => TAG_RE.test(t));
}

export interface ImportRecord {
  email: string;
  name: string | null;
  tags: string[];
  /** Beehiiv says this person is no longer subscribed. */
  unsubscribed: boolean;
  /** Beehiiv status is exactly `active` with no unsubscribed_at. */
  active: boolean;
}

export interface ImportPlanAction {
  kind: "insert" | "update";
  email: string;
  name: string | null;
  tags: string | null;
  subscribed: number;
  personId?: string;
}

export interface ImportPlan {
  counts: {
    rows: number;
    valid: number;
    skipped_invalid: number;
    duplicates_in_file: number;
    new: number;
    new_unsubscribed: number;
    existing: number;
    existing_changed: number;
    would_unsubscribe: number;
    unchanged: number;
  };
  actions: ImportPlanAction[];
}

export function readBeehiivCsv(csv: string): { records: ImportRecord[]; rows: number; invalid: number; duplicates: number } | string {
  const table = parseCsv(csv);
  if (!table.length) return "the file is empty";
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iEmail = col("email");
  if (iEmail === -1) return "no email column — is this a Beehiiv subscriber export?";
  const iStatus = col("status");
  const iTags = col("tags");
  const iUnsub = col("unsubscribed_at");
  const iName = col("name");
  const byEmail = new Map<string, ImportRecord>();
  let invalid = 0;
  let duplicates = 0;
  for (const cells of table.slice(1)) {
    const email = (cells[iEmail] ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      invalid += 1;
      continue;
    }
    const status = iStatus === -1 ? "active" : (cells[iStatus] ?? "").trim().toLowerCase();
    const unsubAt = iUnsub === -1 ? "" : (cells[iUnsub] ?? "").trim();
    const name = iName === -1 ? "" : (cells[iName] ?? "").trim().slice(0, 200);
    const record: ImportRecord = {
      email,
      name: name || null,
      tags: ["beehiiv", ...(iTags === -1 ? [] : parseBeehiivTags(cells[iTags] ?? ""))],
      unsubscribed: status === "inactive" || status === "unsubscribed" || unsubAt !== "",
      active: status === "active" && unsubAt === "",
    };
    const prior = byEmail.get(email);
    if (prior) {
      duplicates += 1;
      // Unsubscribe wins inside the file too.
      prior.unsubscribed = prior.unsubscribed || record.unsubscribed;
      prior.active = prior.active && record.active;
      prior.name = prior.name ?? record.name;
      prior.tags = [...new Set([...prior.tags, ...record.tags])];
    } else byEmail.set(email, record);
  }
  return { records: [...byEmail.values()], rows: table.length - 1, invalid, duplicates };
}

/**
 * Merge rules (unsubscribe wins in either direction):
 *  - new address → inserted, source `beehiiv`, tagged `beehiiv` + its Beehiiv
 *    tags, subscribed only if Beehiiv says active;
 *  - existing → tags added, name filled if blank, subscribed set to 0 if
 *    Beehiiv says unsubscribed; never flipped from 0 back to 1.
 * Pure given the current people rows, so re-running is a no-op.
 */
export function planImport(
  records: ImportRecord[],
  existing: Map<string, { id: string; name: string | null; tags: string | null; subscribed: number }>,
): Omit<ImportPlan, "counts"> & { counts: Omit<ImportPlan["counts"], "rows" | "valid" | "skipped_invalid" | "duplicates_in_file"> } {
  const actions: ImportPlanAction[] = [];
  const counts = { new: 0, new_unsubscribed: 0, existing: 0, existing_changed: 0, would_unsubscribe: 0, unchanged: 0 };
  for (const r of records) {
    const person = existing.get(r.email);
    if (!person) {
      counts.new += 1;
      if (!r.active) counts.new_unsubscribed += 1;
      actions.push({ kind: "insert", email: r.email, name: r.name, tags: mergeTags(null, r.tags), subscribed: r.active ? 1 : 0 });
      continue;
    }
    counts.existing += 1;
    const tags = mergeTags(person.tags, r.tags);
    const name = person.name ?? r.name;
    const subscribed = r.unsubscribed ? 0 : person.subscribed;
    if (tags === person.tags && name === person.name && subscribed === person.subscribed) {
      counts.unchanged += 1;
      continue;
    }
    counts.existing_changed += 1;
    if (person.subscribed === 1 && subscribed === 0) counts.would_unsubscribe += 1;
    actions.push({ kind: "update", email: r.email, name, tags, subscribed, personId: person.id });
  }
  return { actions, counts };
}

async function handleBeehiivImport(request: Request, env: NewsletterEnv): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.csv !== "string") return json({ error: "send {csv, apply}" }, 400);
  if (body.csv.length > MAX_IMPORT_BYTES) return json({ error: "that file is too large (5 MB)" }, 413);
  const parsed = readBeehiivCsv(body.csv);
  if (typeof parsed === "string") return json({ error: parsed }, 400);

  const { results } = await env.cohere
    .prepare(`SELECT id, email, name, tags, subscribed FROM people`)
    .all<{ id: string; email: string; name: string | null; tags: string | null; subscribed: number }>();
  const existing = new Map(results.map((p) => [p.email.toLowerCase(), { ...p, subscribed: Number(p.subscribed) }]));
  const plan = planImport(parsed.records, existing);
  const counts = {
    rows: parsed.rows,
    valid: parsed.records.length + parsed.duplicates,
    skipped_invalid: parsed.invalid,
    duplicates_in_file: parsed.duplicates,
    ...plan.counts,
  };

  if (body.apply !== true) {
    return json({ dry_run: true, counts, pending: plan.actions.length }, 200);
  }

  // Apply one page; the admin page calls again until pending is 0. Each call
  // re-plans against the current rows, so a page that half-failed is simply
  // picked up again, and a finished import re-plans to zero.
  const page = plan.actions.slice(0, IMPORT_PAGE);
  const at = new Date().toISOString();
  for (const a of page) {
    if (a.kind === "insert") {
      await env.cohere
        .prepare(
          `INSERT INTO people (id, email, name, subscribed, unsubscribe_token, source, tags, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'beehiiv', ?6, ?7, ?7)
           ON CONFLICT(email) DO NOTHING`,
        )
        .bind(crypto.randomUUID(), a.email, a.name, a.subscribed, crypto.randomUUID(), a.tags, at)
        .run();
    } else {
      // Preserve live bounce suppression and opt-outs even if the plan is stale.
      await env.cohere
        .prepare(
          `UPDATE people SET name = COALESCE(name, ?2),
             tags = CASE
               WHEN INSTR(${TAGS_EXPR.replace("p.tags", "tags")}, ',undeliverable,') > 0
                AND INSTR(${TAGS_EXPR.replace("p.tags", "?3")}, ',undeliverable,') = 0
               THEN CASE WHEN COALESCE(?3, '') = '' THEN 'undeliverable' ELSE ?3 || ',undeliverable' END
               ELSE ?3 END,
             subscribed = MIN(subscribed, ?4), updated_at = ?5
           WHERE id = ?1`,
        )
        .bind(a.personId, a.name, a.tags, a.subscribed, at)
        .run();
    }
  }
  return json({ dry_run: false, counts, applied: page.length, pending: plan.actions.length - page.length }, 200);
}
