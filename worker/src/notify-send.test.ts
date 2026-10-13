import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import type { MailMessage } from "./auth";
import type { CommunityEvent } from "./events";
import { verifyLink } from "./notify-core";
import { fetchSceneEvents, notifyPaused, runNotifyCron, sweepDevices, type Deps, type NotifyEnv } from "./notify-send";
import { testD1 } from "./test-d1";

const MOCK = "http://127.0.0.1:10049";
const SECRET = "test-link-secret";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const EMAIL = "me@example.org";
const D1ID = "00000000-0000-4000-8000-000000000001";
const D2ID = "00000000-0000-4000-8000-000000000002";
const ANON = "00000000-0000-4000-8000-000000000003";

type Received = { device: string; payload: Record<string, unknown> };
let env: NotifyEnv & { cohere: ReturnType<typeof testD1> };
let receiver: { fixture: { publicKey: string; privateKey: string; subject: string; endpoint: string; p256dh: string; auth: string }; receive: (h: Record<string, string>, b: Uint8Array) => Record<string, unknown> };
let pushed: Received[];
let pushStatus: (device: string) => number;
let mails: { to: string; message: MailMessage }[];
let deps: Deps;

const event = (rkey: string, startsAt: string, endsAt: string | null, name = `Event ${rkey}`): CommunityEvent => ({
  did: "did:plc:mockscene", rkey, name, imageUrl: null, startsAt, endsAt, description: null, status: "scheduled", mode: "inperson", location: { name: "Mock Hall" },
});

let events: CommunityEvent[];
let guests: Record<string, string[]>;

