// T-138: registration and sign-in woven together. The submit route against
// the real schema in memory, with regenOS answered by a stubbed fetch.
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});
import worker from "./index";
import { autoMember } from "./registration";
import { testD1, testKV } from "./test-d1";

type Env = Parameters<typeof worker.fetch>[1];
type Ctx = Parameters<typeof worker.fetch>[2];

const BASE = "https://regen.test";
let cohere: ReturnType<typeof testD1>;
let send: ReturnType<typeof vi.fn>;
let kv: ReturnType<typeof testKV>;
/** What the stubbed regenOS knows: session cookie value → who, and their verified email. */
let sessions: Record<string, { did: string; handle: string; email?: string }>;
let roster: { did: string; handle: string; role: string }[];
let upstreamDown: boolean;
let setMembership: ReturnType<typeof vi.fn>;

function env(extra: Record<string, string> = {}): Env {
  return {
    cohere,
    COHERE_AUTH: kv,
    SEND_EMAIL: { send },
    REGENOS_LOGIN_ENABLED: "true",
    REGENOS_BASE_URL: BASE,
    REGENOS_COLLECTIVE_DID: "did:plc:scene",
    REGENOS_SERVICE_TOKEN: "svc-token",
    ...extra,
  } as unknown as Env;
}

function ctx() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as unknown as Ctx, pending };
}

