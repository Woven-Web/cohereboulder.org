import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});

import { handleAdminBoard, handleCreateReport } from "./board";
import { moderateRecords, type CircleRecord } from "./board-moderation";
import { handleXrpcProxy } from "./regenos-auth";
import { resetRosterCache } from "./roster";
import { testD1, testKV } from "./test-d1";

const SCENE = "did:plc:mockscene";
const ME = "did:plc:me";
const PEER = "did:plc:peer";
const STEWARD = "did:plc:steward";
const OUTSIDER = "did:plc:outsider";
const post = (author: string, rkey: string, extra: Record<string, unknown> = {}): CircleRecord => ({
  uri: `at://${author}/coop.lexicon.post/${rkey}`, cid: `cid-${rkey}`, author,
  record: { text: `text of ${rkey}`, createdAt: "2026-10-12T10:00:00.000Z", ...extra },
});
const reply = (author: string, rkey: string, root: string): CircleRecord =>
  post(author, rkey, { reply: { root: { uri: root, cid: "c" }, parent: { uri: root, cid: "c" } } });

function makeEnv() {
  return {
    cohere: testD1(["../migrations/0011_members.sql"]),
    COHERE_AUTH: testKV(),
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_BASE_URL: "https://upstream.test",
    REGENOS_COLLECTIVE_DID: SCENE,
  } as unknown as Parameters<typeof handleCreateReport>[1] & { cohere: ReturnType<typeof testD1> };
}
type Env = ReturnType<typeof makeEnv>;
const rows = (env: Env, sql: string) => env.cohere.raw.prepare(sql).all() as Record<string, unknown>[];

/** A regenOS stand-in: whoever the cookie names, and a public roster. */
function stubUpstream(sessions: Record<string, string> = { me: ME, peer: PEER, steward: STEWARD, outsider: OUTSIDER }, rosterDown = false) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("getSession")) {
      const cookie = new Headers(init?.headers).get("Cookie") ?? "";
      const who = /__Host-rs_session=([^;]+)/.exec(cookie)?.[1];
      return Response.json(who && sessions[who] ? { did: sessions[who] } : {});
    }
    if (url.pathname.endsWith("getSceneMembers")) {
      if (rosterDown) return new Response("down", { status: 500 });
      return Response.json({ members: [
        { did: ME, role: "member" }, { did: PEER, role: "member" }, { did: STEWARD, role: "steward" },
      ] });
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
afterEach(() => vi.unstubAllGlobals());

const reportRequest = (body: unknown, who = "me") => new Request("https://cohere.test/api/board/reports", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `__Host-rs_session=${who}; cohere_session=secret` },
  body: JSON.stringify(body),
});
const POST_URI = `at://${PEER}/coop.lexicon.post/3kabc`;

describe("POST /api/board/reports", () => {
  let env: Env;
  beforeEach(() => { env = makeEnv(); stubUpstream(); });

  it("files a report under the DID from the verified session, ignoring any claimed reporter", async () => {
    const res = await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam", note: "  selling things ", reporter: PEER, reporterDid: PEER, excerpt: "buy now" }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [row] = rows(env, "SELECT * FROM board_reports");
    expect(row).toMatchObject({ post_uri: POST_URI, post_author_did: PEER, reporter_did: ME, reason: "spam", note: "selling things", excerpt: "buy now", status: "open" });
  });
  it("needs a signed-in regenOS session", async () => {
    expect((await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }, "nobody"), env)).status).toBe(401);
    expect(rows(env, "SELECT * FROM board_reports")).toHaveLength(0);
  });
  it("refuses people who are not on the collective's roster", async () => {
    expect((await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }, "outsider"), env)).status).toBe(403);
  });
  it("fails closed when the roster cannot be read", async () => {
    stubUpstream(undefined, true);
    expect((await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }), env)).status).toBe(503);
  });
  it.each([
    [{ uri: POST_URI, reason: "rude" }],
    [{ uri: POST_URI }],
    [{ uri: "at://did:plc:x/app.bsky.feed.post/1", reason: "spam" }],
    [{ uri: "https://evil.test/", reason: "spam" }],
    [{ uri: POST_URI, reason: "spam", note: "x".repeat(501) }],
    [{ reason: "spam" }],
  ])("rejects a malformed report %j", async (body) => {
    expect((await handleCreateReport(reportRequest(body), env)).status).toBe(400);
  });
  it("answers the same to a duplicate and stores one row", async () => {
    await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }), env);
    expect((await handleCreateReport(reportRequest({ uri: POST_URI, reason: "unkind" }), env)).status).toBe(200);
    expect(rows(env, "SELECT * FROM board_reports")).toHaveLength(1);
  });
  it("rate-limits per reporter", async () => {
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await handleCreateReport(reportRequest({ uri: `at://${PEER}/coop.lexicon.post/p${i}`, reason: "spam" }), env)).status;
    expect(last).toBe(429);
    expect((await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }, "peer"), env)).status).toBe(200);
  });
  it("only accepts POST", async () => {
    expect((await handleCreateReport(new Request("https://cohere.test/api/board/reports"), env)).status).toBe(405);
  });
});

