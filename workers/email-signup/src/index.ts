// COhere member API + admin portal.
//
// Public:  POST /                        legacy "stay in the loop" capture (email + honeypot)
//          POST /api/submit/:formSlug    generic form submission, answers stored as JSON
// Admin:   GET  /admin                   portal UI (asks for the admin key, keeps it in sessionStorage)
//          GET  /api/admin/*             JSON behind `Authorization: Bearer <ADMIN_KEY>`
//
// People persist across years; each year's questions live in `forms` as data and
// each person's answers live in `submissions` as JSON. See schema.sql.

import { ADMIN_PAGE } from "./admin-page";
import {
  clearedCookie,
  consumeLinkToken,
  currentSession,
  endSession,
  normalizeEmail,
  requestLogin,
  sessionCookie,
  verifyCode,
  type AuthEnv,
} from "./auth";

interface Env extends AuthEnv {
  SIGNUPS: KVNamespace;
  cohere: D1Database;
  COHERE_AUTH: KVNamespace;
  ADMIN_KEY?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://cohereboulder.org",
  "https://www.cohereboulder.org",
  "http://localhost:8080",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":
      origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://cohereboulder.org",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// Constant-time compare so the admin key can't be guessed a byte at a time.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Two ways in: a signed-in session cookie (people), or the bearer admin key
 * (scripts, and a way back in if email delivery ever breaks).
 */
async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (env.ADMIN_KEY && token && safeEqual(token, env.ADMIN_KEY)) return true;
  return (await currentSession(env, request)) !== null;
}

