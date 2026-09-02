// "Propose an event", accountless: any community member can suggest an event
// for the COhere calendar without a regenOS sign-in or an admin session. It
// lands as a `pending` row in D1 (worker/migrations/0003_event_proposals.sql)
// — nothing touches regenOS until an organizer approves it from /admin's
// Proposals tab, at which point it is published with the SAME service-token
// createEvent the admin Events tab already uses
// (regenos-service.ts's createEventFromValues) — one path onto the calendar,
// whether an organizer typed the event directly or approved someone else's.
//
// Reused rather than duplicated: the honeypot + IP rate-limit shape from the
// public submission routes in index.ts, `rateLimited` from auth.ts, the event
// field validator `readEventValues` from regenos-service.ts (so a proposal is
// held to the exact rules a directly-created event is), and `sendMail` /
// `mailShell` from auth.ts for the two optional emails.

import type { AuthEnv } from "./auth";
import { mailShell, rateLimited, sendMail } from "./auth";
import type { RegenosServiceEnv } from "./regenos-service";
import { createEventFromValues, readEventValues } from "./regenos-service";

export interface ProposalsEnv extends AuthEnv, RegenosServiceEnv {
  cohere: D1Database;
  /**
   * Optional. When set, a heads-up email goes to this address every time
   * someone proposes an event. Unset by default — the Proposals tab's
   * pending-count badge is the primary way organizers notice, and skipping
   * the mail is the honest behaviour for a deployment that hasn't chosen an
   * address yet.
   */
  PROPOSAL_NOTIFY_EMAIL?: string;
}

interface ProposalRow {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  mode: string;
  place_name: string | null;
  street: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  proposer_name: string | null;
  proposer_email: string | null;
  status: "pending" | "published" | "rejected";
  published_did: string | null;
  published_rkey: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATUSES = new Set(["pending", "published", "rejected"]);

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ public

/**
 * `POST /api/events/propose` — no session, no cookie, open to anyone. Never
 * touches regenOS: this only ever writes a `pending` D1 row. Publishing is
 * the organizer's decision, made from the Proposals tab.
 */
export async function handleProposeEvent(request: Request, env: ProposalsEnv, url: URL): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid JSON" }, 400);

  // Same honeypot shape as the registration and legacy signup forms: a bot
  // fills the hidden field, a person never sees it. Answer success either way
  // so a bot learns nothing.
  if (typeof body.website === "string" && body.website.length > 0) {
    return json({ ok: true }, 200);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await rateLimited(env, `propose:${clientIp}`)) {
    return json({ error: "Too many proposals from this connection. Try again in a bit." }, 429);
  }

