import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { upstreamFetch } = vi.hoisted(() => {
  const upstreamFetch = vi.fn();
  // No edge cache in node; the module must cope with a cache that never hits.
  vi.stubGlobal("caches", {
    default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) },
  });
  return { upstreamFetch };
});
import {
  buildSitemap,
  canonicalFor,
  clip,
  decorateAssetResponse,
  escapeHtml,
  eventMeta,
  formatEventWhen,
  handleSitemap,
  parseEventPath,
  type MetaEvent,
} from "./seo";

const ORIGIN = "https://cohereboulder.org";
const env = {
  REGENOS_BASE_URL: "https://upstream.test",
  REGENOS_COLLECTIVE_DID: "did:plc:mockscene",
  PUBLIC_BASE_URL: ORIGIN,
};

const event: MetaEvent = {
  did: "did:plc:mockscene",
  rkey: "ev1",
  name: "Grief Ritual",
  startsAt: "2026-10-17T00:30:00.000Z",
  description: "A held space for what we are losing, and what we love.",
  location: { name: "Chautauqua", street: "900 Baseline Rd", locality: "Boulder" },
};

beforeEach(() => {
  upstreamFetch.mockReset();
  vi.stubGlobal("fetch", upstreamFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("event paths and canonicals", () => {
  it("parses the SPA's event URL, decoding the DID", () => {
    expect(parseEventPath("/events/did%3Aplc%3Amockscene/ev1")).toEqual({ did: "did:plc:mockscene", rkey: "ev1" });
    expect(parseEventPath("/events/did:plc:mockscene/ev1/")).toEqual({ did: "did:plc:mockscene", rkey: "ev1" });
  });

  it.each(["/events", "/events/did:plc:x", "/events/notadid/ev1", "/events/a/b/c", "/events/%ff/ev1", "/calendar"])(
    "rejects %s",
    (path) => expect(parseEventPath(path)).toBeNull(),
  );

  it("gives known pages a self canonical and unknown ones none", () => {
    expect(canonicalFor("/", ORIGIN)).toBe(`${ORIGIN}/`);
    expect(canonicalFor("/calendar", ORIGIN)).toBe(`${ORIGIN}/calendar`);
    expect(canonicalFor("/calendar/", ORIGIN)).toBe(`${ORIGIN}/calendar`);
    expect(canonicalFor("/no-such-page", ORIGIN)).toBeNull();
  });
});

describe("eventMeta", () => {
  it("builds title, Denver-time description and canonical", () => {
    const meta = eventMeta(event, ORIGIN);
    expect(meta.title).toBe("Grief Ritual · COhere Boulder 2026");
    // 00:30Z on Oct 17 is 6:30 PM MDT on Oct 16.
    expect(meta.description).toContain("Fri, Oct 16, 2026, 6:30 PM MDT");
    expect(meta.description).toContain("Chautauqua, 900 Baseline Rd, Boulder");
    expect(meta.description).toContain("A held space");
    expect(meta.canonical).toBe(`${ORIGIN}/events/did%3Aplc%3Amockscene/ev1`);
  });

  it("hides TBD places and falls back to festival copy without a description", () => {
    const meta = eventMeta({ ...event, description: null, location: { name: "TBD", locality: "tbd" } }, ORIGIN);
    expect(meta.description).not.toMatch(/tbd/i);
    expect(meta.description).toContain("October 15–25, 2026");
  });

  it("marks a cancelled event", () => {
    const meta = eventMeta({ ...event, status: "cancelled" }, ORIGIN);
    expect(meta.title.startsWith("Cancelled: ")).toBe(true);
  });

  it("clips a long description at a word boundary", () => {
    const out = clip("word ".repeat(200), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("tolerates a bad start time", () => {
    expect(formatEventWhen("not-a-date")).toBeNull();
    expect(eventMeta({ ...event, startsAt: "nope" }, ORIGIN).description).toContain("Chautauqua");
  });

  it("escapes markup for the head", () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe(
      "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;",
    );
  });
});

describe("decorateAssetResponse", () => {
  const jsAsset = () =>
    new Response("console.log(1)", {
      headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=0, must-revalidate" },
    });

  it("pins hashed /assets/* files for a year", async () => {
    const out = await decorateAssetResponse(new Request(`${ORIGIN}/assets/index-abc123.js`), jsAsset(), env);
    expect(out.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("never pins the SPA fallback served for a missing /assets/ path", async () => {
    const html = new Response("<html></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    const out = await decorateAssetResponse(new Request(`${ORIGIN}/assets/gone.js`), html, env);
    expect(out.headers.get("Cache-Control")).toBeNull();
  });

  it("leaves non-HTML and non-GET responses alone", async () => {
    const res = new Response("{}", { headers: { "Content-Type": "application/json" } });
    expect(await decorateAssetResponse(new Request(`${ORIGIN}/favicon.webp`), res, env)).toBe(res);
    const post = jsAsset();
    expect(await decorateAssetResponse(new Request(`${ORIGIN}/assets/x.js`, { method: "POST" }), post, env)).toBe(post);
  });

  it("falls back to the untouched page if the rewriter is unavailable", async () => {
    // Node has no HTMLRewriter; the page must still be served as-is.
    const html = new Response("<html><head><title>x</title></head></html>", {
      headers: { "Content-Type": "text/html" },
    });
    const out = await decorateAssetResponse(new Request(`${ORIGIN}/calendar`), html, env);
    expect(out).toBe(html);
  });

  it("uses the regenOS detail read for event pages, anonymously", async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({ uri: "at://did:plc:mockscene/community.lexicon.calendar.event/ev1", value: { name: "X" } }),
    );
    const html = new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
    await decorateAssetResponse(new Request(`${ORIGIN}/events/did:plc:mockscene/ev1`), html, env);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = upstreamFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/xrpc/social.scenius.getEvent?");
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
  });
});

describe("sitemap", () => {
  it("lists the static pages and each event, XML-escaped", () => {
    const xml = buildSitemap(ORIGIN, [{ did: "did:plc:x", rkey: "a&b" }]);
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/calendar</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/propose</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/events/did%3Aplc%3Ax/a%26b</loc>`);
    expect(xml).not.toContain("a&b");
  });

  it("still answers with the static pages when regenOS is down", async () => {
    upstreamFetch.mockRejectedValue(new Error("down"));
    const res = await handleSitemap(new Request(`${ORIGIN}/sitemap.xml`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain(`<loc>${ORIGIN}/calendar</loc>`);
    expect(xml).not.toContain("/events/");
  });

  it("includes upcoming events from the list read", async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({
        events: [
          {
            uri: "at://did:plc:mockscene/community.lexicon.calendar.event/ev9",
            value: { name: "Later", startsAt: "2099-10-16T18:00:00.000Z" },
          },
        ],
      }),
    );
    const xml = await (await handleSitemap(new Request(`${ORIGIN}/sitemap.xml`), env)).text();
    expect(xml).toContain(`<loc>${ORIGIN}/events/did%3Aplc%3Amockscene/ev9</loc>`);
  });
});
