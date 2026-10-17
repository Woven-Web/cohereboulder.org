import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { signLink, verifyLink } from "./notify-core";
import { handleNotify, type NotifyRouteEnv } from "./notify";
import { testD1, testKV } from "./test-d1";

const ME = "did:plc:me";
const PEER = "did:plc:peer";
const SECRET = "route-secret";
const BASE = "https://cohereboulder.org";
const DEVICE = "00000000-0000-4000-8000-000000000001";
const KEYS = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "pub", auth: "secret" };

let env: NotifyRouteEnv & { cohere: ReturnType<typeof testD1> };
let sessions: Record<string, { did: string; email?: string | null }>;
let mailSent: { to: string; subject: string; text: string }[];

beforeEach(() => {
  mailSent = [];
  sessions = { me: { did: ME, email: "me@example.org" }, peer: { did: PEER, email: null } };
  env = {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://upstream.test", REGENOS_COLLECTIVE_DID: "did:plc:mockscene",
    NOTIFY_LINK_SECRET: SECRET, PUBLIC_BASE_URL: BASE,
    SEND_EMAIL: { send: async (message: { raw?: unknown }) => { mailSent.push({ to: "", subject: "", text: String(message.raw ?? "") }); } },
  } as never;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const who = /__Host-rs_session=([^;]+)/.exec(new Headers(init?.headers).get("Cookie") ?? "")?.[1];
    const session = who ? sessions[who] : undefined;
    if (url.pathname.endsWith("getSession")) return Response.json(session ? { did: session.did } : {});
    if (url.pathname.endsWith("getMyContactPref")) {
      return session?.email ? Response.json({ channels: [{ kind: "email", address: session.email, verified: true }] }) : Response.json({ channels: [] });
    }
    return Response.json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

const call = (method: string, path: string, body?: unknown, who: string | null = "me", extra: Record<string, string> = {}) =>
  handleNotify(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(who ? { Cookie: `__Host-rs_session=${who}; cohere_session=admin` } : {}), ...extra },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
    new URL(`${BASE}${path}`),
  ) as Promise<Response>;
const rows = (sql: string) => env.cohere.raw.prepare(sql).all() as Record<string, unknown>[];
const token = (payload: Parameters<typeof signLink>[1]) => signLink(SECRET, payload, new Date());

async function addDevice(person: string | null = null, over: Record<string, unknown> = {}) {
  await env.cohere.prepare("INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)").bind(DEVICE, KEYS.endpoint, KEYS.p256dh, KEYS.auth, "2026-10-01T00:00:00Z").run();
  await env.cohere.prepare("INSERT INTO notify_devices(device_id,person_key,installed,permission,state,fail_count,last_seen_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)")
    .bind(DEVICE, person, over.installed ?? 1, "granted", over.state ?? "live", over.fail_count ?? 0, new Date().toISOString(), "2026-10-01T00:00:00Z").run();
}

describe("GET/PUT /api/notify/settings", () => {
  it("needs a signed-in session", async () => {
    expect((await call("GET", "/api/notify/settings", undefined, null)).status).toBe(401);
    expect((await call("GET", "/api/notify/settings", undefined, "nobody")).status).toBe(401);
    expect((await call("PUT", "/api/notify/settings", { morning: { on: false } }, null)).status).toBe(401);
  });
  it("for someone with no app and no stored choices: only the account's verified email, morning off by default", async () => {
    const res = await call("GET", "/api/notify/settings");
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.email).toEqual({ address: "me@example.org", verified: true, registered: false });
    expect(view.push.status).toBe("none");
    expect(view.notes.morning).toMatchObject({ on: false, channel: "email", chosen: null });
    expect(view.nothingReaches).toBe(false);
    // the verified address was adopted so the cron, which has no session, can write to it
    expect(rows("SELECT person_key, email FROM notify_prefs")).toEqual([{ person_key: ME, email: "me@example.org" }]);
  });
  it("says nothing can reach someone who has no address and no live phone", async () => {
    const view = await (await call("GET", "/api/notify/settings", undefined, "peer")).json();
    expect(view.email).toEqual({ address: null, verified: false, registered: false });
    expect(view.nothingReaches).toBe(true);
  });
  it("a registered person sees the 8 PM note on by email without touching anything, and the address as verified", async () => {
    await env.cohere.prepare("INSERT INTO people(id,email,subscribed,unsubscribe_token,created_at,updated_at) VALUES ('p1','me@example.org',1,'t','x','x')").run();
    await env.cohere.prepare("INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES ('s1','p1','register-2026','{}','x','x')").run();
    const view = await (await call("GET", "/api/notify/settings")).json();
    expect(view.email).toEqual({ address: "me@example.org", verified: true, registered: true });
    expect(view.notes.evening).toMatchObject({ on: true, phone: false, email: true });
    expect(view.notes.morning).toMatchObject({ on: false, phone: false, email: false });
  });
  it("the Phone / Email toggles: email only, both, and neither (which turns the note off)", async () => {
    await addDevice(ME);
    let view = await (await call("PUT", "/api/notify/settings", { evening: { channels: { phone: true, email: true } } })).json();
    expect(view.notes.evening).toMatchObject({ on: true, phone: true, email: true });
    expect(rows("SELECT evening_on, evening_channel, also_email FROM notify_prefs")).toEqual([{ evening_on: 1, evening_channel: "push", also_email: "evening" }]);
    view = await (await call("PUT", "/api/notify/settings", { evening: { channels: { phone: false, email: true } } })).json();
    expect(view.notes.evening).toMatchObject({ on: true, phone: false, email: true });
    expect(rows("SELECT also_email FROM notify_prefs")).toEqual([{ also_email: null }]);
    view = await (await call("PUT", "/api/notify/settings", { evening: { channels: { phone: false, email: false } } })).json();
    expect(view.notes.evening).toMatchObject({ on: false, phone: false, email: false });
    expect((await call("PUT", "/api/notify/settings", { evening: { channels: { phone: "yes" } } })).status).toBe(400);
  });
  it("with the app installed and live: all three on, push by default; this phone's status is reported", async () => {
    await addDevice(ME);
    const view = await (await call("GET", `/api/notify/settings?device=${DEVICE}`)).json();
    expect(view.push).toMatchObject({ status: "live", installed: true, devices: 1, thisDevice: { status: "live", installed: true } });
    for (const type of ["morning", "harvest", "evening"]) expect(view.notes[type]).toMatchObject({ on: true, channel: "push", pushAvailable: true });
    expect(view.pushBroke).toBe(false);
  });
  it("event reminders: on by push for the app, off for email-only, and the Email toggle stores an explicit choice", async () => {
    let view = await (await call("GET", "/api/notify/settings")).json();
    expect(view.notes.reminder).toMatchObject({ on: false, phone: false, email: false });
    view = await (await call("PUT", "/api/notify/settings", { reminder: { channels: { phone: false, email: true } } })).json();
    expect(view.notes.reminder).toMatchObject({ on: true, phone: false, email: true });
    expect(rows("SELECT reminder_on, reminder_channel FROM notify_prefs")).toEqual([{ reminder_on: 1, reminder_channel: "email" }]);
    await addDevice(ME);
    view = await (await call("PUT", "/api/notify/settings", { reminder: { channels: { phone: true, email: false } } })).json();
    expect(view.notes.reminder).toMatchObject({ on: true, phone: true, email: false, channel: "push" });
    view = await (await call("PUT", "/api/notify/settings", { reminder: { on: false } })).json();
    expect(view.notes.reminder).toMatchObject({ on: false });
    expect(rows("SELECT reminder_on FROM notify_prefs")).toEqual([{ reminder_on: 0 }]);
  });
  it("event reminders default on by push once the app is installed and live", async () => {
    await addDevice(ME);
    const view = await (await call("GET", "/api/notify/settings")).json();
    expect(view.notes.reminder).toMatchObject({ on: true, channel: "push", phone: true, email: false, chosen: null });
  });
  it("when push broke: reports it, switches the effective channel to email, keeps the stored choice", async () => {
    await addDevice(ME, { state: "suspect", fail_count: 3 });
    await call("PUT", "/api/notify/settings", { evening: { channel: "push" } });
    const view = await (await call("GET", `/api/notify/settings?device=${DEVICE}`)).json();
    expect(view.pushBroke).toBe(true);
    expect(view.push.thisDevice.status).toBe("suspect");
    expect(view.notes.evening).toMatchObject({ on: true, channel: "email", chosen: "push", pushAvailable: false });
  });
  it("changes a note and its channel, validated", async () => {
    await addDevice(ME);
    const res = await call("PUT", "/api/notify/settings", { morning: { on: false }, harvest: { channel: "email" }, language: "es" });
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.notes.morning.on).toBe(false);
    expect(view.notes.harvest).toMatchObject({ on: true, channel: "email", chosen: "email" });
    expect(view.locale).toBe("es");
    expect(rows("SELECT morning_on, harvest_channel, locale FROM notify_prefs")).toEqual([{ morning_on: 0, harvest_channel: "email", locale: "es" }]);
    for (const bad of [{ morning: { on: "yes" } }, { morning: { channel: "sms" } }, { morning: "off" }, { evening: null }]) {
      expect((await call("PUT", "/api/notify/settings", bad)).status).toBe(400);
    }
    expect((await call("PUT", "/api/notify/settings", "not json")).status).toBe(400);
    // 'auto' again
    const back = await (await call("PUT", "/api/notify/settings", { harvest: { channel: null } })).json();
    expect(back.notes.harvest.chosen).toBeNull();
  });
  it("keeps one person's settings away from another's", async () => {
    await call("PUT", "/api/notify/settings", { morning: { on: true } });
    const peer = await (await call("GET", "/api/notify/settings", undefined, "peer")).json();
    expect(peer.notes.morning.on).toBe(false);
  });
  it("refuses a cross-site write", async () => {
    const res = await call("PUT", "/api/notify/settings", { morning: { on: true } }, "me", { "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect((await call("PUT", "/api/notify/settings", { morning: { on: true } }, "me", { Origin: "https://evil.test" })).status).toBe(403);
  });
  it("folds an address-keyed person (who opted in by email) into the account that verifies the same address", async () => {
    await env.cohere.prepare("INSERT INTO notify_prefs(person_key,email,email_verified_at,email_optin_at,evening_on,locale,created_at,updated_at) VALUES ('mailto:me@example.org','me@example.org','2026-10-12T00:00:00Z','2026-10-12T00:00:00Z',0,'es','2026-10-12T00:00:00Z','2026-10-12T00:00:00Z')").run();
    await env.cohere.prepare("INSERT INTO notify_ledger(type,ref,person_key,claimed_at) VALUES ('evening','2026-10-14','mailto:me@example.org','2026-10-14T00:00:00Z')").run();
    const view = await (await call("GET", "/api/notify/settings")).json();
    expect(rows("SELECT person_key FROM notify_prefs")).toEqual([{ person_key: ME }]);
    expect(rows("SELECT person_key FROM notify_ledger")).toEqual([{ person_key: ME }]);
    expect(view.notes.evening.on).toBe(false);
    expect(rows("SELECT email_optin_at FROM notify_prefs")[0].email_optin_at).toBe("2026-10-12T00:00:00Z");
  });
});

describe("POST /api/notify/email", () => {
  it("caps verify mail to one address at 3 a day, across people", async () => {
    sessions.p2 = { did: "did:plc:p2", email: null }; sessions.p3 = { did: "did:plc:p3", email: null }; sessions.p4 = { did: "did:plc:p4", email: null };
    const codes: number[] = [];
    for (const who of ["peer", "p2", "p3", "p4"]) codes.push((await call("POST", "/api/notify/email", { email: "same@example.org" }, who)).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });
  it("sends a confirmation link to the new address, and changes nothing until it is tapped", async () => {
    const res = await call("POST", "/api/notify/email", { email: " New@Example.org " }, "peer");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: true });
    expect(mailSent).toHaveLength(1);
    expect(rows("SELECT email FROM notify_prefs")).toHaveLength(0);
  });
  it("rejects a bad address, needs a session, and is rate limited", async () => {
    expect((await call("POST", "/api/notify/email", { email: "nope" }, "peer")).status).toBe(400);
    expect((await call("POST", "/api/notify/email", { email: "a@b.org" }, null)).status).toBe(401);
    for (let i = 0; i < 5; i++) await call("POST", "/api/notify/email", { email: `a${i}@example.org` }, "peer");
    expect((await call("POST", "/api/notify/email", { email: "z@example.org" }, "peer")).status).toBe(429);
  });
  it("on staging (no mail binding) it says nothing was delivered", async () => {
    delete (env as { SEND_EMAIL?: unknown }).SEND_EMAIL;
    const res = await call("POST", "/api/notify/email", { email: "new@example.org" }, "peer");
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });
});

