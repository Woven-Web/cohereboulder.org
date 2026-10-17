// The four senders, run from the Worker's every-minute cron.
//
//   morning   6:00 AM Boulder   (the hour the practice push has always gone out)
//   evening   8:00 PM Boulder
//   harvest   an hour after an event you RSVP'd to ends
//   reminder  an hour before an event you RSVP'd to starts (push; email only if asked for)
//
// Safety, in order of importance:
//  * NOTIFY_PAUSED must be exactly "false" for anything to go out. Unset, "true",
//    or any other value pauses every sender (the safe direction).
//  * COMPANION_PUSH_PAUSED === "true" additionally stops pushes (not emails).
//  * Nothing goes out before the gathering's launch floor, outside its dates,
//    or for a day with no organizer-written practice (the morning note).
//  * A recipient is claimed in the ledger BEFORE any I/O, so overlapping
//    invocations and retries can never send twice, and one person gets one note
//    per type per day/event, by exactly one channel.
//  * Staging has no email binding: an email send there is logged, never sent.

import { sendMail, type AuthEnv, type MailMessage } from "./auth";
import { companionWindow, denverDate, localMock, pushConfigured, type CompanionEnv } from "./companion";
import { toCommunityEvent, type CommunityEvent, type EventsEnv, type GetEventsRow } from "./events";
import {
  EVENING_AT, MORNING_AT, addDays, boulderTime, decide, emailOfKey, eventEndMs, eveningRef, harvestDue, isLive, logTag, morningRef,
  reminderDue, rsvpInTime, signLink, softFailure, STALE_DAYS, type DeviceRow, type LinkPayload, type NotifyType, type Reach,
} from "./notify-core";
import {
  eveningEmail, eveningPush, harvestEmail, harvestPush, morningEmail, morningPush, reminderEmail, reminderPush, type Daily, type EventLine, type Lang, type MailContext,
} from "./notify-messages";
import {
  devicesOf, ledgerOf, mailAddress, prefsOrBlank, reachOf, recordSend, registeredEmails, saveDevice, savePrefs, type DeviceWithKeys, type PrefsRow,
} from "./notify-store";
import { encryptPush, serializePush, validEndpoint, vapid, type PushPayload } from "./push";
import { confirmedGuestsOrNull } from "./rsvp-visibility";
import type { RosterEnv } from "./roster";

export interface NotifyEnv extends CompanionEnv, AuthEnv, EventsEnv, RosterEnv {
  cohere: D1Database;
  /** Master switch. Only the exact string "false" lets a sender run. */
  NOTIFY_PAUSED?: string;
  /** HMAC key for the /n/<token> links. Falls back to a key derived from the VAPID private key. */
  NOTIFY_LINK_SECRET?: string;
  /** First Boulder date (YYYY-MM-DD) whose 8 PM note goes to registrants by default. Unset = from the start. */
  EMAIL_DEFAULT_FROM?: string;
}

export const notifyPaused = (env: NotifyEnv) => env.NOTIFY_PAUSED !== "false";
const pushPaused = (env: NotifyEnv) => env.COMPANION_PUSH_PAUSED === "true" || !pushConfigured(env);
const hasTransport = (env: NotifyEnv) => Boolean(env.SEND_EMAIL || env.RESEND_API_KEY);

export const linkSecret = (env: { NOTIFY_LINK_SECRET?: string; VAPID_PRIVATE_KEY?: string }): string | null =>
  env.NOTIFY_LINK_SECRET?.trim() || (env.VAPID_PRIVATE_KEY ? `vapid:${env.VAPID_PRIVATE_KEY}` : null);

export const baseUrl = (env: NotifyEnv) => (env.PUBLIC_BASE_URL || "https://cohereboulder.org").replace(/\/+$/, "");

/** Overridable seams, for tests. */
export interface Deps {
  send?: (env: NotifyEnv, to: string, message: MailMessage) => Promise<void>;
  deliver?: typeof deliverPush;
  events?: (env: NotifyEnv) => Promise<CommunityEvent[] | null>;
  /** An event's confirmed account guests; null when regenOS could not be read. */
  guests?: (env: NotifyEnv, event: CommunityEvent) => Promise<Set<string> | null>;
}

const MAX_PER_TICK = 60;
/**
 * Emails per minute-tick. A run longer than this carries on in the next tick (it stays open and the
 * ledger remembers who is done), so ~112 registrants take three ticks of the 8 PM hour, not one burst.
 */
export const MAX_EMAILS_PER_TICK = 40;
/** Resend allows 2 requests a second; with that provider, wait this long between emails. */
const RESEND_GAP_MS = 550;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TTL: Record<NotifyType | "test", number> = { morning: 3 * 3600, harvest: 6 * 3600, evening: 2 * 3600, reminder: 3600, test: 60 };

