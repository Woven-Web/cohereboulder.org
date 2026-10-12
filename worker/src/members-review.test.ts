// Fixes from the independent review of feat/members: a server-side member gate on
// the circle proxy, a CSRF guard on cookie-authenticated writes, first-seen
// approval, fail-closed moderation, and a per-IP limit on reports.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { handleCreateReport } from "./board";
import { moderateRecords, type CircleRecord } from "./board-moderation";
import { handleXrpcProxy } from "./regenos-auth";
import { resetRosterCache } from "./roster";
import { handleMyRsvpVisibility } from "./rsvp-visibility";
import { testD1, testKV } from "./test-d1";

const SCENE = "did:plc:mockscene";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const OUTSIDER = "did:plc:outsider";
const ORIGIN = "https://cohere.test";

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    cohere: testD1(["../migrations/0011_members.sql"]),
    COHERE_AUTH: testKV(),
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_BASE_URL: "https://upstream.test",
    REGENOS_COLLECTIVE_DID: SCENE,
    ...extra,
  } as unknown as Parameters<typeof handleCreateReport>[1] & Parameters<typeof handleMyRsvpVisibility>[1] & { cohere: ReturnType<typeof testD1> };
}

function stubUpstream() {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("getSession")) {
      const who = /__Host-rs_session=([^;]+)/.exec(new Headers(init?.headers).get("Cookie") ?? "")?.[1];
      const dids: Record<string, string> = { me: ME, peer: PEER, outsider: OUTSIDER };
      return Response.json(who && dids[who] ? { did: dids[who] } : {});
    }
    if (url.pathname.endsWith("getSceneMembers")) return Response.json({ members: [{ did: ME, role: "member" }, { did: PEER, role: "member" }] });
    if (/listCircleProfiles|listCirclePosts|getCircleThread/.test(url.pathname)) {
      return Response.json({ records: [{ uri: `at://${PEER}/coop.lexicon.profile/self`, author: PEER, record: { displayName: "Pia Peer" } }] });
    }
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
beforeEach(() => { resetRosterCache(); });
afterEach(() => vi.unstubAllGlobals());

const cookie = (who: string) => `__Host-rs_session=${who}; cohere_session=secret`;

// --------------------------------------------------------------------- 1: gate

describe("the circle proxy is member-gated on the server", () => {
  const proxy = (nsid: string, who: string | null, init: RequestInit = {}, search = `?collective=${SCENE}`, env = makeEnv()) => {
    const url = new URL(`${ORIGIN}/xrpc/social.scenius.${nsid}${search}`);
    const headers: Record<string, string> = { ...(init.headers as object), ...(who ? { Cookie: cookie(who) } : {}) };
    return handleXrpcProxy(new Request(url, { ...init, headers }), env, url);
  };
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  beforeEach(() => { stubUpstream(); });

  it.each(["listCircleProfiles", "listCirclePosts", "getCircleThread"])("answers a signed-in non-member 403 on %s, with no names", async (nsid) => {
    const res = await proxy(nsid, "outsider");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Pia Peer");
  });
  it.each(["createCirclePost", "deleteCirclePost", "putCircleProfile", "deleteCircleProfile"])("answers a non-member 403 on the write %s, before the upstream call", async (nsid) => {
    const spy = stubUpstream();
    const res = await proxy(nsid, "outsider", post({ collective: SCENE, post: {}, profile: {}, rkey: "r" }), "");
    expect(res.status).toBe(403);
    expect(spy.mock.calls.some(([u]) => String(u).includes(nsid))).toBe(false);
  });
  it("answers a signed-out caller 401", async () => {
    expect((await proxy("listCircleProfiles", null)).status).toBe(401);
  });
  it("lets a member through", async () => {
    const res = await proxy("listCircleProfiles", "me");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Pia Peer");
  });
  it("is a 503, not an open door, when the roster cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      return path.endsWith("getSession") ? Response.json({ did: ME }) : new Response("down", { status: 500 });
    }));
    expect((await proxy("listCircleProfiles", "me")).status).toBe(503);
  });
  it("caches the roster briefly for members", async () => {
    const spy = stubUpstream();
    await proxy("listCircleProfiles", "me");
    await proxy("listCircleProfiles", "me");
    expect(spy.mock.calls.filter(([u]) => String(u).includes("getSceneMembers"))).toHaveLength(1);
  });
  it("leaves the sign-in methods alone (a visitor must be able to sign in before being a member)", async () => {
    expect((await proxy("getSession", "outsider", {}, "")).status).toBe(200);
  });
});

// --------------------------------------------------------------------- 2: CSRF

