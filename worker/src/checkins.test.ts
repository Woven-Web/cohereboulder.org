import { beforeEach, describe, expect, it, vi } from "vitest";

// auth.ts (imported transitively) pulls in the Workers-only email module.
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import {
  csvCell,
  handleCheckin,
  handleCheckinCsv,
  handleCheckinRoster,
  handleRegistrantSearch,
  handleUndoCheckin,
  mergeRoster,
  pickerEvents,
  readCheckinInput,
  runCheckinRetention,
  type CheckinRow,
} from "./checkins";
import type { LiveLookup } from "./rsvps";
import { testD1, testKV } from "./test-d1";

const DID = "did:plc:mockscene";
const NOW = new Date("2026-10-16T01:00:00Z"); // 7pm MDT on Oct 15
const START = "2026-10-16T00:30:00.000Z";

function makeEnv() {
  return {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    PUBLIC_BASE_URL: "https://cohereboulder.org",
  } as unknown as Parameters<typeof handleCheckin>[1] & { cohere: ReturnType<typeof testD1> };
}

const okLookup = vi.fn(
  async (): Promise<LiveLookup> => ({
    kind: "ok",
    event: { did: DID, rkey: "ev1", name: "Opening Circle", startsAt: START, endsAt: null, status: null, where: "Mock Hall" },
  }),
);
const deps = { lookup: okLookup, now: () => NOW };