// ------------------------------------------------------------------- push

/** One encrypted Web Push. Never throws: a network error is status 0. */
export async function deliverPush(env: NotifyEnv, sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload, ttl: number): Promise<{ status: number }> {
  try {
    if (!validEndpoint(sub.endpoint, localMock(env) ?? undefined)) return { status: 0 };
    const body = await encryptPush(serializePush(payload), sub.p256dh, sub.auth);
    const token = await vapid(sub.endpoint, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.VAPID_SUBJECT!);
    const res = await fetch(sub.endpoint, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl) },
      body,
    });
    return { status: res.status };
  } catch {
    return { status: 0 };
  }
}

// ------------------------------------------------------------------ events

const UPSTREAM_TIMEOUT_MS = 8000;

/** The scene's events, past ones included (the public listing drops an event the moment it ends). Anonymous. */
export async function fetchSceneEvents(env: NotifyEnv): Promise<CommunityEvent[] | null> {
  const base = env.REGENOS_BASE_URL?.trim().replace(/\/+$/, "");
  const scene = env.REGENOS_COLLECTIVE_DID?.trim();
  if (!base || !scene) return null;
  try {
    const res = await fetch(`${base}/xrpc/social.scenius.getEvents?${new URLSearchParams({ scene, limit: "200" })}`, {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: GetEventsRow[] };
    return (data.events ?? []).flatMap((row) => {
      const event = toCommunityEvent(row);
      return event && event.status !== "cancelled" ? [event] : [];
    });
  } catch {
    return null;
  }
}

const whereOf = (e: CommunityEvent) => e.location?.name?.trim() || e.location?.street?.trim() || null;
const keyOf = (e: { did: string; rkey: string }) => `${e.did}/${e.rkey}`;
const onDate = (e: CommunityEvent, date: string) => Boolean(e.startsAt) && !Number.isNaN(Date.parse(e.startsAt!)) && denverDate(new Date(e.startsAt!)) === date;
const byStart = (a: CommunityEvent, b: CommunityEvent) => (Date.parse(a.startsAt ?? "") || 0) - (Date.parse(b.startsAt ?? "") || 0);

/** An event of the Boulder day `date` that ended before that evening's 8 PM note goes out. */
function endedBeforeDigest(e: CommunityEvent, date: string): boolean {
  const end = eventEndMs(e);
  if (Number.isNaN(end)) return false;
  const t = boulderTime(new Date(end));
  return t.date === date && t.minutes < EVENING_AT;
}

/** Will the 8 PM note of the event's day carry its "share a harvest" line? (There is no 8 PM note on the last day.) */
function digestCarries(e: CommunityEvent, env: NotifyEnv): boolean {
  const end = eventEndMs(e);
  if (Number.isNaN(end)) return false;
  const day = boulderTime(new Date(end)).date;
  const fest = companionWindow(env);
  return endedBeforeDigest(e, day) && day >= addDays(fest.start, -1) && day < fest.end;
}

/** Harvests shared on a Boulder day, minus the ones a steward hid. A count only; nobody's words. */
async function countHarvestsOn(db: D1Database, date: string): Promise<number> {
  const rows = (await db.prepare(
    `SELECT h.created_at FROM harvests h
      WHERE NOT EXISTS (SELECT 1 FROM board_moderation m WHERE m.uri = 'cohere:harvest/' || h.id AND m.state IN ('hidden', 'removed'))
        AND h.created_at >= ?1 AND h.created_at < ?2`,
  ).bind(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString(), new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86_400_000).toISOString()).all<{ created_at: string }>()).results;
  return rows.filter((r) => boulderTime(new Date(r.created_at)).date === date).length;
}

// ------------------------------------------------------------------- people

interface Person {
  key: string;
  prefs: PrefsRow;
  /** Anonymous installs carry just their one device. */
  anonymous?: DeviceWithKeys;
}

/** Everyone with settings or a phone on file, account people first. */
async function knownPeople(env: NotifyEnv): Promise<Person[]> {
  const db = env.cohere;
  const { results: rows } = await db.prepare("SELECT person_key FROM notify_prefs UNION SELECT person_key FROM notify_devices WHERE person_key IS NOT NULL ORDER BY 1").all<{ person_key: string }>();
  const people: Person[] = [];
  for (const { person_key } of rows) people.push({ key: person_key, prefs: await prefsOrBlank(db, person_key) });
  return people;
}

const addressOf = (p: Person, registered: Set<string>) => mailAddress(p.prefs, registered);

