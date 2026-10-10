import { beforeEach, describe, expect, it, vi } from "vitest";

// auth.ts imports the Workers-only email module; nothing here sends real mail.
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { buildMime, type MailMessage } from "./auth";
import {
  confirmationEmail,
  groupReminders,
  handleCreateRsvp,
  handleRsvpCancel,
  reminderEmail,
  runRsvpCron,
  zonedDayWindow,
  type LiveEvent,
  type LiveLookup,
  type RsvpRow,
} from "./rsvps";
import { testD1, testKV } from "./test-d1";

const BASE = "https://cohereboulder.org";
const DID = "did:plc:mockscene";

function makeEnv() {
  return {
    cohere: testD1(["../migrations/0004_event_rsvps.sql"]),
    COHERE_AUTH: testKV(),
    PUBLIC_BASE_URL: BASE,
  } as unknown as Parameters<typeof handleCreateRsvp>[1] & { cohere: ReturnType<typeof testD1> };
}

function liveEvent(rkey: string, startsAt: string, extra: Partial<LiveEvent> = {}): LiveEvent {
  return { did: DID, rkey, name: `Event ${rkey}`, startsAt, endsAt: null, status: "scheduled", where: "Mock Hall", ...extra };
}

function lookupFrom(events: Record<string, LiveLookup>) {
  return vi.fn(async (_env: unknown, _did: string, rkey: string): Promise<LiveLookup> => events[rkey] ?? { kind: "gone" });
}

