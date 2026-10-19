// Notification settings, device health, and the signed email links.
//
//   GET  /api/notify/settings?device=<id>   my settings (regenOS session)
//   PUT  /api/notify/settings               change them
//   POST /api/notify/email                  add an address; a confirmation link goes to it
//   POST /api/notify/device                 this phone belongs to me (session + subscription keys)
//   POST /api/notify/heartbeat              the app opened: still subscribed? (subscription keys)
//   POST /api/notify/shown                  the service worker showed a push
//   POST /api/notify/test                   "Turn push back on": one visible test push
//   GET  /api/notify/link/:token            what an emailed link is for
//   POST /api/notify/link/:token/<action>   settings | unsubscribe | resubscribe | optin | verify | rsvp
//   POST /n/:token                          RFC 8058 one-click unsubscribe (mail clients POST here)
//
// The person is whoever regenOS says is signed in, or whoever holds a signed
// link; never a field of the request body.

import { normalizeEmail, rateLimited, sendMail } from "./auth";
import { refuseCrossSiteWrite } from "./csrf";
import {
  NOTIFY_TYPES, effectiveChannel, effectiveChannels, isLive, isNotifyType, isOn, pushStatus, afterHeartbeat, reviveDevice, signLink, verifyLink, withAlsoEmail,
  type Channel, type DeviceRow, type LinkPayload, type NotifyType, type PushStatus,
} from "./notify-core";
import { testPush, verifyEmail } from "./notify-messages";
import { baseUrl, deliverPush, linkSecret, notifyPaused, type NotifyEnv } from "./notify-send";
import {
  getDevice, getPrefs, installedDevices, mergeEmailPerson, prefsOrBlank, reachOf, recordSend, saveDevice, savePrefs, type PrefsRow,
} from "./notify-store";
import { readVerifiedSessionDid, readVerifiedSessionEmail, type RegenosAuthEnv } from "./regenos-auth";
import { handleCreateRsvp, lookupLiveEvent, type RsvpDeps, type RsvpEnv } from "./rsvps";

export type NotifyRouteEnv = NotifyEnv & RegenosAuthEnv & RsvpEnv;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: NO_STORE });
const lang = (v: unknown): "en" | "es" => (v === "es" ? "es" : "en");

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the view

export interface SettingsView {
  email: { address: string | null; verified: boolean; /** Has a 2026 registration: the 8 PM note is on by email until they turn it off. */ registered: boolean };
  push: {
    status: PushStatus;
    installed: boolean;
    devices: number;
    lastDeliveredAt: string | null;
    failedSince: number;
    /** The phone that asked, if it is one of mine. */
    thisDevice: { status: PushStatus; installed: boolean } | null;
  };
  /** Push had been working and stopped: the email line and "Turn push back on" show. */
  pushBroke: boolean;
  nothingReaches: boolean;
  notes: Record<NotifyType, { on: boolean; channel: Channel; chosen: Channel | null; pushAvailable: boolean; phone: boolean; email: boolean }>;
  locale: "en" | "es";
}

export async function settingsView(env: NotifyRouteEnv, prefs: PrefsRow, now: Date, thisDeviceId?: string): Promise<SettingsView> {
  const db = env.cohere;
  const devices = await installedDevices(db, prefs.person_key);
  const reach = await reachOf(db, prefs, now.getTime());
  const own = thisDeviceId ? devices.find((d) => d.device_id === thisDeviceId) : undefined;
  const latest = (f: keyof DeviceRow) => devices.map((d) => d[f] as string | null).filter(Boolean).sort().at(-1) ?? null;
  const delivered = [latest("last_shown_at"), latest("last_success_at")].filter(Boolean).sort().at(-1) ?? null;
  const notLive = devices.filter((d) => !isLive(d, now.getTime()));
  const broke = !reach.livePush && devices.some((d) => d.installed === 1 && (d.state === "suspect" || d.state === "expired"));
  const notes = {} as SettingsView["notes"];
  for (const type of NOTIFY_TYPES) {
    notes[type] = { on: isOn(type, prefs, reach), channel: effectiveChannel(type, prefs, reach), chosen: prefs[`${type}_channel`], pushAvailable: reach.livePush, ...effectiveChannels(type, prefs, reach) };
  }
  return {
    email: { address: reach.email ?? prefs.email, verified: Boolean(prefs.email && prefs.email_verified_at) || reach.registered, registered: reach.registered },
    push: {
      status: pushStatus(devices, now.getTime()), installed: reach.hasApp, devices: devices.length, lastDeliveredAt: delivered,
      failedSince: notLive.reduce((n, d) => n + d.fail_count, 0),
      thisDevice: own ? { status: pushStatus([own], now.getTime()), installed: own.installed === 1 } : null,
    },
    pushBroke: broke,
    nothingReaches: !reach.livePush && !reach.email,
    notes,
    locale: prefs.locale,
  };
}

