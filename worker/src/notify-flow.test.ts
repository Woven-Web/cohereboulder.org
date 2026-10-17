// The whole path, through the real routes and the real cron: a person registered for 2026,
// with no settings, who installs the app and allows notifications. One rule:
//   no app            → the 8 PM note by email, nothing to switch on
//   phone allowed     → every note with no explicit choice goes to the phone, and the email stops
//   phone stops       → the notes fall back to email by themselves
//   an explicit choice always wins
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import type { MailMessage } from "./auth";
import type { CommunityEvent } from "./events";
import { companionRoute } from "./companion";
import { addEmailPatch, offerEmailToo } from "../../src/lib/notify";
import { handleNotify } from "./notify";
import { runNotifyCron, type Deps, type NotifyEnv } from "./notify-send";
import { testD1, testKV } from "./test-d1";

const BASE = "https://cohereboulder.org";
const MOCK = "http://127.0.0.1:10049";
const DID = "did:plc:rae";
const EMAIL = "rae@example.org";
const DEVICE = "00000000-0000-4000-8000-0000000000aa";
// 8 PM Boulder on the 16th, 17th and 18th.
const NIGHT = [new Date("2026-10-17T02:00:00Z"), new Date("2026-10-18T02:00:00Z"), new Date("2026-10-19T02:00:00Z")];

let env: NotifyEnv & { cohere: ReturnType<typeof testD1> };
let receiver: { fixture: { publicKey: string; privateKey: string; subject: string; endpoint: string; p256dh: string; auth: string }; receive: (h: Record<string, string>, b: Uint8Array) => Record<string, unknown> };
let pushed: Record<string, unknown>[];
let mails: { to: string; message: MailMessage }[];
let deps: Deps;
let pushGone: boolean;

const event = (rkey: string, startsAt: string): CommunityEvent => ({
  did: "did:plc:mockscene", rkey, name: `Event ${rkey}`, imageUrl: null, startsAt, endsAt: null, description: null, status: "scheduled", mode: "inperson", location: { name: "Mock Hall" },
});

beforeEach(async () => {
  const { createPushReceiver } = await import("../../scripts/pwa-push-receiver.mjs");
  receiver = createPushReceiver(MOCK);
  const k = receiver.fixture;
  env = {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://upstream.test", REGENOS_COLLECTIVE_DID: "did:plc:mockscene",
    NOTIFY_PAUSED: "false", NOTIFY_LINK_SECRET: "flow-secret", PUBLIC_BASE_URL: BASE,
    VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: k.subject,
    COMPANION_LOCAL_TEST_MODE: "true", COMPANION_LOCAL_PUSH_MOCK: MOCK,
    SEND_EMAIL: {} as never,
  } as never;
  pushed = [];
  mails = [];
  pushGone = false;
  deps = {
    send: async (_env, to, message) => { mails.push({ to, message }); },
    events: async () => [event("a", "2026-10-17T18:00:00Z"), event("b", "2026-10-18T18:00:00Z"), event("c", "2026-10-19T18:00:00Z")],
    guests: async () => new Set(),
  };
  // A signed-in regenOS account whose verified address is the one they registered with, and the push service.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === MOCK) {
      if (pushGone) return new Response(null, { status: 410 });
      pushed.push(receiver.receive(Object.fromEntries(new Headers(init?.headers)), init?.body as Uint8Array));
      return new Response(null, { status: 201 });
    }
    const signedIn = /__Host-rs_session=rae/.test(new Headers(init?.headers).get("Cookie") ?? "");
    if (url.pathname.endsWith("getSession")) return Response.json(signedIn ? { did: DID } : {});
    if (url.pathname.endsWith("getMyContactPref")) return Response.json({ channels: signedIn ? [{ kind: "email", address: EMAIL, verified: true }] : [] });
    return Response.json({});
  }));

  await env.cohere.prepare("INSERT INTO people(id,email,subscribed,unsubscribe_token,created_at,updated_at) VALUES ('p1',?1,1,'tok','x','x')").bind(EMAIL).run();
  await env.cohere.prepare("INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES ('s1','p1','register-2026','{}','x','x')").run();
  for (const date of ["2026-10-17", "2026-10-18", "2026-10-19"]) {
    await env.cohere.prepare("INSERT INTO companion_daily(date,title,body,question) VALUES (?1,'A practice','Do the practice.','Why?')").bind(date).run();
  }
});
afterEach(() => vi.unstubAllGlobals());

