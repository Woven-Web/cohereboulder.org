import { describe, expect, it } from "vitest";
import { handleAdminFunnel, handleFunnelEvent, recordSubmitted } from "./funnel";
import { testD1 } from "./test-d1";

const NOW = new Date("2026-10-09T18:00:00Z");
const FIELDS = [
  { key: "full_name", label: "Full Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "volunteer_interest", label: "Volunteer?", type: "radio", options: ["Yes", "No"] },
];

function makeEnv() {
  const cohere = testD1(["../schema.sql"]);
  const add = (slug: string, active: number) =>
    cohere.raw
      .prepare(
        `INSERT INTO forms (slug, title, fields, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'x', 'x')`,
      )
      .run(slug, slug, JSON.stringify(FIELDS), active);
  add("open-form", 1);
  add("closed-form", 0);
  return { cohere } as unknown as Parameters<typeof handleFunnelEvent>[1] & { cohere: ReturnType<typeof testD1> };
}

function post(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request("https://cohereboulder.org/api/funnel/open-form", {
    method: "POST",
    headers: { "Content-Type": "text/plain", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const rows = (env: ReturnType<typeof makeEnv>) =>
  env.cohere.raw.prepare(`SELECT form_slug, day, event, count FROM form_funnel ORDER BY event`).all();

describe("POST /api/funnel/:slug", () => {
  it("upserts a counter per form, day and event", async () => {
    const env = makeEnv();
    for (let i = 0; i < 3; i++) {
      const res = await handleFunnelEvent(post({ event: "view" }), env, "open-form", NOW);
      expect(res.status).toBe(204);
    }
    await handleFunnelEvent(post({ event: "reached:volunteer_interest" }), env, "open-form", NOW);
    await handleFunnelEvent(post({ event: "submit_attempt" }), env, "open-form", new Date("2026-10-10T01:00:00Z"));
    expect(await rows(env)).toEqual([
      { form_slug: "open-form", day: "2026-10-09", event: "reached:volunteer_interest", count: 1 },
      { form_slug: "open-form", day: "2026-10-10", event: "submit_attempt", count: 1 },
      { form_slug: "open-form", day: "2026-10-09", event: "view", count: 3 },
    ]);
  });

  it("accepts a JSON content type too", async () => {
    const env = makeEnv();
    const res = await handleFunnelEvent(
      post({ event: "view" }, { "Content-Type": "application/json" }),
      env,
      "open-form",
      NOW,
    );
    expect(res.status).toBe(204);
  });

  it.each([
    ["an unknown event", { event: "click" }],
    ["submitted, which only the server may count", { event: "submitted" }],
    ["a field key the form does not have", { event: "reached:passport_number" }],
    ["an empty field key", { event: "reached:" }],
    ["a non-string event", { event: 7 }],
    ["no event", {}],
  ])("rejects %s with 400 and stores nothing", async (_label, body) => {
    const env = makeEnv();
    const res = await handleFunnelEvent(post(body), env, "open-form", NOW);
    expect(res.status).toBe(400);
    expect(await rows(env)).toEqual([]);
  });

  it("rejects malformed JSON", async () => {
    const env = makeEnv();
    expect((await handleFunnelEvent(post("{nope", {}, true), env, "open-form", NOW)).status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const env = makeEnv();
    const res = await handleFunnelEvent(post({ event: "view", pad: "x".repeat(2000) }), env, "open-form", NOW);
    expect(res.status).toBe(413);
  });

  it("404s an unknown form and 410s a closed one", async () => {
    const env = makeEnv();
    expect((await handleFunnelEvent(post({ event: "view" }), env, "nope", NOW)).status).toBe(404);
    expect((await handleFunnelEvent(post({ event: "view" }), env, "closed-form", NOW)).status).toBe(410);
    expect(await rows(env)).toEqual([]);
  });

  it("rejects a foreign Origin, allows the same one, and allows none", async () => {
    const env = makeEnv();
    const foreign = await handleFunnelEvent(post({ event: "view" }, { Origin: "https://evil.example" }), env, "open-form", NOW);
    expect(foreign.status).toBe(403);
    const same = await handleFunnelEvent(post({ event: "view" }, { Origin: "https://cohereboulder.org" }), env, "open-form", NOW);
    expect(same.status).toBe(204);
    expect(await rows(env)).toHaveLength(1);
  });

  it("only takes POST", async () => {
    const env = makeEnv();
    const res = await handleFunnelEvent(new Request("https://cohereboulder.org/api/funnel/open-form"), env, "open-form", NOW);
    expect(res.status).toBe(405);
  });

  it("stops counting an event past a daily ceiling, so a script cannot inflate the numbers", async () => {
    const env = makeEnv();
    env.cohere.raw
      .prepare(`INSERT INTO form_funnel (form_slug, day, event, count) VALUES ('open-form', '2026-10-09', 'view', 5000)`)
      .run();
    const res = await handleFunnelEvent(post({ event: "view" }), env, "open-form", NOW);
    expect(res.status).toBe(429);
    expect(((await rows(env)) as { count: number }[])[0].count).toBe(5000);
  });

  it("never stores anything but form, day, event and count", () => {
    const env = makeEnv();
    const columns = env.cohere.raw.prepare(`PRAGMA table_info(form_funnel)`).all() as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(["form_slug", "day", "event", "count"]);
  });
});

describe("recordSubmitted", () => {
  it("increments the submitted counter on the same table", async () => {
    const env = makeEnv();
    await recordSubmitted(env, "open-form", NOW);
    await recordSubmitted(env, "open-form", NOW);
    expect(await rows(env)).toEqual([{ form_slug: "open-form", day: "2026-10-09", event: "submitted", count: 2 }]);
  });

  it("never throws, so a counter problem cannot fail a registration", async () => {
    const env = makeEnv();
    env.cohere.raw.exec(`DROP TABLE form_funnel`);
    await expect(recordSubmitted(env, "open-form", NOW)).resolves.toBeUndefined();
  });
});

describe("GET /api/admin/funnel/:slug", () => {
  async function seed(env: ReturnType<typeof makeEnv>) {
    const hit = async (event: string, n: number, day: string) => {
      for (let i = 0; i < n; i++) await handleFunnelEvent(post({ event }), env, "open-form", new Date(`${day}T12:00:00Z`));
    };
    await hit("view", 10, "2026-10-08");
    await hit("view", 10, "2026-10-09");
    await hit("reached:full_name", 15, "2026-10-09");
    await hit("reached:email", 12, "2026-10-09");
    await hit("reached:volunteer_interest", 5, "2026-10-09");
    await hit("submit_attempt", 4, "2026-10-09");
    await recordSubmitted(env, "open-form", new Date("2026-10-09T12:00:00Z"));
    await recordSubmitted(env, "open-form", new Date("2026-10-09T12:00:00Z"));
    await hit("reached:retired_question", 9, "2026-10-09");
  }
  const get = (query = "") => new URL(`https://cohereboulder.org/api/admin/funnel/open-form${query}`);

  it("lists steps in form order with the drop from the previous step", async () => {
    const env = makeEnv();
    await seed(env);
    const res = await handleAdminFunnel(env, get("?from=2026-10-08&to=2026-10-09"), "open-form", NOW);
    const body = (await res.json()) as { steps: Record<string, unknown>[]; from: string; to: string };
    expect(body.from).toBe("2026-10-08");
    expect(body.to).toBe("2026-10-09");
    expect(body.steps.map((s) => [s.event, s.count, s.drop])).toEqual([
      ["view", 20, null],
      ["reached:full_name", 15, 5],
      ["reached:email", 12, 3],
      ["reached:volunteer_interest", 5, 7],
      ["submit_attempt", 4, 1],
      ["submitted", 2, 2],
    ]);
    expect(body.steps[1].label).toBe("Full Name");
    expect(JSON.stringify(body)).not.toContain("retired_question");
  });

  it("never reports a negative drop when a later step outnumbers the earlier one", async () => {
    const env = makeEnv();
    await handleFunnelEvent(post({ event: "reached:email" }), env, "open-form", NOW);
    const res = await handleAdminFunnel(env, get("?from=2026-10-09&to=2026-10-09"), "open-form", NOW);
    const { steps } = (await res.json()) as { steps: { event: string; drop: number | null }[] };
    expect(steps.find((s) => s.event === "reached:email")?.drop).toBe(0);
  });

  it("defaults to the last 14 days, inclusive of today", async () => {
    const env = makeEnv();
    await seed(env);
    const body = (await (await handleAdminFunnel(env, get(), "open-form", NOW)).json()) as { from: string; to: string };
    expect(body).toMatchObject({ from: "2026-09-26", to: "2026-10-09" });
  });

  it("excludes days outside the range", async () => {
    const env = makeEnv();
    await seed(env);
    const body = (await (await handleAdminFunnel(env, get("?from=2026-10-09&to=2026-10-09"), "open-form", NOW)).json()) as {
      steps: { event: string; count: number }[];
    };
    expect(body.steps[0]).toMatchObject({ event: "view", count: 10 });
  });

  it("rejects bad dates, inverted ranges and unknown forms", async () => {
    const env = makeEnv();
    expect((await handleAdminFunnel(env, get("?from=yesterday"), "open-form", NOW)).status).toBe(400);
    expect((await handleAdminFunnel(env, get("?from=2026-10-09&to=2026-10-01"), "open-form", NOW)).status).toBe(400);
    expect((await handleAdminFunnel(env, get(), "nope", NOW)).status).toBe(404);
  });
});