// -------------------------------------------------------------- who is this

/** The account's verified address, adopted once so the cron (which has no session) can email them. */
async function adoptVerifiedEmail(env: NotifyRouteEnv, request: Request, prefs: PrefsRow, now: string): Promise<PrefsRow> {
  if (prefs.email) return prefs;
  let email: string | null = null;
  try {
    email = await readVerifiedSessionEmail(request, env);
  } catch {
    return prefs; // regenOS was unreachable; try again next time
  }
  if (!email) return prefs;
  const next = { ...prefs, email, email_verified_at: now };
  await savePrefs(env.cohere, next, now);
  await mergeEmailPerson(env.cohere, prefs.person_key, email, now);
  return (await getPrefs(env.cohere, prefs.person_key)) ?? next;
}

async function sessionPerson(request: Request, env: NotifyRouteEnv): Promise<PrefsRow | null> {
  const did = await readVerifiedSessionDid(request, env);
  if (!did) return null;
  return adoptVerifiedEmail(env, request, await prefsOrBlank(env.cohere, did), new Date().toISOString());
}

// ----------------------------------------------------------------- settings

type NotePatch = { on?: boolean; channel?: Channel | null; channels?: { phone?: boolean; email?: boolean } };

/** Apply a validated patch to a prefs row. Returns an error string for a bad one. */
export function applyPatch(prefs: PrefsRow, body: Record<string, unknown>): string | null {
  for (const type of NOTIFY_TYPES) {
    if (!(type in body)) continue;
    const patch = body[type] as NotePatch | null;
    if (!patch || typeof patch !== "object") return `${type} must be an object`;
    if ("on" in patch) {
      if (typeof patch.on !== "boolean") return `${type}.on must be true or false`;
      prefs[`${type}_on`] = patch.on ? 1 : 0;
    }
    if ("channel" in patch) {
      if (patch.channel !== null && patch.channel !== "push" && patch.channel !== "email") return `${type}.channel must be push, email or null`;
      prefs[`${type}_channel`] = patch.channel;
    }
    if ("channels" in patch) {
      // The Phone / Email pair of toggles. Neither pressed = the note is off; both = push plus email.
      const c = patch.channels;
      if (!c || typeof c !== "object" || typeof c.phone !== "boolean" || typeof c.email !== "boolean") return `${type}.channels must be {phone, email} booleans`;
      prefs[`${type}_on`] = c.phone || c.email ? 1 : 0;
      if (c.phone || c.email) prefs[`${type}_channel`] = c.phone ? "push" : "email";
      prefs.also_email = withAlsoEmail(prefs, type, c.phone && c.email);
    }
  }
  if ("language" in body) prefs.locale = lang(body.language);
  return null;
}

async function handleSettings(request: Request, env: NotifyRouteEnv, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "method not allowed" }, 405);
  if (request.method === "PUT") {
    const refused = refuseCrossSiteWrite(request);
    if (refused) return refused;
  }
  const prefs = await sessionPerson(request, env);
  if (!prefs) return json({ error: "Sign in first." }, 401);
  const now = new Date();
  if (request.method === "PUT") {
    const body = await readJson(request);
    if (!body) return json({ error: "invalid JSON" }, 400);
    const error = applyPatch(prefs, body);
    if (error) return json({ error }, 400);
    await savePrefs(env.cohere, prefs, now.toISOString());
  }
  const device = url.searchParams.get("device") ?? undefined;
  return json(await settingsView(env, prefs, now, device && UUID_RE.test(device) ? device : undefined));
}

// -------------------------------------------------------------------- email

async function sendLinkMail(env: NotifyRouteEnv, to: string, message: Parameters<typeof sendMail>[2]): Promise<"sent" | "logged"> {
  if (!env.SEND_EMAIL && !env.RESEND_API_KEY) return "logged"; // staging: say nothing was sent
  await sendMail(env, to, message);
  return "sent";
}