function str(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** Insert the person if they're new, otherwise fill in any blanks we just learned. */
async function upsertPerson(
  env: Env,
  fields: { email: string; name?: string | null; phone?: string | null; orgs?: string | null; source: string },
): Promise<string> {
  const now = new Date().toISOString();
  await env.cohere
    .prepare(
      `INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?8)
       ON CONFLICT(email) DO UPDATE SET
         name       = COALESCE(excluded.name, people.name),
         phone      = COALESCE(excluded.phone, people.phone),
         orgs       = COALESCE(excluded.orgs, people.orgs),
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      fields.email,
      fields.name ?? null,
      fields.phone ?? null,
      fields.orgs ?? null,
      crypto.randomUUID(),
      fields.source,
      now,
    )
    .run();

  const row = await env.cohere
    .prepare(`SELECT id FROM people WHERE email = ?1`)
    .bind(fields.email)
    .first<{ id: string }>();
  return row!.id;
}

async function recordSubmission(
  env: Env,
  personId: string,
  formSlug: string,
  event: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  await env.cohere
    .prepare(
      `INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(person_id, form_slug) DO UPDATE SET
         data       = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), personId, formSlug, event, JSON.stringify(data), now)
    .run();
}

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join("; ")
        : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin"));
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ---------------------------------------------------------------- admin UI

    if (request.method === "GET" && (path === "/admin" || path === "/admin/")) {
      return new Response(ADMIN_PAGE, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "no-store",
        },
      });
    }

    // ------------------------------------------------------------------ auth

    if (path.startsWith("/api/auth/")) {
      const secure = url.protocol === "https:";
      const baseUrl = env.PUBLIC_BASE_URL || url.origin;

      if (request.method === "POST" && path === "/api/auth/request") {
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
        try {
          const result = await requestLogin(env, body.email, clientIp, baseUrl);
          if (!result.ok) return json({ error: result.error }, result.status);
          return json({ ok: true }, 200);
        } catch (error) {
          // Delivery failed — say so plainly rather than a bare 500, since the
          // fix is a configuration one an organizer can act on.
          const detail = error instanceof Error ? error.message : "unknown error";
          console.error("sign-in email failed:", detail);
          return json(
            {
              error:
                detail === "no email transport configured"
                  ? "Sign-in email isn't configured yet. Use the admin key below for now."
                  : "We couldn't send the sign-in email. Try again, or use the admin key below.",
            },
            503,
          );
        }
      }

      if (request.method === "POST" && path === "/api/auth/verify") {
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const result = await verifyCode(env, body.email, body.code);
        if (!result.ok) return json({ error: result.error }, result.status);
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(result.token, secure) });
      }

      if (request.method === "GET" && path === "/api/auth/callback") {
        const token = await consumeLinkToken(env, url.searchParams.get("token") ?? "");
        if (!token) {
          return Response.redirect(`${baseUrl}/admin?error=expired`, 302);
        }
        return new Response(null, {
          status: 302,
          headers: { Location: `${baseUrl}/admin`, "Set-Cookie": sessionCookie(token, secure) },
        });
      }

      if (request.method === "GET" && path === "/api/auth/me") {
        const session = await currentSession(env, request);
        if (!session) return json({ error: "unauthorized" }, 401);
        return json({ email: session.email, name: session.name }, 200);
      }

      if (request.method === "POST" && path === "/api/auth/logout") {
        await endSession(env, request);
        return json({ ok: true }, 200, { "Set-Cookie": clearedCookie(secure) });
      }

      return json({ error: "not found" }, 404);
    }

    // --------------------------------------------------------------- admin API

    if (path.startsWith("/api/admin/") || path === "/list") {
      if (!(await isAdmin(request, env))) {
        return json({ error: "unauthorized" }, 401);
      }

      // Everyone, with their submissions attached.
      if (request.method === "GET" && path === "/api/admin/people") {
        const { results } = await env.cohere
          .prepare(
            `SELECT p.*, (
               SELECT json_group_array(json_object(
                 'form_slug', s.form_slug, 'event', s.event, 'data', s.data, 'created_at', s.created_at))
               FROM submissions s WHERE s.person_id = p.id
             ) AS submissions
             FROM people p
             ORDER BY p.created_at DESC`,
          )
          .all();
        const people = results.map((row) => {
          const { submissions, ...person } = row as Record<string, unknown>;
          return {
            ...person,
            submissions: JSON.parse((submissions as string) ?? "[]").map(
              (s: { data: string } & Record<string, unknown>) => ({ ...s, data: JSON.parse(s.data) }),
            ),
          };
        });
        return json({ count: people.length, people }, 200);
      }

      // Who can sign in.
      if (request.method === "GET" && path === "/api/admin/admins") {
        const { results } = await env.cohere
          .prepare(`SELECT email, name, added_by, created_at FROM admins ORDER BY created_at`)
          .all();
        return json({ admins: results }, 200);
      }

      if (request.method === "POST" && path === "/api/admin/admins") {
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const email = normalizeEmail(body.email);
        if (!email || !email.includes("@")) return json({ error: "invalid email" }, 400);
        const session = await currentSession(env, request);
        await env.cohere
          .prepare(
            `INSERT INTO admins (email, name, added_by, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, admins.name)`,
          )
          .bind(email, str(body.name, 200), session?.email ?? "admin-key", new Date().toISOString())
          .run();
        return json({ ok: true }, 200);
      }

      if (request.method === "DELETE" && path.startsWith("/api/admin/admins/")) {
        const email = normalizeEmail(decodeURIComponent(path.slice("/api/admin/admins/".length)));
        const session = await currentSession(env, request);
        if (session && session.email === email) {
          return json({ error: "you can't remove your own access" }, 400);
        }
        const remaining = await env.cohere
          .prepare(`SELECT COUNT(*) AS n FROM admins`)
          .first<{ n: number }>();
        if ((remaining?.n ?? 0) <= 1) {
          return json({ error: "there has to be at least one admin" }, 400);
        }
        await env.cohere.prepare(`DELETE FROM admins WHERE email = ?1`).bind(email).run();
        return json({ ok: true }, 200);
      }

      // Form definitions — the questions, as data.
      if (request.method === "GET" && path === "/api/admin/forms") {
        const { results } = await env.cohere
          .prepare(`SELECT * FROM forms ORDER BY active DESC, created_at DESC`)
          .all();
        const { results: counts } = await env.cohere
          .prepare(`SELECT form_slug, COUNT(*) AS n FROM submissions GROUP BY form_slug`)
          .all<{ form_slug: string; n: number }>();
        const forms = results.map((f) => {
          const form = f as Record<string, unknown>;
          const hit = counts.find((c) => c.form_slug === form.slug);
          return {
            ...form,
            fields: JSON.parse(form.fields as string),
            submission_count: hit ? hit.n : 0,
          };
        });
        return json({ forms }, 200);
      }

      // Replace a form's questions without a deploy.
      if (request.method === "PUT" && path.startsWith("/api/admin/forms/")) {
        const slug = decodeURIComponent(path.slice("/api/admin/forms/".length));
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        if (!Array.isArray(body.fields)) {
          return json({ error: "fields must be an array" }, 400);
        }
        const now = new Date().toISOString();
        await env.cohere
          .prepare(
            `INSERT INTO forms (slug, title, event, fields, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(slug) DO UPDATE SET
               title = excluded.title, event = excluded.event, fields = excluded.fields,
               active = excluded.active, updated_at = excluded.updated_at`,
          )
          .bind(
            slug,
            str(body.title, 200) ?? slug,
            str(body.event, 100),
            JSON.stringify(body.fields),
            body.active === false ? 0 : 1,
            now,
          )
          .run();
        return json({ ok: true }, 200);
      }

      // Organizer-only fields: tags, notes, subscribe state.
      if (request.method === "PUT" && path.startsWith("/api/admin/people/")) {
        const id = decodeURIComponent(path.slice("/api/admin/people/".length));
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        await env.cohere
          .prepare(
            `UPDATE people SET
               tags           = COALESCE(?2, tags),
               internal_notes = COALESCE(?3, internal_notes),
               subscribed     = COALESCE(?4, subscribed),
               updated_at     = ?5
             WHERE id = ?1`,
          )
          .bind(
            id,
            str(body.tags, 500),
            str(body.internal_notes, 5000),
            typeof body.subscribed === "boolean" ? (body.subscribed ? 1 : 0) : null,
            new Date().toISOString(),
          )
          .run();
        return json({ ok: true }, 200);
      }

      // Flat CSV — one row per person, one column per question on the chosen form.
      if (request.method === "GET" && path === "/api/admin/export.csv") {
        const formSlug = url.searchParams.get("form");
        const statement = formSlug
          ? env.cohere
              .prepare(
                `SELECT p.*, s.data AS answers FROM people p
                 JOIN submissions s ON s.person_id = p.id AND s.form_slug = ?1
                 ORDER BY p.created_at DESC`,
              )
              .bind(formSlug)
          : env.cohere.prepare(`SELECT p.*, NULL AS answers FROM people p ORDER BY p.created_at DESC`);
        const { results } = await statement.all<Record<string, unknown>>();

        const answerKeys = new Set<string>();
        const parsed = results.map((row) => {
          const answers = row.answers ? JSON.parse(row.answers as string) : {};
          Object.keys(answers).forEach((k) => answerKeys.add(k));
          return { row, answers };
        });

        const base = ["email", "name", "phone", "orgs", "subscribed", "tags", "source", "created_at"];
        const header = [...base, ...answerKeys];
        const lines = [header.join(",")];
        for (const { row, answers } of parsed) {
          lines.push(
            [...base.map((k) => csvCell(row[k])), ...[...answerKeys].map((k) => csvCell(answers[k]))].join(","),
          );
        }
        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="cohere-${formSlug ?? "people"}.csv"`,
          },
        });
      }

      // Legacy: the raw KV signups, kept until we're confident D1 has everything.
      if (request.method === "GET" && path === "/list") {
        const signups: unknown[] = [];
        let cursor: string | undefined;
        do {
          const page = await env.SIGNUPS.list({ prefix: "email:", cursor });
          for (const key of page.keys) {
            const value = await env.SIGNUPS.get(key.name, "json");
            if (value) signups.push(value);
          }
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor);
        return json({ count: signups.length, signups }, 200);
      }

      return json({ error: "not found" }, 404);
    }

    // ------------------------------------------------------------ public forms

    // The questions for a form, so the site can render whatever the admin defines.
    if (request.method === "GET" && path.startsWith("/api/form/")) {
      const formSlug = decodeURIComponent(path.slice("/api/form/".length));
      const form = await env.cohere
        .prepare(`SELECT slug, title, event, fields, active FROM forms WHERE slug = ?1`)
        .bind(formSlug)
        .first<{ slug: string; title: string; event: string | null; fields: string; active: number }>();
      if (!form) return json({ error: "unknown form" }, 404, cors);
      return json(
        { ...form, fields: JSON.parse(form.fields), active: Boolean(form.active) },
        200,
        { ...cors, "Cache-Control": "public, max-age=60" },
      );
    }

    // Generic submission: any form in the `forms` table.
    if (request.method === "POST" && path.startsWith("/api/submit/")) {
      const formSlug = decodeURIComponent(path.slice("/api/submit/".length));
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400, cors);
      }

      if (typeof body.website === "string" && body.website.length > 0) {
        return json({ ok: true }, 200, cors); // honeypot
      }

      const form = await env.cohere
        .prepare(`SELECT slug, event, active FROM forms WHERE slug = ?1`)
        .bind(formSlug)
        .first<{ slug: string; event: string | null; active: number }>();
      if (!form) return json({ error: "unknown form" }, 404, cors);
      if (!form.active) return json({ error: "this form is closed" }, 410, cors);

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json({ error: "invalid email" }, 400, cors);
      }

      const answers = (body.answers ?? {}) as Record<string, unknown>;
      const personId = await upsertPerson(env, {
        email,
        name: str(body.name, 200),
        phone: str(body.phone, 60),
        orgs: str(body.orgs, 300),
        source: `form:${formSlug}`,
      });
      await recordSubmission(env, personId, formSlug, form.event, answers);

      // A form may carry the email-list opt-in; honour it either way.
      if (typeof body.subscribed === "boolean") {
        await env.cohere
          .prepare(`UPDATE people SET subscribed = ?2, updated_at = ?3 WHERE id = ?1`)
          .bind(personId, body.subscribed ? 1 : 0, new Date().toISOString())
          .run();
      }

      return json({ ok: true }, 200, cors);
    }

    // Legacy "stay in the loop" capture. Writes D1 and KV so nothing is lost
    // while the old shape is still deployed on the site.
    if (request.method === "POST" && path === "/") {
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400, cors);
      }

      if (typeof body.website === "string" && body.website.length > 0) {
        return json({ ok: true }, 200, cors); // honeypot
      }

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json({ error: "invalid email" }, 400, cors);
      }

      const source = str(body.source, 100) ?? "website";
      const signedUpAt = new Date().toISOString();

      const personId = await upsertPerson(env, {
        email,
        name: str(body.name, 200),
        source: `signup:${source}`,
      });
      await recordSubmission(env, personId, "signup-2026", "october2026", {
        source,
        language: str(body.language, 10) ?? "en",
      });

      await env.SIGNUPS.put(
        `email:${email}`,
        JSON.stringify({
          email,
          name: str(body.name, 200) ?? undefined,
          source,
          language: str(body.language, 10) ?? undefined,
          signedUpAt,
        }),
      );

      return json({ ok: true }, 200, cors);
    }

    return json({ error: "not found" }, 404, cors);
  },
};