describe("moderateRecords", () => {
  let env: Env;
  const stewards = async () => new Set([STEWARD]);
  const as = (did: string | null) => async () => did;
  const run = (records: CircleRecord[], viewer: string | null, deps = { stewards }) => moderateRecords(env, records, as(viewer), deps);
  const setState = (uri: string, state: string, author = PEER) =>
    env.cohere.raw.prepare("INSERT INTO board_moderation (uri, state, author_did, created_at, updated_at) VALUES (?, ?, ?, 'now', 'now')").run(uri, state, author);
  beforeEach(() => { env = makeEnv(); });

  it("passes everything through when nothing is moderated", async () => {
    const records = [post(PEER, "a"), post(ME, "b")];
    expect(await run(records, ME)).toEqual(records);
  });
  it("drops hidden and removed posts for other members", async () => {
    setState(post(PEER, "a").uri, "hidden");
    setState(post(PEER, "b").uri, "removed");
    expect((await run([post(PEER, "a"), post(PEER, "b"), post(PEER, "c")], ME)).map((r) => r.uri)).toEqual([post(PEER, "c").uri]);
  });
  it("shows the author their own hidden post, marked", async () => {
    setState(post(ME, "a").uri, "hidden", ME);
    setState(post(ME, "b").uri, "removed", ME);
    const out = await run([post(ME, "a"), post(ME, "b")], ME);
    expect(out.map((r) => r.cohereModeration)).toEqual(["hidden", "removed"]);
  });
  it("does not hand the marked post to anyone who is not its author", async () => {
    setState(post(ME, "a").uri, "hidden", ME);
    expect(await run([post(ME, "a")], PEER)).toEqual([]);
    expect(await run([post(ME, "a")], null)).toEqual([]);
  });
  it("hides replies under a hidden root", async () => {
    const root = post(PEER, "root");
    setState(root.uri, "hidden");
    const out = await run([root, reply(ME, "r1", root.uri), reply(PEER, "r2", root.uri)], ME);
    expect(out).toEqual([]);
  });
  it("hides the reply, not the thread, when only the reply is hidden", async () => {
    const root = post(PEER, "root");
    setState(reply(PEER, "r2", root.uri).uri, "hidden");
    expect((await run([root, reply(ME, "r1", root.uri), reply(PEER, "r2", root.uri)], ME)).map((r) => r.uri)).toEqual([root.uri, reply(ME, "r1", root.uri).uri]);
  });
  it("leaves unmoderated posts alone when the approval setting is off (the default)", async () => {
    expect(await run([post(PEER, "a")], ME)).toHaveLength(1);
    expect(rows(env, "SELECT * FROM board_moderation")).toHaveLength(0);
  });

  describe("with approval on", () => {
    beforeEach(() => {
      env.cohere.raw.exec("INSERT INTO board_settings (key, value, updated_at) VALUES ('approval', 'on', 'now'), ('approval_since', '2026-10-12T00:00:00.000Z', 'now')");
    });
    it("holds new posts from non-stewards and records them as pending", async () => {
      expect(await run([post(PEER, "a")], ME)).toEqual([]);
      expect(rows(env, "SELECT uri, state, author_did, excerpt FROM board_moderation")).toEqual([
        { uri: post(PEER, "a").uri, state: "pending", author_did: PEER, excerpt: "text of a" },
      ]);
    });
    it("shows the author their own held post, marked pending", async () => {
      const out = await run([post(ME, "a")], ME);
      expect(out.map((r) => r.cohereModeration)).toEqual(["pending"]);
    });
    it("lets stewards' posts through unmarked", async () => {
      expect(await run([post(STEWARD, "s")], ME)).toHaveLength(1);
      expect(rows(env, "SELECT * FROM board_moderation")).toHaveLength(0);
    });
    it("lets posts the Worker saw before the switch-on time through", async () => {
      env.cohere.raw.prepare("INSERT INTO board_seen (uri, first_seen) VALUES (?, '2026-10-01T00:00:00.000Z')").run(post(PEER, "old").uri);
      expect(await run([post(PEER, "old")], ME)).toHaveLength(1);
    });
    it("lets an approved post through, unmarked", async () => {
      setState(post(PEER, "a").uri, "approved");
      const out = await run([post(PEER, "a")], ME);
      expect(out).toHaveLength(1);
      expect(out[0].cohereModeration).toBeUndefined();
    });
    it("holds replies too", async () => {
      expect(await run([reply(PEER, "r", post(STEWARD, "root").uri)], ME)).toEqual([]);
    });
    it("fails closed if stewards cannot be read: the post is held", async () => {
      expect(await run([post(STEWARD, "s")], ME, { stewards: async () => { throw new Error("down"); } })).toEqual([]);
    });
    it("a switch-off releases nothing silently: held rows stay pending but are not applied", async () => {
      env.cohere.raw.exec("UPDATE board_settings SET value = 'off' WHERE key = 'approval'");
      await run([post(PEER, "a")], ME);
      expect(await run([post(PEER, "a")], ME)).toHaveLength(1);
    });
  });
});