function post(body: unknown) {
  return new Request("https://cohereboulder.org/api/admin/checkin/x/y", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function checkinRow(extra: Partial<CheckinRow>): CheckinRow {
  return {
    id: "c-00000001",
    event_did: DID,
    event_rkey: "ev1",
    event_name: "Opening Circle",
    event_starts_at: START,
    email: null,
    guest_did: null,
    name: null,
    source: "walkin",
    person_id: null,
    checked_in_by: "org@cohere.test",
    checked_in_at: NOW.toISOString(),
    ...extra,
  };
}

function seedPerson(env: ReturnType<typeof makeEnv>, email: string, subscribed: number, name: string | null = null) {
  env.cohere.raw
    .prepare(
      `INSERT INTO people (id, email, name, subscribed, unsubscribe_token, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'form:register-2026', ?, ?)`,
    )
    .run(`p-${email}`, email, name, subscribed, `tok-${email}`, NOW.toISOString(), NOW.toISOString());
}

// ------------------------------------------------------------ the roster

describe("mergeRoster", () => {
  it("merges email RSVPs and regenOS guests, deduping each by its own key", () => {
    const r = mergeRoster(
      [
        { email: "Ana@Example.org", name: "Ana" },
        { email: "ana@example.org", name: "Ana again" },
        { email: "bo@example.org", name: null },
      ],
      [
        { did: "did:plc:g1", handle: "cy.test" },
        { did: "did:plc:g1", handle: "cy.test" },
        { did: "did:plc:g2", handle: null },
      ],
      [],
      new Map([["bo@example.org", { id: "p-bo", name: "Bo From People" }]]),
    );
    expect(r.expected.map((e) => e.key).sort()).toEqual(
      ["did:did:plc:g1", "did:did:plc:g2", "email:ana@example.org", "email:bo@example.org"].sort(),
    );
    const bo = r.expected.find((e) => e.email === "bo@example.org")!;
    expect(bo).toMatchObject({ name: "Bo From People", personId: "p-bo", source: "rsvp_email" });
    expect(r.counts).toEqual({ expected: 4, checkedIn: 0, expectedCheckedIn: 0, walkins: 0 });
  });

  it("marks expected people checked in by email (any source) or DID; the rest are others", () => {
    const r = mergeRoster(
      [{ email: "ana@example.org", name: "Ana" }],
      [{ did: "did:plc:g1", handle: "cy.test" }],
      [
        checkinRow({ id: "c-a", email: "ana@example.org", source: "registrant" }),
        checkinRow({ id: "c-g", guest_did: "did:plc:g1", source: "rsvp_regenos" }),
        checkinRow({ id: "c-w", name: "Walk In", source: "walkin" }),
        checkinRow({ id: "c-w2", email: "new@example.org", source: "walkin" }),
      ],
    );
    expect(r.expected.find((e) => e.email)?.checkinId).toBe("c-a");
    expect(r.expected.find((e) => e.guestDid)?.checkinId).toBe("c-g");
    expect(r.others.map((o) => o.id)).toEqual(["c-w", "c-w2"]);
    expect(r.counts).toEqual({ expected: 2, checkedIn: 4, expectedCheckedIn: 2, walkins: 2 });
  });
});

describe("pickerEvents", () => {
  const ev = (rkey: string, startsAt: string | null, endsAt: string | null = null) => ({ did: DID, rkey, name: rkey, startsAt, endsAt });
  it("defaults to the event happening now in Boulder, today first, past last", () => {
    const { events, defaultKey } = pickerEvents(
      [
        ev("tomorrow", "2026-10-16T18:00:00Z"),
        ev("lastweek", "2026-10-08T18:00:00Z"),
        ev("morning", "2026-10-15T15:00:00Z", "2026-10-15T17:00:00Z"),
        ev("tonight", "2026-10-16T00:30:00Z", "2026-10-16T03:00:00Z"),
        ev("undated", null),
      ],
      NOW,
    );
    expect(defaultKey).toBe(`${DID}|tonight`);
    // "morning" was today in Boulder (Oct 15) even though it's over.
    expect(events.map((e) => e.rkey)).toEqual(["morning", "tonight", "tomorrow", "undated", "lastweek"]);
    expect(events.find((e) => e.rkey === "morning")).toMatchObject({ today: true, isPast: true, now: false });
  });
  it("uses the Boulder date, not UTC: 7pm on Oct 15 is not 'today' for an Oct 16 morning event", () => {
    const { events, defaultKey } = pickerEvents([ev("oct16am", "2026-10-16T15:00:00Z")], NOW);
    expect(events[0].today).toBe(false);
    expect(defaultKey).toBeNull();
  });
});

// ------------------------------------------------------- input validation

describe("readCheckinInput", () => {
  it.each([
    [{ source: "walkin", name: "x" }, "missing or malformed id"],
    [{ id: "abcdefgh", source: "nope", name: "x" }, "unknown source"],
    [{ id: "abcdefgh", source: "walkin" }, "A walk-in needs a name or an email."],
    [{ id: "abcdefgh", source: "walkin", name: "x", email: "bad" }, "That doesn't look like an email address."],
    [{ id: "abcdefgh", source: "walkin", name: "x", subscribe: true }, "Joining the email list needs an email address."],
    [{ id: "abcdefgh", source: "rsvp_email", name: "x" }, "an email is required"],
    [{ id: "abcdefgh", source: "rsvp_regenos" }, "a regenOS guest is required"],
    [{ id: "abcdefgh", source: "walkin", name: "x", guestDid: "did:plc:x" }, "only regenOS guests carry a DID"],
  ])("rejects %j", (body, error) => {
    expect(readCheckinInput(body)).toEqual({ error });
  });
  it("only a walk-in can subscribe", () => {
    const r = readCheckinInput({ id: "abcdefgh", source: "registrant", email: "A@B.org", subscribe: true });
    expect(r).toMatchObject({ input: { email: "a@b.org", subscribe: false } });
  });
});

// ---------------------------------------------------------- check in/out

describe("POST check-in", () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => {
    env = makeEnv();
    okLookup.mockClear();
  });
  const count = () => env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM event_checkins").all()[0].n;

  it("stores a row with the event snapshot and the organizer", async () => {
    seedPerson(env, "ana@example.org", 1, "Ana");
    const res = await handleCheckin(
      post({ id: "id-000001", source: "rsvp_email", email: "ANA@example.org", name: "Ana" }),
      env, DID, "ev1", "org@cohere.test", deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already: boolean; checkin: CheckinRow };
    expect(body.already).toBe(false);
    expect(body.checkin).toMatchObject({
      id: "id-000001",
      email: "ana@example.org",
      event_name: "Opening Circle",
      event_starts_at: START,
      source: "rsvp_email",
      person_id: "p-ana@example.org",
      checked_in_by: "org@cohere.test",
      checked_in_at: NOW.toISOString(),
    });
  });

  it("is idempotent: a retried id, and the same email under a new id, store one row", async () => {
    const body = { id: "id-000001", source: "rsvp_email", email: "ana@example.org" };
    await handleCheckin(post(body), env, DID, "ev1", "org@cohere.test", deps);
    const retry = await handleCheckin(post(body), env, DID, "ev1", "org@cohere.test", deps);
    expect(await retry.json()).toMatchObject({ already: true, checkin: { id: "id-000001" } });
    const twin = await handleCheckin(post({ ...body, id: "id-000002" }), env, DID, "ev1", "other@cohere.test", deps);
    expect(await twin.json()).toMatchObject({ already: true, checkin: { id: "id-000001", checked_in_by: "org@cohere.test" } });
    expect(count()).toBe(1);
  });

  it("dedupes regenOS guests by DID, but lets any number of email-less walk-ins in", async () => {
    await handleCheckin(post({ id: "id-g00001", source: "rsvp_regenos", guestDid: "did:plc:g1" }), env, DID, "ev1", "o", deps);
    await handleCheckin(post({ id: "id-g00002", source: "rsvp_regenos", guestDid: "did:plc:g1" }), env, DID, "ev1", "o", deps);
    await handleCheckin(post({ id: "id-w00001", source: "walkin", name: "Sam" }), env, DID, "ev1", "o", deps);
    await handleCheckin(post({ id: "id-w00002", source: "walkin", name: "Sam" }), env, DID, "ev1", "o", deps);
    expect(count()).toBe(3);
  });

  it("refuses an id reused for a different event", async () => {
    await handleCheckin(post({ id: "id-000001", source: "walkin", name: "x" }), env, DID, "ev1", "o", deps);
    const res = await handleCheckin(post({ id: "id-000001", source: "walkin", name: "x" }), env, DID, "ev2", "o", deps);
    expect(res.status).toBe(409);
  });

  it("falls back to the page's snapshot when regenOS is down, and 404s a deleted event", async () => {
    const down = { lookup: async (): Promise<LiveLookup> => ({ kind: "unavailable" }), now: () => NOW };
    const res = await handleCheckin(
      post({ id: "id-000001", source: "walkin", name: "x", event: { name: "From Page", startsAt: START } }),
      env, DID, "ev9", "o", down,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checkin: { event_name: "From Page", event_starts_at: START } });
    const noSnap = await handleCheckin(post({ id: "id-000002", source: "walkin", name: "x" }), env, DID, "ev8", "o", down);
    expect(noSnap.status).toBe(503);
    const gone = { lookup: async (): Promise<LiveLookup> => ({ kind: "gone" }), now: () => NOW };
    expect((await handleCheckin(post({ id: "id-000003", source: "walkin", name: "x" }), env, DID, "ev7", "o", gone)).status).toBe(404);
  });

  it("undo deletes the row, only for its own event, and repeats harmlessly", async () => {
    await handleCheckin(post({ id: "id-000001", source: "walkin", name: "x" }), env, DID, "ev1", "o", deps);
    expect(await (await handleUndoCheckin(env, DID, "ev2", "id-000001")).json()).toMatchObject({ deleted: 0 });
    expect(await (await handleUndoCheckin(env, DID, "ev1", "id-000001")).json()).toMatchObject({ deleted: 1 });
    expect(await (await handleUndoCheckin(env, DID, "ev1", "id-000001")).json()).toMatchObject({ deleted: 0 });
    expect(count()).toBe(0);
  });
});