/**
 * One person, one address, one email per note. Known people (settings or a phone on file) come first,
 * account (DID) people ahead of address-keyed ones; then, when `withRegistered`, everyone with a 2026
 * registration who is not already in the list, keyed by their address. The result is a pure function
 * of what is in the database, so it comes out the same on every tick of a run.
 */
async function peopleFor(env: NotifyEnv, registered: Set<string>, withRegistered: boolean): Promise<Person[]> {
  const known = await knownPeople(env);
  const ranked = [...known].sort((a, b) => Number(b.key.startsWith("did:")) - Number(a.key.startsWith("did:")));
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of ranked) {
    const address = addressOf(p, registered) ?? emailOfKey(p.key);
    if (address && seen.has(address)) continue;
    if (address) seen.add(address);
    out.push(p);
  }
  if (withRegistered) {
    for (const email of [...registered].sort()) {
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ key: `mailto:${email}`, prefs: await prefsOrBlank(env.cohere, `mailto:${email}`) });
    }
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Installs with no account: they only ever get the morning note, and have no settings. */
async function anonymousDevices(env: NotifyEnv): Promise<DeviceWithKeys[]> {
  const { results } = await env.cohere
    .prepare(
      `SELECT s.device_id, s.endpoint, s.p256dh, s.auth, s.language, COALESCE(d.state, 'live') AS state,
              COALESCE(d.installed, 0) AS installed, COALESCE(d.permission, 'granted') AS permission, COALESCE(d.fail_count, 0) AS fail_count,
              d.person_key AS person_key, d.last_seen_at, d.last_sent_at, d.last_success_at, d.last_failure_at, d.last_shown_at, d.soft_failed_for
         FROM companion_subscriptions s LEFT JOIN notify_devices d ON d.device_id = s.device_id
        WHERE d.person_key IS NULL AND COALESCE(d.state, 'live') != 'expired' ORDER BY s.device_id`,
    )
    .all<DeviceWithKeys>();
  return results;
}

// ----------------------------------------------------------------- the run

export interface RunResult {
  paused?: boolean;
  runs: string[];
  sent: number;
  skipped: number;
}

interface Ctx {
  env: NotifyEnv;
  now: Date;
  deps: Deps;
  secret: string | null;
  mock: boolean;
  sent: number;
  skipped: number;
  /** Emails and pushes sent in this tick, for the per-tick email cap and the log. */
  emails: number;
  pushes: number;
  /** Addresses with a 2026 registration who may be written to, read once per tick. */
  registered: Set<string>;
}

const stale = (c: Ctx) => !c.mock && Date.now() - c.now.getTime() > 10 * 60_000;

export async function runNotifyCron(env: NotifyEnv, now: Date, deps: Deps = {}): Promise<RunResult> {
  const result: RunResult = { runs: [], sent: 0, skipped: 0 };
  if (notifyPaused(env)) return { ...result, paused: true };
  const fest = companionWindow(env);
  const ctx: Ctx = { env, now, deps, secret: linkSecret(env), mock: Boolean(localMock(env)), sent: 0, skipped: 0, emails: 0, pushes: 0, registered: new Set() };
  if (stale(ctx)) return result;
  const db = env.cohere;

  const t = boulderTime(now);
  if (t.minutes === MORNING_AT - 5 && t.date >= fest.start) await sweepDevices(env, now);

  const due: { type: NotifyType; ref: string }[] = [];
  const morning = morningRef(now, fest);
  if (morning) due.push({ type: "morning", ref: morning });
  const evening = eveningRef(now, fest);
  if (evening) due.push({ type: "evening", ref: evening });

  // Harvest invites and event reminders depend on when events end and start, so look
  // every five minutes (and always while a run is unfinished) rather than every tick.
  const open = (await db.prepare("SELECT type, ref FROM notify_runs WHERE completed_at IS NULL AND started_at > ?1").bind(new Date(now.getTime() - 12 * 3600_000).toISOString()).all<{ type: NotifyType; ref: string }>()).results;
  for (const run of open) if (!due.some((d) => d.type === run.type && d.ref === run.ref)) due.push(run);
  const lookForHarvest = now.getUTCMinutes() % 5 === 0 && denverDate(now) >= fest.start && denverDate(now) <= addDays(fest.end, 1);

  let events: CommunityEvent[] | null | undefined;
  const loadEvents = async () => (events === undefined ? (events = await (deps.events ?? fetchSceneEvents)(env)) : events);

  if (lookForHarvest) {
    for (const event of (await loadEvents()) ?? []) {
      if (harvestDue(event, now) && !due.some((d) => d.type === "harvest" && d.ref === keyOf(event))) due.push({ type: "harvest", ref: keyOf(event) });
      if (reminderDue(event, now, fest) && !due.some((d) => d.type === "reminder" && d.ref === keyOf(event))) due.push({ type: "reminder", ref: keyOf(event) });
    }
  }

  for (const { type, ref } of due) {
    if (ctx.sent + ctx.skipped >= MAX_PER_TICK) break;
    try {
      const done = await processRun(ctx, type, ref, loadEvents);
      if (done !== null) result.runs.push(`${type}:${ref}`);
    } catch (error) {
      console.error(`notify ${type} run failed:`, error instanceof Error ? error.message : error);
    }
  }
  if (ctx.sent + ctx.skipped > 0) console.info(`notify tick ${now.toISOString()}: ${ctx.emails} email, ${ctx.pushes} push, ${ctx.skipped} skipped`);
  return { ...result, sent: ctx.sent, skipped: ctx.skipped };
}

