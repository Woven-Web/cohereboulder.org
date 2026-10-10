import { beforeEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
const { session, cacheDelete } = vi.hoisted(() => {
  const session = vi.fn();
  const cacheDelete = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: cacheDelete } });
  return { session, cacheDelete };
});
vi.mock("./auth", async (original) => ({ ...await original<typeof import("./auth")>(), currentSession: session }));
import worker from "./index";

const did = "did:plc:mockscene";
const imagePath = `/api/admin/events/${encodeURIComponent(did)}/ev1/image`;
const publicPath = `/api/event-image/${encodeURIComponent(did)}/ev1`;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
let env: Parameters<typeof worker.fetch>[1];
let store: Map<string, { value: ArrayBuffer; metadata: { contentType: string; updated: string } }>;
const call = (path: string, method = "GET", body?: BodyInit, type = "image/png", extra = {}) => worker.fetch(new Request(`https://cohere.test${path}`, { method, body, headers: { "Content-Type": type, ...extra } }), env);
beforeEach(() => {
  store = new Map();
  session.mockResolvedValue({ email: "admin@test" });
  cacheDelete.mockClear();
  env = {
    SIGNUPS: {
      put: async (key: string, value: ArrayBuffer, options: { metadata: { contentType: string; updated: string } }) => { store.set(key, { value, metadata: options.metadata }); },
      delete: async (key: string) => { store.delete(key); },
      getWithMetadata: async (key: string) => store.get(key) ?? { value: null, metadata: null },
      list: async () => ({ keys: [...store].map(([name, entry]) => ({ name, metadata: entry.metadata })), list_complete: true }),
    },
    REGENOS_COLLECTIVE_DID: did, REGENOS_BASE_URL: "https://upstream.test",
  } as unknown as typeof env;
  const row = { uri: `at://${did}/community.lexicon.calendar.event/ev1`, value: { name: "Test event", startsAt: "2099-01-01T00:00:00Z" } };
  vi.stubGlobal("fetch", vi.fn(async (input: string) => Response.json(input.includes("getEvents") ? { events: [row] } : row)));
});
it.each(["PUT", "DELETE"])("requires admin auth for %s", async (method) => {
  session.mockResolvedValue(null);
  expect((await call(imagePath, method, method === "PUT" ? png : undefined)).status).toBe(401);
  expect(store.size).toBe(0);
});
it.each(["image/svg+xml", "text/html", "application/octet-stream"])("rejects %s", async (type) => {
  expect((await call(imagePath, "PUT", png, type)).status).toBe(400);
});
it("rejects oversized bodies, including an absent Content-Length", async () => {
  expect((await call(imagePath, "PUT", new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
  expect((await call(imagePath, "PUT", png, "image/png", { "Content-Length": "2097153" })).status).toBe(413);
});
it.each(["PUT", "DELETE"])("rejects another collective for %s", async (method) => {
  expect((await call(imagePath.replace(encodeURIComponent(did), "did:plc:other"), method, method === "PUT" ? png : undefined)).status).toBe(400);
});
it("uploads, serves, replaces, and removes a photo; JSON tracks the version", async () => {
  expect((await call(publicPath)).status).toBe(404);
  const uploaded = await (await call(imagePath, "PUT", png)).json();
  expect(uploaded.imageUrl).toContain(publicPath);
  const photo = await call(publicPath);
  expect(photo.headers.get("Content-Type")).toBe("image/png");
  expect(photo.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(new Uint8Array(await photo.arrayBuffer())).toEqual(png);
  expect((await call(publicPath, "GET", undefined, "image/png", { "If-None-Match": photo.headers.get("ETag")! })).status).toBe(304);
  for (const path of ["/api/events", `/api/events/${did}/ev1`, "/api/admin/events"]) {
    const data = await (await call(path)).json();
    expect((data.event ?? data.events[0]).imageUrl).toBe(uploaded.imageUrl);
  }
  const replaced = await (await call(imagePath, "PUT", png)).json();
  expect(replaced.imageUrl).not.toBe(uploaded.imageUrl);
  expect((await call(imagePath, "DELETE")).status).toBe(200);
  expect((await call(publicPath)).status).toBe(404);
  const data = await (await call(`/api/events/${did}/ev1`)).json();
  expect(data.event.imageUrl).toBeNull();
  expect(cacheDelete).toHaveBeenCalledTimes(3);
});
it("never serves metadata with a non-image type", async () => {
  await call(imagePath, "PUT", png);
  [...store.values()][0].metadata.contentType = "text/html";
  expect((await call(publicPath)).status).toBe(404);
});
