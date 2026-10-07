import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => vi.stubGlobal("caches", { default: { delete: vi.fn() } }));
import { reconcileMembership } from "./membership";
import { testD1 } from "./test-d1";
let db: ReturnType<typeof testD1>;
const request = new Request("https://cohere.test/api/me/registration", { headers: { Cookie: "__Host-rs_session=test" } });
const env = () => ({ cohere: db, REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://mock.test", REGENOS_COLLECTIVE_DID: "did:plc:scene", REGENOS_SERVICE_TOKEN: "mock-token" });
beforeEach(async () => {
  db = testD1(["../schema.sql", "../migrations/0008_membership_links.sql"]);
  await db.prepare("INSERT INTO people(id,email,unsubscribe_token,created_at,updated_at) VALUES('p','me@test.com','u','now','now')").run();
  await db.prepare("INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES('s','p','register-2026','{}','now','now')").run();
});
function mock(role?: string, fail = false) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("getMyContactPref")) return Response.json({ channels: [{ kind: "email", address: "ME@test.com", verified: true }] });
    if (url.includes("getSceneMembers")) return Response.json({ members: role ? [{ did: "did:plc:me", role }] : [] });
    expect(JSON.parse(String(init?.body))).toEqual({ scene: "did:plc:scene", member: "did:plc:me", role: "member" });
    return Response.json({ recordCid: "cid" }, { status: fail ? 503 : 200 });
  }));
}
it("links a new account and records permanent membership", async () => {
  mock();
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toMatchObject({ registered: true, membership: "member", email: "me@test.com" });
  expect(await db.prepare("SELECT did,status FROM membership_links").first()).toEqual({ did: "did:plc:me", status: "member" });
});
it.each(["member", "builder", "facilitator", "steward"])("never rewrites existing %s", async role => {
  mock(role);
  await reconcileMembership(request, env() as never, "did:plc:me");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("setMembership"))).toBe(false);
});
it("retries a failed write on the next sign-in, without failing sign-in", async () => {
  mock(undefined, true);
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toMatchObject({ registered: true, membership: "pending" });
  mock();
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toMatchObject({ membership: "member" });
  mock();
  await reconcileMembership(request, env() as never, "did:plc:me");
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});
it("does not write for unregistered, unverified or disabled accounts", async () => {
  mock();
  await db.prepare("DELETE FROM submissions").run();
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toMatchObject({ registered: false });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ channels: [{ kind: "email", address: "me@test.com", verified: false }] })));
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toEqual({ registered: null });
  vi.mocked(fetch).mockClear();
  await reconcileMembership(request, { ...env(), REGENOS_LOGIN_ENABLED: "false" } as never, "did:plc:me");
  expect(fetch).not.toHaveBeenCalled();
});
it("fails closed on unreadable rosters and unknown roles", async () => {
  mock("unknown");
  expect(await reconcileMembership(request, env() as never, "did:plc:me")).toMatchObject({ membership: "pending" });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("setMembership"))).toBe(false);
});
it("does not replace a permanent link with another account", async () => {
  mock("member");
  await reconcileMembership(request, env() as never, "did:plc:me");
  mock();
  expect(await reconcileMembership(request, env() as never, "did:plc:other")).toMatchObject({ membership: "pending" });
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  expect(await db.prepare("SELECT did FROM membership_links").first()).toEqual({ did: "did:plc:me" });
});
