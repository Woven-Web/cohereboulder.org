import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { handleAdminBoard, handleCreateReport } from "./board";
import { HARVEST_PHOTO_MAX_BYTES, handleHarvests, harvestUri, readPhoto, type HarvestEnv } from "./harvest";
import { resetRosterCache } from "./roster";
import type { LiveLookup } from "./rsvps";
import { testD1, testKV } from "./test-d1";

const BASE = "https://cohereboulder.org";
const SCENE = "did:plc:mockscene";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const OUTSIDER = "did:plc:outsider";
const WATER = { did: SCENE, rkey: "water" };

let env: HarvestEnv & { cohere: ReturnType<typeof testD1> };
let lookup: (env: unknown, did: string, rkey: string) => Promise<LiveLookup>;
let nowMs: number;
let recentEvents: { did: string; rkey: string; name: string; startsAt: string | null; endsAt: string | null; location: { name: string } | null; [k: string]: unknown }[] | null;

const ended = (rkey: string, minutesAgo: number): LiveLookup => ({
  kind: "ok", event: { did: SCENE, rkey, name: `Event ${rkey} | with Someone`, startsAt: new Date(nowMs - (minutesAgo + 60) * 60_000).toISOString(), endsAt: new Date(nowMs - minutesAgo * 60_000).toISOString(), status: "scheduled", where: "Mock Hall" },
});