async function handleAddEmail(request: Request, env: NotifyRouteEnv, url: URL): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const refused = refuseCrossSiteWrite(request);
  if (refused) return refused;
  const prefs = await sessionPerson(request, env);
  if (!prefs) return json({ error: "Sign in first." }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "That doesn’t look like an email address." }, 400);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if ((await rateLimited(env, `notify-email-addr:${email}`, 3, 86400)) || (await rateLimited(env, `notify-email:${prefs.person_key}`, 5, 3600)) || (await rateLimited(env, `notify-email-ip:${ip}`, 20, 3600))) {
    return json({ error: "Too many tries. Please try again later." }, 429);
  }
  const secret = linkSecret(env);
  if (!secret) return json({ error: "Email isn’t set up here yet." }, 503);
  const token = await signLink(secret, { p: prefs.person_key, k: "verify", e: email }, new Date());
  try {
    const sent = await sendLinkMail(env, email, verifyEmail(lang(body?.language ?? prefs.locale), `${baseUrl(env) || url.origin}/n/${token}`));
    return json({ ok: true, delivered: sent === "sent" });
  } catch (error) {
    console.error("notify verify email failed:", error instanceof Error ? error.message : error);
    return json({ error: "We couldn’t send that just now. Try again in a moment." }, 502);
  }
}

// ------------------------------------------------------------------ devices

interface Proof {
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The caller holds this push subscription's secrets, so they are the device. */
async function ownedDevice(env: NotifyRouteEnv, body: Record<string, unknown>): Promise<{ proof: Proof; device: DeviceRow } | null> {
  const { device_id: id, endpoint, p256dh, auth } = body;
  if (typeof id !== "string" || !UUID_RE.test(id) || typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  const sub = await env.cohere
    .prepare("SELECT device_id FROM companion_subscriptions WHERE device_id = ?1 AND endpoint = ?2 AND p256dh = ?3 AND auth = ?4")
    .bind(id, endpoint, p256dh, auth)
    .first();
  if (!sub) return null;
  const now = new Date().toISOString();
  // A subscription from before this feature has no health row yet.
  await env.cohere
    .prepare("INSERT OR IGNORE INTO notify_devices (device_id, installed, permission, state, created_at, updated_at) VALUES (?1, 0, 'granted', 'live', ?2, ?2)")
    .bind(id, now)
    .run();
  return { proof: { device_id: id, endpoint, p256dh, auth }, device: (await getDevice(env.cohere, id))! };
}

async function deviceCalls(request: Request, env: NotifyRouteEnv, path: string): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const refused = refuseCrossSiteWrite(request);
  if (refused) return refused;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await rateLimited(env, `notify-device-ip:${ip}`, 300, 3600)) return json({ error: "rate limit" }, 429);
  const body = await readJson(request);
  if (!body) return json({ error: "invalid JSON" }, 400);
  const now = new Date().toISOString();

  if (path === "/api/notify/shown") {
    // Unauthenticated and harmless: it can only mark a push as shown.
    const id = body.device_id;
    if (typeof id !== "string" || !UUID_RE.test(id)) return json({ error: "invalid device" }, 400);
    await env.cohere.prepare("UPDATE notify_devices SET last_shown_at = ?2, updated_at = ?2 WHERE device_id = ?1").bind(id, now).run();
    return json({ ok: true });
  }

  const installed = body.installed === true;
  const permission = typeof body.permission === "string" && ["granted", "denied", "default"].includes(body.permission) ? body.permission : "default";

  if (path === "/api/notify/heartbeat" && body.subscribed === false) {
    // The page asked pushManager and there is no subscription: the device is gone.
    const id = body.device_id;
    if (typeof id !== "string" || !UUID_RE.test(id)) return json({ error: "invalid device" }, 400);
    // Holding the subscription's endpoint (itself a secret URL) is the proof; a bare device id is not enough.
    const known = typeof body.endpoint === "string"
      ? await env.cohere.prepare("SELECT 1 AS ok FROM companion_subscriptions WHERE device_id = ?1 AND endpoint = ?2").bind(id, body.endpoint).first()
      : null;
    if (!known) return json({ error: "subscription missing" }, 404);
    const row = await getDevice(env.cohere, id);
    if (row) await saveDevice(env.cohere, afterHeartbeat(row, { installed, permission, subscribed: false }, now), now);
    return json({ ok: true, state: "expired" });
  }