/** Returns null if there was nothing to do (already complete, or no content). */
async function processRun(ctx: Ctx, type: NotifyType, ref: string, loadEvents: () => Promise<CommunityEvent[] | null>): Promise<true | null> {
  const { env, now } = ctx;
  const db = env.cohere;
  const existing = await db.prepare("SELECT completed_at FROM notify_runs WHERE type = ?1 AND ref = ?2").bind(type, ref).first<{ completed_at: string | null }>();
  if (existing?.completed_at) return null;

  // Everything the note needs, or null (and nothing is claimed) when there is nothing to say.
  const content = await buildContent(ctx, type, ref, loadEvents);
  if (!content) return null;

  await db.prepare("INSERT OR IGNORE INTO notify_runs (type, ref, started_at) VALUES (?1, ?2, ?3)").bind(type, ref, now.toISOString()).run();

  ctx.registered = await registeredEmails(db);
  const claimed = new Set(
    (await db.prepare(`SELECT person_key FROM ${ledgerOf(type)} WHERE type = ?1 AND ref = ?2`).bind(type, ref).all<{ person_key: string }>()).results.map((r) => r.person_key),
  );
  // One address, one note per run: an address already claimed under another key (an account that
  // verified it after an earlier tick wrote to it as mailto:) is not written to again.
  const claimedAddresses = new Set<string>();
  for (const key of claimed) {
    const address = key.startsWith("did:") ? mailAddress(await prefsOrBlank(db, key), ctx.registered) : emailOfKey(key);
    if (address) claimedAddresses.add(address);
  }
  const recipients = await content.recipients();
  let budget = MAX_PER_TICK - ctx.sent - ctx.skipped;
  for (const r of recipients) {
    if (claimed.has(r.key)) continue;
    const address = r.person ? addressOf(r.person, ctx.registered) ?? emailOfKey(r.key) : null;
    if (address && claimedAddresses.has(address)) continue;
    if (address) claimedAddresses.add(address);
    if (budget-- <= 0 || stale(ctx)) return true;
    if (ctx.emails >= MAX_EMAILS_PER_TICK) {
      console.info(`notify ${type} ${ref}: email cap for this tick (${MAX_EMAILS_PER_TICK}) reached, the rest go next minute`);
      return true;
    }
    if (!(await content.stillWanted())) return true; // the day's content was withdrawn mid-run
    await handleRecipient(ctx, type, ref, r, content);
  }
  await db.prepare("UPDATE notify_runs SET completed_at = ?3 WHERE type = ?1 AND ref = ?2").bind(type, ref, now.toISOString()).run();
  const totals = (await db.prepare(`SELECT COALESCE(channel, '-') AS channel, status, COUNT(*) AS n FROM ${ledgerOf(type)} WHERE type = ?1 AND ref = ?2 GROUP BY 1, 2`).bind(type, ref).all<{ channel: string; status: string; n: number }>()).results;
  console.info(`notify ${type} ${ref} done: ${totals.map((t) => `${t.n} ${t.status}/${t.channel}`).join(", ") || "nobody"}`);
  return true;
}

interface Recipient {
  key: string;
  person?: Person;
  anonymous?: DeviceWithKeys;
}

interface Content {
  /** The events the note is about (tomorrow's, for the 8 PM note), for one-tap RSVP links. */
  events: CommunityEvent[];
  rsvpLinks: boolean;
  recipients(): Promise<Recipient[]>;
  /** False once the organizers delete the day's practice mid-run. */
  stillWanted(): Promise<boolean>;
  /** Which of `events` this person RSVP'd to ("did/rkey" keys). */
  goingOf(key: string): Promise<Set<string>>;
  push(lang: Lang, deviceId: string, going: Set<string>): PushPayload;
  /** False when a push would have nothing to say (the 8 PM push needs an event tomorrow). */
  pushable?: boolean;
  /** The 8 PM digest: today's ended events this person went to and has not shared a harvest for. */
  toShare?(key: string): Promise<EventLine[]>;
  /** Nothing in the email for this person (no event, no practice, nothing to share). */
  emptyFor?(share: EventLine[]): boolean;
  /** Harvest invitations only: the 8 PM digest already carries this event, for people who get it by email. */
  inDigest?: boolean;
  /** How long a push may wait at the push service, if not the type's usual TTL (a reminder must not land after the start). */
  pushTtl?: number;
  email(mc: MailContext, going: Set<string>, rsvpLink: (e: EventLine) => string, share: EventLine[]): MailMessage;
}

