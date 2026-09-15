import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { upstreamFetch, deleteCache } = vi.hoisted(() => {
  const upstreamFetch = vi.fn();
  const deleteCache = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("caches", { default: { delete: deleteCache } });
  return { upstreamFetch, deleteCache };
});
import { handleXrpcProxy } from "./regenos-auth";

const env = { REGENOS_LOGIN_ENABLED: "true", REGENOS_BASE_URL: "https://upstream.test" };
const url = new URL("https://cohere.test/xrpc/social.scenius.verifyEmail?token=test");
const call = (target = url, config = env) => handleXrpcProxy(new Request(target), config, target);

beforeEach(() => {
  upstreamFetch.mockReset();
  deleteCache.mockClear();
  vi.stubGlobal("fetch", upstreamFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("XRPC proxy boundary", () => {
  it.each(["/", "/calendar?from=login", "https://cohere.test/calendar", "../calendar"])(
    "relays a local redirect %s with the session cookie", async (location) => {
      upstreamFetch.mockResolvedValue(new Response(null, { status: 302, headers: {
        Location: location, "Set-Cookie": "__Host-rs_session=test; Secure; Path=/; HttpOnly",
      } }));
      const response = await call();
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(new URL(location, url).href);
      expect(response.headers.getSetCookie()).toHaveLength(1);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(upstreamFetch.mock.calls[0][1].redirect).toBe("manual");
    },
  );
  it.each(["https://elsewhere.test/", "//elsewhere.test/", "\\\\elsewhere.test/", "javascript:alert(1)", "http://cohere.test/", "https://user:pass@cohere.test/", "http://["])(
    "rejects unsafe Location %s without relaying cookies", async (location) => {
      upstreamFetch.mockResolvedValue(new Response(null, { status: 302, headers: {
        Location: location, "Set-Cookie": "__Host-rs_session=test; Secure; Path=/",
      } }));
      const response = await call();
      expect(response.status).toBe(502);
      expect(response.headers.has("Location")).toBe(false);
      expect(response.headers.has("Set-Cookie")).toBe(false);
      expect(await response.json()).toMatchObject({ error: "InvalidUpstreamRedirect" });
    },
  );
  it.each(["beginOAuth", "oauthCallback", "rsvp"])("does not expose unused %s", async (name) => {
    expect((await call(new URL(`/xrpc/social.scenius.${name}`, url))).status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
  it("keeps the whole proxy off unless enabled", async () => {
    expect((await call(url, { ...env, REGENOS_LOGIN_ENABLED: "false" })).status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
  it("isolates admin cookies, visitor IPs, and upstream CORS grants", async () => {
    upstreamFetch.mockResolvedValue(new Response("{}", { headers: {
      "Set-Cookie": "cohere_session=bad; Path=/",
      "Access-Control-Allow-Origin": "https://elsewhere.test",
    } }));
    const response = await handleXrpcProxy(new Request(url, { headers: {
      Cookie: "cohere_session=private; __Host-rs_session=allowed",
      "CF-Connecting-IP": "192.0.2.1", "X-Forwarded-For": "192.0.2.1",
      Origin: url.origin, "Sec-Fetch-Site": "same-origin",
    } }), env, url);
    const headers = upstreamFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Cookie")).toBe("__Host-rs_session=allowed");
    expect(headers.has("CF-Connecting-IP")).toBe(false);
    expect(headers.has("X-Forwarded-For")).toBe(false);
    expect(headers.get("Origin")).toBe(url.origin);
    expect(headers.get("Sec-Fetch-Site")).toBe("same-origin");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("returns a controlled failure if upstream is unreachable", async () => {
    upstreamFetch.mockRejectedValue(new Error("network details"));
    const response = await call();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("network details");
  });
});