beforeEach(() => {
  resetRosterCache();
  nowMs = Date.now();
  recentEvents = [];
  env = {
    cohere: testD1(["../migrations/0011_members.sql", "../migrations/0012_notify.sql"]), COHERE_AUTH: testKV(),
    REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://upstream.test", REGENOS_COLLECTIVE_DID: SCENE,
  } as never;
  lookup = async (_e, _d, rkey) => (rkey === "water" ? ended("water", 90) : rkey === "other" ? ended("other", 30) : rkey === "running" ? { kind: "ok", event: { ...(ended("running", 0) as Extract<LiveLookup, { kind: "ok" }>).event, endsAt: new Date(nowMs + 3600_000).toISOString() } } : rkey === "off" ? { kind: "ok", event: { ...(ended("off", 90) as Extract<LiveLookup, { kind: "ok" }>).event, status: "cancelled" } } : rkey === "down" ? { kind: "unavailable" } : { kind: "gone" });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const who = /__Host-rs_session=([^;]+)/.exec(new Headers(init?.headers).get("Cookie") ?? "")?.[1];
    const sessions: Record<string, string> = { me: ME, peer: PEER, outsider: OUTSIDER };
    if (url.pathname.endsWith("getSession")) return Response.json(who && sessions[who] ? { did: sessions[who] } : {});
    if (url.pathname.endsWith("getSceneMembers")) return Response.json({ members: [{ did: ME, role: "member" }, { did: PEER, role: "member" }] });
    return Response.json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

const call = (method: string, path: string, body?: unknown, who: string | null = "me", extra: Record<string, string> = {}) =>
  handleHarvests(
    new Request(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(who ? { Cookie: `__Host-rs_session=${who}` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, new URL(`${BASE}${path}`), { lookup: lookup as never, events: async () => recentEvents },
  ) as Promise<Response>;
const rows = (sql: string) => env.cohere.raw.prepare(sql).all() as Record<string, unknown>[];
const write = (over: Record<string, unknown> = {}, who = "me") => call("POST", "/api/harvests", { eventDid: SCENE, eventRkey: "water", body: "I stood at the pond.", ...over }, who);
const listFor = async (who = "me", event = "did:plc:mockscene/water") => (await (await call("GET", `/api/harvests?event=${encodeURIComponent(event).replace("%2F", "/")}`, undefined, who)).json()).harvests as Record<string, unknown>[];
/** A real (tiny) JPEG header followed by filler, as a data URL. */
const jpeg = (bytes = 50) => `data:image/jpeg;base64,${btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0) + "\u0001".repeat(bytes))}`;

describe("who may use harvests", () => {
  it("only signed-in COhere members, to read and to write", async () => {
    for (const who of [null, "nobody"]) {
      expect((await call("GET", "/api/harvests?event=x/y", undefined, who)).status).toBe(401);
      expect((await write({}, who as string)).status).toBe(401);
    }
    expect((await call("GET", "/api/harvests?event=x/y", undefined, "outsider")).status).toBe(403);
    expect((await write({}, "outsider")).status).toBe(403);
    expect(rows("SELECT * FROM harvests")).toHaveLength(0);
  });
  it("fails closed when the roster cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("getSession")) return Response.json({ did: ME });
      void init;
      return new Response("down", { status: 500 });
    }));
    expect((await write()).status).toBe(503);
  });
  it("refuses a cross-site write", async () => {
    expect((await write({}, "me")).status).toBe(201);
    expect((await call("POST", "/api/harvests", { eventDid: SCENE, eventRkey: "other", body: "x" }, "me", { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await call("DELETE", "/api/harvests/00000000-0000-4000-8000-000000000000", undefined, "me", { Origin: "https://evil.test" })).status).toBe(403);
  });
});

describe("writing a harvest", () => {
  it("is open once the event has ended, under the session's own DID, whatever the body claims", async () => {
    const res = await write({ authorDid: PEER, author_did: PEER, prompt: "inquiry", lang: "es" });
    expect(res.status).toBe(201);
    const { harvest } = await res.json();
    expect(harvest).toMatchObject({ authorDid: ME, mine: true, body: "I stood at the pond.", prompt: "inquiry", lang: "es", hasPhoto: false, editedAt: null, eventName: "Event water | with Someone" });
    expect(rows("SELECT author_did, event_did, event_rkey FROM harvests")).toEqual([{ author_did: ME, event_did: SCENE, event_rkey: "water" }]);
  });
  it("is closed until the event ends, and for cancelled or unknown events", async () => {
    expect((await write({ eventRkey: "running" })).status).toBe(409);
    expect((await write({ eventRkey: "off" })).status).toBe(400);
    expect((await write({ eventRkey: "nope" })).status).toBe(404);
    expect((await write({ eventRkey: "down" })).status).toBe(503);
    expect(rows("SELECT * FROM harvests")).toHaveLength(0);
  });
  it("needs a few words, within the limit", async () => {
    for (const body of ["", "   ", undefined, 5, "x".repeat(601)]) expect((await write({ body })).status).toBe(400);
    expect((await write({ body: "x".repeat(600) })).status).toBe(201);
  });
  it("counts characters, not bytes, against the limit", async () => {
    expect((await write({ body: "🌻".repeat(600) })).status).toBe(201);
  });
  it("is one per person per event; a second says to edit", async () => {
    expect((await write()).status).toBe(201);
    const again = await write({ body: "Another" });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/Edit it/);
    expect((await write({}, "peer")).status).toBe(201);
    expect((await write({ eventRkey: "other" })).status).toBe(201);
  });
  it("rejects a malformed event reference", async () => {
    expect((await write({ eventDid: "nope" })).status).toBe(400);
    expect((await write({ eventRkey: "../x y" })).status).toBe(400);
  });
  it("is rate limited per person", async () => {
    for (let i = 0; i < 20; i++) {
      await write({ eventRkey: i % 2 ? "other" : "water", body: `n${i}` });
      await call("DELETE", `/api/harvests/${(rows("SELECT id FROM harvests")[0]?.id as string) ?? "x"}`);
    }
    expect((await write()).status).toBe(429);
  });
});

describe("photos", () => {
  it("accepts a small JPEG, and serves it only to members", async () => {
    const res = await write({ photo: jpeg() });
    const { harvest } = await res.json();
    expect(harvest.hasPhoto).toBe(true);
    const photo = await call("GET", `/api/harvests/${harvest.id}/photo`, undefined, "peer");
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Content-Type")).toBe("image/jpeg");
    expect(photo.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect((await photo.arrayBuffer()).byteLength).toBe(54);
    expect((await call("GET", `/api/harvests/${harvest.id}/photo`, undefined, null)).status).toBe(401);
    expect((await call("GET", `/api/harvests/${harvest.id}/photo`, undefined, "outsider")).status).toBe(403);
  });
  it("refuses anything that is not a small real JPEG", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const fake = `data:image/jpeg;base64,${btoa("this is not an image at all")}`;
    const huge = jpeg(HARVEST_PHOTO_MAX_BYTES);
    for (const photo of [png, fake, huge, "https://example.org/x.jpg", "data:image/jpeg;base64,@@@", 42]) {
      expect((await write({ photo })).status).toBe(400);
    }
    expect(rows("SELECT * FROM harvests")).toHaveLength(0);
    expect(readPhoto(jpeg()).ok).toBe(true);
  });
  it("can be replaced or removed on edit", async () => {
    const { harvest } = await (await write({ photo: jpeg() })).json();
    const gone = await (await call("PATCH", `/api/harvests/${harvest.id}`, { photo: null })).json();
    expect(gone.harvest).toMatchObject({ hasPhoto: false });
    expect(rows("SELECT * FROM harvest_photos")).toHaveLength(0);
    expect((await call("GET", `/api/harvests/${harvest.id}/photo`)).status).toBe(404);
    const back = await (await call("PATCH", `/api/harvests/${harvest.id}`, { photo: jpeg(20) })).json();
    expect(back.harvest.hasPhoto).toBe(true);
    expect(back.harvest.editedAt).not.toBeNull();
  });
});

describe("reading an event's harvests", () => {
  it("lists them oldest first, marking which are mine", async () => {
    await write({ body: "mine" });
    await write({ body: "theirs" }, "peer");
    const list = await listFor();
    expect(list.map((h) => [h.body, h.mine])).toEqual([["mine", true], ["theirs", false]]);
    expect(list[1].authorDid).toBe(PEER);
  });
  it("is scoped to the event", async () => {
    await write({ eventRkey: "other", body: "other event" });
    expect(await listFor()).toEqual([]);
  });
  it("says which events I have shared on", async () => {
    await write();
    await write({ eventRkey: "other" });
    await write({}, "peer");
    const mine = await (await call("GET", "/api/harvests/mine")).json();
    expect(mine.harvests.map((h: { eventRkey: string }) => h.eventRkey).sort()).toEqual(["other", "water"]);
  });
  it("rejects a bad event query", async () => {
    expect((await call("GET", "/api/harvests?event=nope")).status).toBe(400);
    expect((await call("GET", "/api/harvests")).status).toBe(400);
  });
});

describe("recent events (for the Today card)", () => {
  const e = (rkey: string, endedMinutesAgo: number) => ({ did: SCENE, rkey, name: rkey, startsAt: new Date(nowMs - (endedMinutesAgo + 60) * 60_000).toISOString(), endsAt: new Date(nowMs - endedMinutesAgo * 60_000).toISOString(), location: { name: "Hall" } });
  it("lists events that ended in the last two days, newest first, and no others", async () => {
    recentEvents = [e("old", 60 * 49), e("yesterday", 60 * 20), e("hourago", 60), e("running", -30)];
    const res = await call("GET", "/api/harvests/recent");
    expect((await res.json()).events.map((x: { rkey: string }) => x.rkey)).toEqual(["hourago", "yesterday"]);
  });
  it("is members only, and says so when the calendar is unreachable", async () => {
    expect((await call("GET", "/api/harvests/recent", undefined, "outsider")).status).toBe(403);
    recentEvents = null;
    expect((await call("GET", "/api/harvests/recent")).status).toBe(503);
  });
});

describe("editing and deleting", () => {
  it("only the author, with an Edited marker", async () => {
    const { harvest } = await (await write()).json();
    expect((await call("PATCH", `/api/harvests/${harvest.id}`, { body: "hijack" }, "peer")).status).toBe(403);
    expect((await call("DELETE", `/api/harvests/${harvest.id}`, undefined, "peer")).status).toBe(403);
    const edited = await (await call("PATCH", `/api/harvests/${harvest.id}`, { body: "Better words" })).json();
    expect(edited.harvest).toMatchObject({ body: "Better words" });
    expect(edited.harvest.editedAt).not.toBeNull();
  });
  it("saving without changing anything is not an edit", async () => {
    const { harvest } = await (await write()).json();
    const same = await (await call("PATCH", `/api/harvests/${harvest.id}`, { body: "I stood at the pond." })).json();
    expect(same.harvest.editedAt).toBeNull();
  });
  it("can't be emptied; delete instead", async () => {
    const { harvest } = await (await write()).json();
    expect((await call("PATCH", `/api/harvests/${harvest.id}`, { body: "  " })).status).toBe(400);
  });
  it("delete removes it and its photo, and lets the author write another", async () => {
    const { harvest } = await (await write({ photo: jpeg() })).json();
    expect((await call("DELETE", `/api/harvests/${harvest.id}`)).status).toBe(200);
    expect(rows("SELECT * FROM harvests")).toHaveLength(0);
    expect(rows("SELECT * FROM harvest_photos")).toHaveLength(0);
    expect((await write({ body: "Again" })).status).toBe(201);
  });
  it("unknown or malformed ids are 404", async () => {
    expect((await call("PATCH", "/api/harvests/nope", { body: "x" })).status).toBe(404);
    expect((await call("DELETE", "/api/harvests/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("reports and stewards (the Board's tables)", () => {
  async function reportAs(who: string, id: string, extra: Record<string, unknown> = {}) {
    return handleCreateReport(
      new Request(`${BASE}/api/board/reports`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `__Host-rs_session=${who}` }, body: JSON.stringify({ uri: harvestUri(id), reason: "unkind", ...extra }) }),
      env as never,
    );
  }
  const admin = (method: string, path: string, body?: unknown) =>
    handleAdminBoard(new Request(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), env as never, path, "steward@example.org") as Promise<Response>;

  it("a member reports a harvest; the excerpt and author come from D1, not from the reporter", async () => {
    const { harvest } = await (await write({ body: "The real words." }, "peer")).json();
    const res = await reportAs("me", harvest.id, { excerpt: "a lie the reporter typed" });
    expect(res.status).toBe(200);
    expect(rows("SELECT post_uri, post_author_did, reporter_did, excerpt FROM board_reports")).toEqual([
      { post_uri: harvestUri(harvest.id), post_author_did: PEER, reporter_did: ME, excerpt: "The real words." },
    ]);
  });
  it("only members can report, and a harvest that is gone cannot be reported", async () => {
    const { harvest } = await (await write({}, "peer")).json();
    expect((await reportAs("outsider", harvest.id)).status).toBe(403);
    expect((await reportAs("me", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect(rows("SELECT * FROM board_reports")).toHaveLength(0);
  });
  it("shows up in the admin queue with a link to its event page; hiding it removes it for others but not for its author", async () => {
    const { harvest } = await (await write({ body: "Questionable." }, "peer")).json();
    await reportAs("me", harvest.id);
    const overview = await (await admin("GET", "/api/admin/board")).json();
    expect(overview.reports[0]).toMatchObject({ postUri: harvestUri(harvest.id), authorDid: PEER, excerpt: "Questionable.", link: `/events/${encodeURIComponent(SCENE)}/water` });

    expect((await admin("POST", "/api/admin/board/hide", { uri: harvestUri(harvest.id), reason: "unkind" })).status).toBe(200);
    expect((await listFor("me")).map((h) => h.body)).toEqual([]);
    const own = await listFor("peer");
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ mine: true, moderation: "hidden" });
    expect((await admin("GET", "/api/admin/board").then((r) => r.json())).hidden[0]).toMatchObject({ uri: harvestUri(harvest.id), author_did: PEER, link: expect.any(String) });
    expect(rows("SELECT status FROM board_reports")).toEqual([{ status: "actioned" }]);

    expect((await admin("POST", "/api/admin/board/unhide", { uri: harvestUri(harvest.id) })).status).toBe(200);
    expect((await listFor("me")).map((h) => h.body)).toEqual(["Questionable."]);
  });
  it("a hidden harvest's photo is hidden with it", async () => {
    const { harvest } = await (await write({ photo: jpeg() }, "peer")).json();
    await admin("POST", "/api/admin/board/hide", { uri: harvestUri(harvest.id) });
    expect((await call("GET", `/api/harvests/${harvest.id}/photo`, undefined, "me")).status).toBe(404);
    expect((await call("GET", `/api/harvests/${harvest.id}/photo`, undefined, "peer")).status).toBe(200);
  });
  it("a removed harvest stays removed", async () => {
    const { harvest } = await (await write({}, "peer")).json();
    expect((await admin("POST", "/api/admin/board/remove", { uri: harvestUri(harvest.id), note: "private info" })).status).toBe(200);
    expect((await listFor("me"))).toEqual([]);
    expect((await admin("POST", "/api/admin/board/unhide", { uri: harvestUri(harvest.id) })).status).toBe(409);
  });
  it("deleting a harvest closes its open reports", async () => {
    const { harvest } = await (await write({}, "peer")).json();
    await reportAs("me", harvest.id);
    await call("DELETE", `/api/harvests/${harvest.id}`, undefined, "peer");
    expect(rows("SELECT status, resolved_by FROM board_reports")).toEqual([{ status: "dismissed", resolved_by: "author deleted it" }]);
  });
  it("the admin actions still refuse anything that is not a Board post or a harvest", async () => {
    expect((await admin("POST", "/api/admin/board/hide", { uri: "cohere:harvest/../../x" })).status).toBe(400);
    expect((await admin("POST", "/api/admin/board/hide", { uri: "https://evil" })).status).toBe(400);
  });
});
