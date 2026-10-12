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
      expect(response.headers.get("Location")).toBe(new URL(location === "/" ? "/?signedIn=1" : location, url).href);
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
  it.each(["beginOAuth", "oauthCallback", "respondToRequest", "checkIn", "getEvents", "createCheckout"])("does not expose unused %s", async (name) => {
    expect((await call(new URL(`/xrpc/social.scenius.${name}`, url))).status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
  it.each([
    ["rsvp", "POST"],
    ["getEventAttendance", "GET"],
  ])("forwards the RSVP method %s with only regenOS's own cookie", async (name, method) => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ state: "confirmed" }), {
      headers: { "Content-Type": "application/json" },
    }));
    const target = new URL(`/xrpc/social.scenius.${name}?eventDid=did:plc:x&eventRkey=r`, url);
    const response = await handleXrpcProxy(new Request(target, {
      method,
      headers: { Cookie: "cohere_session=private; __Host-rs_session=allowed" },
      ...(method === "POST" ? { body: JSON.stringify({ intent: "going", eventDid: "did:plc:x", eventRkey: "r" }) } : {}),
    }), env, target);
    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = upstreamFetch.mock.calls[0];
    expect(calledUrl).toBe(`https://upstream.test/xrpc/social.scenius.${name}${target.search}`);
    expect((init.headers as Headers).get("Cookie")).toBe("__Host-rs_session=allowed");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // An RSVP is not an event write: the public listing cache stays put. (It
    // does drop that event's short-lived guest list, which profiles read.)
    for (const [request] of deleteCache.mock.calls) expect(String(request.url)).not.toContain("/api/events");
    expect(deleteCache).toHaveBeenCalledTimes(name === "rsvp" ? 1 : 0);
  });
  describe("member profiles", () => {
    const circleEnv = { ...env, REGENOS_COLLECTIVE_DID: "did:plc:mockscene" };
    const profileCall = (nsid: string, body: unknown, search = "") => {
      const target = new URL(`/xrpc/social.scenius.${nsid}${search}`, url);
      return handleXrpcProxy(new Request(target, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), circleEnv, target);
    };
    beforeEach(() => upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ records: [] }), { headers: { "Content-Type": "application/json" } })));

    it("forwards listCircleProfiles, putCircleProfile and deleteCircleProfile for our collective", async () => {
      expect((await profileCall("listCircleProfiles", undefined, "?collective=did:plc:mockscene")).status).toBe(200);
      expect((await profileCall("putCircleProfile", { collective: "did:plc:mockscene", profile: { displayName: "Pia", links: ["https://example.org"], createdAt: "2026-10-12T00:00:00Z" } })).status).toBe(200);
      expect((await profileCall("deleteCircleProfile", { collective: "did:plc:mockscene" })).status).toBe(200);
      expect(upstreamFetch).toHaveBeenCalledTimes(3);
    });
    it("pins profiles to our collective too", async () => {
      expect((await profileCall("listCircleProfiles", undefined, "?collective=did:plc:other")).status).toBe(400);
      expect((await profileCall("putCircleProfile", { collective: "did:plc:other", profile: {} })).status).toBe(400);
      expect((await profileCall("deleteCircleProfile", {})).status).toBe(400);
      expect(upstreamFetch).not.toHaveBeenCalled();
    });
    it.each(["javascript:alert(1)", "data:text/html,x", "ftp://example.org", "not a url"])("refuses a profile link that is not a web link: %s", async (link) => {
      const res = await profileCall("putCircleProfile", { collective: "did:plc:mockscene", profile: { links: ["https://ok.example", link] } });
      expect(res.status).toBe(400);
      expect(upstreamFetch).not.toHaveBeenCalled();
    });
    it("refuses a profile that is not an object, or links that are not a list", async () => {
      expect((await profileCall("putCircleProfile", { collective: "did:plc:mockscene", profile: "x" })).status).toBe(400);
      expect((await profileCall("putCircleProfile", { collective: "did:plc:mockscene", profile: { links: "https://a.example" } })).status).toBe(400);
    });
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
