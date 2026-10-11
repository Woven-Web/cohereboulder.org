import { describe, expect, it } from "vitest";
import { crossSiteRefusal } from "./csrf";

const url = new URL("https://cohereboulder.org/api/admin/access/role");
const make = (method: string, headers: Record<string, string> = {}) => new Request(url, { method, headers });

describe("crossSiteRefusal", () => {
  it.each(["POST", "PUT", "DELETE", "PATCH"])("refuses a foreign Origin on %s", async (method) => {
    const res = crossSiteRefusal(make(method, { Origin: "https://evil.example" }), url);
    expect(res?.status).toBe(403);
  });

  it("refuses a mutating request with no Origin and no Sec-Fetch-Site", () => {
    expect(crossSiteRefusal(make("POST"), url)?.status).toBe(403);
  });

  it("refuses Sec-Fetch-Site same-site and cross-site even if Origin is missing", () => {
    expect(crossSiteRefusal(make("POST", { "Sec-Fetch-Site": "same-site" }), url)?.status).toBe(403);
    expect(crossSiteRefusal(make("POST", { "Sec-Fetch-Site": "cross-site" }), url)?.status).toBe(403);
  });

  it("refuses a foreign Origin even when Sec-Fetch-Site claims same-origin", () => {
    expect(crossSiteRefusal(make("POST", { Origin: "https://evil.example", "Sec-Fetch-Site": "same-origin" }), url)?.status).toBe(403);
  });

  it("allows the request's own Origin", () => {
    expect(crossSiteRefusal(make("POST", { Origin: "https://cohereboulder.org" }), url)).toBeNull();
  });

  it("allows Sec-Fetch-Site same-origin or none when Origin is absent", () => {
    expect(crossSiteRefusal(make("PUT", { "Sec-Fetch-Site": "same-origin" }), url)).toBeNull();
    expect(crossSiteRefusal(make("DELETE", { "Sec-Fetch-Site": "none" }), url)).toBeNull();
  });

  it("never blocks GET or HEAD", () => {
    expect(crossSiteRefusal(make("GET", { Origin: "https://evil.example" }), url)).toBeNull();
    expect(crossSiteRefusal(make("HEAD"), url)).toBeNull();
  });
});