describe("devices", () => {
  const proof = { device_id: DEVICE, ...KEYS };
  it("links a phone to the signed-in person and records that the app is installed", async () => {
    await addDevice(null, { installed: 0 });
    const res = await call("POST", "/api/notify/device", { ...proof, installed: true, permission: "granted", language: "es" });
    expect(res.status).toBe(200);
    expect(rows("SELECT person_key, installed, state FROM notify_devices")).toEqual([{ person_key: ME, installed: 1, state: "live" }]);
    expect(rows("SELECT locale FROM notify_prefs")[0].locale).toBe("es");
  });
  it("needs the person AND the subscription's own secrets", async () => {
    await addDevice(null);
    expect((await call("POST", "/api/notify/device", { ...proof, installed: true, permission: "granted" }, null)).status).toBe(401);
    expect((await call("POST", "/api/notify/device", { ...proof, auth: "wrong", installed: true, permission: "granted" })).status).toBe(404);
    expect((await call("POST", "/api/notify/device", { device_id: "nope", ...KEYS })).status).toBe(404);
    expect(rows("SELECT person_key FROM notify_devices")).toEqual([{ person_key: null }]);
  });
  it("a heartbeat needs only the subscription's secrets and keeps the phone live", async () => {
    await addDevice(ME);
    const res = await call("POST", "/api/notify/heartbeat", { ...proof, installed: true, permission: "granted", subscribed: true }, null);
    expect(res.status).toBe(200);
    expect((await call("POST", "/api/notify/heartbeat", { ...proof, auth: "wrong", installed: true, permission: "granted", subscribed: true }, null)).status).toBe(404);
  });
  it("a heartbeat for a legacy subscription creates its health row", async () => {
    await env.cohere.prepare("INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)").bind(DEVICE, KEYS.endpoint, KEYS.p256dh, KEYS.auth, "2026-10-01T00:00:00Z").run();
    await call("POST", "/api/notify/heartbeat", { ...proof, installed: true, permission: "granted", subscribed: true }, null);
    expect(rows("SELECT person_key, installed, state FROM notify_devices")).toEqual([{ person_key: null, installed: 1, state: "live" }]);
  });
  it("a heartbeat saying there is no subscription, or that permission was denied, expires the phone", async () => {
    await addDevice(ME);
    const bare = await call("POST", "/api/notify/heartbeat", { device_id: DEVICE, installed: true, permission: "granted", subscribed: false }, null);
    expect(bare.status).toBe(404); // a device id alone proves nothing
    expect(rows("SELECT state FROM notify_devices")[0].state).not.toBe("expired");
    await call("POST", "/api/notify/heartbeat", { device_id: DEVICE, endpoint: KEYS.endpoint, installed: true, permission: "granted", subscribed: false }, null);
    expect(rows("SELECT state FROM notify_devices")[0].state).toBe("expired");
    await env.cohere.prepare("UPDATE notify_devices SET state = 'live'").run();
    await call("POST", "/api/notify/heartbeat", { ...proof, installed: true, permission: "denied", subscribed: true }, null);
    expect(rows("SELECT state FROM notify_devices")[0].state).toBe("expired");
  });
  it("the service worker's 'shown' ping is recorded", async () => {
    await addDevice(ME);
    expect((await call("POST", "/api/notify/shown", { device_id: DEVICE }, null)).status).toBe(200);
    expect(rows("SELECT last_shown_at FROM notify_devices")[0].last_shown_at).not.toBeNull();
    expect((await call("POST", "/api/notify/shown", { device_id: "x" }, null)).status).toBe(400);
  });
  it("the test push is refused while NOTIFY_PAUSED or COMPANION_PUSH_PAUSED is on, even with VAPID set", async () => {
    await addDevice(ME);
    Object.assign(env, { VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:x@example.org" });
    for (const pause of [{ NOTIFY_PAUSED: "true" }, { NOTIFY_PAUSED: undefined }, { NOTIFY_PAUSED: "false", COMPANION_PUSH_PAUSED: "true" }]) {
      Object.assign(env, { NOTIFY_PAUSED: "false", COMPANION_PUSH_PAUSED: undefined }, pause);
      const fetched = vi.fn();
      vi.stubGlobal("fetch", fetched);
      expect((await call("POST", "/api/notify/test", proof, null)).status).toBe(503);
      expect(fetched).not.toHaveBeenCalled();
    }
  });
  it("the test push is refused without push configured, and with the wrong secrets", async () => {
    await addDevice(ME, { state: "suspect", fail_count: 3 });
    expect((await call("POST", "/api/notify/test", proof, null)).status).toBe(503);
    expect((await call("POST", "/api/notify/test", { ...proof, auth: "wrong" }, null)).status).toBe(404);
  });
  it("'turn push back on' lands a test push and revives the phone", async () => {
    const { createPushReceiver } = await import("../../scripts/pwa-push-receiver.mjs");
    const receiver = createPushReceiver("http://127.0.0.1:10049");
    const k = receiver.fixture;
    Object.assign(env, { NOTIFY_PAUSED: "false", VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: k.subject, COMPANION_LOCAL_TEST_MODE: "true", COMPANION_LOCAL_PUSH_MOCK: "http://127.0.0.1:10049" });
    await env.cohere.prepare("INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)").bind(DEVICE, k.endpoint, k.p256dh, k.auth, "2026-10-01T00:00:00Z").run();
    await env.cohere.prepare("INSERT INTO notify_devices(device_id,person_key,installed,permission,state,fail_count,created_at,updated_at) VALUES (?1,?2,1,'granted','suspect',3,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')").bind(DEVICE, ME).run();
    let received: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      received = receiver.receive(Object.fromEntries(new Headers(init?.headers)), init?.body as Uint8Array);
      return new Response(null, { status: 201 });
    }));
    const res = await call("POST", "/api/notify/test", { device_id: DEVICE, endpoint: k.endpoint, p256dh: k.p256dh, auth: k.auth }, null);
    expect(await res.json()).toEqual({ ok: true, status: 201 });
    expect(received).toMatchObject({ title: "Push is working", device: DEVICE });
    expect(rows("SELECT state, fail_count FROM notify_devices")[0]).toEqual({ state: "live", fail_count: 0 });
  });
});

