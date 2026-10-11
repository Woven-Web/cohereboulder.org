import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => { vi.stubGlobal("caches", { default: { delete: vi.fn() } }); });
import { handleMe } from "./me";

const BASE = "https://regenos.test";
const roster: Record<string, { handle: string; role: string }> = {
  "did:plc:st": { handle: "sam.mock.test", role: "steward" },
  "did:plc:bu": { handle: "rosa.mock.test", role: "builder" },
  "did:plc:me": { handle: "mel.mock.test", role: "member" },
};
const sessions: Record<string, { did: string; handle: string } | null> = {
  st: { did: "did:plc:st", handle: "sam.mock.test" },
  bu: { did: "did:plc:bu", handle: "rosa.mock.test" },
  me: { did: "did:plc:me", handle: "mel.mock.test" },
  gone: null,
};

function fakeRegenos(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const headers = new Headers(init?.headers);
  const reply = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
  const nsid = url.pathname.replace("/xrpc/", "");
  const rs = /__Host-rs_session=([^;]+)/.exec(headers.get("Cookie") ?? "")?.[1];
  if (nsid === "social.scenius.getSession") {
    const s = rs ? sessions[rs] : null;
    return reply(s ? { ...s, kind: "user" } : {});
  }
  if (nsid === "social.scenius.getSceneMembers") {
    if (headers.get("Authorization") !== "Bearer svc") return reply({ error: "NotAuthorized" }, 403);
    return reply({ members: Object.entries(roster).map(([did, m]) => ({ did, kind: "person", ...m })) });
  }
  if (nsid === "social.scenius.getMyContactPref") return reply({ channels: [] });
  return reply({ error: "NotFound" }, 404);
}

const kv = () => {
  const store = new Map<string, string>();
  return { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
};
const env = () =>
  ({ COHERE_AUTH: kv(), cohere: {}, REGENOS_BASE_URL: BASE, REGENOS_LOGIN_ENABLED: "true", REGENOS_COLLECTIVE_DID: "did:plc:scene", REGENOS_SERVICE_TOKEN: "svc" }) as unknown as Parameters<typeof handleMe>[0];
const ask = (cookie?: string, method = "GET") =>
  handleMe(env(), new Request("https://cohereboulder.org/api/me", { method, headers: cookie ? { Cookie: cookie } : {} }));
const rs = (v: string) => `__Host-rs_session=${v}`;

beforeEach(() => void vi.stubGlobal("fetch", vi.fn(fakeRegenos)));
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/me", () => {
  it("a steward is an organizer and a steward", async () => {
    const res = await ask(rs("st"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: true, handle: "sam.mock.test", organizer: true, steward: true });
  });

  it("a builder is an organizer but not a steward", async () => {
    expect(await (await ask(rs("bu"))).json()).toEqual({ signedIn: true, handle: "rosa.mock.test", organizer: true, steward: false });
  });

  it("a plain member is signed in and nothing more", async () => {
    expect(await (await ask(rs("me"))).json()).toEqual({ signedIn: true, handle: "mel.mock.test", organizer: false, steward: false });
  });

  it("signed out, and an expired session, say so without a handle", async () => {
    const out = { signedIn: false, handle: null, organizer: false, steward: false };
    expect(await (await ask()).json()).toEqual(out);
    expect(await (await ask(rs("gone"))).json()).toEqual(out);
  });

  it("is never cached and answers only GET", async () => {
    expect((await ask(rs("st"))).headers.get("Cache-Control")).toBe("no-store");
    expect((await ask(rs("st"), "POST")).status).toBe(405);
  });

  it("fails closed (signed out) when regenOS is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    expect(await (await ask(rs("st"))).json()).toEqual({ signedIn: false, handle: null, organizer: false, steward: false });
  });
});
