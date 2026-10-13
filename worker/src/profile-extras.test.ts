import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { handleMemberProfileExtras, handleMyProfileExtras, validateExtras, type ProfileExtrasEnv } from "./profile-extras";
import { testD1 } from "./test-d1";

const SCENE = "did:plc:mockscene";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const LEFT = "did:plc:left";
const OUTSIDER = "did:plc:outsider";
const sessions: Record<string, string> = { me: ME, peer: PEER, left: LEFT, outsider: OUTSIDER };

const makeEnv = () =>
  ({
    cohere: testD1(["../migrations/0013_profile_extras.sql"]),
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_BASE_URL: "https://upstream.test",
    REGENOS_COLLECTIVE_DID: SCENE,
  }) as unknown as ProfileExtrasEnv & { cohere: ReturnType<typeof testD1> };

function stubUpstream({ rosterDown = false } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("getSession")) {
      const who = /__Host-rs_session=([^;]+)/.exec(new Headers(init?.headers).get("Cookie") ?? "")?.[1];
      return Response.json(who && sessions[who] ? { did: sessions[who] } : {});
    }
    if (url.pathname.endsWith("getSceneMembers")) {
      return rosterDown ? new Response("x", { status: 500 }) : Response.json({ members: [{ did: ME, role: "member" }, { did: PEER, role: "member" }] });
    }
    return Response.json({});
  }));
}
afterEach(() => vi.unstubAllGlobals());

const req = (who: string | null, method = "GET", body?: unknown) =>
  new Request("https://cohereboulder.org/api/me/profile-extras", {
    method,
    headers: { ...(who ? { Cookie: `__Host-rs_session=${who}` } : {}), "content-type": "application/json", Origin: "https://cohereboulder.org", "Sec-Fetch-Site": "same-origin" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("validateExtras", () => {
  it("trims, collapses whitespace and treats missing keys as empty", () => {
    expect(validateExtras({ bringing: "  seeds \n and  tea ", offering: "" })).toEqual({ extras: { bringing: "seeds and tea", offering: "", curious: "" } });
  });
  it("counts graphemes, not code units", () => {
    expect("error" in validateExtras({ curious: "👨‍👩‍👧".repeat(120) })).toBe(false);
    expect("error" in validateExtras({ curious: "a".repeat(121) })).toBe(true);
  });
  it("rejects non-text values and non-objects", () => {
    expect("error" in validateExtras({ bringing: 4 })).toBe(true);
    expect("error" in validateExtras([])).toBe(true);
    expect("error" in validateExtras(null)).toBe(true);
  });
});

describe("/api/me/profile-extras", () => {
  it("round-trips for a member, keyed by the session's DID", async () => {
    stubUpstream();
    const env = makeEnv();
    const put = await handleMyProfileExtras(req("me", "PUT", { bringing: "bread", did: PEER }), env);
    expect(put.status).toBe(200);
    expect(await (await handleMyProfileExtras(req("me"), env)).json()).toEqual({ bringing: "bread", offering: "", curious: "" });
    expect(await (await handleMyProfileExtras(req("peer"), env)).json()).toEqual({ bringing: "", offering: "", curious: "" });
  });
  it("refuses signed-out (401), outsiders (403), too-long text (400) and a down roster (503)", async () => {
    stubUpstream();
    const env = makeEnv();
    expect((await handleMyProfileExtras(req(null), env)).status).toBe(401);
    expect((await handleMyProfileExtras(req("outsider", "PUT", { bringing: "x" }), env)).status).toBe(403);
    expect((await handleMyProfileExtras(req("me", "PUT", { bringing: "a".repeat(121) }), env)).status).toBe(400);
    stubUpstream({ rosterDown: true });
    expect((await handleMyProfileExtras(req("me"), env)).status).toBe(503);
  });
  it("refuses a cross-site write", async () => {
    stubUpstream();
    const r = new Request("https://cohereboulder.org/api/me/profile-extras", {
      method: "PUT", headers: { Cookie: "__Host-rs_session=me", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site", "content-type": "application/json" }, body: "{}",
    });
    expect((await handleMyProfileExtras(r, makeEnv())).status).toBe(403);
  });
});

describe("/api/members/profile-extras", () => {
  it("returns current members' lines only, and 403s outsiders", async () => {
    stubUpstream();
    const env = makeEnv();
    await handleMyProfileExtras(req("me", "PUT", { offering: "rides" }), env);
    await env.cohere.prepare("INSERT INTO profile_extras (did, bringing, updated_at) VALUES (?1, 'ghost', 'x')").bind(LEFT).run();
    const list = (who: string | null) => handleMemberProfileExtras(req(who), env);
    const ok = await list("peer");
    expect(await ok.json()).toEqual({ extras: { [ME]: { bringing: "", offering: "rides", curious: "" } } });
    expect((await list("outsider")).status).toBe(403);
    expect((await list(null)).status).toBe(401);
  });
});
