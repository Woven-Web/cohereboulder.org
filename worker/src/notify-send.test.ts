import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import type { MailMessage } from "./auth";
import type { CommunityEvent } from "./events";
import { verifyLink } from "./notify-core";
import { MAX_EMAILS_PER_TICK, fetchSceneEvents, notifyPaused, runNotifyCron, sweepDevices, type Deps, type NotifyEnv } from "./notify-send";
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
    cohere: testD1(["../schema.sql"]),
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
    // "Change your settings" opens Me → notifications (which asks them to sign in); it is not a signed link.
    expect(message.text).toContain("Change your settings: https://cohereboulder.org/more/notifications");
    expect(message.html).toContain("Change your settings");
    expect(message.html).toContain('href="https://cohereboulder.org/more/notifications"');
  });
});

describe("push and email together: fallback, dedupe", () => {
  beforeEach(async () => { await addDaily("2026-10-17"); await addPrefs(ME); });

  it("falls back to email when the phone is not live, and says so once at the top", async () => {
    await addDevice(ME, D1ID, { state: "suspect", fail_count: 3 });
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(1);
    expect(mails[0].message.text).toContain("Push failed. Sent by email.");
    expect(ledger()).toMatchObject([{ channel: "email", fell_back: 1, status: "sent" }]);
    // The next day's email does not repeat the line.
    await addDaily("2026-10-18");
    await runNotifyCron(env, new Date("2026-10-18T12:00:00Z"), deps);
    expect(mails).toHaveLength(2);
    expect(mails[1].message.text).not.toContain("Push failed");
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
    expect(mails[0].message.text).not.toContain("Push failed");
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
    expect(String(payload.body)).toContain("4 events · Oct 17 · going to 1");
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
    expect(message.subject).toBe("Tomorrow at COhere: Saturday, October 17");
    const soup = message.text!.slice(message.text!.indexOf("Soup Night"));
    expect(soup.split("\n")[2]).toBe("✓ RSVP’d");
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

async function addRegistered(email: string, over: { subscribed?: number; tags?: string; form?: string } = {}) {
  const id = `p-${email}`;
  await db().prepare("INSERT INTO people(id,email,subscribed,unsubscribe_token,tags,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)")
    .bind(id, email, over.subscribed ?? 1, `tok-${email}`, over.tags ?? null, "2026-10-01T00:00:00Z").run();
  await db().prepare("INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES (?1,?2,?3,'{}',?4,?4)")
    .bind(`s-${email}`, id, over.form ?? "register-2026", "2026-10-01T00:00:00Z").run();
}

describe("email by default for people registered for 2026", () => {
  beforeEach(async () => {
    events = [event("a", "2026-10-17T15:00:00Z", "2026-10-17T16:00:00Z", "Honoring Water"), event("b", "2026-10-17T19:00:00Z", null, "Soup Night")];
    await addDaily("2026-10-17");
  });

  it("a registered person with no settings gets exactly one email a day: the 8 PM note, with tomorrow's practice in it", async () => {
    await addRegistered("rae@example.org");
    const result = await runNotifyCron(env, EVENING, deps);
    expect(result.sent).toBe(1);
    expect(pushed).toHaveLength(0);
    expect(mails).toHaveLength(1);
    const { to, message } = mails[0];
    expect(to).toBe("rae@example.org");
    expect(message.subject).toBe("Tomorrow at COhere: Saturday, October 17");
    expect(message.text).toContain("Tomorrow’s practice");
    expect(message.text).toContain("Learn three neighbours’ names");
    expect(message.text).toContain("Learn the names of three neighbours. Say them out loud twice.");
    expect(message.html).toContain("Learn the names of three neighbours. Say them out loud twice.");
    // a one-click unsubscribe, and a settings link that asks them to sign in
    const unsub = /<(https:\/\/cohereboulder\.org\/n\/[^>]+)>/.exec(message.headers!["List-Unsubscribe"])![1];
    expect(message.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await verifyLink(SECRET, unsub.split("/n/")[1], new Date())).toEqual({ p: "mailto:rae@example.org", k: "unsub", t: "evening" });
    expect(message.text).toContain("Change your settings: https://cohereboulder.org/more/notifications");
    expect(ledger()).toMatchObject([{ person_key: "mailto:rae@example.org", type: "evening", channel: "email", status: "sent" }]);
  });
  it("the same person gets no morning note and no harvest invitation unless they turn them on", async () => {
    await addRegistered("rae@example.org");
    await runNotifyCron(env, MORNING, deps); // 10-17 has a practice, so the morning run exists; they are simply not on its list
    expect(mails).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
  it("a registered person who turned the 8 PM note on for the morning too gets both, by email", async () => {
    await addRegistered("rae@example.org");
    await addPrefs("mailto:rae@example.org", { email: "rae@example.org", morning_on: 1 });
    await runNotifyCron(env, MORNING, deps);
    expect(mails).toHaveLength(1);
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(2);
  });
  it("sends nothing to someone who unsubscribed, was marked undeliverable, or did not register for 2026", async () => {
    await addRegistered("gone@example.org", { subscribed: 0 });
    await addRegistered("bounced@example.org", { tags: "friend, undeliverable" });
    await addRegistered("old@example.org", { form: "register-2025" });
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
  it("sends nothing to someone who unsubscribed from the 8 PM note (their unsubscribe link wrote evening_on = 0)", async () => {
    await addRegistered("rae@example.org");
    await addPrefs("mailto:rae@example.org", { email: "rae@example.org", evening_on: 0 });
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(0);
    expect(ledger()).toMatchObject([{ status: "skipped", reason: "off" }]);
  });
  it("one address, one email: an account and an address-keyed row for the same address do not both send", async () => {
    await addRegistered("rae@example.org");
    await addPrefs(ME, { email: "rae@example.org" });
    await addPrefs("mailto:rae@example.org", { email: "rae@example.org", email_optin_at: "2026-10-02T00:00:00Z" });
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(1);
    expect(ledger().map((r) => r.person_key)).toEqual([ME]);
    await runNotifyCron(env, new Date(EVENING.getTime() + 60_000), deps);
    expect(mails).toHaveLength(1);
  });
  it("a signed-in account whose verified address is a registration is also on by default, and not sent twice", async () => {
    await addRegistered("rae@example.org");
    await addPrefs(ME, { email: "rae@example.org" });
    await runNotifyCron(env, EVENING, deps);
    expect(mails.map((m) => m.to)).toEqual(["rae@example.org"]);
    expect(ledger()).toMatchObject([{ person_key: ME, channel: "email", status: "sent" }]);
  });
  it("people with the app keep today's defaults: all three notes by push, and a registration adds no email", async () => {
    await addRegistered("rae@example.org");
    await addDevice(ME);
    await addPrefs(ME, { email: "rae@example.org" });
    await runNotifyCron(env, EVENING, deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(0);
    await runNotifyCron(env, MORNING, deps);
    expect(pushed).toHaveLength(2);
    expect(mails).toHaveLength(0);
  });
  it("someone who is not registered and has no settings gets nothing at all", async () => {
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(0);
    expect(pushed).toHaveLength(0);
  });
  it("phone and email both: a push to the live phone and the email, one ledger row", async () => {
    await addRegistered("rae@example.org");
    await addDevice(ME);
    await addPrefs(ME, { email: "rae@example.org", evening_on: 1, evening_channel: "push" });
    await db().prepare("UPDATE notify_prefs SET also_email = 'evening' WHERE person_key = ?1").bind(ME).run();
    await runNotifyCron(env, EVENING, deps);
    expect(pushed).toHaveLength(1);
    expect(mails).toHaveLength(1);
    expect(ledger()).toMatchObject([{ person_key: ME, channel: "push+email", status: "sent" }]);
  });
  it("caps emails per tick and finishes the run on the next ticks, logging totals", async () => {
    for (let i = 0; i < 95; i++) await addRegistered(`p${String(i).padStart(3, "0")}@example.org`);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(MAX_EMAILS_PER_TICK);
    expect(all("SELECT * FROM notify_runs WHERE completed_at IS NOT NULL")).toHaveLength(0);
    await runNotifyCron(env, new Date(EVENING.getTime() + 60_000), deps);
    expect(mails).toHaveLength(MAX_EMAILS_PER_TICK * 2);
    await runNotifyCron(env, new Date(EVENING.getTime() + 120_000), deps);
    expect(mails).toHaveLength(95);
    expect(new Set(mails.map((m) => m.to)).size).toBe(95);
    expect(all("SELECT * FROM notify_runs WHERE completed_at IS NOT NULL")).toHaveLength(1);
    expect(info.mock.calls.map((c) => String(c[0]))).toContain("notify evening 2026-10-16 done: 95 sent/email");
    info.mockRestore();
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
    // ends 8:30 PM, after the 8 PM note: the separate invitation stays
    events = [event("water", "2026-10-17T00:30:00Z", "2026-10-17T02:30:00Z", "Honoring Water | with Angelique")];
    await addPrefs("mailto:sam@example.org", { email: "sam@example.org", email_optin_at: "2026-10-12T00:00:00Z" });
    await addPrefs("mailto:no@example.org", { email: "no@example.org" });
    for (const email of ["sam@example.org", "no@example.org", "stranger@example.org"]) {
      await db().prepare("INSERT INTO event_rsvps(id,event_did,event_rkey,event_name,event_starts_at,email,cancel_token,created_at) VALUES (?1,'did:plc:mockscene','water','Honoring Water','2026-10-16T15:00:00Z',?2,?1,'2026-10-12T00:00:00Z')").bind(`id-${email}`, email).run();
    }
    await runNotifyCron(env, new Date("2026-10-17T03:35:00Z"), deps);
    expect(mails.map((m) => m.to)).toEqual(["sam@example.org"]);
    expect(mails[0].message.subject).toBe("How was Honoring Water?");
    expect(mails[0].message.text).toContain("https://cohereboulder.org/events/did%3Aplc%3Amockscene/water");
    expect(mails[0].message.text).toContain("Harvests show your name.");
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

describe("the 8 PM note as the one daily email", () => {
  // Today is Fri Oct 16 (Boulder). Water ended 10:15 AM and Tea 2 PM; Late ends 9 PM; tomorrow has three events.
  const water = event("water", "2026-10-16T15:00:00Z", "2026-10-16T16:15:00Z", "Honoring Water | with Angelique");
  const tea = event("tea", "2026-10-16T19:00:00Z", "2026-10-16T20:00:00Z", "Tea Circle");
  const late = event("late", "2026-10-17T01:00:00Z", "2026-10-17T03:00:00Z", "Night Walk");
  const tomorrow = [
    event("a", "2026-10-17T15:00:00Z", "2026-10-17T16:00:00Z", "Honoring Water"),
    event("b", "2026-10-17T19:00:00Z", null, "Soup Night"),
    event("c", "2026-10-17T21:00:00Z", null, "Song Circle"),
  ];
  const SAM = "mailto:sam@example.org";
  const rsvp = (email: string, rkey: string) =>
    db().prepare("INSERT INTO event_rsvps(id,event_did,event_rkey,event_name,event_starts_at,email,cancel_token,created_at) VALUES (?1,'did:plc:mockscene',?2,'x','2026-10-16T15:00:00Z',?3,?1,'2026-10-12T00:00:00Z')").bind(`${rkey}-${email}`, rkey, email).run();
  const harvest = (id: string, author: string, rkey: string, createdAt = "2026-10-16T22:00:00Z") =>
    db().prepare("INSERT INTO harvests(id,event_did,event_rkey,event_name,author_did,body,created_at) VALUES (?1,'did:plc:mockscene',?2,'x',?3,'PRIVATE WORDS',?4)").bind(id, rkey, author, createdAt).run();
  beforeEach(async () => {
    events = [water, tea, late, ...tomorrow];
    await addDaily("2026-10-17");
    await addPrefs(SAM, { email: "sam@example.org", email_optin_at: "2026-10-12T00:00:00Z" });
    await rsvp("sam@example.org", "water");
    await rsvp("sam@example.org", "late");
  });

  it("carries every section in order: practice, one list of tomorrow's events, today's harvests, footer", async () => {
    await rsvp("sam@example.org", "a");
    await harvest("h1", "did:plc:x", "tea");
    await harvest("h2", "did:plc:y", "tea");
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(1);
    const { message } = mails[0];
    expect(message.subject).toBe("Tomorrow at COhere: Saturday, October 17");
    const t = message.text!;
    const order = ["Tomorrow’s practice", "Tomorrow’s events", "Today’s harvests", "Change your settings"].map((h) => t.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(t).toContain("Learn the names of three neighbours. Say them out loud twice.");
    // one list, time order, with the going one marked and the others offering the one-tap RSVP
    const events = t.slice(t.indexOf("Tomorrow’s events"), t.indexOf("Today’s harvests"));
    expect(events.indexOf("Honoring Water")).toBeLessThan(events.indexOf("Soup Night"));
    expect(events.indexOf("Soup Night")).toBeLessThan(events.indexOf("Song Circle"));
    expect(events.match(/✓ RSVP’d/g)).toHaveLength(1);
    expect(events.match(/RSVP: I’m going: https:/g)).toHaveLength(2);
    expect(events.match(/Details: https:/g)).toHaveLength(3);
    expect(t).not.toMatch(/You’re going|Also tomorrow|Open tomorrow in COhere|Ready for tomorrow/);
    expect(t).toContain("Sent to sam@example.org");
    // water (ended 10 AM, went) is to share; late (ends 9 PM) and tea (did not go) are not
    const share = t.slice(t.indexOf("Today’s harvests"), t.indexOf("Sent to"));
    expect(share).toContain("Honoring Water | with Angelique");
    expect(share).toContain("Share harvest: https://cohereboulder.org/events/did%3Aplc%3Amockscene/water");
    expect(share).not.toContain("Night Walk");
    expect(share).not.toContain("Tea Circle");
    expect(t).toContain("2 people shared harvests today: https://cohereboulder.org/today");
    expect(message.html).toContain("Share harvest");
    expect(message.html).toContain("color:#2e7d32");
  });
  it("previews an event's own description, cleaned and cut on a word, never reworded", async () => {
    const long = "**Join us** for a [water ceremony](https://x.test/a) at the creek. <p>Bring a cup &amp; a friend.</p> " + "We will walk slowly and listen to the water together. ".repeat(6);
    events = [{ ...water }, { ...tomorrow[0], description: long }, tomorrow[1]];
    await runNotifyCron(env, EVENING, deps);
    const t = mails[0].message.text!;
    const line = t.split("\n").find((l) => l.startsWith("Join us for a water ceremony at the creek. Bring a cup & a friend."))!;
    expect(line).toBeTruthy();
    expect(line.length).toBeLessThanOrEqual(162);
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toMatch(/[*<>[\]]|https/);
    expect(mails[0].message.html).toContain("Join us for a water ceremony");
  });
  it("leaves out a section that is empty", async () => {
    events = tomorrow;
    await runNotifyCron(env, EVENING, deps);
    const t = mails[0].message.text!;
    expect(t).toContain("Tomorrow’s practice");
    expect(t).toContain("Tomorrow’s events");
    expect(t).not.toContain("Today’s harvests");
    mails.length = 0;
    await db().prepare("DELETE FROM companion_daily").run();
    await db().prepare("DELETE FROM notify_ledger").run();
    await db().prepare("DELETE FROM notify_runs").run();
    await runNotifyCron(env, EVENING, deps);
    expect(mails[0].message.text).not.toContain("Tomorrow’s practice");
  });
  it("does not offer a harvest already shared, and says nothing of an event they did not go to", async () => {
    await harvest("h1", "did:plc:sam", "water");
    await db().prepare("UPDATE notify_prefs SET did = NULL WHERE person_key = ?1").bind(SAM).run();
    // an account person who shared: no share section; the count still shows
    await addPrefs(ME, { email: "me@example.org", evening_channel: "email", evening_on: 1 });
    guests["did:plc:mockscene/water"] = [ME];
    await harvest("h2", ME, "water");
    await runNotifyCron(env, EVENING, deps);
    const mine = mails.find((m) => m.to === "me@example.org")!.message.text!;
    expect(mine).not.toContain("Share harvest");
    expect(mine).toContain("2 people shared harvests today");
  });
  it("never puts a harvest's words, or its author, in the email", async () => {
    await harvest("h1", "did:plc:x", "tea");
    await runNotifyCron(env, EVENING, deps);
    const { message } = mails[0];
    expect(message.text).not.toContain("PRIVATE WORDS");
    expect(message.html).not.toContain("PRIVATE WORDS");
    expect(message.text).not.toContain("did:plc:x");
    expect(message.text).toContain("1 person shared a harvest today");
  });
  it("a hidden harvest is not counted", async () => {
    await harvest("h1", "did:plc:x", "tea");
    await db().prepare("INSERT INTO board_moderation(uri,state,created_at,updated_at) VALUES ('cohere:harvest/h1','hidden','2026-10-16T23:00:00Z','2026-10-16T23:00:00Z')").run();
    await runNotifyCron(env, EVENING, deps);
    expect(mails[0].message.text).not.toMatch(/shared a? ?harvest/);
  });
  it("sends on a day with a practice tomorrow and no events", async () => {
    events = [];
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(1);
    const t = mails[0].message.text!;
    expect(t).toContain("Tomorrow’s practice");
    expect(t).not.toContain("Tomorrow’s events");
  });
  it("sends on a day with only a harvest to share, and nothing when there is truly nothing", async () => {
    events = [water];
    await db().prepare("DELETE FROM companion_daily").run();
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(1);
    expect(mails[0].message.text).toContain("Today’s harvests");
    mails.length = 0;
    await db().prepare("DELETE FROM notify_ledger").run();
    await db().prepare("DELETE FROM notify_runs").run();
    await db().prepare("DELETE FROM event_rsvps").run();
    await runNotifyCron(env, EVENING, deps);
    expect(mails).toHaveLength(0);
  });
  it("a push person on a practice-only day gets no 8 PM push", async () => {
    events = [];
    await addDevice(ME);
    await addPrefs(ME);
    await runNotifyCron(env, EVENING, deps);
    expect(pushed).toHaveLength(0);
  });
  it("the harvest email is not sent again for an event the digest carried (ended before 8 PM), and is for one ending later", async () => {
    // ended 10:15 AM → digest carries it → the 11:15 AM harvest invitation is not emailed
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(mails).toHaveLength(0);
    expect(all("SELECT reason FROM notify_ledger WHERE type = 'harvest'")).toEqual([{ reason: "in-digest" }]);
    // ... and the digest has it, once
    await runNotifyCron(env, EVENING, deps);
    await runNotifyCron(env, new Date(EVENING.getTime() + 60_000), deps);
    expect(mails.filter((m) => m.message.text!.includes("Today’s harvests"))).toHaveLength(1);
    // ended 9 PM → the digest cannot carry it → the separate invitation goes
    await runNotifyCron(env, new Date("2026-10-17T04:05:00Z"), deps);
    const harvestMails = mails.filter((m) => m.message.subject.startsWith("How was"));
    expect(harvestMails.map((m) => m.message.subject)).toEqual(["How was Night Walk?"]);
  });
  it("someone whose 8 PM note is off still gets the separate harvest email", async () => {
    await db().prepare("UPDATE notify_prefs SET evening_on = 0 WHERE person_key = ?1").bind(SAM).run();
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(mails.map((m) => m.message.subject)).toEqual(["How was Honoring Water?"]);
  });
  it("a push harvest invitation is unchanged by the digest", async () => {
    await addDevice(ME);
    await addPrefs(ME);
    guests["did:plc:mockscene/water"] = [ME];
    await runNotifyCron(env, new Date("2026-10-16T17:15:00Z"), deps);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].payload.title).toBe("How was Honoring Water?");
  });
});