  const parsed = readEventValues(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const values = parsed.values;

  const proposerName = text(body.proposerName, 200);
  const proposerEmail = text(body.proposerEmail, 320).toLowerCase();
  if (proposerEmail && !EMAIL_RE.test(proposerEmail)) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.cohere
    .prepare(
      `INSERT INTO event_proposals
         (id, name, description, starts_at, ends_at, mode,
          place_name, street, locality, region, postal_code,
          proposer_name, proposer_email, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'pending', ?14, ?14)`,
    )
    .bind(
      id,
      values.name,
      values.description || null,
      values.startsAt,
      values.endsAt || null,
      values.mode,
      values.placeName || null,
      values.street || null,
      values.locality || null,
      values.region || null,
      values.postalCode || null,
      proposerName || null,
      proposerEmail || null,
      now,
    )
    .run();

  // Two best-effort emails. Neither failure should fail the proposal itself
  // — the row is already saved and will show up in the Proposals tab either way.
  if (proposerEmail) {
    try {
      await sendMail(env, proposerEmail, {
        subject: `We got your event idea: ${values.name}`,
        html: mailShell(
          "Thanks — we've got it.",
          `<p style="margin:0 0 14px;line-height:1.6">Thanks for proposing <b>${escapeHtml(values.name)}</b> for the COhere community calendar. ` +
            `An organizer will take a look and we'll email you either way — if it's approved, it'll show up on ` +
            `<a href="https://cohereboulder.org/calendar" style="color:#36558F">the public calendar</a>.</p>`,
        ),
        text:
          `Thanks for proposing "${values.name}" for the COhere community calendar. ` +
          `An organizer will take a look and we'll email you either way — if it's approved, it'll show up on the public calendar at ` +
          `https://cohereboulder.org/calendar.`,
      });
    } catch (error) {
      console.error("proposal confirmation email failed:", error instanceof Error ? error.message : error);
    }
  }

  const notify = env.PROPOSAL_NOTIFY_EMAIL?.trim();
  if (notify) {
    try {
      await sendMail(env, notify, {
        subject: `New event proposal: ${values.name}`,
        html: mailShell(
          "A new event was proposed",
          `<p style="margin:0 0 14px;line-height:1.6"><b>${escapeHtml(values.name)}</b>, proposed by ` +
            `${escapeHtml(proposerName || "someone")}${proposerEmail ? ` (${escapeHtml(proposerEmail)})` : ""}. ` +
            `Review it in <a href="${escapeHtml(env.PUBLIC_BASE_URL || url.origin)}/admin" style="color:#36558F">the admin portal</a>'s Proposals tab.</p>`,
        ),
        text: `${values.name}, proposed by ${proposerName || "someone"}${proposerEmail ? ` (${proposerEmail})` : ""}. Review it at ${env.PUBLIC_BASE_URL || url.origin}/admin.`,
      });
    } catch (error) {
      console.error("proposal notify email failed:", error instanceof Error ? error.message : error);
    }
  }

  return json({ ok: true }, 200);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------------- admin

/** `GET /api/admin/proposals[?status=pending|published|rejected]`. */
export async function handleAdminProposalsList(env: ProposalsEnv, statusParam: string | null): Promise<Response> {
  const status = statusParam && STATUSES.has(statusParam) ? statusParam : null;
  const statement = status
    ? env.cohere
        .prepare(`SELECT * FROM event_proposals WHERE status = ?1 ORDER BY created_at DESC`)
        .bind(status)
    : env.cohere.prepare(`SELECT * FROM event_proposals ORDER BY created_at DESC`);
  const { results } = await statement.all<ProposalRow>();
  return json({ proposals: results }, 200);
}

/**
 * `POST /api/admin/proposals/:id/approve` — reads the pending row, calls the
 * SAME service-token createEvent the Events tab uses, and on success marks
 * the row published. Idempotent: approving an already-published proposal
 * just returns the event it already published, rather than minting a
 * duplicate on the calendar.
 */
export async function handleAdminProposalApprove(
  env: ProposalsEnv,
  url: URL,
  id: string,
  reviewerEmail: string | null,
): Promise<Response> {
  const row = await env.cohere
    .prepare(`SELECT * FROM event_proposals WHERE id = ?1`)
    .bind(id)
    .first<ProposalRow>();
  if (!row) return json({ error: "not found" }, 404);

  if (row.status === "published") {
    return json(
      {
        ok: true,
        did: row.published_did,
        rkey: row.published_rkey,
        publicPath: row.published_did && row.published_rkey ? `/events/${row.published_did}/${row.published_rkey}` : null,
        alreadyPublished: true,
      },
      200,
    );
  }
  if (row.status === "rejected") {
    return json({ error: "This proposal was already rejected. Reopen it isn't supported yet — ask them to resubmit." }, 400);
  }

  // The rows were already validated on the way in (readEventValues in
  // handleProposeEvent), but re-run it here too: it is cheap, and it means an
  // approval NEVER sends anything to regenOS that a fresh create wouldn't.
  const parsed = readEventValues({
    name: row.name,
    description: row.description ?? "",
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? "",
    mode: row.mode,
    placeName: row.place_name ?? "",
    street: row.street ?? "",
    locality: row.locality ?? "",
    region: row.region ?? "",
    postalCode: row.postal_code ?? "",
  });
  if ("error" in parsed) return json({ error: `stored proposal is no longer valid: ${parsed.error}` }, 400);

  const created = await createEventFromValues(env, url, parsed.values);
  if (!created.ok) return created.response;

  const now = new Date().toISOString();
  await env.cohere
    .prepare(
      `UPDATE event_proposals
         SET status = 'published', published_did = ?2, published_rkey = ?3,
             reviewed_by = ?4, updated_at = ?5
       WHERE id = ?1`,
    )
    .bind(id, created.result.did, created.result.rkey, reviewerEmail, now)
    .run();

  if (row.proposer_email) {
    try {
      const base = env.PUBLIC_BASE_URL || url.origin;
      const publicLink = `${base}${created.result.publicPath}`;
      await sendMail(env, row.proposer_email, {
        subject: `Your event is live: ${row.name}`,
        html: mailShell(
          "Your event is on the calendar!",
          `<p style="margin:0 0 14px;line-height:1.6"><b>${escapeHtml(row.name)}</b> is now on the COhere community calendar. ` +
            `<a href="${escapeHtml(publicLink)}" style="color:#36558F">See it here</a>.</p>`,
        ),
        text: `"${row.name}" is now on the COhere community calendar: ${publicLink}`,
      });
    } catch (error) {
      console.error("proposal-approved email failed:", error instanceof Error ? error.message : error);
    }
  }

  return json({ ok: true, did: created.result.did, rkey: created.result.rkey, publicPath: created.result.publicPath }, 200);
}

/** `POST /api/admin/proposals/:id/reject` — body `{note?}`. */
export async function handleAdminProposalReject(
  request: Request,
  env: ProposalsEnv,
  id: string,
  reviewerEmail: string | null,
): Promise<Response> {
  const row = await env.cohere
    .prepare(`SELECT * FROM event_proposals WHERE id = ?1`)
    .bind(id)
    .first<ProposalRow>();
  if (!row) return json({ error: "not found" }, 404);
  if (row.status === "published") {
    return json({ error: "This proposal is already published — reject a different one." }, 400);
  }

  // A reject's body is optional, so a missing/empty one is fine, not a 400.
  const body = (await readJsonBody(request)) ?? {};
  const note = text(body.note, 2000);

  const now = new Date().toISOString();
  await env.cohere
    .prepare(
      `UPDATE event_proposals SET status = 'rejected', review_note = ?2, reviewed_by = ?3, updated_at = ?4 WHERE id = ?1`,
    )
    .bind(id, note || null, reviewerEmail, now)
    .run();

  if (row.proposer_email) {
    try {
      await sendMail(env, row.proposer_email, {
        subject: `About your event proposal: ${row.name}`,
        html: mailShell(
          "Your event proposal wasn't approved",
          `<p style="margin:0 0 14px;line-height:1.6">An organizer looked at <b>${escapeHtml(row.name)}</b> and decided not to add it to the COhere community calendar this time` +
            (note ? `:</p><p style="margin:0 0 14px;line-height:1.6">${escapeHtml(note)}</p>` : ".</p>") +
            `<p style="margin:0 0 14px;line-height:1.6">Questions? Just reply to this email.</p>`,
        ),
        text:
          `An organizer looked at "${row.name}" and decided not to add it to the COhere community calendar this time.` +
          (note ? ` ${note}` : "") +
          ` Questions? Just reply to this email.`,
      });
    } catch (error) {
      console.error("proposal-rejected email failed:", error instanceof Error ? error.message : error);
    }
  }

  return json({ ok: true }, 200);
}