beforeEach(async () => {
  const { createPushReceiver } = await import("../../scripts/pwa-push-receiver.mjs");
  receiver = createPushReceiver(MOCK);
  const k = receiver.fixture;
  env = {
    cohere: testD1(["../migrations/0004_event_rsvps.sql", "../migrations/0010_companion.sql", "../migrations/0011_members.sql", "../migrations/0012_notify.sql"]),
    COHERE_AUTH: {} as KVNamespace,
    NOTIFY_PAUSED: "false", NOTIFY_LINK_SECRET: SECRET, PUBLIC_BASE_URL: "https://cohereboulder.org",
    VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: k.subject,
    COMPANION_LOCAL_TEST_MODE: "true", COMPANION_LOCAL_PUSH_MOCK: MOCK,
    SEND_EMAIL: {} as never,
  } as never;
  pushed = [];
  mails = [];
  events = [];
  guests = {};
  pushStatus = () => 201;
  deps = {
    send: async (_env, to, message) => { mails.push({ to, message }); },
    events: async () => events,
    guests: async (_env, e) => new Set(guests[`${e.did}/${e.rkey}`] ?? []),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const device = new URL(url).searchParams.get("d") ?? "?";
    pushed.push({ device, payload: receiver.receive(Object.fromEntries(new Headers(init?.headers)), init?.body as Uint8Array) });
    return new Response(null, { status: pushStatus(device) });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const db = () => env.cohere;
const all = (sql: string) => db().raw.prepare(sql).all() as Record<string, unknown>[];
const ledger = () => all("SELECT type, ref, person_key, channel, fell_back, status, reason FROM notify_ledger ORDER BY person_key, type");

async function addDaily(date: string, extra = "") {
  await db().prepare(`INSERT INTO companion_daily(date,title,body,question${extra ? ",title_es,body_es,question_es" : ""}) VALUES (?1,?2,?3,?4${extra ? ",?5,?6,?7" : ""})`)
    .bind(date, "Learn three neighbours’ names", "Learn the names of three neighbours. Say them out loud twice.", "Who lives within a minute of you?", ...(extra ? ["Aprende tres nombres", "Aprende los nombres de tres vecinos. Dilos en voz alta.", "¿Quién vive cerca de ti?"] : [])).run();
}
/** A person's phone: a push subscription plus its health row. */
async function addDevice(person: string | null, id = D1ID, over: Record<string, unknown> = {}) {
  const k = receiver.fixture;
  await db().prepare("INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,language,created_at) VALUES (?1,?2,?3,?4,?5,?6)")
    .bind(id, `${k.endpoint}?d=${id}`, k.p256dh, k.auth, over.language ?? "en", "2026-10-01T00:00:00Z").run();
  const row = { installed: 1, permission: "granted", state: "live", fail_count: 0, last_seen_at: "2026-10-15T10:00:00Z", ...over };
  await db().prepare("INSERT INTO notify_devices(device_id,person_key,installed,permission,state,fail_count,last_seen_at,last_success_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)")
    .bind(id, person, row.installed, row.permission, row.state, row.fail_count, row.last_seen_at, (row as { last_success_at?: string }).last_success_at ?? null, "2026-10-01T00:00:00Z").run();
}
async function addPrefs(key: string, over: Record<string, unknown> = {}) {
  const email = (over.email as string | null | undefined) === undefined ? EMAIL : (over.email as string | null);
  await db().prepare(`INSERT INTO notify_prefs(person_key,did,morning_on,harvest_on,evening_on,morning_channel,harvest_channel,evening_channel,email,email_verified_at,email_optin_at,locale,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)`)
    .bind(key, key.startsWith("did:") ? key : null, over.morning_on ?? null, over.harvest_on ?? null, over.evening_on ?? null, over.morning_channel ?? null, over.harvest_channel ?? null, over.evening_channel ?? null,
      email, email ? "2026-10-01T00:00:00Z" : null, over.email_optin_at ?? null, over.locale ?? "en", "2026-10-01T00:00:00Z").run();
}

const MORNING = new Date("2026-10-17T12:00:00Z"); // 6 AM in Boulder, day 3
const EVENING = new Date("2026-10-17T02:00:00Z"); // 8 PM on the 16th
const bodyOf = (r: Received) => String(r.payload.body);

describe("the master switch and the launch guards", () => {
  beforeEach(async () => { await addDaily("2026-10-17"); await addDevice(ME); await addPrefs(ME); });

  it("is off unless NOTIFY_PAUSED is exactly 'false'", async () => {
    for (const value of [undefined, "true", "", "FALSE", "no", "0"]) {
      env.NOTIFY_PAUSED = value;
      expect(notifyPaused(env)).toBe(true);
      expect((await runNotifyCron(env, MORNING, deps)).paused).toBe(true);
    }
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
    env.NOTIFY_PAUSED = "false";
    expect(notifyPaused(env)).toBe(false);
  });
  it("sends nothing before the launch floor even with content, devices and the switch on", async () => {
    await addDaily("2026-10-14");
    env.COMPANION_LOCAL_TEST_MODE = "false"; // no local capability: the floor holds
    await runNotifyCron(env, new Date("2026-10-14T12:00:00Z"), deps);
    expect(pushed).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
  it("sends nothing after the gathering ends", async () => {
    await addDaily("2026-10-26");
    await runNotifyCron(env, new Date("2026-10-26T12:00:00Z"), deps);
    expect(pushed).toHaveLength(0);
  });
  it("sends no morning note for a day with no organizer-written practice", async () => {
    await db().prepare("DELETE FROM companion_daily").run();
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
  it("COMPANION_PUSH_PAUSED stops pushes (the person is not emailed in their place)", async () => {
    env.COMPANION_PUSH_PAUSED = "true";
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect(ledger()).toMatchObject([{ status: "skipped", reason: "push-paused" }]);
  });
  it("without VAPID keys nothing is pushed", async () => {
    delete env.VAPID_PRIVATE_KEY;
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
  });
  it("refuses a loopback push endpoint unless the local-test capability is on", async () => {
    env.COMPANION_LOCAL_TEST_MODE = "false";
    // Date.now() is "now", the tick is far in the past, so also check the staleness rule in a real environment:
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
  });
  it("does not run a tick that arrives much too late (outside the local-test capability)", async () => {
    env.COMPANION_LOCAL_TEST_MODE = "false";
    const result = await runNotifyCron(env, new Date(Date.now() - 3600_000), deps);
    expect(result.sent).toBe(0);
  });
  it("rejects invalid configured dates", async () => {
    env.COMPANION_END_DATE = "bad";
    await expect(runNotifyCron(env, MORNING, deps)).rejects.toThrow(/dates/);
  });
});

describe("the morning note", () => {
  beforeEach(async () => { await addDaily("2026-10-17"); });

  it("is one push: the practice and its question together, then today's events with RSVPs first", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    events = [
      event("late", "2026-10-17T23:00:00Z", "2026-10-18T00:00:00Z", "Evening Circle | with Someone"),
      event("early", "2026-10-17T15:00:00Z", "2026-10-17T16:00:00Z", "Honoring Water"),
      event("tomorrow", "2026-10-18T15:00:00Z", null),
    ];
    guests["did:plc:mockscene/late"] = [ME];
    const result = await runNotifyCron(env, MORNING, deps);
    expect(result.sent).toBe(1);
    expect(pushed).toHaveLength(1);
    const { payload } = pushed[0];
    expect(payload.title).toBe("Day 3 · Learn three neighbours’ names");
    expect(payload.url).toBe("/today");
    expect(payload.tag).toBe("2026-10-17-morning");
    expect(payload.device).toBe(D1ID);
    const body = String(payload.body);
    expect(body.startsWith("Learn the names of three neighbours. Then ask: Who lives within a minute of you?")).toBe(true);
    // The RSVP'd event is named first; the rest is a count; tomorrow's event is not mentioned.
    expect(body).toContain("Evening Circle · going");
    expect(body).toContain("+ 1 more event today");
    expect(body).not.toContain("tomorrow");
    expect(body.indexOf("Evening Circle")).toBeLessThan(body.indexOf("+ 1 more"));
    expect(mails).toHaveLength(0);
  });
  it("is in Spanish for a person whose language is Spanish", async () => {
    await addDaily("2026-10-18", "es");
    await addDevice(ME, D1ID, { language: "es" });
    await addPrefs(ME, { locale: "es" });
    await runNotifyCron(env, new Date("2026-10-18T12:00:00Z"), deps);
    expect(pushed[0].payload.title).toBe("Día 4 · Aprende tres nombres");
    expect(bodyOf(pushed[0])).toContain("Luego pregúntate: ¿Quién vive cerca de ti?");
  });
  it("sends one push per person per day, however many ticks, runs and overlaps", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    await Promise.all([runNotifyCron(env, MORNING, deps), runNotifyCron(env, MORNING, deps)]);
    await runNotifyCron(env, new Date("2026-10-17T12:01:00Z"), deps);
    await runNotifyCron(env, new Date("2026-10-17T12:30:00Z"), deps);
    expect(pushed).toHaveLength(1);
    expect(ledger()).toHaveLength(1);
    // A different day is a different note.
    await addDaily("2026-10-18");
    await runNotifyCron(env, new Date("2026-10-18T12:00:00Z"), deps);
    expect(pushed).toHaveLength(2);
  });
  it("claims the person before any I/O, so a crash mid-send never double-sends", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    let claimedAtSend: unknown;
    vi.stubGlobal("fetch", vi.fn(async () => {
      claimedAtSend = db().raw.prepare("SELECT * FROM notify_ledger WHERE person_key = ?").get(ME);
      throw new Error("network down");
    }));
    await runNotifyCron(env, MORNING, deps);
    expect(claimedAtSend).toMatchObject({ person_key: ME, status: "claimed" });
    await runNotifyCron(env, new Date("2026-10-17T12:01:00Z"), deps);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
  it("stops mid-run when the day's practice is deleted", async () => {
    for (const [i, id] of [D1ID, D2ID].entries()) { await addDevice(`did:plc:p${i}`, id); await addPrefs(`did:plc:p${i}`); }
    pushStatus = () => { db().raw.prepare("DELETE FROM companion_daily").run(); return 201; };
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(1);
  });
  it("an anonymous install gets the morning note (and only that), no settings needed", async () => {
    await addDevice(null, ANON, { installed: 0 });
    events = [event("a", "2026-10-17T15:00:00Z", null, "Honoring Water")];
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].device).toBe(ANON);
    expect(bodyOf(pushed[0])).toContain("+ 1 more event today");
    await runNotifyCron(env, EVENING, deps);
    expect(pushed).toHaveLength(1);
  });
  it("a legacy subscription with no health row still counts as an anonymous install", async () => {
    const k = receiver.fixture;
    await db().prepare("INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)").bind(ANON, `${k.endpoint}?d=${ANON}`, k.p256dh, k.auth, "2026-10-01T00:00:00Z").run();
    await runNotifyCron(env, MORNING, deps);
    expect(pushed.map((p) => p.device)).toEqual([ANON]);
  });
  it("never sends to an expired install", async () => {
    await addDevice(null, ANON, { state: "expired" });
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
  });
  it("is off for an email-only person unless they turned it on", async () => {
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org" });
    await runNotifyCron(env, MORNING, deps);
    expect(mails).toHaveLength(0);
    expect(ledger()).toMatchObject([{ status: "skipped", reason: "off" }]);
    await db().prepare("UPDATE notify_prefs SET morning_on = 1").run();
    await runNotifyCron(env, new Date("2026-10-17T12:05:00Z"), deps);
    // the first run completed; a person who opts in later today is not retro-sent (the run is done)
    expect(mails).toHaveLength(0);
  });
  it("emails an email-only person who opted in, with settings and one-click unsubscribe", async () => {
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org", morning_on: 1 });
    await runNotifyCron(env, MORNING, deps);
    expect(mails).toHaveLength(1);
    const { to, message } = mails[0];
    expect(to).toBe("sam@example.org");
    expect(message.subject).toBe("Day 3: Learn three neighbours’ names");
    expect(message.text).toContain("Who lives within a minute of you?");
    const unsub = /<(https:\/\/cohereboulder\.org\/n\/[^>]+)>/.exec(message.headers!["List-Unsubscribe"])![1];
    expect(message.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await verifyLink(SECRET, unsub.split("/n/")[1], new Date())).toEqual({ p: "mailto:sam@example.org", k: "unsub", t: "morning" });
    const settings = /https:\/\/cohereboulder\.org\/n\/([A-Za-z0-9_.-]+)/.exec(message.text!.split("Change which notes you get: ")[1])![1];
    expect(await verifyLink(SECRET, settings, new Date())).toMatchObject({ p: "mailto:sam@example.org", k: "settings" });
    expect(message.html).toContain("Change which notes you get");
  });
});

describe("push and email together: fallback, dedupe", () => {
  beforeEach(async () => { await addDaily("2026-10-17"); await addPrefs(ME); });

  it("falls back to email when the phone is not live, and says so once at the top", async () => {
    await addDevice(ME, D1ID, { state: "suspect", fail_count: 3 });
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(1);
    expect(mails[0].message.text).toContain("Push stopped working, so we sent this by email.");
    expect(ledger()).toMatchObject([{ channel: "email", fell_back: 1, status: "sent" }]);
    // The next day's email does not repeat the line.
    await addDaily("2026-10-18");
    await runNotifyCron(env, new Date("2026-10-18T12:00:00Z"), deps);
    expect(mails).toHaveLength(2);
    expect(mails[1].message.text).not.toContain("Push stopped working");
    expect(ledger().map((r) => r.fell_back)).toEqual([1, 1]);
  });
  it("returns to push by itself when the phone is live again, and forgets the 'stopped' line", async () => {
    await addDevice(ME, D1ID, { state: "suspect", fail_count: 3 });
    await runNotifyCron(env, MORNING, deps);
    expect(all("SELECT fallback_noted_at FROM notify_prefs")[0].fallback_noted_at).not.toBeNull();
    await db().prepare("UPDATE notify_devices SET state = 'live', fail_count = 0").run();
    await addDaily("2026-10-18");
    await runNotifyCron(env, new Date("2026-10-18T12:00:00Z"), deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(1);
    expect(all("SELECT fallback_noted_at FROM notify_prefs")[0].fallback_noted_at).toBeNull();
    expect(all("SELECT morning_channel FROM notify_prefs")[0].morning_channel).toBeNull(); // the stored choice never changed
  });
  it("a 410 from the push service expires the phone for good and the note goes by email instead, once", async () => {
    await addDevice(ME);
    pushStatus = () => 410;
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(1);
    expect(ledger()).toMatchObject([{ channel: "email", fell_back: 1 }]);
    expect(all("SELECT state FROM notify_devices")[0].state).toBe("expired");
    expect(all("SELECT * FROM companion_subscriptions")).toHaveLength(0);
    await runNotifyCron(env, new Date("2026-10-17T12:01:00Z"), deps);
    expect(pushed).toHaveLength(1); // never retried
    expect(mails).toHaveLength(1);
  });
  it("other failures count up; two on different days make the phone suspect, and a suspect phone is not pushed to", async () => {
    await addDevice(ME);
    pushStatus = () => 500;
    for (const day of ["17", "18", "19"]) {
      if (day !== "17") await addDaily(`2026-10-${day}`);
      await runNotifyCron(env, new Date(`2026-10-${day}T12:00:00Z`), deps);
    }
    expect(all("SELECT state, fail_count FROM notify_devices")[0]).toEqual({ state: "suspect", fail_count: 2 });
    expect(pushed).toHaveLength(2); // the third day is not even tried
    expect(mails).toHaveLength(3); // each note went by exactly one channel: email
    expect(ledger().every((r) => r.channel === "email")).toBe(true);
  });
  it("a failed push with no email address is recorded as failed, not retried", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { email: null });
    await addDevice(ME);
    pushStatus = () => 500;
    await runNotifyCron(env, MORNING, deps);
    expect(ledger()).toMatchObject([{ status: "failed", reason: "push-failed-no-email" }]);
    expect(mails).toHaveLength(0);
  });
  it("email chosen stays email even with a live phone", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { morning_channel: "email" });
    await addDevice(ME);
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(1);
    expect(ledger()).toMatchObject([{ channel: "email", fell_back: 0 }]);
    expect(mails[0].message.text).not.toContain("Push stopped working");
  });
  it("never sends both a push and an email for one note, across every run", async () => {
    await addDevice(ME);
    for (const minute of ["00", "01", "02", "30"]) await runNotifyCron(env, new Date(`2026-10-17T12:${minute}:00Z`), deps);
    expect(pushed.length + mails.length).toBe(1);
  });
  it("skips, logs and records a person nothing can reach: no push, no address", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { email: null });
    await addDevice(ME, D1ID, { state: "expired" });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect(ledger()).toMatchObject([{ status: "skipped", reason: "unreachable" }]);
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).toContain("nothing can reach");
    expect(logged).not.toContain(ME);
    info.mockRestore();
  });
  it("a note turned off sends nothing", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { morning_on: 0 });
    await addDevice(ME);
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
  it("a person with no stored settings but the app gets all three on by default", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addDevice(ME);
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(1);
  });
  it("does not email without a way to sign an unsubscribe link", async () => {
    delete env.NOTIFY_LINK_SECRET;
    delete env.VAPID_PRIVATE_KEY;
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { morning_channel: "email" });
    await runNotifyCron(env, MORNING, deps);
    expect(mails).toHaveLength(0);
  });
  it("on staging (no mail binding) an email is logged and nothing is sent", async () => {
    delete (env as { SEND_EMAIL?: unknown }).SEND_EMAIL;
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { morning_on: 1, morning_channel: "email" });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await runNotifyCron(env, MORNING, { ...deps, send: undefined });
    expect(mails).toHaveLength(0);
    expect(ledger()).toMatchObject([{ status: "skipped", reason: "no-transport" }]);
    expect(info.mock.calls.flat().join(" ")).toContain("no transport");
    info.mockRestore();
  });
  it("a failing mail transport is recorded and not retried", async () => {
    await db().prepare("DELETE FROM notify_prefs").run();
    await addPrefs(ME, { morning_on: 1, morning_channel: "email" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { ...deps, send: vi.fn(async () => { throw new Error("smtp down"); }) };
    await runNotifyCron(env, MORNING, failing);
    await runNotifyCron(env, new Date("2026-10-17T12:01:00Z"), failing);
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect(ledger()).toMatchObject([{ status: "failed", reason: "email-failed" }]);
    error.mockRestore();
  });
});

