// Registration funnel: counts only. Where do people stop on a form?
//
// The browser sends tiny beacons — `view`, `reached:<field key>`,
// `submit_attempt` — to POST /api/funnel/:slug, and the submit path counts
// `submitted` itself. Each one bumps a single counter row per
// (form, UTC day, event) in D1 `form_funnel`. There is no visitor id, no
// cookie, no IP, no user agent and no answer anywhere in the request handling
// or the table: nothing here can say who did what, only how many.
//
// The only abuse control is a daily ceiling per counter. A per-IP limiter
// would need to remember IPs, which is exactly what this avoids.

export interface FunnelEnv {
  cohere: D1Database;
}

/** A counter stops moving past this many hits a day; far above real traffic. */
const DAILY_CEILING = 5000;
const MAX_BODY_BYTES = 512;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RANGE_DAYS = 14;

interface FormRow {
  fields: string;
  active: number;
}

interface FieldDef {
  key: string;
  label: string;
}

function respond(status: number, error?: string): Response {
  return error
    ? new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } })
    : new Response(null, { status });
}

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

function fieldsOf(form: FormRow): FieldDef[] {
  try {
    const parsed = JSON.parse(form.fields) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((f): f is FieldDef => typeof f?.key === "string" && f.key.length > 0)
      : [];
  } catch {
    return [];
  }
}

/** Bumps one counter; false when it has hit its daily ceiling. */
async function bump(env: FunnelEnv, slug: string, event: string, now: Date): Promise<boolean> {
  const result = await env.cohere
    .prepare(
      `INSERT INTO form_funnel (form_slug, day, event, count) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(form_slug, day, event) DO UPDATE SET count = count + 1 WHERE count < ?4
       RETURNING count`,
    )
    .bind(slug, dayOf(now), event, DAILY_CEILING)
    .run();
  return (result.results?.length ?? 0) > 0;
}

/**
 * Reads at most `max` bytes of the body, cancelling the stream the moment one
 * more arrives. Null when the body is larger. Counting bytes while streaming,
 * not characters after buffering, is what bounds the memory a client can cost.
 */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** POST /api/funnel/:slug — body `{event}` and nothing else of interest. */
export async function handleFunnelEvent(
  request: Request,
  env: FunnelEnv,
  slug: string,
  now: Date = new Date(),
): Promise<Response> {
  if (request.method !== "POST") return respond(405, "method not allowed");

  // Same origin only. A missing Origin (curl, some privacy settings) is let
  // through: a script can forge the header anyway, and the ceiling is what
  // bounds it.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return respond(403, "forbidden");

  // The browser posts text/plain to stay a "simple" request, so the body is
  // read as text whatever the content type says.
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > MAX_BODY_BYTES) return respond(413, "too large");
  const bytes = await readCapped(request, MAX_BODY_BYTES);
  if (!bytes) return respond(413, "too large");
  const text = new TextDecoder().decode(bytes);
  let event: unknown;
  try {
    event = (JSON.parse(text) as { event?: unknown }).event;
  } catch {
    return respond(400, "invalid JSON");
  }
  if (typeof event !== "string") return respond(400, "unknown event");

  const form = await env.cohere
    .prepare(`SELECT fields, active FROM forms WHERE slug = ?1`)
    .bind(slug)
    .first<FormRow>();
  if (!form) return respond(404, "unknown form");
  if (!form.active) return respond(410, "this form is closed");

  const isStep = event === "view" || event === "submit_attempt";
  const isReached =
    event.startsWith("reached:") && fieldsOf(form).some((f) => `reached:${f.key}` === event);
  // `submitted` is deliberately not accepted: only the submit path counts it.
  if (!isStep && !isReached) return respond(400, "unknown event");

  return (await bump(env, slug, event, now)) ? respond(204) : respond(429, "enough for today");
}

/** Counted by the submit path itself. Never throws: a counter must not fail a registration. */
export async function recordSubmitted(env: FunnelEnv, slug: string, now: Date = new Date()): Promise<void> {
  try {
    await bump(env, slug, "submitted", now);
  } catch (error) {
    console.error("funnel count failed:", error instanceof Error ? error.message : error);
  }
}

interface Step {
  event: string;
  label: string;
  count: number;
  /** How many fewer than the step before; null for the first step. Never negative. */
  drop: number | null;
}

/** GET /api/admin/funnel/:slug?from=&to= — caller has already checked the session. */
export async function handleAdminFunnel(
  env: FunnelEnv,
  url: URL,
  slug: string,
  now: Date = new Date(),
): Promise<Response> {
  const to = url.searchParams.get("to") ?? dayOf(now);
  const from =
    url.searchParams.get("from") ??
    (DAY_RE.test(to) && !Number.isNaN(Date.parse(to))
      ? dayOf(new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_RANGE_DAYS - 1) * 86_400_000))
      : "");
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return respond(400, "from and to must be YYYY-MM-DD");
  }
  if (from > to) return respond(400, "from is after to");

  const form = await env.cohere
    .prepare(`SELECT fields, active FROM forms WHERE slug = ?1`)
    .bind(slug)
    .first<FormRow>();
  if (!form) return respond(404, "unknown form");

  const { results } = await env.cohere
    .prepare(
      `SELECT event, SUM(count) AS n FROM form_funnel
       WHERE form_slug = ?1 AND day >= ?2 AND day <= ?3 GROUP BY event`,
    )
    .bind(slug, from, to)
    .all<{ event: string; n: number }>();
  const totals = new Map(results.map((r) => [r.event, Number(r.n)]));

  // Form order, not alphabetical: questions that were since removed from the
  // form are left out rather than shown as orphans.
  const plan = [
    { event: "view", label: "Form views" },
    ...fieldsOf(form).map((f) => ({ event: `reached:${f.key}`, label: f.label || f.key })),
    { event: "submit_attempt", label: "Submit clicked" },
    { event: "submitted", label: "Registered" },
  ];
  let previous: number | null = null;
  const steps: Step[] = plan.map((p) => {
    const count = totals.get(p.event) ?? 0;
    const drop = previous === null ? null : Math.max(0, previous - count);
    previous = count;
    return { ...p, count, drop };
  });

  return new Response(JSON.stringify({ slug, from, to, steps }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
