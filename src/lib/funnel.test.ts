import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFunnelEvent } from "./api";
import { REACHED_RATIO, countsAsReached } from "./funnel";

afterEach(() => vi.unstubAllGlobals());

describe("sendFunnelEvent transport", () => {
  it("uses fetch with no credentials and no referrer, never sendBeacon", () => {
    const sendBeacon = vi.fn(() => true);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("fetch", fetchMock);
    // A signed-in organizer: the admin cookie is Path=/, so the browser would
    // attach it to a credentialed request. Only credentials "omit" prevents that.
    vi.stubGlobal("document", { cookie: "cohere_session=abc" });

    sendFunnelEvent("transport-form", "view");

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/funnel/transport-form");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" });
    expect(JSON.parse(init.body as string)).toEqual({ event: "view" });
  });

  it("sends each event once per page load and swallows failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    sendFunnelEvent("transport-once", "view");
    sendFunnelEvent("transport-once", "view");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("countsAsReached", () => {
  const entry = (isIntersecting: boolean, intersectionRatio: number) => ({ isIntersecting, intersectionRatio });

  it("ignores the initial partial observation of a question at the fold", () => {
    expect(countsAsReached(entry(true, 0.1))).toBe(false);
    expect(countsAsReached(entry(true, 0.59))).toBe(false);
  });
  it("counts once 60% is visible", () => {
    expect(REACHED_RATIO).toBe(0.6);
    expect(countsAsReached(entry(true, 0.6))).toBe(true);
    expect(countsAsReached(entry(true, 1))).toBe(true);
  });
  it("never counts a question that is not intersecting", () => {
    expect(countsAsReached(entry(false, 0))).toBe(false);
  });
});