describe("the 8 PM note", () => {
  beforeEach(() => {
    events = [
      event("a", "2026-10-17T15:00:00Z", "2026-10-17T16:00:00Z", "Honoring Water"),
      event("b", "2026-10-17T19:00:00Z", null, "Soup Night"),
      event("c", "2026-10-17T21:00:00Z", null, "Stargazing"),
      event("d", "2026-10-17T22:00:00Z", null, "Song Circle"),
      event("today", "2026-10-16T15:00:00Z", null, "Not tomorrow"),
    ];
  });

  it("goes out at 8 PM Boulder, one push listing tomorrow's events, your RSVPs first", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    guests["did:plc:mockscene/c"] = [ME];
    const result = await runNotifyCron(env, EVENING, deps);
    expect(result.sent).toBe(1);
    const { payload } = pushed[0];
    expect(payload.title).toBe("Ready for tomorrow?");
    expect(payload.url).toBe("/tomorrow");
    expect(String(payload.body)).toContain("4 events on Oct 17. You’re going to 1.");
    expect(String(payload.body)).toContain("You’re going 3 PM Stargazing");
    expect(String(payload.body)).toContain("Also 9 AM Honoring Water · 1 PM Soup Night · + 1 more");
    expect(String(payload.body)).not.toContain("Not tomorrow");
  });
  it("is not sent at 7 PM or 9 PM", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    await runNotifyCron(env, new Date("2026-10-17T01:00:00Z"), deps);
    await runNotifyCron(env, new Date("2026-10-17T03:00:00Z"), deps);
    expect(pushed).toHaveLength(0);
  });
  it("sends nothing when there is nothing tomorrow", async () => {
    events = [];
    await addDevice(ME);
    await addPrefs(ME);
    await runNotifyCron(env, EVENING, deps);
    expect(pushed).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
  it("emails someone who opted in by the one-tap ask, with a pre-signed RSVP link per event they are not going to", async () => {
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org", email_optin_at: "2026-10-12T00:00:00Z" });
    await db().prepare("INSERT INTO event_rsvps(id,event_did,event_rkey,event_name,event_starts_at,email,cancel_token,created_at) VALUES ('1','did:plc:mockscene','b','Soup Night','2026-10-17T19:00:00Z','sam@example.org','t1','2026-10-12T00:00:00Z')").run();
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(1);
    const { message } = mails[0];
    expect(message.subject).toBe("Ready for tomorrow: 4 events on Oct 17");
    const going = /You’re going\n([^\n]+)\n(https:\/\/\S+)/.exec(message.text!);
    expect(going![1]).toMatch(/Soup Night.*· going/);
    const rsvpLinks = [...message.text!.matchAll(/RSVP: I’m going: (https:\/\/cohereboulder\.org\/n\/([A-Za-z0-9_.-]+))/g)];
    expect(rsvpLinks).toHaveLength(3);
    const payload = await verifyLink(SECRET, rsvpLinks[0][2], new Date());
    expect(payload).toMatchObject({ p: "mailto:sam@example.org", k: "rsvp", d: "did:plc:mockscene" });
  });
  it("does not email an address that never opted in", async () => {
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org" });
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(0);
  });
  it("the morning and evening notes are separate sends for the same person on the same date", async () => {
    await addDaily("2026-10-16");
    await addDevice(ME);
    await addPrefs(ME);
    await runNotifyCron(env, new Date("2026-10-16T12:00:00Z"), deps);
    await runNotifyCron(env, EVENING, deps);
    expect(pushed.map((p) => p.payload.url)).toEqual(["/today", "/tomorrow"]);
  });
});

