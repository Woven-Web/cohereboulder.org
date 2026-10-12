import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { handleMemberRsvps, handleMyRsvps, handleMyRsvpVisibility, type RsvpVisibilityEnv } from "./rsvp-visibility";
import { testD1 } from "./test-d1";

const SCENE = "did:plc:mockscene";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const OUTSIDER = "did:plc:outsider";
const STRANGER = "did:plc:stranger";
const ev = (rkey: string) => `at://${SCENE}/community.lexicon.calendar.event/${rkey}`;
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const EVENTS: Record<string, { name: string; startsAt: string; guests: string[] }> = {
  walk: { name: "Ecology Walk", startsAt: future(2), guests: [ME, PEER] },
  feast: { name: "Harvest Feast", startsAt: future(1), guests: [ME] },
  quiet: { name: "Quiet Sit", startsAt: future(3), guests: [PEER] },
  old: { name: "Last Month's Potluck", startsAt: future(-20), guests: [ME] },
};

function makeEnv() {
  return {
    cohere: testD1(["../migrations/0011_members.sql"]),
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_BASE_URL: "https://upstream.test",
    REGENOS_COLLECTIVE_DID: SCENE,
  } as unknown as RsvpVisibilityEnv & { cohere: ReturnType<typeof testD1> };
}
type Env = ReturnType<typeof makeEnv>;

const sessions: Record<string, string> = { me: ME, peer: PEER, outsider: OUTSIDER, stranger: STRANGER };
function stubUpstream({ rosterDown = false } = {}) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("getSession")) {
      const who = /__Host-rs_session=([^;]+)/.exec(new Headers(init?.headers).get("Cookie") ?? "")?.[1];
      return Response.json(who && sessions[who] ? { did: sessions[who] } : {});
    }
    if (url.pathname.endsWith("getSceneMembers")) {
      return rosterDown ? new Response("x", { status: 500 }) : Response.json({ members: [{ did: ME, role: "member" }, { did: PEER, role: "member" }] });
    }
    if (url.pathname.endsWith("getEvents")) {
      return Response.json({ events: Object.entries(EVENTS).map(([rkey, e]) => ({ uri: ev(rkey), value: { name: e.name, startsAt: e.startsAt, createdAt: e.startsAt } })) });
    }
    if (url.pathname.endsWith("getEventAttendance")) {
      const e = EVENTS[url.searchParams.get("eventRkey") ?? ""];
      return e ? Response.json({ confirmed: e.guests.length, guests: e.guests.map((did) => ({ did })) }) : new Response("no", { status: 404 });
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
afterEach(() => vi.unstubAllGlobals());

const req = (path: string, who: string | null, method = "GET", body?: unknown) =>
  new Request(`https://cohere.test${path}`, {
    method,
    headers: { ...(who ? { Cookie: `__Host-rs_session=${who}; cohere_session=secret` } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const visibilityRow = (env: Env, did: string) => env.cohere.raw.prepare("SELECT * FROM profile_rsvp_visibility WHERE did = ?").all(did)[0] as Record<string, unknown> | undefined;

describe("GET/PUT /api/me/rsvp-visibility", () => {
  let env: Env;
  beforeEach(() => { env = makeEnv(); stubUpstream(); });

  it("defaults to members, nothing hidden, and writes nothing on read", async () => {
    const res = await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me"), env);
    expect(await res.json()).toEqual({ mode: "members", hiddenEvents: [] });
    expect(visibilityRow(env, ME)).toBeUndefined();
  });
  it("needs a signed-in regenOS session", async () => {
    expect((await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", null), env)).status).toBe(401);
    expect((await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", null, "PUT", { mode: "nobody" }), env)).status).toBe(401);
  });
  it("sets the mode under the session DID", async () => {
    const res = await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { mode: "nobody" }), env);
    expect(await res.json()).toEqual({ mode: "nobody", hiddenEvents: [] });
    expect(visibilityRow(env, ME)).toMatchObject({ did: ME, mode: "nobody", hidden_event_uris: "[]" });
  });
  it("is owner-only: a body-supplied DID is ignored", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { mode: "nobody", did: PEER, owner: PEER }), env);
    expect(visibilityRow(env, PEER)).toBeUndefined();
    expect(visibilityRow(env, ME)).toMatchObject({ mode: "nobody" });
  });
  it("hides and unhides one event, keeping the mode", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: true }), env);
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("feast"), hidden: true }), env);
    expect(JSON.parse(String(visibilityRow(env, ME)?.hidden_event_uris))).toEqual([ev("walk"), ev("feast")]);
    const res = await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: false }), env);
    expect(await res.json()).toEqual({ mode: "members", hiddenEvents: [ev("feast")] });
  });
  it("hiding twice does not duplicate", async () => {
    for (let i = 0; i < 2; i++) await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: true }), env);
    expect(JSON.parse(String(visibilityRow(env, ME)?.hidden_event_uris))).toEqual([ev("walk")]);
  });
  it.each([
    [{ mode: "everyone" }],
    [{ mode: 1 }],
    [{ event: "https://evil.test/", hidden: true }],
    [{ event: ev("walk"), hidden: "yes" }],
    [{ event: ev("walk") }],
    [{}],
  ])("rejects %j", async (body) => {
    expect((await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", body), env)).status).toBe(400);
  });
  it("caps the hidden list", async () => {
    for (let i = 0; i < 200; i++) await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev(`e${i}`), hidden: true }), env);
    expect((await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("one-more"), hidden: true }), env)).status).toBe(400);
  });
  it("only answers GET and PUT", async () => {
    expect((await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "DELETE"), env)).status).toBe(405);
  });
});