describe("the /xrpc proxy and the board", () => {
  let env: Env;
  const upstreamBody = (records: CircleRecord[]) => ({ records });
  function proxy(nsid: string, search: string, who = "me", init: RequestInit = {}) {
    const url = new URL(`https://cohere.test/xrpc/social.scenius.${nsid}${search}`);
    return handleXrpcProxy(new Request(url, { ...init, headers: { Cookie: `__Host-rs_session=${who}; cohere_session=secret`, ...(init.headers as object) } }), env, url);
  }
  beforeEach(() => { env = makeEnv(); resetRosterCache(); });

  function stubWith(records: CircleRecord[]) {
    const spy = stubUpstream();
    const inner = spy.getMockImplementation()!;
    spy.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (/listCirclePosts|getCircleThread/.test(url.pathname)) return Response.json(upstreamBody(records));
      return inner(input, init);
    });
    return spy;
  }

  it.each(["createCirclePost", "deleteCirclePost", "listCirclePosts", "getCircleThread"])("forwards %s", async (nsid) => {
    const spy = stubWith([]);
    const isGet = nsid.startsWith("list") || nsid.startsWith("get");
    const res = await proxy(nsid, isGet ? `?collective=${SCENE}&root=at://x` : "", "me",
      isGet ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collective: SCENE, post: {}, rkey: "r" }) });
    expect(res.status).toBe(200);
    expect(spy.mock.calls.some(([u]) => String(u).includes(nsid))).toBe(true);
  });
  it("refuses a collective other than the configured one", async () => {
    const spy = stubWith([]);
    expect((await proxy("listCirclePosts", "?collective=did:plc:other")).status).toBe(400);
    expect((await proxy("createCirclePost", "", "me", { method: "POST", body: JSON.stringify({ collective: "did:plc:other", post: {} }) })).status).toBe(400);
    expect((await proxy("listCirclePosts", "")).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
  it("filters hidden posts out of a listing", async () => {
    stubWith([post(PEER, "a"), post(PEER, "b")]);
    env.cohere.raw.prepare("INSERT INTO board_moderation (uri, state, author_did, created_at, updated_at) VALUES (?, 'hidden', ?, 'n', 'n')").run(post(PEER, "a").uri, PEER);
    const body = await (await proxy("listCirclePosts", `?collective=${SCENE}`)).json() as { records: CircleRecord[] };
    expect(body.records.map((r) => r.uri)).toEqual([post(PEER, "b").uri]);
  });
  it("marks the author's own hidden post", async () => {
    stubWith([post(ME, "mine")]);
    env.cohere.raw.prepare("INSERT INTO board_moderation (uri, state, author_did, created_at, updated_at) VALUES (?, 'hidden', ?, 'n', 'n')").run(post(ME, "mine").uri, ME);
    const body = await (await proxy("getCircleThread", `?collective=${SCENE}&root=${post(ME, "mine").uri}`)).json() as { records: CircleRecord[] };
    expect(body.records[0].cohereModeration).toBe("hidden");
  });
  it("answers a non-member 403 rather than an empty page (the gate is the server's)", async () => {
    stubWith([post(PEER, "a")]);
    const res = await proxy("listCirclePosts", `?collective=${SCENE}`, "outsider");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("text of a");
  });
  it("is a 502, not a leak, if moderation state cannot be read", async () => {
    stubWith([post(PEER, "a")]);
    env.cohere.raw.exec("DROP TABLE board_moderation");
    const res = await proxy("listCirclePosts", `?collective=${SCENE}`);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("text of a");
  });
});

describe("/api/admin/board", () => {
  let env: Env;
  const call = (method: string, path: string, body?: unknown) => handleAdminBoard(
    new Request(`https://cohere.test${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env, path, "steward@cohere.test",
  ) as Promise<Response>;
  const list = async () => (await call("GET", "/api/admin/board")).json() as Promise<{
    reports: { id: number; postUri: string; reason: string; reporters: number; state: string | null }[];
    hidden: { uri: string; state: string; note: string | null }[];
    pending: { uri: string }[];
    settings: { approval: boolean };
  }>;
  beforeEach(async () => {
    env = makeEnv();
    stubUpstream();
    await handleCreateReport(reportRequest({ uri: POST_URI, reason: "unkind", note: "mean", excerpt: "the text" }), env);
    await handleCreateReport(reportRequest({ uri: POST_URI, reason: "spam" }, "steward"), env);
  });

  it("returns nothing for paths it does not own", async () => {
    expect(await handleAdminBoard(new Request("https://cohere.test/api/admin/people"), env, "/api/admin/people", "a@b.c")).toBeNull();
  });
  it("lists open reports grouped by post, with approval off by default", async () => {
    const data = await list();
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0]).toMatchObject({ postUri: POST_URI, reporters: 2, state: null });
    expect(data.settings).toEqual({ approval: false });
  });
  it("hides, then unhides, and resolves the reports", async () => {
    expect((await call("POST", "/api/admin/board/hide", { uri: POST_URI, reason: "unkind", note: "asked to soften" })).status).toBe(200);
    let data = await list();
    expect(data.reports).toHaveLength(0);
    expect(data.hidden[0]).toMatchObject({ uri: POST_URI, state: "hidden", note: "asked to soften" });
    expect((await call("POST", "/api/admin/board/unhide", { uri: POST_URI })).status).toBe(200);
    data = await list();
    expect(data.hidden).toHaveLength(0);
    expect(rows(env, "SELECT status, resolved_by FROM board_reports")[0]).toMatchObject({ status: "actioned", resolved_by: "steward@cohere.test" });
  });
  it("removes permanently: needs a note and cannot be unhidden", async () => {
    expect((await call("POST", "/api/admin/board/remove", { uri: POST_URI })).status).toBe(400);
    expect((await call("POST", "/api/admin/board/remove", { uri: POST_URI, note: "doxxing" })).status).toBe(200);
    expect((await call("POST", "/api/admin/board/unhide", { uri: POST_URI })).status).toBe(409);
    expect((await list()).hidden[0]).toMatchObject({ state: "removed", note: "doxxing" });
  });
  it("dismisses a report without touching the post", async () => {
    const [{ id }] = (await list()).reports;
    expect((await call("POST", `/api/admin/board/reports/${id}/dismiss`)).status).toBe(200);
    expect((await list()).reports).toHaveLength(0);
    expect(rows(env, "SELECT * FROM board_moderation")).toHaveLength(0);
  });
  it("rejects a bad uri", async () => {
    expect((await call("POST", "/api/admin/board/hide", { uri: "nope" })).status).toBe(400);
  });
  it("switches approval on, stamping when; off again", async () => {
    expect((await call("PUT", "/api/admin/board/settings", { approval: true })).status).toBe(200);
    expect((await list()).settings.approval).toBe(true);
    expect(rows(env, "SELECT value FROM board_settings WHERE key='approval_since'")[0].value).toMatch(/^\d{4}-/);
    await call("PUT", "/api/admin/board/settings", { approval: false });
    expect((await list()).settings.approval).toBe(false);
    expect((await call("PUT", "/api/admin/board/settings", { approval: "yes" })).status).toBe(400);
  });
  it("approves a pending post", async () => {
    await call("PUT", "/api/admin/board/settings", { approval: true });
    await moderateRecords(env, [post(PEER, "n", { createdAt: new Date(Date.now() + 1000).toISOString() })], async () => ME, { stewards: async () => new Set() });
    const data = await list();
    expect(data.pending).toHaveLength(1);
    expect((await call("POST", "/api/admin/board/approve", { uri: data.pending[0].uri })).status).toBe(200);
    expect((await list()).pending).toHaveLength(0);
  });
});