describe("cookie-authenticated writes refuse cross-site requests", () => {
  const headers = (extra: Record<string, string> = {}) => ({ "Content-Type": "application/json", Cookie: cookie("me"), ...extra });
  const report = (extra: Record<string, string> = {}, body = JSON.stringify({ uri: `at://${PEER}/coop.lexicon.post/3k`, reason: "spam" })) =>
    handleCreateReport(new Request(`${ORIGIN}/api/board/reports`, { method: "POST", headers: headers(extra), body }), makeEnv());
  const visibility = (extra: Record<string, string> = {}, contentType = "application/json") =>
    handleMyRsvpVisibility(new Request(`${ORIGIN}/api/me/rsvp-visibility`, {
      method: "PUT", headers: { ...headers(extra), "Content-Type": contentType }, body: JSON.stringify({ mode: "nobody" }),
    }), makeEnv());
  const circleWrite = (extra: Record<string, string> = {}, contentType = "application/json") => {
    const url = new URL(`${ORIGIN}/xrpc/social.scenius.createCirclePost`);
    return handleXrpcProxy(new Request(url, {
      method: "POST", headers: { ...headers(extra), "Content-Type": contentType }, body: JSON.stringify({ collective: SCENE, post: {} }),
    }), makeEnv(), url);
  };
  beforeEach(() => { stubUpstream(); });

  const cases: [string, (extra?: Record<string, string>, ct?: string) => Promise<Response>][] = [
    ["POST /api/board/reports", (e) => report(e)],
    ["PUT /api/me/rsvp-visibility", (e, ct) => visibility(e, ct)],
    ["a proxied circle POST", (e, ct) => circleWrite(e, ct)],
  ];
  for (const [name, send] of cases) {
    describe(name, () => {
      it("rejects Sec-Fetch-Site: cross-site", async () => {
        expect((await send({ "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
      });
      it("rejects a foreign Origin", async () => {
        expect((await send({ Origin: "https://evil.test" })).status).toBe(403);
      });
      it("accepts the same origin", async () => {
        expect((await send({ Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
      });
      it("accepts a request with neither header (curl, server-side callers)", async () => {
        expect((await send()).status).toBe(200);
      });
    });
  }
  it("requires a JSON content type on a visibility write", async () => {
    expect((await visibility({}, "text/plain")).status).toBe(415);
  });
  it("requires a JSON content type on a proxied circle write", async () => {
    expect((await circleWrite({}, "text/plain")).status).toBe(415);
  });
  it("changes nothing when it refuses", async () => {
    const env = makeEnv();
    const res = await handleMyRsvpVisibility(new Request(`${ORIGIN}/api/me/rsvp-visibility`, {
      method: "PUT", headers: headers({ "Sec-Fetch-Site": "cross-site" }), body: JSON.stringify({ mode: "nobody" }),
    }), env);
    expect(res.status).toBe(403);
    expect(env.cohere.raw.prepare("SELECT * FROM profile_rsvp_visibility").all()).toHaveLength(0);
  });
});

// ------------------------------------------------------------- 3: first-seen

describe("the approval hook uses when the Worker first saw a post", () => {
  const post = (rkey: string, createdAt: string): CircleRecord => ({
    uri: `at://${PEER}/coop.lexicon.post/${rkey}`, author: PEER, record: { text: `t ${rkey}`, createdAt },
  });
  const run = (env: ReturnType<typeof makeEnv>, records: CircleRecord[]) =>
    moderateRecords(env as never, records, async () => ME, { stewards: async () => new Set() });
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => {
    env = makeEnv();
    env.cohere.raw.exec("INSERT INTO board_settings (key, value, updated_at) VALUES ('approval', 'on', 'x'), ('approval_since', '2026-10-12T00:00:00.000Z', 'x')");
  });

  it("holds a backdated post that appears after approval was switched on", async () => {
    expect(await run(env, [post("sneaky", "2020-01-01T00:00:00.000Z")])).toEqual([]);
  });
  it("lets through a post first seen before approval was switched on, whatever its createdAt", async () => {
    env.cohere.raw.prepare("INSERT INTO board_seen (uri, first_seen) VALUES (?, '2026-10-01T00:00:00.000Z')").run(post("old", "2099-01-01T00:00:00.000Z").uri);
    expect(await run(env, [post("old", "2099-01-01T00:00:00.000Z")])).toHaveLength(1);
  });
  it("records first sight even while approval is off, so switching it on never holds the back catalogue", async () => {
    env.cohere.raw.exec("UPDATE board_settings SET value = 'off' WHERE key = 'approval'");
    await run(env, [post("a", "2026-10-02T00:00:00.000Z")]);
    expect(env.cohere.raw.prepare("SELECT uri FROM board_seen").all()).toHaveLength(1);
  });
  it("keeps the first sighting when a post is seen again", async () => {
    env.cohere.raw.prepare("INSERT INTO board_seen (uri, first_seen) VALUES (?, '2026-10-01T00:00:00.000Z')").run(post("a", "x").uri);
    await run(env, [post("a", "x")]);
    expect(env.cohere.raw.prepare("SELECT first_seen FROM board_seen").all()).toEqual([{ first_seen: "2026-10-01T00:00:00.000Z" }]);
  });
});

// ------------------------------------------------- 4: fail closed w/o D1 binding

describe("moderated reads fail closed", () => {
  it("answers 502 on listCirclePosts when the D1 binding is missing, without the upstream page", async () => {
    stubUpstream();
    const env = makeEnv({ cohere: undefined });
    const url = new URL(`${ORIGIN}/xrpc/social.scenius.listCirclePosts?collective=${SCENE}`);
    const res = await handleXrpcProxy(new Request(url, { headers: { Cookie: cookie("me") } }), env as never, url);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("Pia Peer");
  });
});

// ------------------------------------------------------------- 5: per-IP limit

describe("reports are limited per IP before the upstream call", () => {
  it("answers 429 once an address has filed too many, without calling regenOS", async () => {
    const spy = stubUpstream();
    const env = makeEnv();
    const send = () => handleCreateReport(new Request(`${ORIGIN}/api/board/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7" },
      body: JSON.stringify({ uri: `at://${PEER}/coop.lexicon.post/3k`, reason: "spam" }),
    }), env);
    let last = 0;
    for (let i = 0; i < 40; i++) last = (await send()).status;
    expect(last).toBe(429);
    const calls = spy.mock.calls.length;
    await send();
    expect(spy.mock.calls.length).toBe(calls);
  });
});
