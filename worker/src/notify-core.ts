// Notifications: the pure rules. No I/O here, so every decision (who gets a
// note, by which channel, whether a phone still counts as reachable, when a
// note is due, whether a link is genuine) is unit-tested without a database.
//
// The four notes:
//   morning   today's practice with its question inside it, then today's events
//   harvest   about an hour after an event you RSVP'd to ends
//   evening   8 PM Boulder: tomorrow's events, with a prompt to RSVP
//   reminder  about an hour before an event you RSVP'd to starts

export const NOTIFY_TYPES = ["morning", "harvest", "evening", "reminder"] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];
export type Channel = "push" | "email";
export type DeviceState = "live" | "suspect" | "expired";

export const TZ = "America/Denver";

export const isNotifyType = (v: unknown): v is NotifyType => typeof v === "string" && (NOTIFY_TYPES as readonly string[]).includes(v);

// ------------------------------------------------------------------ people

/** The settings key: the regenOS DID if there is one, else the verified email. */
export function personKey(input: { did?: string | null; email?: string | null }): string | null {
  if (input.did) return input.did;
  const email = input.email?.trim().toLowerCase();
  return email ? `mailto:${email}` : null;
}

export const emailOfKey = (key: string): string | null => (key.startsWith("mailto:") ? key.slice("mailto:".length) : null);

/** A short stable tag for logs; the address itself is never logged. */
export async function logTag(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return Array.from(digest.slice(0, 5), (b) => b.toString(16).padStart(2, "0")).join("");
}

// -------------------------------------------------------- device health

export const SUSPECT_AFTER_FAILURES = 3;
/** No heartbeat and no accepted push for this long downgrades `live` to `suspect`. */
export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;
/** A push the phone never reported showing, after this long, counts as a soft failure. */
export const UNSHOWN_GRACE_MS = DAY_MS;