async function buildContent(ctx: Ctx, type: NotifyType, ref: string, loadEvents: () => Promise<CommunityEvent[] | null>): Promise<Content | null> {
  const { env, deps } = ctx;
  const db = env.cohere;
  // Per-run memory: each event's confirmed guests, and each event's email RSVPs, are read once.
  const guestCache = new Map<string, Promise<Set<string> | null>>();
  const guestsOrNull = (e: CommunityEvent) => {
    if (!guestCache.has(keyOf(e))) guestCache.set(keyOf(e), (deps.guests ?? confirmedGuestsOrNull)(env, e));
    return guestCache.get(keyOf(e))!;
  };
  const guests = async (e: CommunityEvent) => (await guestsOrNull(e)) ?? new Set<string>();
  const rsvpCache = new Map<string, Promise<Set<string>>>();
  const emailGuests = (e: CommunityEvent) => {
    if (!rsvpCache.has(keyOf(e))) {
      rsvpCache.set(
        keyOf(e),
        db.prepare("SELECT email FROM event_rsvps WHERE event_did = ?1 AND event_rkey = ?2").bind(e.did, e.rkey).all<{ email: string }>()
          .then((r) => new Set(r.results.map((x) => `mailto:${x.email}`))),
      );
    }
    return rsvpCache.get(keyOf(e))!;
  };
  /** The account (DID) or address (mailto:) is on the guest list of each of these events. */
  const goingFor = async (key: string, events: CommunityEvent[]) => {
    const going = new Set<string>();
    for (const e of events) {
      const here = key.startsWith("did:") ? await guests(e) : await emailGuests(e);
      if (here.has(key)) going.add(keyOf(e));
    }
    return going;
  };
  const lines = (events: CommunityEvent[], going: Set<string>): EventLine[] =>
    events.map((e) => ({ did: e.did, rkey: e.rkey, name: e.name, startsAt: e.startsAt, endsAt: e.endsAt, where: whereOf(e), description: e.description, going: going.has(keyOf(e)) }));
  const people = async (withRegistered = false): Promise<Recipient[]> =>
    (await peopleFor(env, await registeredEmails(db), withRegistered)).map((p) => ({ key: p.key, person: p }));

  if (type === "morning") {
    const daily = await db.prepare("SELECT * FROM companion_daily WHERE date = ?1").bind(ref).first<Daily>();
    if (!daily?.title) return null; // no organizer-written practice: nothing goes out
    const events = ((await loadEvents()) ?? []).filter((e) => onDate(e, ref)).sort(byStart);
    return {
      events, rsvpLinks: false,
      stillWanted: async () => Boolean(await db.prepare("SELECT 1 FROM companion_daily WHERE date = ?1").bind(ref).first()),
      async recipients() {
        const out = await people();
        for (const d of await anonymousDevices(env)) out.push({ key: `device:${d.device_id}`, anonymous: d });
        return out;
      },
      goingOf: (key) => goingFor(key, events),
      push: (lang, deviceId, going) => morningPush({ date: ref, daily, events: lines(events, going), lang }, deviceId),
      email: (mc, going) => morningEmail({ date: ref, daily, events: lines(events, going), lang: mc.lang }, mc),
    };
  }

  if (type === "evening") {
    const tomorrow = addDays(ref, 1);
    const all = (await loadEvents()) ?? [];
    const events = all.filter((e) => onDate(e, tomorrow)).sort(byStart);
    const daily = await db.prepare("SELECT * FROM companion_daily WHERE date = ?1").bind(tomorrow).first<Daily>();
    // Today's events that ended before this note goes out: a harvest to share, per person.
    const ended = all.filter((e) => endedBeforeDigest(e, ref)).sort(byStart);
    if (events.length === 0 && !daily?.title && ended.length === 0) return null;
    const harvestsToday = await countHarvestsOn(db, ref);
    return {
      events, rsvpLinks: true, pushable: events.length > 0,
      stillWanted: async () => true,
      // Account people, anyone who opted in by email, and everyone registered for 2026. Anonymous installs have no settings and no RSVPs: no 8 PM note.
      recipients: () => people(ref >= (env.EMAIL_DEFAULT_FROM ?? "")),
      goingOf: (key) => goingFor(key, events),
      async toShare(key) {
        const went = await goingFor(key, ended);
        if (went.size === 0) return [];
        const shared = key.startsWith("did:")
          ? new Set((await db.prepare("SELECT event_did, event_rkey FROM harvests WHERE author_did = ?1").bind(key).all<{ event_did: string; event_rkey: string }>()).results.map((r) => `${r.event_did}/${r.event_rkey}`))
          : new Set<string>();
        return lines(ended.filter((e) => went.has(keyOf(e)) && !shared.has(keyOf(e))), new Set());
      },
      emptyFor: (share) => events.length === 0 && !daily?.title && share.length === 0,
      push: (lang, deviceId, going) => eveningPush({ date: tomorrow, events: lines(events, going), lang }, deviceId),
      email: (mc, going, rsvpLink, share) => eveningEmail({ date: tomorrow, events: lines(events, going), daily, toShare: share, harvestsToday, lang: mc.lang }, mc, rsvpLink),
    };
  }

  // harvest and reminder: ref is "<did>/<rkey>"; only people who RSVP'd to that event.
  const event = ((await loadEvents()) ?? []).find((e) => keyOf(e) === ref);
  if (!event) return null;
  const info = { did: event.did, rkey: event.rkey, name: event.name, where: whereOf(event) };

  if (type === "reminder") {
    const start = Date.parse(event.startsAt ?? "");
    // Once the event has started (or if it lost its time) the run closes with nobody left to remind.
    const live = !Number.isNaN(start) && ctx.now.getTime() < start;
    const reminder = { ...info, startsAt: event.startsAt };
    return {
      events: [event], rsvpLinks: false,
      pushTtl: live ? Math.max(60, Math.floor((start - ctx.now.getTime()) / 1000)) : 60,
      stillWanted: async () => true,
      async recipients() {
        if (!live) return [];
        // An email RSVP made less than an hour before the start is not reminded. regenOS gives no RSVP time for
        // account RSVPs, so for those the guest list read at the hour mark (the run starts 60–65 min out) is the cut.
        const [accounts, rows] = await Promise.all([
          guestsOrNull(event),
          db.prepare("SELECT email, created_at FROM event_rsvps WHERE event_did = ?1 AND event_rkey = ?2").bind(event.did, event.rkey).all<{ email: string; created_at: string }>(),
        ]);
        // A failed read is not "nobody RSVP'd": throw, so the run stays open and the next tick tries again (until the start).
        if (!accounts) throw new Error("regenOS guest list unreachable");
        const early = new Set(rows.results.filter((r) => rsvpInTime(r.created_at, event.startsAt!)).map((r) => `mailto:${r.email}`));
        return (await people()).filter((r) => accounts.has(r.key) || early.has(r.key));
      },
      goingOf: async () => new Set([ref]),
      push: (lang, deviceId) => reminderPush({ event: reminder, lang }, deviceId),
      email: (mc) => reminderEmail({ event: reminder, lang: mc.lang }, mc),
    };
  }

  return {
    events: [event], rsvpLinks: false, inDigest: digestCarries(event, env),
    stillWanted: async () => true,
    async recipients() {
      const [accounts, addresses] = await Promise.all([guests(event), emailGuests(event)]);
      return (await people()).filter((r) => accounts.has(r.key) || addresses.has(r.key));
    },
    goingOf: async () => new Set([ref]),
    push: (lang, deviceId) => harvestPush({ event: info, lang }, deviceId),
    email: (mc) => harvestEmail({ event: info, lang: mc.lang }, mc),
  };
}

