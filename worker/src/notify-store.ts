// Notifications: the D1 reads and writes behind the pure rules in notify-core.ts.

import { audienceWhere } from "./newsletter";
import {
  afterSend, emptyPrefs, emailOfKey, isLive, NOTIFY_TYPES, personKey, type Channel, type DeviceRow, type NotifyType, type Prefs, type Reach,
} from "./notify-core";

export interface PrefsRow extends Prefs {
  person_key: string;
  did: string | null;
  locale: "en" | "es";
  fallback_noted_at: string | null;
}

export interface DeviceWithKeys extends DeviceRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string;
}

const lang = (v: unknown): "en" | "es" => (v === "es" ? "es" : "en");

export async function getPrefs(db: D1Database, key: string): Promise<PrefsRow | null> {
  const row = await db.prepare("SELECT * FROM notify_prefs WHERE person_key = ?1").bind(key).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...emptyPrefs(), ...(row as unknown as PrefsRow), locale: lang(row.locale) };
}

/** The stored row, or a blank one for someone who has never touched their settings. */
export async function prefsOrBlank(db: D1Database, key: string): Promise<PrefsRow> {
  return (
    (await getPrefs(db, key)) ?? {
      ...emptyPrefs(), person_key: key, did: key.startsWith("did:") ? key : null, locale: "en", fallback_noted_at: null,
      // An address-keyed person is, by definition, reachable at that address.
      ...(emailOfKey(key) ? { email: emailOfKey(key) } : {}),
    }
  );
}

export async function savePrefs(db: D1Database, p: PrefsRow, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notify_prefs (person_key, did, morning_on, harvest_on, evening_on, morning_channel, harvest_channel, evening_channel,
         email, email_verified_at, email_optin_at, locale, fallback_noted_at, also_email, reminder_on, reminder_channel, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?16, ?17, ?14, ?14)
       ON CONFLICT(person_key) DO UPDATE SET did = ?2, morning_on = ?3, harvest_on = ?4, evening_on = ?5,
         morning_channel = ?6, harvest_channel = ?7, evening_channel = ?8, email = ?9, email_verified_at = ?10,
         email_optin_at = ?11, locale = ?12, fallback_noted_at = ?13, also_email = ?15, reminder_on = ?16, reminder_channel = ?17, updated_at = ?14`,
    )
    .bind(
      p.person_key, p.did, p.morning_on, p.harvest_on, p.evening_on, p.morning_channel, p.harvest_channel, p.evening_channel,
      p.email, p.email_verified_at, p.email_optin_at, p.locale, p.fallback_noted_at, now, p.also_email, p.reminder_on, p.reminder_channel,
    )
    .run();
}

/** A person's phones, with the keys needed to push to them. */
export async function devicesOf(db: D1Database, key: string): Promise<DeviceWithKeys[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, s.endpoint, s.p256dh, s.auth, s.language
         FROM notify_devices d JOIN companion_subscriptions s ON s.device_id = d.device_id
        WHERE d.person_key = ?1 ORDER BY d.device_id`,
    )
    .bind(key)
    .all<DeviceWithKeys>();
  return results;
}

/** Phones the person owns whose subscription is gone still count as "has the app". */
export async function installedDevices(db: D1Database, key: string): Promise<DeviceRow[]> {
  const { results } = await db.prepare("SELECT * FROM notify_devices WHERE person_key = ?1 ORDER BY device_id").bind(key).all<DeviceRow>();
  return results;
}

export async function saveDevice(db: D1Database, d: DeviceRow, now: string): Promise<void> {
  await db
    .prepare(
      `UPDATE notify_devices SET person_key = ?2, installed = ?3, permission = ?4, state = ?5, fail_count = ?6, last_seen_at = ?7,
         last_sent_at = ?8, last_success_at = ?9, last_failure_at = ?10, last_shown_at = ?11, soft_failed_for = ?12, updated_at = ?13
       WHERE device_id = ?1`,
    )
    .bind(
      d.device_id, d.person_key, d.installed, d.permission, d.state, d.fail_count, d.last_seen_at, d.last_sent_at,
      d.last_success_at, d.last_failure_at, d.last_shown_at, d.soft_failed_for, now,
    )
    .run();
}

export async function getDevice(db: D1Database, deviceId: string): Promise<DeviceRow | null> {
  return db.prepare("SELECT * FROM notify_devices WHERE device_id = ?1").bind(deviceId).first<DeviceRow>();
}

/** Event reminders keep their own ledger (migration 0015): notify_ledger's type CHECK predates them. */
export const ledgerOf = (type: NotifyType): string => (type === "reminder" ? "notify_reminder_ledger" : "notify_ledger");
const LEDGERS = ["notify_ledger", "notify_reminder_ledger"] as const;

/** The form whose registrants are notification people by default. */
export const REGISTRATION_FORM = "register-2026";