export interface DeviceRow {
  device_id: string;
  person_key: string | null;
  installed: number;
  permission: string;
  state: DeviceState;
  fail_count: number;
  last_seen_at: string | null;
  last_sent_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_shown_at: string | null;
  soft_failed_for: string | null;
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const fresh = (iso: string | null | undefined, now: number, days = STALE_DAYS) => {
  const t = ms(iso);
  return !Number.isNaN(t) && now - t <= days * DAY_MS;
};
const denverDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * "Has the app and a live subscription": state live, installed, permission
 * granted, and a heartbeat or an accepted push in the last 14 days.
 */
export function isLive(d: DeviceRow, now: number): boolean {
  return d.state === "live" && d.installed === 1 && d.permission === "granted" && (fresh(d.last_seen_at, now) || fresh(d.last_success_at, now));
}

/** The same, for an anonymous install that has no settings: not installed-gated, only not dead. */
export const isAnonymousReachable = (d: Pick<DeviceRow, "state"> | null): boolean => !d || d.state !== "expired";

export interface SendResult {
  /** The push service's HTTP status, or 0 for a network error or timeout. */
  status: number;
}

/** What a send did to a device. 404/410 expire it at once; the rest count up. */
export function afterSend(d: DeviceRow, result: SendResult, nowIso: string): DeviceRow {
  const next = { ...d, last_sent_at: nowIso };
  if (result.status === 404 || result.status === 410) return { ...next, state: "expired", fail_count: d.fail_count + 1, last_failure_at: nowIso };
  if (result.status >= 200 && result.status < 300) return { ...next, state: "live", fail_count: 0, last_success_at: nowIso };
  return failed(next, nowIso);
}

/** Three failures in a row, or two on different days, make a device suspect. */
function failed(d: DeviceRow, nowIso: string): DeviceRow {
  const fail_count = d.fail_count + 1;
  const otherDay = d.fail_count >= 1 && d.last_failure_at !== null && denverDay(d.last_failure_at) !== denverDay(nowIso);
  const suspect = fail_count >= SUSPECT_AFTER_FAILURES || otherDay;
  return { ...d, fail_count, last_failure_at: nowIso, state: d.state === "expired" ? "expired" : suspect ? "suspect" : d.state };
}

export interface Heartbeat {
  installed: boolean;
  permission: string;
  /** false = the page asked pushManager and there was no subscription. */
  subscribed: boolean;
}

/**
 * An app open. No subscription, or a denied permission, expires the device.
 * Otherwise it is alive again, and a device that was only `suspect` because it
 * went quiet (no failures on record) comes back to `live`; one that is suspect
 * for failed sends stays so until a push actually lands (or the person taps
 * "Turn push back on", which sends one).
 */
export function afterHeartbeat(d: DeviceRow, hb: Heartbeat, nowIso: string): DeviceRow {
  const base = { ...d, installed: hb.installed ? 1 : 0, permission: hb.permission, last_seen_at: nowIso };
  if (!hb.subscribed || hb.permission === "denied") return { ...base, state: "expired" };
  if (d.state === "expired") return base; // only a fresh subscription revives it, see reviveDevice
  if (d.state === "suspect" && d.fail_count === 0) return { ...base, state: "live" };
  return base;
}

/** A new subscription (or a successful "turn it back on" test push). */
export function reviveDevice(d: DeviceRow, nowIso: string): DeviceRow {
  return { ...d, state: "live", fail_count: 0, last_failure_at: null, last_seen_at: nowIso };
}

/** A sent push the phone never reported showing, a day on. Counted once per send. */
export function softFailure(d: DeviceRow, now: number): DeviceRow | null {
  if (!d.last_sent_at || d.soft_failed_for === d.last_sent_at) return null;
  if (now - ms(d.last_sent_at) < UNSHOWN_GRACE_MS) return null;
  const shown = ms(d.last_shown_at);
  if (!Number.isNaN(shown) && shown >= ms(d.last_sent_at) - 1000) return null;
  return { ...failed(d, new Date(now).toISOString()), soft_failed_for: d.last_sent_at };
}

export type PushStatus = "live" | "suspect" | "expired" | "none" | "not-installed";

/** What settings says about the phone you are holding. */
export function pushStatus(devices: DeviceRow[], now: number): PushStatus {
  if (devices.length === 0) return "none";
  if (devices.some((d) => isLive(d, now))) return "live";
  if (devices.every((d) => d.installed !== 1) && devices.some((d) => d.state !== "expired")) return "not-installed";
  if (devices.some((d) => d.state === "suspect" || (d.state === "live" && d.installed === 1))) return "suspect";
  return "expired";
}

// ---------------------------------------------------------- channel choice

export interface Prefs {
  morning_on: number | null;
  harvest_on: number | null;
  evening_on: number | null;
  reminder_on: number | null;
  morning_channel: Channel | null;
  harvest_channel: Channel | null;
  evening_channel: Channel | null;
  reminder_channel: Channel | null;
  /** Comma-separated note types that also go by email when the channel is push ("both"). */
  also_email: string | null;
  email: string | null;
  email_verified_at: string | null;
  email_optin_at: string | null;
}

export const emptyPrefs = (): Prefs => ({
  morning_on: null, harvest_on: null, evening_on: null, reminder_on: null,
  morning_channel: null, harvest_channel: null, evening_channel: null, reminder_channel: null, also_email: null,
  email: null, email_verified_at: null, email_optin_at: null,
});

export interface Reach {
  /** At least one device is live (installed, granted, recent). */
  livePush: boolean;
  /** The person has installed the app on some phone, live or not. */
  hasApp: boolean;
  /** A verified address we may write to, or the address they registered with. */
  email: string | null;
  /** Has a 2026 registration and has not unsubscribed from COhere mail. */
  registered: boolean;
}

/** Does this note also go by email, on top of push? */
export const alsoEmail = (prefs: Pick<Prefs, "also_email">, type: NotifyType): boolean => (prefs.also_email ?? "").split(",").includes(type);

export function withAlsoEmail(prefs: Pick<Prefs, "also_email">, type: NotifyType, on: boolean): string | null {
  const next = new Set((prefs.also_email ?? "").split(",").filter(isNotifyType));
  if (on) next.add(type);
  else next.delete(type);
  return next.size ? NOTIFY_TYPES.filter((t) => next.has(t)).join(",") : null;
}

export type Decision =
  | { action: "push"; fellBack: false }
  | { action: "email"; fellBack: boolean }
  | { action: "both" }
  | { action: "skip"; reason: "off" | "unreachable" | "no-app-no-optin" | "no-live-push" };

/** Is this note on? Explicit settings win; otherwise the defaults from the brief. */
export function isOn(type: NotifyType, prefs: Prefs, reach: Reach): boolean {
  const explicit = prefs[`${type}_on`];
  if (explicit !== null && explicit !== undefined) return explicit === 1;
  // People who installed the app did so for this: all on.
  if (reach.hasApp) return true;
  // Event reminders are an app thing: by email only when asked for (they already get the daily email).
  if (type === "reminder") return false;
  // Registered for 2026: the 8 PM note (tomorrow's events and practice) by email, until they turn it off.
  if (reach.registered && type === "evening") return true;
  // Email-only: the morning note is opt-in; the other two need the one-tap ask.
  if (type === "morning") return false;
  return prefs.email_optin_at !== null;
}

/**
 * Evaluated at send time, per note and per person.
 *  - Push chosen (or the default) and a live phone: push.
 *  - Push chosen but none live: email instead, `fellBack` set when they had the app.
 *  - Email chosen stays email, whatever the app is doing.
 *  - Nowhere to send: skip, and say why.
 * The stored choice is never rewritten; only the effective channel moves.
 */
export function decide(type: NotifyType, prefs: Prefs, reach: Reach): Decision {
  if (!isOn(type, prefs, reach)) return { action: "skip", reason: "off" };
  if (type === "reminder") return decideReminder(prefs, reach);
  const stored = prefs[`${type}_channel`];
  // Someone with the app who never picked a channel is, by default, a push person.
  const wantsPush = stored === "push" || (stored === null && reach.hasApp);
  // Phone and email both: the phone if it is live, and the email either way.
  if (wantsPush && alsoEmail(prefs, type) && reach.email) return reach.livePush ? { action: "both" } : { action: "email", fellBack: reach.hasApp };
  if (wantsPush && reach.livePush) return { action: "push", fellBack: false };
  if (reach.email) return { action: "email", fellBack: wantsPush && reach.hasApp };
  return { action: "skip", reason: "unreachable" };
}

/** Event reminders go to the phone. Email only if the person asked for it, never as a silent fallback. */
function reminderWants(prefs: Prefs, reach: Reach): { phone: boolean; email: boolean } {
  const stored = prefs.reminder_channel;
  const phone = stored === "push" || (stored === null && reach.hasApp);
  // Asking for email: choosing it, phone-and-email, or switching reminders on with no app to send them to.
  const email = stored === "email" || (phone && alsoEmail(prefs, "reminder")) || (stored === null && !reach.hasApp && prefs.reminder_on === 1);
  return { phone, email };
}

function decideReminder(prefs: Prefs, reach: Reach): Decision {
  const want = reminderWants(prefs, reach);
  const push = want.phone && reach.livePush;
  const email = want.email && reach.email !== null;
  if (push && email) return { action: "both" };
  if (push) return { action: "push", fellBack: false };
  if (email) return { action: "email", fellBack: want.phone && reach.hasApp };
  return { action: "skip", reason: want.phone ? "no-live-push" : "unreachable" };
}

/** Which of the two toggles settings shows as pressed, mirroring `decide` without the on/off. */
export function effectiveChannels(type: NotifyType, prefs: Prefs, reach: Reach): { phone: boolean; email: boolean } {
  const on = isOn(type, prefs, reach);
  if (type === "reminder") {
    const want = reminderWants(prefs, reach);
    return { phone: on && want.phone && reach.livePush, email: on && want.email };
  }
  const channel = effectiveChannel(type, prefs, reach);
  return { phone: on && channel === "push", email: on && (channel === "email" || alsoEmail(prefs, type)) };
}

/** The channel settings should show as selected, mirroring `decide` without the on/off. */
export function effectiveChannel(type: NotifyType, prefs: Prefs, reach: Reach): Channel {
  if (type === "reminder") return reminderWants(prefs, reach).phone && reach.livePush ? "push" : "email";
  const chosen: Channel = prefs[`${type}_channel`] ?? (reach.livePush ? "push" : "email");
  return chosen === "push" && !reach.livePush ? "email" : chosen;
}

// ------------------------------------------------------------------- timing

export interface BoulderTime {
  /** YYYY-MM-DD in Boulder. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
}

export function boulderTime(now: Date): BoulderTime {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Boulder clock times the two daily notes go out, and how long a late run may still catch up. */
export const MORNING_AT = 6 * 60;
export const EVENING_AT = 20 * 60;
export const CATCH_UP_MINUTES = 60;
/** The harvest invite goes this long after an event ends, and may be late by up to this much. */
export const HARVEST_DELAY_MS = 60 * 60_000;
export const HARVEST_CATCH_UP_MS = 6 * 60 * 60_000;

export interface Festival {
  start: string;
  end: string;
}

/** The morning note's day (a Boulder date) if `now` is inside its window and the festival, else null. */
export function morningRef(now: Date, festival: Festival): string | null {
  const t = boulderTime(now);
  if (t.minutes < MORNING_AT || t.minutes >= MORNING_AT + CATCH_UP_MINUTES) return null;
  return t.date >= festival.start && t.date <= festival.end ? t.date : null;
}

/**
 * The 8 PM note's day: the evening it is sent. It describes the next day, so it
 * starts the night before the festival opens and skips the last night.
 */
export function eveningRef(now: Date, festival: Festival): string | null {
  const t = boulderTime(now);
  if (t.minutes < EVENING_AT || t.minutes >= EVENING_AT + CATCH_UP_MINUTES) return null;
  return t.date >= addDays(festival.start, -1) && t.date < festival.end ? t.date : null;
}

/** When an event ends: its end, else an hour after it starts. NaN if it has neither. */
export function eventEndMs(event: { startsAt: string | null; endsAt: string | null }): number {
  const end = event.endsAt ? Date.parse(event.endsAt) : NaN;
  if (!Number.isNaN(end)) return end;
  const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
  return Number.isNaN(start) ? NaN : start + 60 * 60_000;
}

/** Is the harvest invite for this event due right now? */
export function harvestDue(event: { startsAt: string | null; endsAt: string | null; status?: string | null }, now: Date): boolean {
  if (event.status === "cancelled") return false;
  const end = eventEndMs(event);
  if (Number.isNaN(end)) return false;
  const at = end + HARVEST_DELAY_MS;
  return now.getTime() >= at && now.getTime() < at + HARVEST_CATCH_UP_MS;
}

/** The event reminder goes this long before an event starts. */
export const REMINDER_LEAD_MS = 60 * 60_000;
/** The cron looks every five minutes, so a reminder may go up to this much early (still "about an hour")... */
export const REMINDER_EARLY_MS = 5 * 60_000;
/** ...or, after a missed tick, this much late. Never once the event has started. */
export const REMINDER_CATCH_UP_MS = 15 * 60_000;
/** No reminder for an event that starts before this Boulder clock time: nobody wants a push at 5 AM. */
export const REMINDER_EARLIEST_START = 7 * 60;

/** Is the reminder for this event due right now? Only for events inside the gathering. */
export function reminderDue(event: { startsAt: string | null; status?: string | null }, now: Date, festival: Festival): boolean {
  if (event.status === "cancelled") return false;
  const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
  if (Number.isNaN(start)) return false;
  const t = boulderTime(new Date(start));
  if (t.minutes < REMINDER_EARLIEST_START || t.date < festival.start || t.date > festival.end) return false;
  const at = start - REMINDER_LEAD_MS;
  return now.getTime() >= at - REMINDER_EARLY_MS && now.getTime() < Math.min(at + REMINDER_CATCH_UP_MS, start);
}

/** An RSVP made less than an hour before the start gets no reminder: they have just decided, they know. */
export function rsvpInTime(rsvpAt: string | null | undefined, startsAt: string): boolean {
  const made = rsvpAt ? Date.parse(rsvpAt) : NaN;
  return !Number.isNaN(made) && made <= Date.parse(startsAt) - REMINDER_LEAD_MS;
}

// -------------------------------------------------------------- signed links

export type LinkKind = "unsub" | "settings" | "optin" | "verify" | "rsvp";

export interface LinkPayload {
  /** person_key */
  p: string;
  k: LinkKind;
  /** note type, for `unsub` ('all' unsubscribes from every note) */
  t?: NotifyType | "all";
  /** expiry, epoch seconds; absent = never */
  x?: number;
  /** email being verified, for `verify` */
  e?: string;
  /** event, for `rsvp` */
  d?: string;
  r?: string;
}

/** Unsubscribe links never expire. The others do. */
export const LINK_TTL_SECONDS: Record<LinkKind, number | null> = {
  unsub: null,
  settings: 30 * 86_400,
  optin: 60 * 86_400,
  verify: 86_400,
  rsvp: 3 * 86_400,
};

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(`cohere-notify-links-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signLink(secret: string, payload: Omit<LinkPayload, "x">, now: Date): Promise<string> {
  const ttl = LINK_TTL_SECONDS[payload.k];
  const body: LinkPayload = ttl === null ? payload : { ...payload, x: Math.floor(now.getTime() / 1000) + ttl };
  const head = b64(enc.encode(JSON.stringify(body)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(head)));
  return `${head}.${b64(sig)}`;
}

/** The payload of a genuine, unexpired link, else null. */
export async function verifyLink(secret: string, token: string, now: Date): Promise<LinkPayload | null> {
  try {
    const [head, sig, extra] = token.split(".");
    if (!head || !sig || extra !== undefined) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), unb64(sig), enc.encode(head));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64(head))) as LinkPayload;
    if (typeof payload.p !== "string" || !payload.p || !(payload.k in LINK_TTL_SECONDS)) return null;
    if (payload.x !== undefined && (typeof payload.x !== "number" || payload.x * 1000 < now.getTime())) return null;
    // A link kind that expires must carry its expiry; stripping it is not a way to get a forever link.
    if (LINK_TTL_SECONDS[payload.k] !== null && payload.x === undefined) return null;
    return payload;
  } catch {
    return null;
  }
}