// --------------------------------------------------------------- recipients

async function handleRecipient(ctx: Ctx, type: NotifyType, ref: string, r: Recipient, content: Content): Promise<void> {
  const { env, now } = ctx;
  const db = env.cohere;
  const nowIso = now.toISOString();
  // Claim before any I/O. Whoever inserts the row owns this send; nobody retries it.
  const claim = await db.prepare(`INSERT OR IGNORE INTO ${ledgerOf(type)} (type, ref, person_key, claimed_at) VALUES (?1, ?2, ?3, ?4)`).bind(type, ref, r.key, nowIso).run();
  if (!claim.meta.changes) return;
  const settle: Settle = async (status, channel, fellBack, reason) => {
    await db.prepare(`UPDATE ${ledgerOf(type)} SET status = ?4, channel = ?5, fell_back = ?6, reason = ?7 WHERE type = ?1 AND ref = ?2 AND person_key = ?3`).bind(type, ref, r.key, status, channel, fellBack ? 1 : 0, reason).run();
    if (status === "sent") ctx.sent++;
    else ctx.skipped++;
  };

  // An anonymous install: a push to that one phone, morning only.
  if (r.anonymous) {
    if (pushPaused(env)) return settle("skipped", null, false, "push-paused");
    const ok = await sendPushTo(ctx, r.anonymous, type, content.push(r.anonymous.language === "es" ? "es" : "en", r.anonymous.device_id, new Set()));
    return settle(ok ? "sent" : "failed", "push", false, ok ? null : "push-failed");
  }

  const prefs = r.person!.prefs;
  const reach: Reach = await reachOf(db, prefs, now.getTime(), ctx.registered);
  const decision = decide(type, prefs, reach);
  if (decision.action === "skip") {
    if (decision.reason === "unreachable") console.info(`notify ${type}: nothing can reach ${await logTag(r.key)}`);
    return settle("skipped", null, false, decision.reason);
  }

  const lang: Lang = prefs.locale;
  const going = await content.goingOf(r.key);
  const share = content.toShare ? await content.toShare(r.key) : [];
  const canPush = content.pushable !== false;
  // A harvest invitation for an event the 8 PM note already carries is not also emailed to someone who gets that note by email.
  let digestEmail = false;
  if (content.inDigest) {
    const evening = decide("evening", prefs, reach);
    digestEmail = evening.action === "email" || evening.action === "both";
  }

  if (decision.action === "both") {
    // Phone and email, as chosen: a push to every live phone, then the email. The email goes whatever the push did.
    let pushed = false;
    if (!pushPaused(env) && canPush) {
      for (const d of (await devicesOf(db, prefs.person_key)).filter((x) => isLive(x, now.getTime()))) {
        pushed = (await sendPushTo(ctx, d, type, content.push(d.language === "es" ? "es" : lang, d.device_id, going), content.pushTtl)) || pushed;
      }
    }
    if (digestEmail) return settle(pushed ? "sent" : "skipped", pushed ? "push" : null, false, pushed ? null : "in-digest");
    return emailTo(ctx, type, prefs, reach.email!, lang, going, content, false, settle, share, pushed ? "push+email" : "email");
  }

  if (decision.action === "push") {
    if (pushPaused(env)) return settle("skipped", null, false, "push-paused");
    if (!canPush) return settle("skipped", null, false, "nothing-to-say");
    const devices = (await devicesOf(db, prefs.person_key)).filter((d) => isLive(d, now.getTime()));
    let delivered = false;
    for (const d of devices) delivered = (await sendPushTo(ctx, d, type, content.push(d.language === "es" ? "es" : lang, d.device_id, going), content.pushTtl)) || delivered;
    if (delivered) {
      // Push is working again: forget that we ever said it stopped.
      if (prefs.fallback_noted_at) await savePrefs(db, { ...prefs, fallback_noted_at: null }, nowIso);
      return settle("sent", "push", false, null);
    }
    // Every live phone refused. If there is an address, the note goes there instead: once, never both.
    // Not a reminder, though: those go by email only to people who asked for email.
    if (type === "reminder") return settle("failed", "push", false, "push-failed");
    if (reach.email && digestEmail) return settle("skipped", null, false, "in-digest");
    if (reach.email) return emailTo(ctx, type, prefs, reach.email, lang, going, content, true, settle, share);
    return settle("failed", "push", false, "push-failed-no-email");
  }
  if (digestEmail) return settle("skipped", null, false, "in-digest");
  return emailTo(ctx, type, prefs, reach.email!, lang, going, content, decision.fellBack, settle, share);
}

