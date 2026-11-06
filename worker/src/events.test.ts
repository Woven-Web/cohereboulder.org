import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A real edge cache would hide what each case reads, so the Cache API is a tiny Map, and only the
// network (regenOS and the PDS, both outside this repo) is faked.
const { cacheStore } = vi.hoisted(() => {
  const cacheStore = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (req: Request) => cacheStore.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => { cacheStore.set(req.url, res.clone()); },
      delete: async (req: Request) => cacheStore.delete(req.url),
    },
  });
  return { cacheStore };
});

import { handleEventDetail, handleEventDetailWithArchive, handleEventsList, mergePastEvents, type CommunityEvent, type GetEventsRow } from "./events";

const SCENE = "did:plc:scene";
const COLLECTION = "community.lexicon.calendar.event";
const NOW = Date.parse("2026-11-06T12:00:00Z");
const uri = (rkey: string, did = SCENE) => `at://${did}/${COLLECTION}/${rkey}`;
const record = (rkey: string, startsAt: string | undefined, extra: Record<string, unknown> = {}): GetEventsRow => ({
  uri: uri(rkey),
  value: { name: `Event ${rkey}`, startsAt, endsAt: startsAt ? new Date(Date.parse(startsAt) + 3_600_000).toISOString() : undefined, ...extra },
});
const listed = (rkey: string, startsAt: string | null, extra: Partial<CommunityEvent> = {}): CommunityEvent => ({
  did: SCENE, rkey, name: `Listed ${rkey}`, imageUrl: null, startsAt, endsAt: null, description: null, status: null, mode: null, location: null, ...extra,
});

describe("mergePastEvents", () => {
  it("adds the ended PDS records to the appview's upcoming list, soonest first", () => {
    const merged = mergePastEvents(
      [listed("next", "2026-12-01T18:00:00Z")],
      [record("b", "2026-10-20T18:00:00Z"), record("a", "2026-10-16T18:00:00Z")],
      NOW,
    );
    expect(merged.map((e) => e.rkey)).toEqual(["a", "b", "next"]);
  });

  it("drops cancelled records, whatever the status's namespace", () => {
    const merged = mergePastEvents([], [
      record("kept", "2026-10-16T18:00:00Z"),
      record("gone", "2026-10-17T18:00:00Z", { status: `${COLLECTION}#cancelled` }),
    ], NOW);
    expect(merged.map((e) => e.rkey)).toEqual(["kept"]);
  });

  it("dedupes by URI, and the appview's copy wins", () => {
    const merged = mergePastEvents(
      [listed("same", "2026-10-16T18:00:00Z")],
      [record("same", "2026-10-16T18:00:00Z"), record("twice", "2026-10-17T18:00:00Z"), record("twice", "2026-10-17T18:00:00Z")],
      NOW,
    );
    expect(merged.map((e) => [e.rkey, e.name])).toEqual([["same", "Listed same"], ["twice", "Event twice"]]);
  });

  it("drops the organizers' test records but keeps a real title that starts with 'test'", () => {
    const names = ["TEST", "test", " Test ", "test event", "Test 2", "Testing the Waters: a river walk"];
    const merged = mergePastEvents([], names.map((name, i) => record(`r${i}`, "2026-10-16T18:00:00Z", { name })), NOW);
    expect(merged.map((e) => e.name)).toEqual(["Testing the Waters: a river walk"]);
  });

  it("never lists a PDS record that hasn't ended: only the appview says what is upcoming", () => {
    const merged = mergePastEvents([], [record("future", "2026-12-01T18:00:00Z"), record("undated", undefined)], NOW);
    expect(merged).toEqual([]);
  });

  it("counts an event under way as not ended", () => {
    const merged = mergePastEvents([], [record("now", "2026-11-06T11:30:00Z")], NOW);
    expect(merged).toEqual([]);
  });

  it("keeps undated appview events last", () => {
    const merged = mergePastEvents([listed("undated", null), listed("next", "2026-12-01T18:00:00Z")], [record("a", "2026-10-16T18:00:00Z")], NOW);
    expect(merged.map((e) => e.rkey)).toEqual(["a", "next", "undated"]);
  });
});

// ------------------------------------------------------------- the two routes