function submit(body: Record<string, unknown>, cookie?: string, headers: Record<string, string> = {}) {
  return new Request("https://cohere.test/api/submit/register-2026", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://cohere.test", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

const person = (email: string) =>
  cohere.raw.prepare(`SELECT name, phone, orgs, subscribed FROM people WHERE email = ?`).all(email)[0];
const answers = (email: string) =>
  (cohere.raw
    .prepare(`SELECT s.data FROM submissions s JOIN people p ON p.id = s.person_id WHERE p.email = ? AND s.form_slug = 'register-2026'`)
    .all(email) as { data: string }[]).map((r) => JSON.parse(r.data));

beforeEach(() => {
  cohere = testD1(["../schema.sql"]);
  cohere.raw
    .prepare(
      `INSERT INTO forms (slug, title, fields, active, confirm_subject, confirm_body, created_at, updated_at)
       VALUES ('register-2026', 'Register', '[]', 1, 'Thanks', 'See you there.', 'x', 'x')`,
    )
    .run();
  cohere.raw
    .prepare(
      `INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at)
       VALUES ('p-ana', 'ana@test.com', 'Ana Original', '555-0100', 'Garden Co', 1, 'tok-ana', 'form:register-2026', 'x', 'x')`,
    )
    .run();
  cohere.raw
    .prepare(
      `INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at)
       VALUES ('s-ana', 'p-ana', 'register-2026', NULL, '{"diet":"vegan"}', 'x', 'x')`,
    )
    .run();
  send = vi.fn(async () => {});
  kv = testKV();
  sessions = {
    "sess-ana": { did: "did:plc:ana", handle: "ana.test", email: "ana@test.com" },
    "sess-new": { did: "did:plc:new", handle: "new.test", email: "new@test.com" },
    "sess-noemail": { did: "did:plc:noemail", handle: "noemail.test" },
  };
  roster = [{ did: "did:plc:site", handle: "cohere-site.scenius.social", role: "steward" }];
  upstreamDown = false;
  setMembership = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const cookie = new Headers(init?.headers).get("Cookie") ?? "";
      const who = sessions[/__Host-rs_session=([^;]+)/.exec(cookie)?.[1] ?? ""];
      const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
      switch (url.pathname) {
        case "/xrpc/social.scenius.getSession":
          return reply(who ? { did: who.did, handle: who.handle } : {});
        case "/xrpc/social.scenius.getMyContactPref":
          if (upstreamDown) return reply({ error: "down" }, 502);
          return reply({ channels: who?.email ? [{ kind: "email", address: who.email, verified: true }] : [] }, who ? 200 : 401);
        case "/xrpc/social.scenius.getSceneMembers":
          return reply({ members: roster, steward: true });
        case "/xrpc/social.scenius.setMembership": {
          const body = JSON.parse(String(init?.body));
          setMembership(body, new Headers(init?.headers).get("Authorization"));
          roster.push({ did: body.member, handle: "x", role: body.role });
          return reply({ ok: true });
        }
        default:
          return reply({ error: "NotFound" }, 404);
      }
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("signed out, existing registration", () => {
  it("never overwrites, answers like a success with a flag, and sends no email", async () => {
    const { ctx: c, pending } = ctx();
    const res = await worker.fetch(
      submit({ email: " ANA@test.com ", name: "Mallory", phone: "999", orgs: "Evil", answers: { diet: "none" }, subscribed: false }),
      env(),
      c,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyRegistered: true });
    expect(person("ana@test.com")).toEqual({ name: "Ana Original", phone: "555-0100", orgs: "Garden Co", subscribed: 1 });
    expect(answers("ana@test.com")).toEqual([{ diet: "vegan" }]);
    expect(send).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0); // not counted as submitted
  });

  it("treats a signed-in session with no verified email like signed out", async () => {
    const res = await worker.fetch(submit({ email: "ana@test.com", name: "Mallory", answers: {} }, "__Host-rs_session=sess-noemail"), env(), ctx().ctx);
    expect(await res.json()).toEqual({ ok: true, alreadyRegistered: true });
    expect(person("ana@test.com").name).toBe("Ana Original");
  });

  it("also guards when regenOS login is off", async () => {
    const res = await worker.fetch(submit({ email: "ana@test.com", name: "Mallory", answers: {} }, "__Host-rs_session=sess-ana"), env({ REGENOS_LOGIN_ENABLED: "false" }), ctx().ctx);
    expect(await res.json()).toEqual({ ok: true, alreadyRegistered: true });
    expect(answers("ana@test.com")).toEqual([{ diet: "vegan" }]);
  });
});

describe("signed out, new email", () => {
  it("stores the registration and sends the confirmation, as before", async () => {
    const { ctx: c, pending } = ctx();
    const res = await worker.fetch(submit({ email: "bo@test.com", name: "Bo", phone: "1", answers: { diet: "any" } }), env(), c);
    expect(await res.json()).toEqual({ ok: true });
    expect(person("bo@test.com")).toMatchObject({ name: "Bo", phone: "1" });
    expect(answers("bo@test.com")).toEqual([{ diet: "any" }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);
  });

  it("registers a known person with no submission for this form, filling blanks only", async () => {
    cohere.raw
      .prepare(
        `INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at)
         VALUES ('p-cy', 'cy@test.com', 'Cy Kept', NULL, NULL, 1, 'tok-cy', 'signup:website', 'x', 'x')`,
      )
      .run();
    const res = await worker.fetch(submit({ email: "cy@test.com", name: "Someone Else", phone: "222", answers: { diet: "fish" } }), env(), ctx().ctx);
    expect(await res.json()).toEqual({ ok: true });
    expect(person("cy@test.com")).toMatchObject({ name: "Cy Kept", phone: "222" });
    expect(answers("cy@test.com")).toEqual([{ diet: "fish" }]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("signed in with a verified email", () => {
  it("takes the email from the session, never the body, and edits the caller's own row", async () => {
    const { ctx: c, pending } = ctx();
    const res = await worker.fetch(
      submit({ email: "someone-else@test.com", name: "Ana New", phone: "555-0199", answers: { diet: "omni" } }, "__Host-rs_session=sess-ana"),
      env(),
      c,
    );
    expect(await res.json()).toEqual({ ok: true, updated: true });
    expect(person("ana@test.com")).toMatchObject({ name: "Ana New", phone: "555-0199", orgs: "Garden Co" });
    expect(answers("ana@test.com")).toEqual([{ diet: "omni" }]);
    expect(person("someone-else@test.com")).toBeUndefined();
    expect(send).not.toHaveBeenCalled(); // an edit is not confirmed again
    expect(pending).toHaveLength(0);
  });

  it("a first registration while signed in is stored under the session email and confirmed", async () => {
    const res = await worker.fetch(submit({ email: "typo@test.com", name: "Nia", answers: { diet: "any" } }, "__Host-rs_session=sess-new"), env(), ctx().ctx);
    expect(await res.json()).toEqual({ ok: true });
    expect(answers("new@test.com")).toEqual([{ diet: "any" }]);
    expect(person("typo@test.com")).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("asks to try again when the session's email cannot be read", async () => {
    upstreamDown = true;
    const res = await worker.fetch(submit({ email: "ana@test.com", name: "X", answers: {} }, "__Host-rs_session=sess-ana"), env(), ctx().ctx);
    expect(res.status).toBe(503);
    expect(answers("ana@test.com")).toEqual([{ diet: "vegan" }]);
  });

  it("refuses a cross-site write that carries the session cookie", async () => {
    const res = await worker.fetch(
      submit({ email: "ana@test.com", name: "X", answers: {} }, "__Host-rs_session=sess-ana", { Origin: "https://evil.test" }),
      env(),
      ctx().ctx,
    );
    expect(res.status).toBe(403);
    expect(person("ana@test.com").name).toBe("Ana Original");
  });
});

describe("GET /api/me/registration?detail=1", () => {
  const read = (cookie: string, query = "?detail=1") =>
    new Request(`https://cohere.test/api/me/registration${query}`, { headers: { Cookie: cookie } });

  it("gives the caller their own saved registration to edit", async () => {
    const res = await worker.fetch(read("__Host-rs_session=sess-ana"), env(), ctx().ctx);
    expect(await res.json()).toEqual({
      registered: true, email: "ana@test.com", name: "Ana Original", phone: "555-0100", orgs: "Garden Co", subscribed: true, answers: { diet: "vegan" },
    });
  });

  it("gives an unregistered caller just their verified email", async () => {
    const res = await worker.fetch(read("__Host-rs_session=sess-new"), env(), ctx().ctx);
    expect(await res.json()).toMatchObject({ registered: false, email: "new@test.com", answers: {} });
  });

  it("stays the light answer without ?detail", async () => {
    const res = await worker.fetch(read("__Host-rs_session=sess-ana", ""), env(), ctx().ctx);
    expect(await res.json()).toEqual({ registered: true });
  });
});

describe("AUTO_MEMBER_ON_SIGNIN", () => {
  const visit = async (cookie: string, extra: Record<string, string> = {}) => {
    const { ctx: c, pending } = ctx();
    await worker.fetch(new Request("https://cohere.test/api/me/registration", { headers: { Cookie: cookie } }), env(extra), c);
    await Promise.all(pending);
  };

  it("is off unless exactly \"true\"", async () => {
    await visit("__Host-rs_session=sess-ana");
    await visit("__Host-rs_session=sess-ana", { AUTO_MEMBER_ON_SIGNIN: "yes" });
    expect(setMembership).not.toHaveBeenCalled();
  });

  it("adds a registered non-member once, as member, with the service token", async () => {
    await visit("__Host-rs_session=sess-ana", { AUTO_MEMBER_ON_SIGNIN: "true" });
    await visit("__Host-rs_session=sess-ana", { AUTO_MEMBER_ON_SIGNIN: "true" });
    expect(setMembership).toHaveBeenCalledTimes(1);
    expect(setMembership).toHaveBeenCalledWith({ scene: "did:plc:scene", member: "did:plc:ana", role: "member" }, "Bearer svc-token");
    expect(kv.store.get("automember:did:plc:ana")).toBe("added");
  });

  it("never touches someone already on the roster (no downgrade)", async () => {
    roster.push({ did: "did:plc:ana", handle: "ana.test", role: "builder" });
    await visit("__Host-rs_session=sess-ana", { AUTO_MEMBER_ON_SIGNIN: "true" });
    expect(setMembership).not.toHaveBeenCalled();
    expect(roster.find((m) => m.did === "did:plc:ana")?.role).toBe("builder");
  });

  it("skips people who are not registered", async () => {
    await visit("__Host-rs_session=sess-new", { AUTO_MEMBER_ON_SIGNIN: "true" });
    expect(setMembership).not.toHaveBeenCalled();
  });

  it("refuses the site's own accounts", async () => {
    await autoMember(env() as never, "did:plc:x", "cohere-site.scenius.social");
    await autoMember(env() as never, "did:plc:y", "claudeji.scenius.social");
    expect(setMembership).not.toHaveBeenCalled();
  });

  it("fails quietly when regenOS refuses", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => { throw new Error("boom"); });
    await expect(autoMember(env() as never, "did:plc:z", "z.test")).resolves.toBeUndefined();
  });
});