type Settle = (status: "sent" | "skipped" | "failed", channel: "push" | "email" | "push+email" | null, fellBack: boolean, reason: string | null) => Promise<void>;

async function sendPushTo(ctx: Ctx, device: DeviceWithKeys, type: NotifyType, payload: PushPayload, ttl = TTL[type]): Promise<boolean> {
  const { status } = await (ctx.deps.deliver ?? deliverPush)(ctx.env, device, payload, ttl);
  if (status >= 200 && status < 300) ctx.pushes++;
  await recordSend(ctx.env.cohere, device, status, ctx.now.toISOString());
  return status >= 200 && status < 300;
}

async function emailTo(ctx: Ctx, type: NotifyType, prefs: PrefsRow, to: string, lang: Lang, going: Set<string>, content: Content, fellBack: boolean, settle: Settle, share: EventLine[], channel: "email" | "push+email" = "email"): Promise<void> {
  const { env, now } = ctx;
  if (content.emptyFor?.(share)) return settle("skipped", null, false, "nothing-to-say");
  if (!ctx.secret) return settle("skipped", null, false, "no-link-secret"); // an email without an unsubscribe link is never sent
  const base = baseUrl(env);
  const link = async (payload: Omit<LinkPayload, "x">) => `${base}/n/${await signLink(ctx.secret!, payload, now)}`;
  // The first fallback after being live says so, once; settings shows it until push is live again.
  const first = fellBack && !prefs.fallback_noted_at;
  // "Change your settings" is a signed link: most registrants have no account, so it opens their email settings with no sign-in.
  // "Turn push back on" needs the phone, so that one still goes to Me → notifications. The unsubscribe link stays one tap.
  const settingsUrl = await link({ p: prefs.person_key, k: "settings" });
  const mc: MailContext = { lang, to, base, settingsUrl, pushSettingsUrl: `${base}/more/notifications`, unsubUrl: await link({ p: prefs.person_key, k: "unsub", t: type }), fellBack: first };
  // 8 PM: an address-keyed person has no session, so each event's RSVP link is pre-signed for them.
  const rsvp = new Map<string, string>();
  if (content.rsvpLinks && prefs.person_key.startsWith("mailto:")) {
    for (const e of content.events) rsvp.set(keyOf(e), await link({ p: prefs.person_key, k: "rsvp", d: e.did, r: e.rkey }));
  }
  const message = content.email(mc, going, (e) => rsvp.get(keyOf(e)) ?? `${base}/events/${encodeURIComponent(e.did)}/${encodeURIComponent(e.rkey)}`, share);
  try {
    if (ctx.deps.send || hasTransport(env)) {
      await (ctx.deps.send ?? sendMail)(env, to, message);
      ctx.emails++;
      if (!ctx.deps.send && !env.SEND_EMAIL && !ctx.mock) await sleep(RESEND_GAP_MS);
    } else {
      // Staging has no mail binding: say so, send nothing.
      console.info(`notify ${type} email (no transport, not sent): ${await logTag(prefs.person_key)}`);
      return settle("skipped", "email", fellBack, "no-transport");
    }
  } catch (error) {
    console.error(`notify ${type} email failed:`, error instanceof Error ? error.message : error);
    return settle("failed", "email", fellBack, "email-failed");
  }
  if (first) await savePrefs(env.cohere, { ...prefs, fallback_noted_at: now.toISOString() }, now.toISOString());
  return settle("sent", channel, fellBack, null);
}