const env = { REGENOS_BASE_URL: "https://appview.test", REGENOS_COLLECTIVE_DID: SCENE, REGENOS_PDS_URL: "https://pds.test", REGENOS_PDS_DID: SCENE, REGENOS_WEB_URL: "https://appview.test" };
const PAGE_ONE = [record("a", "2026-10-16T18:00:00Z"), record("t", "2026-10-16T19:00:00Z", { name: "TEST" })];
const PAGE_TWO = [record("b", "2026-10-25T18:00:00Z", { uris: [{ uri: "https://cohere.test/more", name: "More" }, { uri: "javascript:alert(1)" }] })];

type Answer = () => Response | Promise<Response>;
let answers: { appviewList: Answer; appviewDetail: Answer; pdsList: (url: URL) => Response; pdsRecord: Answer };
let pdsCalls: string[];

const listPage = (url: URL) => {
  const cursor = url.searchParams.get("cursor");
  // Like the real PDS: a cursor even on the last page with records, then an empty page.
  if (!cursor) return Response.json({ records: PAGE_ONE, cursor: "one" });
  if (cursor === "one") return Response.json({ records: PAGE_TWO, cursor: "two" });
  return Response.json({ records: [] });
};

beforeEach(() => {
  cacheStore.clear();
  pdsCalls = [];
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  answers = {
    appviewList: () => Response.json({ events: [] }),
    appviewDetail: () => Response.json({ error: "NotFound" }, { status: 404 }),
    pdsList: listPage,
    pdsRecord: () => Response.json({ error: "RecordNotFound" }, { status: 400 }),
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.origin === "https://pds.test") {
      pdsCalls.push(url.pathname + url.search);
      return url.pathname.endsWith("listRecords") ? answers.pdsList(url) : answers.pdsRecord();
    }
    return url.pathname.endsWith("getEvents") ? answers.appviewList() : answers.appviewDetail();
  }));
});
afterEach(() => vi.useRealTimers());

const list = async (query = "") => {
  const res = await handleEventsList(new Request(`https://cohere.test/api/events${query}`), env, {});
  return { res, body: (await res.json()) as { events: CommunityEvent[]; degraded?: boolean } };
};

describe("GET /api/events", () => {
  it("?past=1 walks every PDS page and shows the festival, without the test record", async () => {
    const { body } = await list("?past=1");
    expect(body.events.map((e) => e.rkey)).toEqual(["a", "b"]);
    expect(pdsCalls).toHaveLength(3);
    expect(pdsCalls[0]).toContain(`repo=${encodeURIComponent(SCENE)}`);
    expect(pdsCalls[0]).toContain(`collection=${encodeURIComponent(COLLECTION)}`);
  });

  it("accepts ?past=true as well", async () => {
    expect((await list("?past=true")).body.events.map((e) => e.rkey)).toEqual(["a", "b"]);
  });

  it("the plain listing stays upcoming only, from the same cached copy", async () => {
    answers.appviewList = () => Response.json({ events: [record("next", "2026-12-01T18:00:00Z")] });
    expect((await list("?past=1")).body.events.map((e) => e.rkey)).toEqual(["a", "b", "next"]);
    expect((await list()).body.events.map((e) => e.rkey)).toEqual(["next"]);
    expect(pdsCalls).toHaveLength(3); // the second answer came from the cache
  });

  it("with no PDS configured it behaves as before", async () => {
    const { REGENOS_PDS_URL: _gone, ...noPds } = env;
    const res = await handleEventsList(new Request("https://cohere.test/api/events?past=1"), noPds, {});
    expect(await res.json()).toMatchObject({ events: [] });
    expect(pdsCalls).toEqual([]);
  });

  it("a PDS configured for another DID is never called, so a mock scene can't reach the real one", async () => {
    const res = await handleEventsList(new Request("https://cohere.test/api/events?past=1"), { ...env, REGENOS_COLLECTIVE_DID: "did:plc:mockscene" }, {});
    expect(await res.json()).toMatchObject({ events: [] });
    expect(pdsCalls).toEqual([]);
    const detail = await handleEventDetailWithArchive({ ...env, REGENOS_COLLECTIVE_DID: "did:plc:mockscene" }, "did:plc:mockscene", "x", {});
    expect(detail.status).toBe(404);
    expect(pdsCalls).toEqual([]);
  });

  it("a failed PDS read with nothing upcoming is degraded, not an empty calendar, and isn't kept", async () => {
    answers.pdsList = () => new Response("boom", { status: 500 });
    const { res, body } = await list("?past=1");
    expect(body.degraded).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // The plain listing doesn't need the PDS, so its readers aren't told anything is wrong.
    expect((await list()).body.degraded).toBeUndefined();
  });

  it("a failed PDS read keeps the upcoming events on screen", async () => {
    answers.appviewList = () => Response.json({ events: [record("next", "2026-12-01T18:00:00Z")] });
    answers.pdsList = () => new Response("boom", { status: 500 });
    const { body } = await list("?past=1");
    expect(body.events.map((e) => e.rkey)).toEqual(["next"]);
    expect(body.degraded).toBeUndefined();
  });

  it("the appview being down is still degraded, even with a healthy PDS", async () => {
    answers.appviewList = () => new Response("boom", { status: 502 });
    expect((await list("?past=1")).body.degraded).toBe(true);
  });

  it("stops at the page cap instead of following a cursor forever", async () => {
    let served = 0;
    answers.pdsList = () => Response.json({ records: [record(`p${served++}`, "2026-10-16T18:00:00Z")], cursor: "more" });
    const { body } = await list("?past=1");
    expect(pdsCalls.length).toBeLessThanOrEqual(20);
    expect(body.events.length).toBe(pdsCalls.length);
  });
});