describe("emailed links", () => {
  it("one-click unsubscribe: a mail client POSTs the token with no sign-in, only that note goes off, for that person only", async () => {
    const t = await token({ p: "mailto:sam@example.org", k: "unsub", t: "morning" });
    await env.cohere.prepare("INSERT INTO notify_prefs(person_key,email,email_verified_at,morning_on,locale,created_at,updated_at) VALUES ('mailto:sam@example.org','sam@example.org','2026-10-01T00:00:00Z',1,'en','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')").run();
    await env.cohere.prepare("INSERT INTO notify_prefs(person_key,email,email_verified_at,morning_on,locale,created_at,updated_at) VALUES ('mailto:other@example.org','other@example.org','2026-10-01T00:00:00Z',1,'en','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')").run();
    const res = await handleNotify(
      new Request(`${BASE}/n/${t}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
      env, new URL(`${BASE}/n/${t}`),
    );
    expect(res!.status).toBe(200);
    expect(rows("SELECT person_key, morning_on, harvest_on, evening_on FROM notify_prefs ORDER BY person_key")).toEqual([
      { person_key: "mailto:other@example.org", morning_on: 1, harvest_on: null, evening_on: null },
      { person_key: "mailto:sam@example.org", morning_on: 0, harvest_on: null, evening_on: null },
    ]);
  });
  it("GET /n/:token is the page itself (the SPA), never an action", async () => {
    const t = await token({ p: "mailto:sam@example.org", k: "unsub", t: "morning" });
    expect(await handleNotify(new Request(`${BASE}/n/${t}`), env, new URL(`${BASE}/n/${t}`))).toBeNull();
    expect(rows("SELECT * FROM notify_prefs")).toHaveLength(0);
  });
  it("a forged or wrong-kind token does nothing", async () => {
    for (const bad of ["junk", `${await token({ p: "mailto:a@b.org", k: "settings" })}`, (await token({ p: "mailto:a@b.org", k: "unsub" })).replace(/.$/, "x")]) {
      const res = await handleNotify(new Request(`${BASE}/n/${bad}`, { method: "POST" }), env, new URL(`${BASE}/n/${bad}`));
      expect(res!.status).toBe(410);
    }
    expect(rows("SELECT * FROM notify_prefs")).toHaveLength(0);
  });
  it("the unsubscribe page can say what it is for, offer Undo, and open the person's other settings", async () => {
    const t = await token({ p: "mailto:sam@example.org", k: "unsub", t: "evening" });
    const info = await (await call("GET", `/api/notify/link/${t}`, undefined, null)).json();
    expect(info).toMatchObject({ kind: "unsub", type: "evening" });
    expect(info.settingsToken).toBeUndefined(); // a never-expiring link must not mint a 30-day settings link
    const off = await (await call("POST", `/api/notify/link/${t}/unsubscribe`, {}, null)).json();
    expect(off).toEqual({ ok: true, types: ["evening"], previous: { evening: null } });
    expect(rows("SELECT evening_on FROM notify_prefs")[0].evening_on).toBe(0);
    await call("POST", `/api/notify/link/${t}/resubscribe`, { previous: off.previous }, null);
    expect(rows("SELECT evening_on FROM notify_prefs")[0].evening_on).toBeNull(); // the default stays the default
  });
  it("'all' turns every note off; Undo puts each back as it was", async () => {
    await env.cohere.prepare("INSERT INTO notify_prefs(person_key,email,email_verified_at,morning_on,harvest_on,locale,created_at,updated_at) VALUES ('mailto:sam@example.org','sam@example.org','2026-10-01T00:00:00Z',1,0,'en','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')").run();
    const t = await token({ p: "mailto:sam@example.org", k: "unsub", t: "all" });
    const off = await (await call("POST", `/api/notify/link/${t}/unsubscribe`, {}, null)).json();
    expect(rows("SELECT morning_on, harvest_on, evening_on FROM notify_prefs")[0]).toEqual({ morning_on: 0, harvest_on: 0, evening_on: 0 });
    await call("POST", `/api/notify/link/${t}/resubscribe`, { previous: off.previous }, null);
    expect(rows("SELECT morning_on, harvest_on, evening_on FROM notify_prefs")[0]).toEqual({ morning_on: 1, harvest_on: 0, evening_on: null });
  });
  it("a settings link opens and changes that address's settings with no sign-in, but cannot reach push or the address", async () => {
    await env.cohere.prepare("INSERT INTO notify_prefs(person_key,email,email_verified_at,locale,created_at,updated_at) VALUES ('mailto:sam@example.org','sam@example.org','2026-10-01T00:00:00Z','en','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')").run();
    const t = await token({ p: "mailto:sam@example.org", k: "settings" });
    const info = await (await call("GET", `/api/notify/link/${t}`, undefined, null)).json();
    expect(info.view.email.address).toBe("sam@example.org");
    expect(info.view.notes.morning.on).toBe(false);
    const view = await (await call("PUT", `/api/notify/link/${t}/settings`, { morning: { on: true }, evening: { on: false } }, null)).json();
    expect(view.notes.morning.on).toBe(true);
    expect(view.notes.evening.on).toBe(false);
    // the unsubscribe link may not change settings, nor may a settings link unsubscribe
    const unsub = await token({ p: "mailto:sam@example.org", k: "unsub", t: "all" });
    expect((await call("PUT", `/api/notify/link/${unsub}/settings`, { morning: { on: true } }, null)).status).toBe(403);
    expect((await call("POST", `/api/notify/link/${t}/unsubscribe`, {}, null)).status).toBe(400);
  });
  it("the one-tap ask in the RSVP confirmation turns on the harvest and 8 PM notes for that address", async () => {
    const t = await token({ p: "mailto:sam@example.org", k: "optin" });
    expect(await (await call("GET", `/api/notify/link/${t}`, undefined, null)).json()).toMatchObject({ kind: "optin" });
    expect(rows("SELECT * FROM notify_prefs")).toHaveLength(0); // looking does not opt in
    const res = await call("POST", `/api/notify/link/${t}/optin`, {}, null);
    expect(await res.json()).toEqual({ ok: true, email: "sam@example.org" });
    expect(rows("SELECT person_key, email, email_optin_at IS NOT NULL AS optin, morning_on FROM notify_prefs")).toEqual([{ person_key: "mailto:sam@example.org", email: "sam@example.org", optin: 1, morning_on: null }]);
    expect((await call("POST", `/api/notify/link/${t}/optin`, {}, null)).status).toBe(200); // idempotent
  });
  it("confirming a new address makes it the one we write to", async () => {
    const t = await token({ p: ME, k: "verify", e: "fresh@example.org" });
    expect(await (await call("GET", `/api/notify/link/${t}`, undefined, null)).json()).toMatchObject({ kind: "verify", email: "fresh@example.org" });
    expect(rows("SELECT * FROM notify_prefs")).toHaveLength(0);
    await call("POST", `/api/notify/link/${t}/verify`, {}, null);
    expect(rows("SELECT person_key, email, email_verified_at IS NOT NULL AS ok FROM notify_prefs")).toEqual([{ person_key: ME, email: "fresh@example.org", ok: 1 }]);
  });
  it("an expired verification link is refused", async () => {
    const t = await signLink(SECRET, { p: ME, k: "verify", e: "fresh@example.org" }, new Date(Date.now() - 2 * 86_400_000));
    expect((await call("POST", `/api/notify/link/${t}/verify`, {}, null)).status).toBe(410);
    expect(rows("SELECT * FROM notify_prefs")).toHaveLength(0);
  });
  it("without a link secret no link is honoured", async () => {
    const t = await token({ p: "mailto:a@b.org", k: "unsub", t: "all" });
    delete env.NOTIFY_LINK_SECRET;
    expect((await call("GET", `/api/notify/link/${t}`, undefined, null)).status).toBe(410);
  });
  it("a one-tap RSVP link RSVPs that address by email through the normal RSVP path, and the confirmation goes out", async () => {
    const sent: { to: string; subject: string }[] = [];
    const rsvpDeps = {
      lookup: async () => ({ kind: "ok" as const, event: { did: "did:plc:mockscene", rkey: "tomorrow1", name: "Soup Night", startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: null, status: "scheduled", where: "Mock Hall" } }),
      send: async (_env: unknown, to: string, message: { subject: string }) => { sent.push({ to, subject: message.subject }); },
    };
    const t = await token({ p: "mailto:sam@example.org", k: "rsvp", d: "did:plc:mockscene", r: "tomorrow1" });
    const res = await handleNotify(
      new Request(`${BASE}/api/notify/link/${t}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      env, new URL(`${BASE}/api/notify/link/${t}/rsvp`), rsvpDeps as never,
    );
    expect(res!.status).toBe(200);
    expect(rows("SELECT event_rkey, email FROM event_rsvps")).toEqual([{ event_rkey: "tomorrow1", email: "sam@example.org" }]);
    expect(sent).toEqual([{ to: "sam@example.org", subject: "You're on the list: Soup Night" }]);
  });
  it("an RSVP link for an account (not an address) does nothing", async () => {
    const t = await token({ p: ME, k: "rsvp", d: "did:plc:mockscene", r: "x" });
    expect((await call("POST", `/api/notify/link/${t}/rsvp`, {}, null)).status).toBe(400);
  });
});