// ----------------------------------------------------------- walk-in opt-in

describe("walk-in email list opt-in", () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => {
    env = makeEnv();
  });
  const person = (email: string) =>
    env.cohere.raw.prepare("SELECT * FROM people WHERE email = ?").all(email)[0] as Record<string, unknown> | undefined;

  it("unticked: never creates a people row", async () => {
    await handleCheckin(post({ id: "id-000001", source: "walkin", name: "Sam", email: "sam@example.org" }), env, DID, "ev1", "o", deps);
    expect(person("sam@example.org")).toBeUndefined();
  });

  it("ticked, new address: a subscribed person with source walkin:<rkey> and a fresh unsubscribe token", async () => {
    const res = await handleCheckin(
      post({ id: "id-000001", source: "walkin", name: "Sam", email: "Sam@Example.org", subscribe: true }),
      env, DID, "ev1", "o", deps,
    );
    expect(await res.json()).toMatchObject({ subscribed: true });
    const p = person("sam@example.org")!;
    expect(p).toMatchObject({ name: "Sam", subscribed: 1, source: "walkin:ev1" });
    expect(String(p.unsubscribe_token)).toMatch(/^[0-9a-f-]{36}$/);
    const row = env.cohere.raw.prepare("SELECT person_id FROM event_checkins").all()[0];
    expect(row.person_id).toBe(p.id);
  });

  it("ticked, previously unsubscribed: stays unsubscribed, source and token untouched", async () => {
    seedPerson(env, "gone@example.org", 0, null);
    const res = await handleCheckin(
      post({ id: "id-000001", source: "walkin", name: "Gone", email: "gone@example.org", subscribe: true }),
      env, DID, "ev1", "o", deps,
    );
    expect(await res.json()).toMatchObject({ subscribed: false });
    expect(person("gone@example.org")).toMatchObject({
      subscribed: 0,
      source: "form:register-2026",
      unsubscribe_token: "tok-gone@example.org",
      name: "Gone", // a blank name is filled in
    });
  });

  it("ticked, known subscriber: keeps their existing name", async () => {
    seedPerson(env, "ana@example.org", 1, "Ana Real");
    await handleCheckin(
      post({ id: "id-000001", source: "walkin", name: "Typo Name", email: "ana@example.org", subscribe: true }),
      env, DID, "ev1", "o", deps,
    );
    expect(person("ana@example.org")).toMatchObject({ subscribed: 1, name: "Ana Real" });
  });
});

