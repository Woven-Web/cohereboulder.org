// Notifications from the app's side: the settings API, the signed email links,
// and keeping the Worker informed about this phone (installed? subscribed?).
// Every call goes to the Worker's /api/notify (worker/src/notify.ts).

import { API_BASE } from "@/lib/api";
import { anonymousDevice, localGet, localSet } from "@/lib/companion";
import { getInstallState } from "@/lib/install";

/** In the order settings lists them: through the day. */
export const NOTIFY_TYPES = ["morning", "reminder", "harvest", "evening"] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];
export type Channel = "push" | "email";
export type PushStatus = "live" | "suspect" | "expired" | "none" | "not-installed";

export interface NoteView {
  on: boolean;
  channel: Channel;
  chosen: Channel | null;
  pushAvailable: boolean;
  /** The two toggles: does it go to the phone, does it go by email. */
  phone: boolean;
  email: boolean;
}

export interface SettingsView {
  email: { address: string | null; verified: boolean; registered: boolean };
  push: {
    status: PushStatus;
    installed: boolean;
    devices: number;
    lastDeliveredAt: string | null;
    failedSince: number;
    thisDevice: { status: PushStatus; installed: boolean } | null;
  };
  pushBroke: boolean;
  nothingReaches: boolean;
  notes: Record<NotifyType, NoteView>;
  locale: "en" | "es";
}

export type SettingsPatch = Partial<Record<NotifyType, { on?: boolean; channel?: Channel | null; channels?: { phone: boolean; email: boolean } }>> & { language?: "en" | "es" };

/** Does anything reach this person? A note that is on, and a phone or an address for it to go to. */
export const receivesNothing = (view: SettingsView): boolean =>
  view.nothingReaches || NOTIFY_TYPES.every((type) => !view.notes[type]?.on);

/** Notes that went to the phone by default (no choice made) and not by email too. */
const phoneOnly = (view: SettingsView): NotifyType[] =>
  NOTIFY_TYPES.filter((type) => { const n = view.notes[type]; return n?.on && n.phone && !n.email && n.chosen === null; });

/**
 * "Now on your phone. Want email too?": shown once the phone is live and has taken over
 * notes by default, while there is an address we may write to. Gone after any choice.
 */
export const offerEmailToo = (view: SettingsView): boolean =>
  view.push.status === "live" && Boolean(view.email.address) && view.email.verified && phoneOnly(view).length > 0;

/** The one tap: each of those notes keeps the phone and adds email. */
export const addEmailPatch = (view: SettingsView): SettingsPatch =>
  Object.fromEntries(phoneOnly(view).map((type) => [type, { channels: { phone: true, email: true } }]));

export class NotifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new NotifyError(res.status, data?.error ?? `notify answered ${res.status}`);
  return data as T;
}

// ------------------------------------------------------------ signed in

export const NOTIFY_SETTINGS_KEY = ["notify-settings"] as const;

/** `device` makes the Worker also say how THIS phone is doing. */
export const fetchSettings = (device?: string) => call<SettingsView>(`/api/notify/settings${device ? `?device=${encodeURIComponent(device)}` : ""}`);
export const saveSettings = (patch: SettingsPatch, device?: string) => call<SettingsView>(`/api/notify/settings${device ? `?device=${encodeURIComponent(device)}` : ""}`, "PUT", patch);
export const addEmail = (email: string, language: string) => call<{ ok: true; delivered: boolean }>("/api/notify/email", "POST", { email, language });

// ----------------------------------------------------- emailed links

export type LinkKind = "unsub" | "settings" | "optin" | "verify" | "rsvp";

export interface LinkInfo {
  kind: LinkKind;
  type: NotifyType | "all" | null;
  email: string | null;
  locale: "en" | "es";
  view?: SettingsView;
  event?: { name: string; startsAt: string | null; where: string | null; did?: string; rkey?: string } | null;
}

export const fetchLink = (token: string) => call<LinkInfo>(`/api/notify/link/${encodeURIComponent(token)}`);
export const linkAction = <T = { ok: true }>(token: string, action: string, body: unknown = {}, method = "POST") =>
  call<T>(`/api/notify/link/${encodeURIComponent(token)}/${action}`, method, body);

// --------------------------------------------------------------- this phone

export const isInstalled = () => getInstallState().installed;

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function currentSubscription(): Promise<Subscription | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    const json = sub?.toJSON();
    return json?.endpoint && json.keys?.p256dh && json.keys.auth ? { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth } : null;
  } catch {
    return null;
  }
}

const permission = () => (typeof Notification === "undefined" ? "default" : Notification.permission);

/** The proof a request carries that it comes from this phone: the subscription's own secrets. */
async function proof(language: string) {
  const sub = await currentSubscription();
  if (sub) localSet(ENDPOINT_KEY, sub.endpoint);
  return sub ? { device_id: anonymousDevice(), ...sub, installed: isInstalled(), permission: permission(), language } : null;
}

const SYNC_KEY = "cohere-notify-synced";
const ENDPOINT_KEY = "cohere-notify-endpoint";
const SYNC_EVERY_MS = 10 * 60_000;

/**
 * Tell the Worker how this phone is doing, on app open: still subscribed,
 * installed, permission. Signed in, it also says whose phone this is. A
 * browser that had notifications on but lost its subscription quietly
 * re-subscribes when permission is still granted (no tap needed).
 * Failures are silent and retried next time.
 */
export async function syncDevice(opts: { signedIn: boolean; language: string; pushKey?: string | null; force?: boolean }): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const last = Number(localGet(SYNC_KEY) ?? 0);
  if (!opts.force && Date.now() - last < SYNC_EVERY_MS) return;
  localSet(SYNC_KEY, String(Date.now()));
  try {
    let body = await proof(opts.language);
    const hadPush = localGet("cohere-push-off") === "false";
    if (!body && hadPush && permission() === "granted" && opts.pushKey) {
      body = await resubscribe(opts.pushKey, opts.language);
    }
    if (!body) {
      // Only worth saying if this phone ever had notifications on.
      // The last endpoint this phone held is its proof: without it the Worker ignores the report.
      const endpoint = localGet(ENDPOINT_KEY);
      if (hadPush && endpoint) await call("/api/notify/heartbeat", "POST", { device_id: anonymousDevice(), endpoint, installed: isInstalled(), permission: permission(), subscribed: false });
      return;
    }
    await call("/api/notify/heartbeat", "POST", { ...body, subscribed: true });
    if (opts.signedIn) await call("/api/notify/device", "POST", body);
  } catch {
    localSet(SYNC_KEY, "0");
  }
}

async function resubscribe(pushKey: string, language: string) {
  const key = Uint8Array.from(atob(pushKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  const res = await fetch(`${API_BASE}/api/companion/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: anonymousDevice(), endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, language }),
  });
  if (!res.ok) {
    await sub.unsubscribe();
    return null;
  }
  return proof(language);
}

/** "Turn push back on": one visible test push. If the push service takes it, this phone is live again. */
export async function testPush(language: string): Promise<boolean | "paused"> {
  const body = await proof(language);
  if (!body) return false;
  try {
    return (await call<{ ok: boolean }>("/api/notify/test", "POST", body)).ok;
  } catch (error) {
    // 503: pushes aren't switched on yet, which is not the phone's fault.
    return error instanceof NotifyError && error.status === 503 ? "paused" : false;
  }
}

export const thisDeviceId = () => anonymousDevice();
