// "RSVP · remind me" for people without a COhere (regenOS) account.
//
// Signed-in visitors RSVP on regenOS itself through the /xrpc proxy
// (social.scenius.rsvp), and regenOS reminds them 24h and 1h ahead. Everyone
// else leaves an email here: one D1 row per (event, email) in `event_rsvps`
// (worker/migrations/0004_event_rsvps.sql), a short confirmation with an .ics,
// and ONE reminder email at ~9am Boulder time the day before, listing every
// event they RSVP'd to for that day.
//
// Deliberately NOT the mailing list: nothing here reads or writes `people`,
// and rows are deleted 30 days after the event starts.
//
// Routes (wired in index.ts):
//   POST /api/rsvp                    public; honeypot + IP/email rate limits
//   GET  /rsvp/cancel?token=…         one-click browser cancel (auto-POST)
//   POST /rsvp/cancel?token=…         RFC 8058 one-click List-Unsubscribe target
//   GET  /api/admin/rsvps             per-event email-RSVP counts   (admin)
//   GET  /api/admin/rsvps/:did/:rkey  the list for one event         (admin)
//   scheduled()                       runRsvpCron — reminders + retention

import type { AuthEnv, MailMessage } from "./auth";
import { mailShell, rateLimited, sendMail } from "./auth";
import type { EventsEnv } from "./events";
import { handleEventDetail } from "./events";
import { isPlaceholder } from "./event-completeness";

export interface RsvpEnv extends AuthEnv, EventsEnv {
  cohere: D1Database;
  RSVP_REMINDERS_PAUSED?: string;
}

export const EVENT_TZ = "America/Denver";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows go away this long after the event's start. */
export const RETENTION_DAYS = 30;
/** D1 caps bound parameters per statement at 100. */
const ID_CHUNK = 90;
/** One send per recipient; stay well inside the per-invocation subrequest budget. */
export const MAX_REMINDER_EMAILS_PER_RUN = 400;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RKEY_RE = /^[A-Za-z0-9._~:-]{1,512}$/;
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,2048}$/;

type Lang = "en" | "es";

export interface RsvpRow {
  id: string;
  event_did: string;
  event_rkey: string;
  event_name: string;
  event_starts_at: string;
  event_where: string | null;
  email: string;
  name: string | null;
  language: string;
  cancel_token: string;
  reminder_sent_at: string | null;
  created_at: string;
}

/** What we need to know about a live event, read anonymously from regenOS. */
export interface LiveEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string | null;
  where: string | null;
}

export type LiveLookup =
  | { kind: "ok"; event: LiveEvent }
  | { kind: "gone" }
  | { kind: "unavailable" };