  const owned = await ownedDevice(env, body);
  if (!owned) return json({ error: "subscription missing" }, 404);
  let { device } = owned;

  if (path === "/api/notify/heartbeat") {
    device = afterHeartbeat(device, { installed, permission, subscribed: true }, now);
    await saveDevice(env.cohere, device, now);
    return json({ ok: true, state: device.state });
  }

  if (path === "/api/notify/device") {
    // Linking a phone to a person needs the person: the verified session.
    const prefs = await sessionPerson(request, env);
    if (!prefs) return json({ error: "Sign in first." }, 401);
    device = afterHeartbeat({ ...device, person_key: prefs.person_key }, { installed, permission, subscribed: true }, now);
    await saveDevice(env.cohere, device, now);
    if ("language" in body && body.language !== prefs.locale) await savePrefs(env.cohere, { ...prefs, locale: lang(body.language) }, now);
    return json({ ok: true, state: device.state });
  }

  if (path === "/api/notify/test") {
    // "Turn push back on": one visible push; if the push service takes it, the phone is live again.
    if (!pushReady(env)) return json({ error: "push disabled" }, 503);
    if (await rateLimited(env, `notify-test:${device.device_id}`, 5, 3600)) return json({ error: "rate limit" }, 429);
    const sub = (await env.cohere.prepare("SELECT endpoint, p256dh, auth, language FROM companion_subscriptions WHERE device_id = ?1").bind(device.device_id).first<{ endpoint: string; p256dh: string; auth: string; language: string }>())!;
    const { status } = await deliverPush(env, sub, testPush(lang(body.language ?? sub.language), device.device_id), 60);
    await recordSend(env.cohere, { ...device, ...sub }, status, now);
    if (status >= 200 && status < 300) await saveDevice(env.cohere, reviveDevice((await getDevice(env.cohere, device.device_id))!, now), now);
    return json({ ok: status >= 200 && status < 300, status });
  }
  return json({ error: "not found" }, 404);
}

/** VAPID is configured AND neither pause switch is on: a user-initiated push must obey the same switches as the cron. */
const pushReady = (env: NotifyRouteEnv) =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) && env.COMPANION_PUSH_PAUSED !== "true" && !notifyPaused(env);

// -------------------------------------------------------------------- links

async function readLink(env: NotifyRouteEnv, token: string): Promise<LinkPayload | null> {
  const secret = linkSecret(env);
  return secret ? verifyLink(secret, token, new Date()) : null;
}

/** What the page behind an emailed link shows, and a settings link if this one can open them. */
async function linkInfo(env: NotifyRouteEnv, link: LinkPayload): Promise<Record<string, unknown>> {
  const now = new Date();
  const prefs = await prefsOrBlank(env.cohere, link.p);
  const out: Record<string, unknown> = { kind: link.k, type: link.t ?? null, email: link.k === "verify" ? link.e ?? null : prefs.email, locale: prefs.locale };
  if (link.k === "settings" || link.k === "unsub") {
    out.view = await settingsView(env, prefs, now);
  }
  if (link.k === "rsvp" && link.d && link.r) {
    const live = await lookupLiveEvent(env, link.d, link.r);
    out.event = live.kind === "ok" ? { name: live.event.name, startsAt: live.event.startsAt, where: live.event.where, did: link.d, rkey: link.r } : null;
  }
  return out;
}