describe("GET /api/events/:did/:rkey", () => {
  const detail = (rkey = "b", did = SCENE) => handleEventDetailWithArchive(env, did, rkey, {}, "https://cohere.test");

  it("opens an ended event from its PDS record, with only safe links", async () => {
    answers.pdsRecord = () => Response.json(PAGE_TWO[0]);
    const res = await detail();
    expect(res.status).toBe(200);
    const { event, icsUrl } = (await res.json()) as { event: { name: string; uris: { uri: string }[]; hostName: string | null }; icsUrl: string };
    expect(event.name).toBe("Event b");
    expect(event.uris.map((u) => u.uri)).toEqual(["https://cohere.test/more"]);
    expect(event.hostName).toBeNull();
    expect(icsUrl).toBe("https://cohere.test/calendar.ics");
  });

  it("prefers the appview while it still knows the event", async () => {
    answers.appviewDetail = () => Response.json({ ...record("live", "2026-12-01T18:00:00Z"), visibility: "public", hostName: "Host" });
    const res = await detail("live");
    expect(((await res.json()) as { event: { hostName: string } }).event.hostName).toBe("Host");
    expect(pdsCalls).toEqual([]);
  });

  it.each([
    ["cancelled", record("x", "2026-10-16T18:00:00Z", { status: `${COLLECTION}#cancelled` })],
    ["a test record", record("x", "2026-10-16T18:00:00Z", { name: "TEST" })],
    ["not ended yet", record("x", "2026-12-01T18:00:00Z")],
  ])("answers 404 for a record that is %s", async (_label, row) => {
    answers.pdsRecord = () => Response.json(row);
    expect((await detail("x")).status).toBe(404);
  });

  it("only ever reads the collective's own repo", async () => {
    answers.pdsRecord = () => Response.json(PAGE_TWO[0]);
    expect((await detail("b", "did:plc:someone-else")).status).toBe(404);
    expect(pdsCalls).toEqual([]);
  });

  it("a missing record is a plain 404, and a PDS failure says try again", async () => {
    expect((await detail("nope")).status).toBe(404);
    answers.pdsRecord = () => new Response("boom", { status: 500 });
    expect((await detail("nope")).status).toBe(503);
    answers.pdsRecord = () => { throw new Error("network"); };
    expect((await detail("nope")).status).toBe(503);
  });

  it("the live-only read RSVPs depend on still says gone for an ended event", async () => {
    answers.pdsRecord = () => Response.json(PAGE_TWO[0]);
    expect((await handleEventDetail(env, SCENE, "b", {})).status).toBe(404);
    expect(pdsCalls).toEqual([]);
  });
});