// -------------------------------------------------------------- roster API

describe("GET roster", () => {
  it("merges D1 RSVPs with regenOS guests, and degrades when regenOS fails", async () => {
    const env = makeEnv();
    env.cohere.raw
      .prepare(
        `INSERT INTO event_rsvps (id, event_did, event_rkey, event_name, event_starts_at, email, name, cancel_token, created_at)
         VALUES ('r1', ?, 'ev1', 'Opening Circle', ?, 'ana@example.org', 'Ana', 'tok1', ?)`,
      )
      .run(DID, START, NOW.toISOString());
    const guests = async () => [{ did: "did:plc:g1", handle: "cy.test" }];
    let body = (await (await handleCheckinRoster(env, DID, "ev1", { lookup: okLookup, guests })).json()) as {
      expected: unknown[];
      regenos: { ok: boolean };
      event: { name: string };
    };
    expect(body.expected).toHaveLength(2);
    expect(body.regenos.ok).toBe(true);
    expect(body.event.name).toBe("Opening Circle");

    const failing = async () => null;
    const down = async (): Promise<LiveLookup> => ({ kind: "unavailable" });
    body = (await (await handleCheckinRoster(env, DID, "ev1", { lookup: down, guests: failing })).json()) as typeof body;
    expect(body.expected).toHaveLength(1);
    expect(body.regenos.ok).toBe(false);
    expect(body.event.name).toBe("Opening Circle"); // from the RSVP snapshot
  });
});

describe("registrant search", () => {
  it("finds register-2026 registrants only, by name or email, with LIKE wildcards escaped", async () => {
    const env = makeEnv();
    seedPerson(env, "ana@example.org", 1, "Ana Garcia");
    seedPerson(env, "old@example.org", 1, "Ana Old");
    for (const [pid, slug] of [
      ["p-ana@example.org", "register-2026"],
      ["p-old@example.org", "register-2025"],
    ]) {
      env.cohere.raw
        .prepare(`INSERT INTO submissions (id, person_id, form_slug, data, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`)
        .run(`s-${pid}`, pid, slug, NOW.toISOString(), NOW.toISOString());
    }
    const find = async (q: string) =>
      ((await (await handleRegistrantSearch(env, q)).json()) as { registrants: { email: string }[] }).registrants.map((r) => r.email);
    expect(await find("ana")).toEqual(["ana@example.org"]);
    expect(await find("GARC")).toEqual(["ana@example.org"]);
    expect(await find("%")).toEqual([]);
    expect(await find("a")).toEqual([]);
  });
});

// ------------------------------------------------------------ CSV + cron

describe("CSV export", () => {
  it("quotes, and defuses spreadsheet formulas typed into a walk-in name", async () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("a,b")).toBe('"a,b"');
    const env = makeEnv();
    await handleCheckin(post({ id: "id-000001", source: "walkin", name: "=cmd|calc" }), env, DID, "ev1", "o@x.org", deps);
    const res = await handleCheckinCsv(env, DID, "ev1");
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("name,email,regenos_guest,source,checked_in_at,checked_in_by,event,event_starts_at");
    expect(text).toContain("'=cmd|calc,,,walk-in,");
  });
});

describe("retention", () => {
  it("deletes check-ins 30 days after the event, and keeps an opted-in walk-in's person row", async () => {
    const env = makeEnv();
    await handleCheckin(
      post({ id: "id-000001", source: "walkin", name: "Sam", email: "sam@example.org", subscribe: true }),
      env, DID, "ev1", "o", deps,
    );
    env.cohere.raw
      .prepare(
        `INSERT INTO event_checkins (id, event_did, event_rkey, event_name, event_starts_at, name, source, checked_in_by, checked_in_at)
         VALUES ('later', ?, 'ev2', 'Later', '2026-11-10T00:00:00.000Z', 'x', 'walkin', 'o', ?)`,
      )
      .run(DID, NOW.toISOString());
    expect(await runCheckinRetention(env, new Date("2026-11-14T15:00:00Z"))).toEqual({ deleted: 0 });
    expect(await runCheckinRetention(env, new Date("2026-11-15T15:00:00Z"))).toEqual({ deleted: 1 });
    const left = env.cohere.raw.prepare("SELECT id FROM event_checkins").all();
    expect(left).toEqual([{ id: "later" }]);
    expect(env.cohere.raw.prepare("SELECT subscribed FROM people WHERE email = 'sam@example.org'").all()).toEqual([{ subscribed: 1 }]);
  });
});