async function linkAction(request: Request, env: NotifyRouteEnv, url: URL, token: string, action: string, rsvpDeps?: RsvpDeps): Promise<Response> {
  const link = await readLink(env, token);
  if (!link) return json({ error: "This link isn’t valid any more." }, 410);
  const now = new Date();
  const nowIso = now.toISOString();
  const db = env.cohere;

  if (request.method === "GET" && action === "") return json(await linkInfo(env, link));
  if (request.method !== "POST" && request.method !== "PUT") return json({ error: "method not allowed" }, 405);

  const body = (await readJson(request)) ?? {};
  const prefs = await prefsOrBlank(db, link.p);

  if (action === "settings") {
    if (link.k !== "settings") return json({ error: "This link can’t change settings." }, 403);
    const error = applyPatch(prefs, body);
    if (error) return json({ error }, 400);
    await savePrefs(db, prefs, nowIso);
    return json(await settingsView(env, prefs, now));
  }

  if (action === "unsubscribe" && link.k === "unsub") {
    const types: NotifyType[] = link.t === "all" || !link.t ? [...NOTIFY_TYPES] : [link.t];
    const previous: Record<string, number | null> = {};
    for (const type of types) {
      previous[type] = prefs[`${type}_on`];
      prefs[`${type}_on`] = 0;
    }
    await savePrefs(db, prefs, nowIso);
    return json({ ok: true, types, previous });
  }

  if (action === "resubscribe" && link.k === "unsub") {
    // Undo: put each note back exactly as it was (the default stays the default).
    const previous = (body.previous && typeof body.previous === "object" ? body.previous : {}) as Record<string, unknown>;
    for (const type of NOTIFY_TYPES) {
      if (!(type in previous)) continue;
      const v = previous[type];
      prefs[`${type}_on`] = v === 0 || v === 1 ? v : null;
    }
    if (Object.keys(previous).length === 0 && isNotifyType(link.t)) prefs[`${link.t}_on`] = 1;
    await savePrefs(db, prefs, nowIso);
    return json({ ok: true });
  }

  if (action === "optin" && link.k === "optin") {
    // The one-tap ask in the RSVP confirmation: harvest and 8 PM notes, by email.
    const email = link.p.startsWith("mailto:") ? link.p.slice("mailto:".length) : null;
    if (!email) return json({ error: "invalid link" }, 400);
    await savePrefs(db, { ...prefs, email, email_verified_at: prefs.email_verified_at ?? nowIso, email_optin_at: prefs.email_optin_at ?? nowIso }, nowIso);
    return json({ ok: true, email });
  }

  if (action === "verify" && link.k === "verify") {
    const email = typeof link.e === "string" && EMAIL_RE.test(link.e) ? link.e : null;
    if (!email) return json({ error: "invalid link" }, 400);
    await savePrefs(db, { ...prefs, email, email_verified_at: nowIso }, nowIso);
    if (link.p.startsWith("did:")) await mergeEmailPerson(db, link.p, email, nowIso);
    return json({ ok: true, email });
  }

  if (action === "rsvp" && link.k === "rsvp" && link.d && link.r) {
    const email = link.p.startsWith("mailto:") ? link.p.slice("mailto:".length) : null;
    if (!email) return json({ error: "invalid link" }, 400);
    // The same path as the RSVP form, so the confirmation, the cancel link and the limits are all the same.
    const synthetic = new Request(new URL("/api/rsvp", url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": request.headers.get("CF-Connecting-IP") ?? "unknown" },
      body: JSON.stringify({ did: link.d, rkey: link.r, email, language: prefs.locale }),
    });
    const res = await handleCreateRsvp(synthetic, env, url, rsvpDeps);
    return new Response(res.body, { status: res.status, headers: NO_STORE });
  }

  return json({ error: "That doesn’t apply to this link." }, 400);
}

// ------------------------------------------------------------------- router

/** Routes under /api/notify and the one-click POST at /n/:token. Null for any other path. */
export async function handleNotify(request: Request, env: NotifyRouteEnv, url: URL, rsvpDeps?: RsvpDeps): Promise<Response | null> {
  const path = url.pathname;

  const oneClick = /^\/n\/([A-Za-z0-9_.-]+)$/.exec(path);
  if (oneClick) {
    if (request.method !== "POST") return null; // GET is the page itself (the SPA)
    const link = await readLink(env, oneClick[1]);
    if (!link || link.k !== "unsub") return json({ error: "This link isn’t valid any more." }, 410);
    // Mail clients POST with no Origin and a form body; no CSRF guard applies, the token is the credential.
    return linkAction(request, env, url, oneClick[1], "unsubscribe");
  }

  if (!path.startsWith("/api/notify/")) return null;
  if (path === "/api/notify/settings") return handleSettings(request, env, url);
  if (path === "/api/notify/email") return handleAddEmail(request, env, url);
  if (["/api/notify/device", "/api/notify/heartbeat", "/api/notify/shown", "/api/notify/test"].includes(path)) return deviceCalls(request, env, path);

  const link = /^\/api\/notify\/link\/([A-Za-z0-9_.-]+)(?:\/([a-z]+))?$/.exec(path);
  if (link) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (await rateLimited(env, `notify-link-ip:${ip}`, 200, 3600)) return json({ error: "rate limit" }, 429);
    return linkAction(request, env, url, link[1], link[2] ?? "", rsvpDeps);
  }
  return json({ error: "not found" }, 404);
}

