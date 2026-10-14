import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => { vi.stubGlobal("caches", { default: { delete: vi.fn() } }); });
import { notOrganizerPage, canManageAccess, emailLoginEnabled, resolveAdminAccess, sessionMailbox } from "./admin-gate";

const BASE = "https://regenos.test";
const SCENE = "did:plc:scene";

/** A KV that honours expirationTtl against the (fake) clock. */
function ttlKV() {
  const store = new Map<string, { value: string; expires: number }>();
  return {
    store,
    puts: [] as { key: string; ttl?: number }[],
    async get(key: string) {
      const hit = store.get(key);
      if (!hit || hit.expires <= Date.now()) return null;
      return hit.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      this.puts.push({ key, ttl: opts?.expirationTtl });
      store.set(key, { value, expires: Date.now() + (opts?.expirationTtl ?? 1e9) * 1000 });
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

// Roster and sessions the fake regenOS answers from; tests mutate them.
let roster: Record<string, { handle: string; role: string }>;
let sessions: Record<string, { did: string; handle: string } | null>;
let contact: Record<string, string>;
const calls: { url: URL; cookie: string | null; auth: string | null }[] = [];

function fakeRegenos(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const headers = new Headers(init?.headers);
  calls.push({ url, cookie: headers.get("Cookie"), auth: headers.get("Authorization") });
  const reply = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
  const nsid = url.pathname.replace("/xrpc/", "");
  const rs = /__Host-rs_session=([^;]+)/.exec(headers.get("Cookie") ?? "")?.[1];
  if (nsid === "social.scenius.getSession") {
    const s = rs ? sessions[rs] : null;
    return reply(s ? { ...s, kind: "user" } : {});
  }
  if (nsid === "social.scenius.getSceneMembers") {
    if (headers.get("Authorization") !== "Bearer svc") return reply({ error: "NotAuthorized" }, 403);
    return reply({ members: Object.entries(roster).map(([did, m]) => ({ did, kind: "person", ...m })), steward: true });
  }
  if (nsid === "social.scenius.getMyContactPref") {
    const s = rs ? sessions[rs] : null;
    const address = s ? contact[s.did] : undefined;
    return reply({ channels: address ? [{ kind: "email", address, verified: true }] : [] });
  }
  return reply({ error: "NotFound" }, 404);
}

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    COHERE_AUTH: ttlKV(),
    cohere: {},
    REGENOS_BASE_URL: BASE,
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_COLLECTIVE_DID: SCENE,
    REGENOS_SERVICE_TOKEN: "svc",
    ...extra,
  } as unknown as Parameters<typeof resolveAdminAccess>[0] & { COHERE_AUTH: ReturnType<typeof ttlKV> };
}

const req = (cookie?: string) => new Request("https://cohereboulder.org/admin", { headers: cookie ? { Cookie: cookie } : {} });
const rs = (value: string) => `__Host-rs_session=${value}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  calls.length = 0;
  roster = {
    "did:plc:st": { handle: "sam.mock.test", role: "steward" },
    "did:plc:bu": { handle: "rosa.mock.test", role: "builder" },
    "did:plc:me": { handle: "mel.mock.test", role: "member" },
  };
  sessions = {
    st: { did: "did:plc:st", handle: "sam.mock.test" },
    bu: { did: "did:plc:bu", handle: "rosa.mock.test" },
    me: { did: "did:plc:me", handle: "mel.mock.test" },
    out: { did: "did:plc:out", handle: "otto.mock.test" },
    gone: null,
  };
  contact = { "did:plc:bu": "Rosa@Cohere.test" };
  vi.stubGlobal("fetch", vi.fn(fakeRegenos));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("portal gate from the regenOS scene role", () => {
  it("lets a steward in, with access management", async () => {
    const result = await resolveAdminAccess(makeEnv(), req(rs("st")));
    expect(result.state).toBe("organizer");
    if (result.state !== "organizer") return;
    expect(result.session).toMatchObject({ handle: "sam.mock.test", role: "steward", did: "did:plc:st", source: "regenos" });
    expect(canManageAccess(result.session)).toBe(true);
  });

  it("lets a builder in but not into Access", async () => {
    const result = await resolveAdminAccess(makeEnv(), req(rs("bu")));
    expect(result.state).toBe("organizer");
    if (result.state !== "organizer") return;
    expect(canManageAccess(result.session)).toBe(false);
  });

  it("turns a plain member away, naming them", async () => {
    expect(await resolveAdminAccess(makeEnv(), req(rs("me")))).toEqual({
      state: "notOrganizer",
      handle: "mel.mock.test",
      role: "member",
    });
  });

  it("treats a signed-in non-member as not an organizer", async () => {
    expect(await resolveAdminAccess(makeEnv(), req(rs("out")))).toMatchObject({ state: "notOrganizer", role: null });
  });

  it("answers signedOut with no cookie, without calling anyone", async () => {
    expect(await resolveAdminAccess(makeEnv(), req())).toEqual({ state: "signedOut" });
    expect(calls).toHaveLength(0);
  });

  it("answers signedOut for an expired regenOS session", async () => {
    expect(await resolveAdminAccess(makeEnv(), req(rs("gone")))).toEqual({ state: "signedOut" });
  });

  it("fails closed when regenOS is unreachable or the service token is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    expect((await resolveAdminAccess(makeEnv(), req(rs("st")))).state).toBe("signedOut");
    vi.stubGlobal("fetch", vi.fn(fakeRegenos));
    const noToken = makeEnv({ REGENOS_SERVICE_TOKEN: undefined });
    expect((await resolveAdminAccess(noToken, req(rs("st")))).state).not.toBe("organizer");
  });
});

describe("roster pagination", () => {
  it("follows the cursor to find an organizer beyond the first page", async () => {
    const pages = [
      { members: [{ did: "did:plc:x1", role: "member" }], cursor: "c2" },
      { members: [{ did: "did:plc:x2", role: "member" }], cursor: "c3" },
      { members: [{ did: "did:plc:bu", handle: "rosa.mock.test", role: "builder", kind: "person" }] },
    ];
    const seen: (string | null)[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("getSceneMembers")) {
        const cursor = url.searchParams.get("cursor");
        seen.push(cursor);
        const page = pages[cursor === "c3" ? 2 : cursor === "c2" ? 1 : 0];
        return Promise.resolve(new Response(JSON.stringify(page)));
      }
      return fakeRegenos(input, init);
    }));
    const result = await resolveAdminAccess(makeEnv(), req(rs("bu")));
    expect(result.state).toBe("organizer");
    expect(seen).toEqual([null, "c2", "c3"]);
  });

  it("fails closed rather than loop forever on a cursor that never ends", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("getSceneMembers")) return Promise.resolve(new Response(JSON.stringify({ members: [], cursor: "same" })));
      return fakeRegenos(input, init);
    }));
    expect((await resolveAdminAccess(makeEnv(), req(rs("bu")))).state).not.toBe("organizer");
  });
});

describe("caching", () => {
  it("asks regenOS once per 60 seconds, then re-checks the role", async () => {
    const env = makeEnv();
    await resolveAdminAccess(env, req(rs("bu")));
    const first = calls.length;
    await resolveAdminAccess(env, req(rs("bu")));
    expect(calls.length).toBe(first);
    expect(env.COHERE_AUTH.puts.every((p) => p.ttl === 60)).toBe(true);

    roster["did:plc:bu"].role = "member"; // revoked upstream
    vi.advanceTimersByTime(30_000);
    expect((await resolveAdminAccess(env, req(rs("bu")))).state).toBe("organizer"); // still cached
    vi.advanceTimersByTime(31_000);
    expect(await resolveAdminAccess(env, req(rs("bu")))).toMatchObject({ state: "notOrganizer", role: "member" });
  });

  it("refuses an expired regenOS session once the cache lapses", async () => {
    const env = makeEnv();
    expect((await resolveAdminAccess(env, req(rs("st")))).state).toBe("organizer");
    sessions.st = null;
    vi.advanceTimersByTime(61_000);
    expect((await resolveAdminAccess(env, req(rs("st")))).state).toBe("signedOut");
  });

  it("never stores the raw cookie value in KV keys", async () => {
    const env = makeEnv();
    await resolveAdminAccess(env, req(rs("st")));
    expect([...env.COHERE_AUTH.store.keys()].some((k) => k.includes("st") && k.includes("__Host"))).toBe(false);
  });
});

describe("cookies stay where they belong", () => {
  it("sends only __Host-rs_ cookies, only to regenOS, and the bearer only on the roster read", async () => {
    await resolveAdminAccess(makeEnv(), req(`cohere_session=secret-admin; ${rs("bu")}; theme=dark`));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.origin).toBe(BASE);
      expect(call.cookie ?? "").not.toContain("cohere_session");
      expect(call.cookie ?? "").not.toContain("theme");
      if (call.url.pathname.endsWith("getSceneMembers")) expect(call.cookie).toBeNull();
      else expect(call.auth).toBeNull();
    }
  });
});

describe("the email-code login is retired behind ADMIN_EMAIL_LOGIN", () => {
  const legacy = {
    email: "old@cohere.test",
    name: "Old Admin",
    createdAt: "2026-01-01T00:00:00Z",
  };
  async function withLegacySession(flag?: string) {
    const env = makeEnv(flag === undefined ? {} : { ADMIN_EMAIL_LOGIN: flag });
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tok")))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await env.COHERE_AUTH.put(`session:${hash}`, JSON.stringify(legacy));
    (env as unknown as { cohere: unknown }).cohere = {
      prepare: () => ({ bind: () => ({ first: async () => ({ email: legacy.email, name: legacy.name }) }) }),
    };
    return env;
  }

  it.each([undefined, "false", "", "TRUE"])("a cohere_session alone grants nothing when the flag is %j", async (flag) => {
    const env = await withLegacySession(flag);
    expect(emailLoginEnabled(env)).toBe(false);
    expect(await resolveAdminAccess(env, req("cohere_session=tok"))).toEqual({ state: "signedOut" });
  });

  it("still works for rollback when the flag is exactly \"true\"", async () => {
    const env = await withLegacySession("true");
    const result = await resolveAdminAccess(env, req("cohere_session=tok"));
    expect(result.state).toBe("organizer");
    if (result.state !== "organizer") return;
    expect(result.session).toMatchObject({ email: "old@cohere.test", source: "email" });
    expect(canManageAccess(result.session)).toBe(true);
  });

  it.each(["me", "out"])("rollback also works for someone with a below-builder regenOS session (%s)", async (who) => {
    const env = await withLegacySession("true");
    const result = await resolveAdminAccess(env, req(`${rs(who)}; cohere_session=tok`));
    expect(result.state).toBe("organizer");
    if (result.state !== "organizer") return;
    expect(result.session).toMatchObject({ source: "email", email: "old@cohere.test" });
  });

  it("a below-builder regenOS session with no legacy session is still notOrganizer under the flag", async () => {
    const env = await withLegacySession("true");
    expect(await resolveAdminAccess(env, req(rs("me")))).toMatchObject({ state: "notOrganizer", role: "member" });
  });

  it("a below-builder regenOS session plus a cohere_session is refused when the flag is off", async () => {
    const env = await withLegacySession("false");
    expect(await resolveAdminAccess(env, req(`${rs("me")}; cohere_session=tok`))).toMatchObject({ state: "notOrganizer" });
  });
});

describe("identity", () => {
  it("uses the verified contact email when regenOS has one, lowercased", async () => {
    const result = await resolveAdminAccess(makeEnv(), req(rs("bu")));
    if (result.state !== "organizer") throw new Error("expected organizer");
    expect(result.session.email).toBe("rosa@cohere.test");
    expect(sessionMailbox(result.session)).toBe("rosa@cohere.test");
  });

  it("falls back to @handle, with no mailbox, when it has none", async () => {
    const result = await resolveAdminAccess(makeEnv(), req(rs("st")));
    if (result.state !== "organizer") throw new Error("expected organizer");
    expect(result.session.email).toBe("@sam.mock.test");
    expect(sessionMailbox(result.session)).toBeNull();
  });
});

describe("the refusal page", () => {
  it("names the handle, asks for the builder role, and escapes markup", () => {
    const page = notOrganizerPage("mel.mock.test");
    expect(page).toContain("You're signed in as @mel.mock.test, but you're not an organizer of COhere's scene. Ask a steward to give you the builder role.");
    expect(notOrganizerPage("<script>x</script>")).not.toContain("<script>x");
  });
});