describe("the harvest invitation", () => {
  const ended = event("water", "2026-10-16T15:00:00Z", "2026-10-16T16:15:00Z", "Honoring Water | with Angelique");
  beforeEach(async () => {
    events = [ended];
    guests["did:plc:mockscene/water"] = [ME];
    await addDevice(ME);
    await addPrefs(ME);
    await addDevice(PEER, D2ID);
    await addPrefs(PEER); // has the app but did not RSVP
  });

  it("goes an hour after the event ends, to the people who RSVP'd, linking to the event page", async () => {
    await runNotifyCron(env, new Date("2026-10-16T17:10:00Z"), deps); // 55 minutes after
    expect(pushed).toHaveLength(0);
    const result = await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(result.sent).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].device).toBe(D1ID);
    expect(pushed[0].payload).toMatchObject({
      title: "How was Honoring Water?",
      url: `/events/${encodeURIComponent("did:plc:mockscene")}/water`,
    });
    expect(String(pushed[0].payload.body)).toContain("Share your harvest.");
  });
  it("is sent once, not on every later tick, and not a day late", async () => {
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    await runNotifyCron(env, new Date("2026-10-16T17:20:00Z"), deps);
    await runNotifyCron(env, new Date("2026-10-16T18:00:00Z"), deps);
    expect(pushed).toHaveLength(1);
    pushed.length = 0;
    const late = event("old", "2026-10-15T15:00:00Z", "2026-10-15T16:00:00Z");
    events = [late];
    guests["did:plc:mockscene/old"] = [ME];
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(pushed).toHaveLength(0);
  });
  it("is not sent for a cancelled event", async () => {
    events = [{ ...ended, status: "cancelled" }];
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(pushed).toHaveLength(0);
  });
  it("an email RSVP who said yes once gets it by email; one who never said yes does not", async () => {
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org", email_optin_at: "2026-10-12T00:00:00Z" });
    await addPrefs("mailto:no@example.org", { email: "no@example.org" });
    for (const email of ["sam@example.org", "no@example.org", "stranger@example.org"]) {
      await db().prepare("INSERT INTO event_rsvps(id,event_did,event_rkey,event_name,event_starts_at,email,cancel_token,created_at) VALUES (?1,'did:plc:mockscene','water','Honoring Water','2026-10-16T15:00:00Z',?2,?1,'2026-10-12T00:00:00Z')").bind(`id-${email}`, email).run();
    }
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(mails.map((m) => m.to)).toEqual(["sam@example.org"]);
    expect(mails[0].message.subject).toBe("How was Honoring Water? Share your harvest");
    expect(mails[0].message.text).toContain("https://cohereboulder.org/events/did%3Aplc%3Amockscene/water");
    expect(mails[0].message.text).toContain("Harvests are visible to everyone in COhere and carry your name.");
  });
  it("sees an event that has just ended, which the public listing has already dropped", async () => {
    const fetched = vi.fn(async () => Response.json({ events: [
      { uri: "at://did:plc:mockscene/community.lexicon.calendar.event/past", value: { name: "Past", startsAt: "2026-10-16T15:00:00Z", endsAt: "2026-10-16T16:00:00Z", status: "scheduled" } },
      { uri: "at://did:plc:mockscene/community.lexicon.calendar.event/gone", value: { name: "Gone", startsAt: "2026-10-16T15:00:00Z", status: "cancelled" } },
    ] }));
    vi.stubGlobal("fetch", fetched);
    const list = await fetchSceneEvents({ ...env, REGENOS_BASE_URL: "https://upstream.test", REGENOS_COLLECTIVE_DID: "did:plc:mockscene" });
    expect(list!.map((e) => e.name)).toEqual(["Past"]);
    expect(new Headers((fetched.mock.calls[0] as unknown as [string, RequestInit])[1].headers).has("Authorization")).toBe(false);
  });
});

describe("device sweeps", () => {
  it("a phone quiet for 14 days stops counting as live; a push never shown, a day on, is one soft failure", async () => {
    await addDevice(ME, D1ID, { last_seen_at: "2026-10-01T00:00:00Z" });
    await addDevice(PEER, D2ID, { last_seen_at: "2026-10-16T00:00:00Z" });
    await db().prepare("UPDATE notify_devices SET last_sent_at = '2026-10-15T12:00:00Z', last_success_at = '2026-10-15T12:00:00Z' WHERE device_id = ?").bind(D2ID).run();
    await sweepDevices(env, new Date("2026-10-17T11:55:00Z"));
    const rows = Object.fromEntries(all("SELECT device_id, state, fail_count FROM notify_devices").map((r) => [r.device_id, r]));
    expect(rows[D1ID]).toMatchObject({ state: "suspect" });
    expect(rows[D2ID]).toMatchObject({ state: "live", fail_count: 1 });
    await sweepDevices(env, new Date("2026-10-18T11:55:00Z"));
    expect(all("SELECT fail_count FROM notify_devices WHERE device_id = ?".replace("?", `'${D2ID}'`))[0].fail_count).toBe(1);
  });
});
