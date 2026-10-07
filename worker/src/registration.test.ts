import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => { vi.stubGlobal("caches", { default: { delete: vi.fn() } }); });
import { handleMyRegistration } from "./registration";
const first = vi.fn();
const bind = vi.fn(() => ({ first }));
const prepare = vi.fn(() => ({ bind }));
const env = { REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://regen.test", cohere: { prepare } };
const request = () => new Request("https://cohere.test/api/me/registration?email=other@test.com", { headers: { Cookie: "__Host-rs_session=mine; cohere_session=private" } });
beforeEach(() => { vi.clearAllMocks(); });
function session(data: { did?: string; email?: string; emailVerified?: boolean }) {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ did: data.did })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ channels: data.email ? [{ kind: "email", address: data.email, verified: data.emailVerified !== false }] : [] }))));
}
it.each([true, false])("returns only the caller's registration: %s", async (registered) => {
  session({ did: "did:plc:me", email: " Verified@Test.com " });
  first.mockResolvedValue(registered ? { "1": 1 } : null);
  const response = await handleMyRegistration(request(), env as never);
  expect(await response.json()).toEqual({ registered });
  expect(bind).toHaveBeenCalledWith("verified@test.com");
  expect(prepare.mock.calls[0][0]).toContain("register-2026");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toBeInstanceOf(Headers);
  expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Cookie")).toBe("__Host-rs_session=mine");
});
it.each([{ did: "did:plc:me" }, { did: "did:plc:me", email: "x@test.com", emailVerified: false }])("keeps unknown email private", async (data) => {
  session(data);
  expect(await (await handleMyRegistration(request(), env as never)).json()).toEqual({ registered: null });
  expect(prepare).not.toHaveBeenCalled();
});
it("rejects anonymous callers", async () => {
  session({});
  expect((await handleMyRegistration(request(), env as never)).status).toBe(401);
  expect(prepare).not.toHaveBeenCalled();
});