/**
 * Lowercased addresses with a 2026 registration who may still be written to:
 * subscribed, and not tagged undeliverable (a spam complaint unsubscribes, a hard
 * bounce tags). The same filter the newsletter uses.
 */
export async function registeredEmails(db: D1Database): Promise<Set<string>> {
  const where = audienceWhere({ kind: "form", form: REGISTRATION_FORM });
  const { results } = await db.prepare(`SELECT LOWER(TRIM(p.email)) AS email FROM people p WHERE ${where.sql}`).bind(...where.params).all<{ email: string }>();
  return new Set(results.map((r) => r.email).filter(Boolean));
}

/** The address we would write to for this person, if any: the one they verified, else the one they registered with. */
export function mailAddress(prefs: PrefsRow, registered: Set<string>): string | null {
  const verified = prefs.email && prefs.email_verified_at ? prefs.email.trim().toLowerCase() : null;
  if (verified) return verified;
  const typed = (prefs.email ?? emailOfKey(prefs.person_key))?.trim().toLowerCase();
  return typed && registered.has(typed) ? typed : null;
}

/** The reach used by every decision, from what is on file right now. */
export async function reachOf(db: D1Database, prefs: PrefsRow, now: number, registered: Set<string> | null = null): Promise<Reach> {
  const devices = await installedDevices(db, prefs.person_key);
  // A phone only counts as live if its push subscription is still on file.
  const keyed = new Set((await devicesOf(db, prefs.person_key)).map((d) => d.device_id));
  const list = registered ?? (await registeredEmails(db));
  const address = mailAddress(prefs, list);
  return {
    livePush: devices.some((d) => keyed.has(d.device_id) && isLive(d, now)),
    hasApp: devices.some((d) => d.installed === 1),
    email: address,
    registered: Boolean(address && list.has(address)),
  };
}

/**
 * Fold an address-keyed person into the account that has now verified the same
 * address: the account keeps anything it already set, and picks up the rest.
 * The sends move too, even for a registrant who never saved a setting, so a note
 * already emailed tonight is not pushed again once the phone is linked.
 */
export async function mergeEmailPerson(db: D1Database, did: string, email: string, now: string): Promise<void> {
  const from = personKey({ email });
  if (!from || from === did) return;
  const moveSends = LEDGERS.flatMap((ledger) => [
    db.prepare(`UPDATE OR IGNORE ${ledger} SET person_key = ?1 WHERE person_key = ?2`).bind(did, from),
    db.prepare(`DELETE FROM ${ledger} WHERE person_key = ?1`).bind(from),
  ]);
  const old = await getPrefs(db, from);
  if (!old) {
    await db.batch(moveSends);
    return;
  }
  const into = await prefsOrBlank(db, did);
  const merged: PrefsRow = { ...into, did };
  for (const type of NOTIFY_TYPES) {
    merged[`${type}_on`] = into[`${type}_on`] ?? old[`${type}_on`];
    merged[`${type}_channel`] = (into[`${type}_channel`] ?? old[`${type}_channel`]) as Channel | null;
  }
  merged.also_email = into.also_email ?? old.also_email;
  merged.email_optin_at = into.email_optin_at ?? old.email_optin_at;
  merged.email = into.email ?? email;
  merged.email_verified_at = into.email_verified_at ?? old.email_verified_at ?? now;
  await db.batch([...moveSends, db.prepare("DELETE FROM notify_prefs WHERE person_key = ?1").bind(from)]);
  await savePrefs(db, merged, now);
}

/** Record the outcome of one push. Only touches the device if its subscription is still the one we sent to. */
export async function recordSend(db: D1Database, d: DeviceWithKeys, status: number, now: string): Promise<DeviceRow> {
  const next = afterSend(d, { status }, now);
  const same = "EXISTS (SELECT 1 FROM companion_subscriptions s WHERE s.device_id = notify_devices.device_id AND s.endpoint = ?2 AND s.p256dh = ?3 AND s.auth = ?4)";
  await db
    .prepare(
      `UPDATE notify_devices SET state = ?5, fail_count = ?6, last_sent_at = ?7, last_success_at = ?8, last_failure_at = ?9, updated_at = ?7
        WHERE device_id = ?1 AND ${same}`,
    )
    .bind(d.device_id, d.endpoint, d.p256dh, d.auth, next.state, next.fail_count, next.last_sent_at, next.last_success_at, next.last_failure_at)
    .run();
  if (status === 404 || status === 410) {
    // The push service says it is gone for good: never retry it.
    await db.prepare("DELETE FROM companion_subscriptions WHERE device_id = ?1 AND endpoint = ?2 AND p256dh = ?3 AND auth = ?4").bind(d.device_id, d.endpoint, d.p256dh, d.auth).run();
  }
  return next;
}

export const isNotifyKey = (v: string) => v.startsWith("did:") || v.startsWith("mailto:");

export type { NotifyType };