function post(body: unknown, ip = "192.0.2.1") {
  return new Request(`${BASE}/api/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const NOW = new Date("2026-10-14T15:00:00Z"); // 9am MDT on Oct 14

// ------------------------------------------------------------------ time

describe("zonedDayWindow (America/Denver)", () => {
  it("is tomorrow's local midnight-to-midnight during MDT", () => {
    expect(zonedDayWindow(NOW)).toEqual({ start: "2026-10-15T06:00:00.000Z", end: "2026-10-16T06:00:00.000Z" });
  });
  it("uses the local date, not the UTC date, late in the evening", () => {
    // 11:30pm MDT on Oct 14 is already Oct 15 in UTC; tomorrow is still Oct 15 locally.
    expect(zonedDayWindow(new Date("2026-10-15T05:30:00Z")).start).toBe("2026-10-15T06:00:00.000Z");
  });
  it("handles the 25-hour day when DST ends (Nov 1, 2026)", () => {
    const w = zonedDayWindow(new Date("2026-10-31T15:00:00Z"));
    expect(w).toEqual({ start: "2026-11-01T06:00:00.000Z", end: "2026-11-02T07:00:00.000Z" });
  });
  it("handles the 23-hour day when DST starts (Mar 8, 2026)", () => {
    const w = zonedDayWindow(new Date("2026-03-07T16:00:00Z"));
    expect(w).toEqual({ start: "2026-03-08T07:00:00.000Z", end: "2026-03-09T06:00:00.000Z" });
  });
});

// ------------------------------------------------------------ POST /api/rsvp

describe("POST /api/rsvp", () => {
  let env: ReturnType<typeof makeEnv>;
  let send: ReturnType<typeof vi.fn>;
  const future = liveEvent("ev1", "2026-10-16T00:30:00.000Z");
  const deps = () => ({ lookup: lookupFrom({ ev1: { kind: "ok", event: future } }), send, now: () => NOW });

  beforeEach(() => {
    env = makeEnv();
    send = vi.fn().mockResolvedValue(undefined);
  });

  it("stores the RSVP with an event snapshot and sends one confirmation", async () => {
    const res = await handleCreateRsvp(
      post({ did: DID, rkey: "ev1", email: " Ana@Example.org ", name: "Ana Mock", language: "es" }),
      env,
      new URL(`${BASE}/api/rsvp`),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const rows = env.cohere.raw.prepare("SELECT * FROM event_rsvps").all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_did: DID,
      event_rkey: "ev1",
      event_name: "Event ev1",
      event_starts_at: "2026-10-16T00:30:00.000Z",
      event_where: "Mock Hall",
      email: "ana@example.org",
      name: "Ana Mock",
      language: "es",
      reminder_sent_at: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const [, to, message] = send.mock.calls[0] as [unknown, string, MailMessage];
    expect(to).toBe("ana@example.org");
    expect(message.subject).toContain("Event ev1");
    expect(message.text).toContain(`${BASE}/rsvp/cancel?token=${rows[0].cancel_token}`);
    expect(message.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(message.attachments?.[0].content).toContain("DTSTART:20261016T003000Z");
  });

  it("dedupes on (event, email): a repeat answers already and resends its link", async () => {
    const url = new URL(`${BASE}/api/rsvp`);
    await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "ana@example.org" }), env, url, deps());
    const again = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "ANA@example.org" }), env, url, deps());
    expect(await again.json()).toEqual({ ok: true, already: true });
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ did: DID, rkey: "ev1", email: "not-an-email" }, 400],
    [{ did: DID, rkey: "ev1" }, 400],
    [{ did: "not-a-did", rkey: "ev1", email: "a@b.org" }, 400],
    [{ did: DID, rkey: "../x", email: "a@b.org" }, 400],
    [{ did: DID, rkey: "missing", email: "a@b.org" }, 404],
    ["{not json", 400],
  ])("rejects %j with %i and stores nothing", async (body, status) => {
    const res = await handleCreateRsvp(post(body), env, new URL(`${BASE}/api/rsvp`), deps());
    expect(res.status).toBe(status);
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses cancelled, past, and undated events", async () => {
    const url = new URL(`${BASE}/api/rsvp`);
    for (const event of [
      liveEvent("ev1", "2026-10-16T00:30:00.000Z", { status: "cancelled" }),
      liveEvent("ev1", "2026-10-01T00:30:00.000Z"),
      liveEvent("ev1", "", { startsAt: null }),
    ]) {
      const res = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "a@b.org" }), env, url, {
        ...deps(),
        lookup: lookupFrom({ ev1: { kind: "ok", event } }),
      });
      expect(res.status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("says 503 (not 'unknown event') when regenOS is unreachable", async () => {
    const res = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "a@b.org" }), env, new URL(`${BASE}/api/rsvp`), {
      ...deps(),
      lookup: lookupFrom({ ev1: { kind: "unavailable" } }),
    });
    expect(res.status).toBe(503);
  });

  it("silently swallows the honeypot", async () => {
    const res = await handleCreateRsvp(
      post({ did: DID, rkey: "ev1", email: "a@b.org", website: "spam" }),
      env,
      new URL(`${BASE}/api/rsvp`),
      deps(),
    );
    expect(await res.json()).toEqual({ ok: true });
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("rate-limits one address across many requests", async () => {
    const url = new URL(`${BASE}/api/rsvp`);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "flood@b.org" }, `198.51.100.${i}`), env, url, deps());
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("rate-limits one IP across many addresses", async () => {
    const url = new URL(`${BASE}/api/rsvp`);
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      const res = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: `p${i}@b.org` }), env, url, deps());
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(20);
  });

  it("keeps the RSVP and lets its owner retry a failed confirmation", async () => {
    send.mockRejectedValueOnce(new Error("mail down"));
    const url = new URL(`${BASE}/api/rsvp`);
    const res = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "a@b.org" }), env, url, deps());
    expect(res.status).toBe(200);
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(1);
    const retry = await handleCreateRsvp(post({ did: DID, rkey: "ev1", email: "a@b.org" }), env, url, deps());
    expect(await retry.json()).toEqual({ ok: true, already: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1][2] as MailMessage).text).toContain("/rsvp/cancel?token=");
  });
});

// ------------------------------------------------------------ /rsvp/cancel

function seed(env: ReturnType<typeof makeEnv>, row: Partial<RsvpRow> & { id: string; email: string; event_rkey: string; event_starts_at: string }) {
  env.cohere.raw
    .prepare(
      `INSERT INTO event_rsvps (id, event_did, event_rkey, event_name, event_starts_at, event_where, email, name, language, cancel_token, reminder_sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.event_did ?? DID,
      row.event_rkey,
      row.event_name ?? `Event ${row.event_rkey}`,
      row.event_starts_at,
      row.event_where ?? null,
      row.email,
      row.name ?? null,
      row.language ?? "en",
      row.cancel_token ?? `${row.id.padEnd(16, "0")}`.replace(/[^a-f0-9]/g, "a"),
      row.reminder_sent_at ?? null,
      row.created_at ?? "2026-10-01T00:00:00.000Z",
    );
}

describe("/rsvp/cancel", () => {
  it("GET offers a one-click browser POST without mutating; repeat POST is harmless", async () => {
    const env = makeEnv();
    seed(env, { id: "r1", email: "a@b.org", event_rkey: "ev1", event_starts_at: "2026-10-16T00:30:00.000Z", cancel_token: "abcdef0123456789" });
    const url = new URL(`${BASE}/rsvp/cancel?token=abcdef0123456789`);

    const preview = await handleRsvpCancel(new Request(url), env, url);
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain("document.getElementById('cancel').submit()");
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(1);
    const done = await handleRsvpCancel(new Request(url, { method: "POST" }), env, url);
    expect(await done.text()).toContain("RSVP cancelled");
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(0);
    const again = await handleRsvpCancel(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }), env, url);
    expect(again.status).toBe(200);
    expect((await handleRsvpCancel(new Request(url), env, url)).status).toBe(404);
  });

  it("cancels several RSVPs from one reminder link, and only those", async () => {
    const env = makeEnv();
    seed(env, { id: "r1", email: "a@b.org", event_rkey: "ev1", event_starts_at: "2026-10-16T00:30:00.000Z", cancel_token: "aaaaaaaaaaaaaaa1" });
    seed(env, { id: "r2", email: "a@b.org", event_rkey: "ev2", event_starts_at: "2026-10-16T02:30:00.000Z", cancel_token: "aaaaaaaaaaaaaaa2" });
    seed(env, { id: "r3", email: "c@d.org", event_rkey: "ev1", event_starts_at: "2026-10-16T00:30:00.000Z", cancel_token: "aaaaaaaaaaaaaaa3" });
    const url = new URL(`${BASE}/rsvp/cancel?token=aaaaaaaaaaaaaaa1,aaaaaaaaaaaaaaa2,<script>`);
    await handleRsvpCancel(new Request(url, { method: "POST" }), env, url);
    expect(env.cohere.raw.prepare("SELECT id FROM event_rsvps").all()).toEqual([{ id: "r3" }]);
  });

  it("ignores junk tokens", async () => {
    const env = makeEnv();
    const url = new URL(`${BASE}/rsvp/cancel?token=' OR 1=1 --`);
    expect((await handleRsvpCancel(new Request(url), env, url)).status).toBe(404);
  });
});