function json(data: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function lang(value: unknown): Lang {
  return value === "es" ? "es" : "en";
}

function whereLine(location: { name?: string; street?: string; locality?: string } | null | undefined): string | null {
  if (!location) return null;
  const parts = [location.name, location.street, location.locality].filter(
    (p): p is string => typeof p === "string" && !isPlaceholder(p),
  );
  return parts.length ? parts.join(", ") : null;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ time

/** The zone's UTC offset (ms, zone − UTC) at a given instant. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - (instant - (instant % 1000));
}

/** The calendar date (y, m, d) an instant falls on in the zone. */
function zonedDate(instant: number, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** The UTC instant of local midnight starting y-m-d in the zone (DST-safe). */
function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  const naive = Date.UTC(y, m - 1, d);
  let guess = naive - tzOffsetMs(naive, timeZone);
  // A second pass settles the rare case where the first guess sits across a
  // DST transition from the real answer.
  guess = naive - tzOffsetMs(guess, timeZone);
  return guess;
}

/**
 * [start, end) of the calendar day `offsetDays` after `now`'s own day, in the
 * zone, as ISO strings. The day after a DST change is 23 or 25 hours long,
 * which is why this walks calendar dates rather than adding 24h.
 */
export function zonedDayWindow(now: Date, offsetDays = 1, timeZone = EVENT_TZ): { start: string; end: string } {
  const today = zonedDate(now.getTime(), timeZone);
  const base = new Date(Date.UTC(today.y, today.m - 1, today.d + offsetDays));
  const next = new Date(Date.UTC(today.y, today.m - 1, today.d + offsetDays + 1));
  const start = zonedMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), timeZone);
  const end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function formatWhen(iso: string, language: Lang, withDate = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    timeZone: EVENT_TZ,
    ...(withDate ? { weekday: "long", month: "long", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

// ------------------------------------------------------------ live event

/** One anonymous regenOS read, through the same path the public detail page uses. */
export async function lookupLiveEvent(env: EventsEnv, did: string, rkey: string): Promise<LiveLookup> {
  const res = await handleEventDetail(env, did, rkey, {});
  if (res.status === 404) return { kind: "gone" };
  if (!res.ok) return { kind: "unavailable" };
  const data = (await res.json().catch(() => null)) as {
    event?: {
      did: string;
      rkey: string;
      name: string;
      startsAt: string | null;
      endsAt: string | null;
      status: string | null;
      location: { name?: string; street?: string; locality?: string } | null;
    };
  } | null;
  const e = data?.event;
  if (!e?.name) return { kind: "gone" };
  return {
    kind: "ok",
    event: {
      did: e.did,
      rkey: e.rkey,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: e.status,
      where: whereLine(e.location),
    },
  };
}

// ------------------------------------------------------------------- ics

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  for (let rest = line.slice(75); rest.length; rest = rest.slice(74)) out.push(rest.slice(0, 74));
  return out.join("\r\n ");
}

export function eventIcs(event: LiveEvent, link: string): string | null {
  if (!event.startsAt || Number.isNaN(Date.parse(event.startsAt))) return null;
  const end =
    event.endsAt && !Number.isNaN(Date.parse(event.endsAt))
      ? event.endsAt
      : new Date(Date.parse(event.startsAt) + 60 * 60 * 1000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//COhere Boulder//RSVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.rkey}.${event.did}@cohereboulder.org`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(event.startsAt)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEscape(event.name)}`,
    ...(event.where ? [`LOCATION:${icsEscape(event.where)}`] : []),
    `URL:${link}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function googleCalendarLink(event: LiveEvent, link: string): string | null {
  if (!event.startsAt) return null;
  const end = event.endsAt ?? new Date(Date.parse(event.startsAt) + 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${icsTime(event.startsAt)}/${icsTime(end)}`,
    details: link,
    ...(event.where ? { location: event.where } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ------------------------------------------------------------------ copy

const COPY = {
  en: {
    confirmSubject: (name: string) => `You're on the list: ${name}`,
    confirmHeading: (first: string) => (first ? `Thanks, ${first} — see you there.` : "See you there."),
    confirmLead: "You RSVP'd for",
    remindNote: "We'll email you a reminder the morning before (around 9am Boulder time).",
    addCal: "Add to Google Calendar",
    icsNote: "An .ics file for any calendar app is attached.",
    viewEvent: "View the event",
    cancel: "Can't make it? Cancel this RSVP",
    footer:
      "You're receiving this because this address RSVP'd on cohereboulder.org. It does not add you to our mailing list, and we delete RSVP details 30 days after the event.",
    reminderSubject: (names: string[]) =>
      names.length === 1 ? `Tomorrow: ${names[0]}` : `Tomorrow: ${names.length} COhere events`,
    reminderHeading: (first: string) => (first ? `See you tomorrow, ${first}!` : "See you tomorrow!"),
    reminderLead: "A reminder of what you RSVP'd for tomorrow:",
    cancelOne: "Can't make it? Cancel",
    reminderFooter:
      "You're receiving this because this address RSVP'd on cohereboulder.org. This is the only reminder we'll send for these events.",
  },
  es: {
    confirmSubject: (name: string) => `Estás en la lista: ${name}`,
    confirmHeading: (first: string) => (first ? `Gracias, ${first} — nos vemos allí.` : "Nos vemos allí."),
    confirmLead: "Confirmaste tu asistencia a",
    remindNote: "Te enviaremos un recordatorio la mañana anterior (alrededor de las 9am, hora de Boulder).",
    addCal: "Añadir a Google Calendar",
    icsNote: "Se adjunta un archivo .ics para cualquier app de calendario.",
    viewEvent: "Ver el evento",
    cancel: "¿No puedes ir? Cancela esta confirmación",
    footer:
      "Recibes esto porque esta dirección confirmó asistencia en cohereboulder.org. No te añade a nuestra lista de correo, y borramos los datos 30 días después del evento.",
    reminderSubject: (names: string[]) =>
      names.length === 1 ? `Mañana: ${names[0]}` : `Mañana: ${names.length} eventos de COhere`,
    reminderHeading: (first: string) => (first ? `¡Nos vemos mañana, ${first}!` : "¡Nos vemos mañana!"),
    reminderLead: "Un recordatorio de lo que confirmaste para mañana:",
    cancelOne: "¿No puedes ir? Cancela",
    reminderFooter:
      "Recibes esto porque esta dirección confirmó asistencia en cohereboulder.org. Es el único recordatorio que enviaremos para estos eventos.",
  },
} as const;

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function cancelUrl(base: string, tokens: string[]): string {
  return `${base}/rsvp/cancel?token=${tokens.map(encodeURIComponent).join(",")}`;
}

function unsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

const P = 'style="margin:0 0 14px;line-height:1.6"';
const A = 'style="color:#36558F"';

export function confirmationEmail(
  event: LiveEvent,
  row: Pick<RsvpRow, "name" | "cancel_token">,
  language: Lang,
  base: string,
): MailMessage {
  const c = COPY[language];
  const link = `${base}/events/${event.did}/${event.rkey}`;
  const cancel = cancelUrl(base, [row.cancel_token]);
  const when = event.startsAt ? formatWhen(event.startsAt, language) : "";
  const gcal = googleCalendarLink(event, link);
  const ics = eventIcs(event, link);
  const html = mailShell(
    escapeHtml(c.confirmHeading(firstName(row.name))),
    `<p ${P}>${c.confirmLead} <b>${escapeHtml(event.name)}</b>.</p>` +
      `<p ${P}>${escapeHtml(when)}${event.where ? `<br>${escapeHtml(event.where)}` : ""}</p>` +
      `<p ${P}>${escapeHtml(c.remindNote)}</p>` +
      `<p ${P}><a href="${escapeHtml(link)}" ${A}>${escapeHtml(c.viewEvent)}</a>` +
      (gcal ? ` · <a href="${escapeHtml(gcal)}" ${A}>${escapeHtml(c.addCal)}</a>` : "") +
      `</p>` +
      (ics ? `<p ${P}>${escapeHtml(c.icsNote)}</p>` : "") +
      `<p ${P}><a href="${escapeHtml(cancel)}" ${A}>${escapeHtml(c.cancel)}</a></p>`,
    escapeHtml(c.footer),
  );
  const textBody = [
    `${c.confirmLead} ${event.name}.`,
    when,
    event.where ?? "",
    "",
    c.remindNote,
    "",
    `${c.viewEvent}: ${link}`,
    ...(gcal ? [`${c.addCal}: ${gcal}`] : []),
    "",
    `${c.cancel}: ${cancel}`,
    "",
    c.footer,
  ].join("\n");
  return {
    subject: c.confirmSubject(event.name),
    html,
    text: textBody,
    headers: unsubscribeHeaders(cancel),
    attachments: ics ? [{ filename: "event.ics", contentType: "text/calendar; method=PUBLISH", content: ics }] : [],
  };
}

export interface ReminderItem {
  name: string;
  startsAt: string;
  where: string | null;
  link: string;
  cancelToken: string;
}

export function reminderEmail(
  person: { email: string; name: string | null; language: Lang },
  items: ReminderItem[],
  base: string,
): MailMessage {
  const c = COPY[person.language];
  const all = cancelUrl(
    base,
    items.map((i) => i.cancelToken),
  );
  const blocks = items.map((item) => {
    const when = formatWhen(item.startsAt, person.language);
    const cancel = cancelUrl(base, [item.cancelToken]);
    return {
      html:
        `<p ${P}><b><a href="${escapeHtml(item.link)}" ${A}>${escapeHtml(item.name)}</a></b><br>` +
        `${escapeHtml(when)}${item.where ? `<br>${escapeHtml(item.where)}` : ""}<br>` +
        `<a href="${escapeHtml(cancel)}" style="color:#78847f;font-size:13px">${escapeHtml(c.cancelOne)}</a></p>`,
      text: [item.name, when, item.where ?? "", item.link, `${c.cancelOne}: ${cancel}`].filter(Boolean).join("\n"),
    };
  });
  return {
    subject: c.reminderSubject(items.map((i) => i.name)),
    html: mailShell(
      escapeHtml(c.reminderHeading(firstName(person.name))),
      `<p ${P}>${escapeHtml(c.reminderLead)}</p>` + blocks.map((b) => b.html).join(""),
      escapeHtml(c.reminderFooter),
    ),
    text: [c.reminderLead, "", ...blocks.map((b) => b.text + "\n"), c.reminderFooter].join("\n"),
    headers: unsubscribeHeaders(all),
  };
}

// ------------------------------------------------------------ POST /api/rsvp

export interface RsvpDeps {
  lookup?: typeof lookupLiveEvent;
  send?: typeof sendMail;
  now?: () => Date;
}

/**
 * `POST /api/rsvp` — `{did, rkey, email, name?, language?, website?}`.
 *
 * Anyone may call it, so it can email an arbitrary address: that is what the
 * honeypot and per-IP/per-email limits are for. A repeat RSVP returns
 * `{ok, already:true}` and resends the existing confirmation, allowing a
 * recipient to recover a lost message without creating a second RSVP.
 */
export async function handleCreateRsvp(
  request: Request,
  env: RsvpEnv,
  url: URL,
  deps: RsvpDeps = {},
): Promise<Response> {
  const lookup = deps.lookup ?? lookupLiveEvent;
  const send = deps.send ?? sendMail;
  const now = (deps.now ?? (() => new Date()))();

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // A bot fills the hidden field; a person never sees it. Same answer either way.
  if (typeof body.website === "string" && body.website.length > 0) {
    return json({ ok: true }, 200);
  }

  const did = text(body.did, 2100);
  const rkey = text(body.rkey, 512);
  const email = text(body.email, 320).toLowerCase();
  const name = text(body.name, 200) || null;
  const language = lang(body.language);
  if (!DID_RE.test(did) || !RKEY_RE.test(rkey)) return json({ error: "unknown event" }, 400);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (
    (await rateLimited(env, `rsvp-ip:${clientIp}`, 20, 60 * 60)) ||
    (await rateLimited(env, `rsvp-email:${email}`, 10, 60 * 60))
  ) {
    return json({ error: "Too many RSVPs from here just now. Try again in a bit." }, 429);
  }

  const live = await lookup(env, did, rkey);
  if (live.kind === "gone") return json({ error: "unknown event" }, 404);
  if (live.kind === "unavailable") {
    return json({ error: "The calendar isn't responding right now. Try again in a moment." }, 503);
  }
  const event = live.event;
  if (event.status === "cancelled") return json({ error: "This event was cancelled." }, 400);
  const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
  if (Number.isNaN(startMs)) return json({ error: "This event doesn't have a date yet." }, 400);
  if (startMs <= now.getTime()) return json({ error: "This event has already started." }, 400);

  const row = {
    id: crypto.randomUUID(),
    cancel_token: randomToken(),
    name,
  };
  const inserted = await env.cohere
    .prepare(
      `INSERT INTO event_rsvps
         (id, event_did, event_rkey, event_name, event_starts_at, event_where,
          email, name, language, cancel_token, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (event_did, event_rkey, email) DO NOTHING`,
    )
    .bind(
      row.id,
      event.did,
      event.rkey,
      event.name,
      new Date(startMs).toISOString(),
      event.where,
      email,
      name,
      language,
      row.cancel_token,
      now.toISOString(),
    )
    .run();

  if (!inserted.meta?.changes) {
    const existing = await env.cohere
      .prepare(`SELECT name, language, cancel_token FROM event_rsvps WHERE event_did = ?1 AND event_rkey = ?2 AND email = ?3`)
      .bind(event.did, event.rkey, email)
      .first<{ name: string | null; language: string; cancel_token: string }>();
    if (existing) {
      try {
        await send(env, email, confirmationEmail(event, existing, existing.language === "es" ? "es" : "en", env.PUBLIC_BASE_URL || url.origin));
      } catch (error) {
        console.error("rsvp confirmation resend failed:", error instanceof Error ? error.message : error);
      }
    }
    return json({ ok: true, already: true }, 200);
  }

  try {
    await send(env, email, confirmationEmail(event, row, language, env.PUBLIC_BASE_URL || url.origin));
  } catch (error) {
    // The RSVP stands either way; the reminder carries the cancel link too.
    console.error("rsvp confirmation email failed:", error instanceof Error ? error.message : error);
  }
  return json({ ok: true }, 200);
}

// ------------------------------------------------------------ /rsvp/cancel

function parseTokens(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^[a-f0-9]{16,128}$/.test(t))
    .slice(0, 20);
}

function placeholders(n: number, offset = 0): string {
  return Array.from({ length: n }, (_, i) => `?${i + 1 + offset}`).join(", ");
}

function cancelPage(state: "confirm" | "done" | "unknown", names: string[], token = ""): string {
  const list = names.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  const body =
    state === "done"
      ? `<h1>RSVP cancelled</h1>
         <p>We've removed your RSVP${names.length > 1 ? "s" : ""} and won't send a reminder.
         Changed your mind? RSVP again from the event page.</p>
         <p lang="es">Cancelamos tu confirmación y no te enviaremos recordatorio.</p>`
      : state === "confirm"
        ? `<h1>Cancel your RSVP?</h1>
           <ul>${list}</ul>
           <p>Finishing your cancellation… If it doesn't finish automatically, use the button.</p>
           <form id="cancel" method="POST" action="/rsvp/cancel?token=${encodeURIComponent(token)}">
             <button type="submit">Yes, cancel my RSVP · Sí, cancelar</button>
           </form>
           <script>document.getElementById('cancel').submit()</script>`
        : `<h1>Nothing to cancel</h1>
           <p>This RSVP was already cancelled, or its details have been deleted after the event.</p>
           <p lang="es">Esta confirmación ya fue cancelada o sus datos ya se borraron.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,"><title>COhere Boulder — RSVP</title>
<style>
  body { margin:0; background:#f4f7f4; color:#1b2430;
         font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; line-height:1.6; }
  main { max-width:32rem; margin:0 auto; padding:4rem 1.5rem; }
  h1 { font-size:1.5rem; line-height:1.25; margin:0 0 1rem; letter-spacing:-0.02em; }
  p, li { color:#4a5560; }
  button { font:inherit; cursor:pointer; background:#36558F; color:#fff; border:0;
           border-radius:4px; padding:0.7rem 1.2rem; margin-top:0.5rem; }
  a { color:#36558F; }
  .brand { font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:#489FB5; margin-bottom:0.5rem; }
</style></head>
<body><main>
  <p class="brand">COhere Boulder</p>
  ${body}
  <p style="margin-top:2rem"><a href="/calendar">Back to the calendar</a></p>
</main></body></html>`;
}

const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/**
 * GET renders a page whose script submits a POST. Link scanners that only
 * fetch the URL cannot cancel; browsers finish in one click. With scripting
 * disabled the visitor can submit the form. POST is also the RFC 8058
 * List-Unsubscribe-Post target and is idempotent.
 */
export async function handleRsvpCancel(request: Request, env: RsvpEnv, url: URL): Promise<Response> {
  const tokens = parseTokens(url.searchParams.get("token"));
  const rows = tokens.length
    ? (
        await env.cohere
          .prepare(`SELECT id, event_name FROM event_rsvps WHERE cancel_token IN (${placeholders(tokens.length)}) ORDER BY event_starts_at`)
          .bind(...tokens)
          .all<{ id: string; event_name: string }>()
      ).results
    : [];

  if (request.method === "POST") {
    if (rows.length) {
      await env.cohere
        .prepare(`DELETE FROM event_rsvps WHERE cancel_token IN (${placeholders(tokens.length)})`)
        .bind(...tokens)
        .run();
    }
    return new Response(cancelPage(rows.length ? "done" : "unknown", []), { status: 200, headers: HTML });
  }
  if (!rows.length) return new Response(cancelPage("unknown", []), { status: 404, headers: HTML });
  return new Response(cancelPage("confirm", rows.map((r) => r.event_name), tokens.join(",")), { status: 200, headers: HTML });
}

// ------------------------------------------------------------------ admin

/** `GET /api/admin/rsvps` — `{counts: [{did, rkey, count}]}`. */
export async function handleAdminRsvpCounts(env: RsvpEnv): Promise<Response> {
  const { results } = await env.cohere
    .prepare(
      `SELECT event_did AS did, event_rkey AS rkey, COUNT(*) AS count
       FROM event_rsvps GROUP BY event_did, event_rkey`,
    )
    .all<{ did: string; rkey: string; count: number }>();
  return json({ counts: results }, 200);
}

/** `GET /api/admin/rsvps/:did/:rkey` — the email RSVPs for one event. */
export async function handleAdminRsvpList(env: RsvpEnv, did: string, rkey: string): Promise<Response> {
  const { results } = await env.cohere
    .prepare(
      `SELECT name, email, language, created_at, reminder_sent_at FROM event_rsvps
       WHERE event_did = ?1 AND event_rkey = ?2 ORDER BY created_at`,
    )
    .bind(did, rkey)
    .all();
  return json({ rsvps: results }, 200);
}

// ------------------------------------------------------------------- cron

export interface CronResult {
  deleted: number;
  candidates: number;
  claimed: number;
  emailsSent: number;
  emailsFailed: number;
  skippedGone: number;
  skippedCancelled: number;
  deferred: number;
}

/** Group claimed rows into one reminder per address, events in start order. */
export function groupReminders(
  rows: (RsvpRow & { live: LiveEvent })[],
  base: string,
): { email: string; name: string | null; language: Lang; ids: string[]; items: ReminderItem[] }[] {
  const byEmail = new Map<
    string,
    { email: string; name: string | null; language: Lang; ids: string[]; items: ReminderItem[] }
  >();
  const sorted = [...rows].sort((a, b) => Date.parse(a.live.startsAt ?? "") - Date.parse(b.live.startsAt ?? ""));
  for (const row of sorted) {
    let group = byEmail.get(row.email);
    if (!group) {
      group = { email: row.email, name: row.name, language: lang(row.language), ids: [], items: [] };
      byEmail.set(row.email, group);
    }
    group.name = group.name ?? row.name;
    group.ids.push(row.id);
    group.items.push({
      name: row.live.name,
      startsAt: row.live.startsAt ?? row.event_starts_at,
      where: row.live.where,
      link: `${base}/events/${row.event_did}/${row.event_rkey}`,
      cancelToken: row.cancel_token,
    });
  }
  return [...byEmail.values()];
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The daily run (wrangler.jsonc: `0 15 * * *` = 9am Boulder during MDT).
 *
 *  1. Retention: delete RSVPs whose event started 30+ days ago.
 *  2. Re-read every upcoming event that has un-reminded RSVPs from regenOS,
 *     refreshing the row's snapshot — so a moved event is judged by its NEW
 *     start and a deleted/cancelled one is never reminded.
 *  3. Pick rows whose event starts TOMORROW in America/Denver.
 *  4. Claim them (`reminder_sent_at` set only where still NULL, RETURNING the
 *     ids actually won) — two overlapping runs can never both send a row.
 *  5. One email per address listing all their events; a failed send releases
 *     its claim so a re-run the same day retries it.
 */
export async function runRsvpCron(
  env: RsvpEnv,
  now: Date,
  deps: { lookup?: typeof lookupLiveEvent; send?: typeof sendMail } = {},
): Promise<CronResult> {
  const lookup = deps.lookup ?? lookupLiveEvent;
  const send = deps.send ?? sendMail;
  const base = (env.PUBLIC_BASE_URL || "https://cohereboulder.org").replace(/\/+$/, "");
  const result: CronResult = {
    deleted: 0,
    candidates: 0,
    claimed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skippedGone: 0,
    skippedCancelled: 0,
    deferred: 0,
  };

  // Recheck every unsent RSVP before retention: an event can move into
  // tomorrow from any prior date, even after its original cutoff.
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();
  const window = zonedDayWindow(now, 1);
  const { results: pending } = await env.cohere
    .prepare(`SELECT * FROM event_rsvps WHERE reminder_sent_at IS NULL ORDER BY event_starts_at`)
    .all<RsvpRow>();

  const live = new Map<string, LiveLookup>();
  for (const row of pending) {
    const key = `${row.event_did}|${row.event_rkey}`;
    if (!live.has(key)) live.set(key, await lookup(env, row.event_did, row.event_rkey));
  }

  const due: (RsvpRow & { live: LiveEvent })[] = [];
  for (const [key, found] of live) {
    const [did, rkey] = key.split("|");
    const rows = pending.filter((r) => r.event_did === did && r.event_rkey === rkey);
    if (found.kind === "gone") {
      result.skippedGone += rows.length;
      continue;
    }
    let event: LiveEvent;
    if (found.kind === "unavailable") {
      // regenOS is down: fall back to the snapshot rather than miss the day.
      const first = rows[0];
      event = {
        did,
        rkey,
        name: first.event_name,
        startsAt: first.event_starts_at,
        endsAt: null,
        status: null,
        where: first.event_where,
      };
    } else {
      event = found.event;
      const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
      const fresh = Number.isNaN(startMs) ? null : new Date(startMs).toISOString();
      if (fresh && (fresh !== rows[0].event_starts_at || event.name !== rows[0].event_name || event.where !== rows[0].event_where)) {
        await env.cohere
          .prepare(
            `UPDATE event_rsvps SET event_name = ?3, event_starts_at = ?4, event_where = ?5
             WHERE event_did = ?1 AND event_rkey = ?2`,
          )
          .bind(did, rkey, event.name, fresh, event.where)
          .run();
      }
      if (fresh) event = { ...event, startsAt: fresh };
    }
    if (event.status === "cancelled") {
      result.skippedCancelled += rows.length;
      continue;
    }
    if (!event.startsAt || event.startsAt < window.start || event.startsAt >= window.end) continue;
    for (const row of rows) due.push({ ...row, live: event });
  }
  // Retain a moved RSVP until the live date has been refreshed. Purge only
  // after inspecting pending rows, not against the stale snapshot at entry.
  const purge = await env.cohere.prepare(`DELETE FROM event_rsvps WHERE event_starts_at < ?1`).bind(cutoff).run();
  result.deleted = purge.meta?.changes ?? 0;
  // Aaron's 2026-10-07 pause: keep retention running, leave claims untouched.
  if (env.RSVP_REMINDERS_PAUSED === "true") {
    console.info("rsvp reminders paused");
    return result;
  }
  result.candidates = due.length;
  if (!due.length) return result;

  // 4. claim
  const claimedAt = now.toISOString();
  const won = new Set<string>();
  for (const ids of chunks(
    due.map((r) => r.id),
    ID_CHUNK,
  )) {
    const { results } = await env.cohere
      .prepare(
        `UPDATE event_rsvps SET reminder_sent_at = ?1
         WHERE reminder_sent_at IS NULL AND id IN (${placeholders(ids.length, 1)})
         RETURNING id`,
      )
      .bind(claimedAt, ...ids)
      .all<{ id: string }>();
    for (const r of results) won.add(r.id);
  }
  result.claimed = won.size;

  // 5. send, one message per address
  const groups = groupReminders(
    due.filter((r) => won.has(r.id)),
    base,
  );
  const release: string[] = [];
  for (const [index, group] of groups.entries()) {
    if (index >= MAX_REMINDER_EMAILS_PER_RUN) {
      result.deferred += 1;
      release.push(...group.ids);
      continue;
    }
    try {
      await send(env, group.email, reminderEmail(group, group.items, base));
      result.emailsSent += 1;
    } catch (error) {
      result.emailsFailed += 1;
      release.push(...group.ids);
      console.error("rsvp reminder email failed:", error instanceof Error ? error.message : error);
    }
  }
  for (const ids of chunks(release, ID_CHUNK)) {
    await env.cohere
      .prepare(
        `UPDATE event_rsvps SET reminder_sent_at = NULL
         WHERE reminder_sent_at = ?1 AND id IN (${placeholders(ids.length, 1)})`,
      )
      .bind(claimedAt, ...ids)
      .run();
  }
  return result;
}
