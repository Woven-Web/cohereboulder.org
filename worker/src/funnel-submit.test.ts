import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
vi.hoisted(() => {
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
});
import worker from "./index";
import { testD1 } from "./test-d1";

type Env = Parameters<typeof worker.fetch>[1];
type Ctx = Parameters<typeof worker.fetch>[2];

let cohere: ReturnType<typeof testD1>;
let counter: () => Promise<unknown>;

/** The real in-memory D1, except the funnel counter write is under test control. */
function envWith(): Env {
  const wrapped = {
    ...cohere,
    prepare: (sql: string) => {
      const statement = cohere.prepare(sql);
      if (!sql.includes("form_funnel")) return statement;
      return { bind: () => ({ run: () => counter() }) };
    },
  };
  return { cohere: wrapped } as unknown as Env;
}

const submit = () =>
  new Request("https://cohere.test/api/submit/reg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "a@b.test", name: "A", answers: {} }),
  });

function context() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as unknown as Ctx, pending };
}

const within = <T>(promise: Promise<T>, ms = 500) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("blocked on the counter")), ms))]);

beforeEach(() => {
  cohere = testD1(["../schema.sql"]);
  cohere.raw
    .prepare(`INSERT INTO forms (slug, title, fields, active, created_at, updated_at) VALUES ('reg', 'Reg', '[]', 1, 'x', 'x')`)
    .run();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/submit/:slug counts `submitted` off the request path", () => {
  it("answers while the counter promise is still unresolved", async () => {
    counter = () => new Promise(() => {});
    const { ctx, pending } = context();
    const response = await within(worker.fetch(submit(), envWith(), ctx));
    expect(response.status).toBe(200);
    expect(pending).toHaveLength(1);
    expect(cohere.raw.prepare(`SELECT COUNT(*) AS n FROM submissions`).all()).toEqual([{ n: 1 }]);
  });

  it("is unaffected when the counter rejects", async () => {
    counter = async () => {
      throw new Error("no such table: form_funnel");
    };
    const { ctx, pending } = context();
    const response = await within(worker.fetch(submit(), envWith(), ctx));
    expect(response.status).toBe(200);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});