// ------------------------------------------------------- the RSVP reminder

/**
 * Of these addresses, the ones tonight's 8 PM note will reach by email. The RSVP cron's
 * day-before reminder skips them: tonight's note lists tomorrow's events with their RSVP marked.
 * Mirrors the evening run's own checks (switch, dates, link secret, who, decide), not its content.
 */
export async function eveningEmailTonight(env: NotifyEnv, now: Date, addresses: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (addresses.length === 0 || notifyPaused(env) || !linkSecret(env)) return out;
  const tonight = boulderTime(now).date;
  const fest = companionWindow(env);
  if (tonight < addDays(fest.start, -1) || tonight >= fest.end) return out;
  const registered = await registeredEmails(env.cohere);
  const wanted = new Set(addresses.map((a) => a.trim().toLowerCase()));
  for (const p of await peopleFor(env, registered, tonight >= (env.EMAIL_DEFAULT_FROM ?? ""))) {
    // Only address-keyed people: the 8 PM note marks an email RSVP for them, not for an account (it reads regenOS's guest list).
    if (!p.key.startsWith("mailto:")) continue;
    const address = addressOf(p, registered) ?? emailOfKey(p.key);
    if (!address || !wanted.has(address)) continue;
    const decision = decide("evening", p.prefs, await reachOf(env.cohere, p.prefs, now.getTime(), registered));
    if (decision.action === "email" || decision.action === "both") out.add(address);
  }
  return out;
}

// ------------------------------------------------------------------ sweeps

/**
 * Once a day, before the morning note: a phone that has been quiet 14 days
 * stops counting as live, and a push the phone never reported showing (a day
 * on) counts once as a soft failure.
 */
export async function sweepDevices(env: NotifyEnv, now: Date): Promise<void> {
  const db = env.cohere;
  const { results } = await db.prepare("SELECT * FROM notify_devices WHERE state != 'expired'").all<DeviceRow>();
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000;
  for (const d of results) {
    let next: DeviceRow = d;
    const soft = softFailure(next, now.getTime());
    if (soft) next = soft;
    const seen = Math.max(Date.parse(d.last_seen_at ?? "") || 0, Date.parse(d.last_success_at ?? "") || 0);
    if (next.state === "live" && seen < cutoff) next = { ...next, state: "suspect" };
    if (next !== d) await saveDevice(db, next, now.toISOString());
  }
}