describe("GET /api/me/rsvps", () => {
  let env: Env;
  beforeEach(() => { env = makeEnv(); stubUpstream(); });

  it("lists my confirmed regenOS RSVPs on upcoming events, with hidden flags, soonest first", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: true }), env);
    const body = await (await handleMyRsvps(req("/api/me/rsvps", "me"), env)).json() as { visibility: unknown; rsvps: { uri: string; name: string; hidden: boolean }[] };
    expect(body.rsvps.map((r) => [r.name, r.hidden])).toEqual([["Harvest Feast", false], ["Ecology Walk", true]]);
    expect(body.visibility).toEqual({ mode: "members", hiddenEvents: [ev("walk")] });
  });
  it("needs a session", async () => {
    expect((await handleMyRsvps(req("/api/me/rsvps", null), env)).status).toBe(401);
  });
});

describe("GET /api/members/:did/rsvps", () => {
  let env: Env;
  const names = async (who: string | null, target: string) => {
    const res = await handleMemberRsvps(req(`/api/members/${target}/rsvps`, who), env, target);
    return { status: res.status, names: ((await res.clone().json()) as { rsvps?: { name: string }[] }).rsvps?.map((r) => r.name) };
  };
  beforeEach(() => { env = makeEnv(); stubUpstream(); });

  it("shows a member's RSVPs to other members by default", async () => {
    expect(await names("peer", ME)).toEqual({ status: 200, names: ["Harvest Feast", "Ecology Walk"] });
  });
  it("leaves out events the owner hid", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: true }), env);
    expect((await names("peer", ME)).names).toEqual(["Harvest Feast"]);
  });
  it("shows nothing at all when the owner chose Nobody — indistinguishable from no RSVPs", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { mode: "nobody" }), env);
    expect(await names("peer", ME)).toEqual({ status: 200, names: [] });
    expect(await (await handleMemberRsvps(req(`/api/members/${ME}/rsvps`, "peer"), env, ME)).json()).toEqual({ rsvps: [] });
  });
  it("applies the setting to the owner's own view of 'what members see' too", async () => {
    await handleMyRsvpVisibility(req("/api/me/rsvp-visibility", "me", "PUT", { event: ev("walk"), hidden: true }), env);
    expect((await names("me", ME)).names).toEqual(["Harvest Feast"]);
  });
  it("refuses signed-out callers and non-members", async () => {
    expect((await names(null, ME)).status).toBe(401);
    expect((await names("outsider", ME)).status).toBe(403);
  });
  it("fails closed if the roster can't be read", async () => {
    stubUpstream({ rosterDown: true });
    expect((await names("peer", ME)).status).toBe(503);
  });
  it("shows nothing for someone who isn't a member (their records aren't the board's)", async () => {
    expect(await names("peer", OUTSIDER)).toEqual({ status: 200, names: [] });
  });
  it("returns only what a profile needs", async () => {
    const body = await (await handleMemberRsvps(req(`/api/members/${ME}/rsvps`, "peer"), env, ME)).json() as { rsvps: Record<string, unknown>[] };
    expect(Object.keys(body.rsvps[0]).sort()).toEqual(["did", "endsAt", "name", "rkey", "startsAt", "uri"]);
  });
  it("is never cacheable", async () => {
    expect((await handleMemberRsvps(req(`/api/members/${ME}/rsvps`, "peer"), env, ME)).headers.get("Cache-Control")).toBe("no-store");
  });
});
