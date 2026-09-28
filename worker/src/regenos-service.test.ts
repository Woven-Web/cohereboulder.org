import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { upstreamFetch } = vi.hoisted(() => {
  const upstreamFetch = vi.fn();
  vi.stubGlobal("caches", { default: { delete: vi.fn().mockResolvedValue(true) } });
  return { upstreamFetch };
});
import { handleAdminEventDelete, SITE_ACCESS_REFUSED } from "./regenos-service";

const env = {
  REGENOS_BASE_URL: "https://upstream.test",
  REGENOS_COLLECTIVE_DID: "did:plc:mockscene",
  REGENOS_SERVICE_TOKEN: "test-token",
};
const url = new URL("https://cohere.test/api/admin/events/did:plc:mockscene/ev1");
const del = () => handleAdminEventDelete(env, url, "did:plc:mockscene", "ev1");

beforeEach(() => {
  upstreamFetch.mockReset();
  vi.stubGlobal("fetch", upstreamFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("service-token write refusals", () => {
  it.each([401, 403])("an upstream %i says it's the site's access, not the organizer's", async (status) => {
    upstreamFetch.mockResolvedValue(
      Response.json(
        { error: "NotAuthorized", message: "this token is not authorized for this method (scope check)" },
        { status },
      ),
    );
    const res = await del();
    // Still a 400: a 401 would sign a working organizer out of the portal.
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.message).toBe(SITE_ACCESS_REFUSED);
    expect(body.siteAccess).toBe(true);
    expect(body.detail).toContain("scope check");
    expect(JSON.stringify(body)).not.toContain("test-token");
  });

  it("other upstream refusals keep regenOS's own sentence", async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({ error: "InvalidRequest", message: "rkey is malformed" }, { status: 400 }),
    );
    const body = (await (await del()).json()) as Record<string, unknown>;
    expect(body.message).toBe("rkey is malformed");
    expect(body.siteAccess).toBeUndefined();
  });
});