const notify = (method: string, path: string, body?: unknown) =>
  handleNotify(new Request(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", Origin: BASE, Cookie: "__Host-rs_session=rae" }, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, new URL(`${BASE}${path}`)) as Promise<Response>;

/** What the app does when the person taps "Allow": subscribe, then say whose phone it is. */
async function allowNotifications() {
  const k = receiver.fixture;
  const keys = { device_id: DEVICE, endpoint: `${k.endpoint}?d=${DEVICE}`, p256dh: k.p256dh, auth: k.auth };
  const sub = await companionRoute(new Request(`${BASE}/api/companion/subscriptions`, {
    method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5" }, body: JSON.stringify({ ...keys, language: "en" }),
  }), env);
  expect(sub.status).toBeLessThan(300);
  const proof = { ...keys, installed: true, permission: "granted", language: "en" };
  expect((await notify("POST", "/api/notify/heartbeat", { ...proof, subscribed: true })).status).toBe(200);
  expect((await notify("POST", "/api/notify/device", proof)).status).toBe(200);
  return keys;
}

const settings = async () => (await notify("GET", `/api/notify/settings?device=${DEVICE}`)).json();

describe("one rule: registered, then the phone", () => {
  it("registered with no app: the 8 PM note by email, once", async () => {
    await runNotifyCron(env, NIGHT[0], deps);
    expect(mails.map((m) => m.to)).toEqual([EMAIL]);
    expect(pushed).toHaveLength(0);
  });

  it("after allowing notifications, the 8 PM note comes by phone only: exactly one channel, no default email", async () => {
    await runNotifyCron(env, NIGHT[0], deps);
    expect(mails).toHaveLength(1);

    // The registration row (keyed by address) folds into the account; the phone is live.
    await allowNotifications();
    const view = await settings();
    expect(view.push.status).toBe("live");
    for (const type of ["morning", "harvest", "evening", "reminder"]) expect(view.notes[type]).toMatchObject({ on: true, phone: true, email: false, chosen: null });

    await runNotifyCron(env, NIGHT[1], deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(1); // still just night 1's email
    const rows = env.cohere.raw.prepare("SELECT person_key, channel FROM notify_ledger WHERE type = 'evening' ORDER BY ref").all();
    expect(rows).toEqual([{ person_key: DID, channel: "email" }, { person_key: DID, channel: "push" }]);
    // and a retry tick in the same hour sends nothing more
    await runNotifyCron(env, new Date(NIGHT[1].getTime() + 60_000), deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(1);
  });

  it("allowing notifications mid-run, after that night's email went, does not also push the same note", async () => {
    // 45 registrants: the run takes two ticks (40 emails a tick), and rae is in the first.
    for (let i = 0; i < 44; i++) {
      await env.cohere.prepare("INSERT INTO people(id,email,subscribed,unsubscribe_token,created_at,updated_at) VALUES (?1,?2,1,?1,'x','x')").bind(`z${i}`, `zz${String(i).padStart(2, "0")}@example.org`).run();
      await env.cohere.prepare("INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES (?1,?1,'register-2026','{}','x','x')").bind(`z${i}`).run();
    }
    await runNotifyCron(env, NIGHT[0], deps);
    expect(mails.filter((m) => m.to === EMAIL)).toHaveLength(1);
    await allowNotifications();
    await runNotifyCron(env, new Date(NIGHT[0].getTime() + 60_000), deps);
    expect(mails).toHaveLength(45);
    expect(pushed).toHaveLength(0);
  });

  it("'Want email too?': one tap adds email to the notes now on the phone, and both then go", async () => {
    await allowNotifications();
    const before = await settings();
    expect(offerEmailToo(before)).toBe(true);
    const view = await (await notify("PUT", `/api/notify/settings?device=${DEVICE}`, addEmailPatch(before))).json();
    expect(offerEmailToo(view)).toBe(false);
    for (const type of ["morning", "harvest", "evening", "reminder"]) expect(view.notes[type]).toMatchObject({ on: true, phone: true, email: true });
    await runNotifyCron(env, NIGHT[1], deps);
    expect(pushed).toHaveLength(1);
    expect(mails.map((m) => m.to)).toEqual([EMAIL]);
  });

  it("when the phone stops working, the 8 PM note falls back to email by itself, still once", async () => {
    await allowNotifications();
    pushGone = true; // the push service answers 410: the subscription is gone for good
    await runNotifyCron(env, NIGHT[1], deps);
    expect(pushed).toHaveLength(0);
    expect(mails.map((m) => m.to)).toEqual([EMAIL]); // the 410 sends the note by email instead, once
    await runNotifyCron(env, NIGHT[2], deps);
    expect(mails).toHaveLength(2);
    expect(mails[1].to).toBe(EMAIL);
    expect(pushed).toHaveLength(0);
    expect((await settings()).notes.evening).toMatchObject({ on: true, phone: false, email: true });
  });

  it("an explicit choice wins: email chosen before the app stays email, and nothing goes by phone", async () => {
    await allowNotifications();
    await notify("PUT", "/api/notify/settings", { evening: { channels: { phone: false, email: true } } });
    await runNotifyCron(env, NIGHT[1], deps);
    expect(pushed).toHaveLength(0);
    expect(mails.map((m) => m.to)).toEqual([EMAIL]);
  });
});