// ------------------------------------------------------------------- cron

describe("runRsvpCron", () => {
  // Tomorrow (Oct 15, Denver) runs 2026-10-15T06:00Z .. 2026-10-16T06:00Z.
  const TOMORROW_EARLY = "2026-10-15T06:00:00.000Z"; // 12:00am Oct 15 MDT — inside
  const TOMORROW_LATE = "2026-10-16T05:59:00.000Z"; // 11:59pm Oct 15 MDT — inside
  const DAY_AFTER = "2026-10-16T06:00:00.000Z"; // 12:00am Oct 16 MDT — outside
  const TONIGHT = "2026-10-15T05:00:00.000Z"; // 11pm Oct 14 MDT — today, outside

  function setup() {
    const env = makeEnv();
    seed(env, { id: "a1", email: "ana@x.org", name: "Ana", event_rkey: "early", event_starts_at: TOMORROW_EARLY });
    seed(env, { id: "a2", email: "ana@x.org", event_rkey: "late", event_starts_at: TOMORROW_LATE });
    seed(env, { id: "a3", email: "ana@x.org", event_rkey: "dayafter", event_starts_at: DAY_AFTER });
    seed(env, { id: "b1", email: "bo@x.org", event_rkey: "late", event_starts_at: TOMORROW_LATE, language: "es" });
    seed(env, { id: "c1", email: "cy@x.org", event_rkey: "tonight", event_starts_at: TONIGHT });
    seed(env, { id: "d1", email: "di@x.org", event_rkey: "deleted", event_starts_at: TOMORROW_LATE });
    seed(env, { id: "e1", email: "ed@x.org", event_rkey: "cancelled", event_starts_at: TOMORROW_LATE });
    seed(env, { id: "old", email: "ol@x.org", event_rkey: "old", event_starts_at: "2026-09-13T00:00:00.000Z" });
    seed(env, { id: "keep", email: "ke@x.org", event_rkey: "recent", event_starts_at: "2026-09-15T00:00:00.000Z", reminder_sent_at: "x" });
    const lookup = lookupFrom({
      early: { kind: "ok", event: liveEvent("early", TOMORROW_EARLY) },
      late: { kind: "ok", event: liveEvent("late", TOMORROW_LATE) },
      dayafter: { kind: "ok", event: liveEvent("dayafter", DAY_AFTER) },
      tonight: { kind: "ok", event: liveEvent("tonight", TONIGHT) },
      cancelled: { kind: "ok", event: liveEvent("cancelled", TOMORROW_LATE, { status: "cancelled" }) },
    });
    const send = vi.fn().mockResolvedValue(undefined);
    return { env, lookup, send };
  }

  it("pauses reminders without writing claims, still purges, and resumes once", async () => {
    const { env, lookup, send } = setup();
    env.RSVP_REMINDERS_PAUSED = "true";
    const prepare = vi.spyOn(env.cohere, "prepare");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const result = await runRsvpCron(env, NOW, { lookup, send });
      expect(result).toMatchObject({ deleted: 1, claimed: 0, emailsSent: 0 });
      expect(send).not.toHaveBeenCalled();
      expect(prepare.mock.calls.some(([sql]) => /UPDATE event_rsvps SET reminder_sent_at/.test(sql))).toBe(false);
      expect(env.cohere.raw.prepare("SELECT id FROM event_rsvps WHERE reminder_sent_at IS NOT NULL").all()).toEqual([{ id: "keep" }]);
      expect(env.cohere.raw.prepare("SELECT id FROM event_rsvps WHERE id = 'old'").all()).toEqual([]);
      expect(log).toHaveBeenCalledWith("rsvp reminders paused");

      env.RSVP_REMINDERS_PAUSED = "false";
      expect(await runRsvpCron(env, NOW, { lookup, send })).toMatchObject({ claimed: 3, emailsSent: 2 });
      expect(await runRsvpCron(env, NOW, { lookup, send })).toMatchObject({ claimed: 0, emailsSent: 0 });
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
      prepare.mockRestore();
    }
  });

  it("sends one email per person for tomorrow's events (Denver day), skipping deleted/cancelled", async () => {
    const { env, lookup, send } = setup();
    const result = await runRsvpCron(env, NOW, { lookup, send });
    expect(result).toMatchObject({ claimed: 3, emailsSent: 2, emailsFailed: 0, skippedGone: 2, skippedCancelled: 1 });

    const byTo = Object.fromEntries(send.mock.calls.map(([, to, m]) => [to, m as MailMessage]));
    expect(Object.keys(byTo).sort()).toEqual(["ana@x.org", "bo@x.org"]);
    expect(byTo["ana@x.org"].subject).toBe("Tomorrow: 2 COhere events");
    expect(byTo["ana@x.org"].text.indexOf("Event early")).toBeLessThan(byTo["ana@x.org"].text.indexOf("Event late"));
    expect(byTo["ana@x.org"].text).not.toContain("Event dayafter");
    expect(byTo["ana@x.org"].headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/cohereboulder\.org\/rsvp\/cancel\?token=[a-f0-9]+,[a-f0-9]+>$/);
    expect(byTo["bo@x.org"].subject).toBe("Mañana: Event late");

    const sent = env.cohere.raw.prepare("SELECT id FROM event_rsvps WHERE reminder_sent_at IS NOT NULL ORDER BY id").all();
    expect(sent.map((r) => r.id)).toEqual(["a1", "a2", "b1", "keep"]);
  });

  it("deletes RSVPs 30+ days after their event, and nothing newer", async () => {
    const { env, lookup, send } = setup();
    const result = await runRsvpCron(env, NOW, { lookup, send });
    expect(result.deleted).toBe(1);
    const ids = env.cohere.raw.prepare("SELECT id FROM event_rsvps").all().map((r) => r.id);
    expect(ids).not.toContain("old");
    expect(ids).toContain("keep");
  });

  it("is idempotent: a second run the same day sends nothing", async () => {
    const { env, lookup, send } = setup();
    await runRsvpCron(env, NOW, { lookup, send });
    send.mockClear();
    const again = await runRsvpCron(env, new Date(NOW.getTime() + 60_000), { lookup, send });
    expect(again.emailsSent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when a send fails, so a re-run retries only that person", async () => {
    const { env, lookup, send } = setup();
    send.mockImplementation(async (_env: unknown, to: string) => {
      if (to === "bo@x.org") throw new Error("mail down");
    });
    const first = await runRsvpCron(env, NOW, { lookup, send });
    expect(first).toMatchObject({ emailsSent: 1, emailsFailed: 1 });
    expect(env.cohere.raw.prepare("SELECT reminder_sent_at FROM event_rsvps WHERE id = 'b1'").all()[0].reminder_sent_at).toBeNull();

    send.mockReset().mockResolvedValue(undefined);
    const retry = await runRsvpCron(env, NOW, { lookup, send });
    expect(retry.emailsSent).toBe(1);
    expect(send.mock.calls.map(([, to]) => to)).toEqual(["bo@x.org"]);
  });

  it("follows a moved event: reminds on its new day with the new details, not the snapshot", async () => {
    const env = makeEnv();
    seed(env, { id: "m1", email: "mo@x.org", event_rkey: "moved", event_starts_at: "2026-10-20T01:00:00.000Z", event_name: "Old name" });
    seed(env, { id: "m2", email: "mo@x.org", event_rkey: "away", event_starts_at: TOMORROW_LATE });
    const lookup = lookupFrom({
      moved: { kind: "ok", event: liveEvent("moved", "2026-10-15T18:00:00.000Z", { name: "New name", where: "New Hall" }) },
      away: { kind: "ok", event: liveEvent("away", "2026-10-22T18:00:00.000Z") },
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await runRsvpCron(env, NOW, { lookup, send });
    expect(result.emailsSent).toBe(1);
    const message = send.mock.calls[0][2] as MailMessage;
    expect(message.text).toContain("New name");
    expect(message.text).toContain("New Hall");
    expect(message.text).not.toContain("Event away");
    const rows = env.cohere.raw.prepare("SELECT id, event_starts_at, event_name, reminder_sent_at FROM event_rsvps ORDER BY id").all();
    expect(rows[0]).toMatchObject({ id: "m1", event_starts_at: "2026-10-15T18:00:00.000Z", event_name: "New name" });
    expect(rows[1]).toMatchObject({ id: "m2", event_starts_at: "2026-10-22T18:00:00.000Z", reminder_sent_at: null });
  });

  it("rescues an RSVP moved in from beyond the old lookup window or retention cutoff", async () => {
    const env = makeEnv();
    seed(env, { id: "far", email: "far@x.org", event_rkey: "far", event_starts_at: "2027-03-01T18:00:00.000Z" });
    seed(env, { id: "oldmove", email: "old@x.org", event_rkey: "oldmove", event_starts_at: "2026-09-01T18:00:00.000Z" });
    const lookup = lookupFrom({
      far: { kind: "ok", event: liveEvent("far", TOMORROW_EARLY) },
      oldmove: { kind: "ok", event: liveEvent("oldmove", TOMORROW_LATE) },
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await runRsvpCron(env, NOW, { lookup, send });
    expect(result.emailsSent).toBe(2);
    expect(result.deleted).toBe(0);
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_rsvps").all()[0].n).toBe(2);
  });

  it("falls back to the snapshot when regenOS is unreachable", async () => {
    const env = makeEnv();
    seed(env, { id: "u1", email: "un@x.org", event_rkey: "flaky", event_starts_at: TOMORROW_LATE, event_name: "Snapshot name" });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await runRsvpCron(env, NOW, { lookup: lookupFrom({ flaky: { kind: "unavailable" } }), send });
    expect(result.emailsSent).toBe(1);
    expect((send.mock.calls[0][2] as MailMessage).subject).toBe("Tomorrow: Snapshot name");
  });

  it("two overlapping runs never double-send", async () => {
    const { env, lookup, send } = setup();
    await Promise.all([runRsvpCron(env, NOW, { lookup, send }), runRsvpCron(env, NOW, { lookup, send })]);
    const recipients = send.mock.calls.map(([, to]) => to).sort();
    expect(recipients).toEqual(["ana@x.org", "bo@x.org"]);
  });
});

// ------------------------------------------------------------------ email

describe("emails", () => {
  it("groups reminders by address in start order", () => {
    const row = (id: string, email: string, startsAt: string): RsvpRow & { live: LiveEvent } => ({
      id, event_did: DID, event_rkey: id, event_name: id, event_starts_at: startsAt, event_where: null,
      email, name: null, language: "en", cancel_token: `tok${id}`, reminder_sent_at: null, created_at: "",
      live: liveEvent(id, startsAt),
    });
    const groups = groupReminders(
      [row("b", "x@y.org", "2026-10-15T20:00:00Z"), row("a", "x@y.org", "2026-10-15T16:00:00Z"), row("c", "z@y.org", "2026-10-15T18:00:00Z")],
      BASE,
    );
    expect(groups.map((g) => [g.email, g.ids])).toEqual([["x@y.org", ["a", "b"]], ["z@y.org", ["c"]]]);
    expect(groups[0].items[0].link).toBe(`${BASE}/events/${DID}/a`);
  });

  it("escapes event text in HTML and shows Denver time", () => {
    const message = reminderEmail(
      { email: "a@b.org", name: "<b>Ana</b>", language: "en" },
      [{ name: "<script>x</script>", startsAt: "2026-10-16T00:30:00Z", where: null, link: `${BASE}/events/x/y`, cancelToken: "abc" }],
      BASE,
    );
    expect(message.html).not.toContain("<script>x");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.text).toContain("6:30 PM MDT");
  });

  it("builds MIME with the unsubscribe headers and an .ics attachment", () => {
    const message = confirmationEmail(liveEvent("ev1", "2026-10-16T00:30:00.000Z"), { name: null, cancel_token: "abc123" }, "en", BASE);
    const mime = buildMime({ name: "COhere Boulder", address: "cohere@wovenweb.org" }, "a@b.org", message);
    expect(mime).toContain(`List-Unsubscribe: <${BASE}/rsvp/cancel?token=abc123>`);
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(mime).toContain("Content-Type: multipart/mixed;");
    expect(mime).toContain('Content-Disposition: attachment; filename="event.ics"');
  });

  it("drops header values that could inject lines", () => {
    const mime = buildMime({ name: "", address: "cohere@wovenweb.org" }, "a@b.org", {
      subject: "s", html: "h", text: "t", headers: { "X-Evil": "a\r\nBcc: victim@x.org", "X-Fine": "ok" },
    });
    expect(mime).not.toContain("Bcc:");
    expect(mime).toContain("X-Fine: ok");
  });
});
