import { beforeEach, describe, expect, it, vi } from "vitest";

// auth.ts imports the Workers-only email module; nothing here sends real mail.
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));

import type { Session } from "./auth";
import {
  audienceWhere,
  bulkTags as bulkTagsHandler,
  maskEmail,
  cancelNewsletter,
  contentHash,
  handleNewsletterAdmin,
  handleNewsletterCancelLink,
  HOLD_MINUTES,
  mergeTags,
  newsletterMessage,
  parseAudience,
  parseCsv,
  planImport,
  readBeehiivCsv,
  redactEmails,
  renderNewsletterBody,
  ResendError,
  runNewsletterCron,
  sha256Hex,
  type ResendSend,
} from "./newsletter";
import { testD1, testKV } from "./test-d1";

const BASE = "https://cohereboulder.org";
const ADMIN: Session = { email: "ana@cohere.test", name: "Ana", createdAt: "2026-01-01T00:00:00Z" };
const OTHER: Session = { email: "ben@cohere.test", name: "Ben", createdAt: "2026-01-01T00:00:00Z" };
const T0 = new Date("2026-10-01T16:00:00Z");

function makeEnv() {
  return {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    PUBLIC_BASE_URL: BASE,
    RESEND_API_KEY: "test-key",
  } as unknown as Parameters<typeof handleNewsletterAdmin>[1] & { cohere: ReturnType<typeof testD1> };
}
type Env = ReturnType<typeof makeEnv>;

let n = 0;
function person(env: Env, email: string, extra: { subscribed?: number; tags?: string | null; name?: string | null; forms?: string[] } = {}) {
  const id = `p${++n}`;
  env.cohere.raw
    .prepare(
      `INSERT INTO people (id, email, name, subscribed, unsubscribe_token, source, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'test', ?, '2026-01-01', '2026-01-01')`,
    )
    .run(id, email, extra.name ?? null, extra.subscribed ?? 1, `tok-${id}`, extra.tags ?? null);
  for (const form of extra.forms ?? []) {
    env.cohere.raw
      .prepare(`INSERT INTO submissions (id, person_id, form_slug, data, created_at, updated_at) VALUES (?, ?, ?, '{}', 'x', 'x')`)
      .run(`s${++n}`, id, form);
  }
  return id;
}

function admin(env: Env, email: string) {
  env.cohere.raw.prepare(`INSERT INTO admins (email, created_at) VALUES (?, 'x')`).run(email);
}

function req(method: string, path: string, body?: unknown) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeSender() {
  const sent: ResendSend[] = [];
  const send = vi.fn(async (_env: unknown, msg: ResendSend) => {
    sent.push(msg);
    return { id: `re_${sent.length}` };
  });
  return { sent, send };
}

async function call(env: Env, method: string, path: string, body?: unknown, session = ADMIN, deps = {}) {
  const r = req(method, path, body);
  const res = await handleNewsletterAdmin(r, env, new URL(r.url), session, { now: () => T0, ...deps });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary per route
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

function audienceIds(env: Env, audience: unknown) {
  const where = audienceWhere(parseAudience(audience)!);
  return env.cohere.raw
    .prepare(`SELECT p.email FROM people p WHERE ${where.sql} ORDER BY p.email`)
    .all(...where.params)
    .map((r: Record<string, unknown>) => r.email);
}

// -------------------------------------------------------------- audience

describe("audience selection", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
    person(env, "a@x.org", { forms: ["register-2026"] });
    person(env, "b@x.org", { forms: ["register-2025"], tags: "cohere-2024, Volunteer" });
    person(env, "c@x.org", { forms: ["register-2026"], subscribed: 0 });
    person(env, "d@x.org", { forms: ["register-2026"], tags: "beehiiv,undeliverable" });
    person(env, "e@x.org", { tags: "Undeliverable" });
    person(env, "f@x.org", { tags: "volunteer,cohere-2024x" });
  });

  it("everyone = subscribed and not undeliverable", () => {
    expect(audienceIds(env, { kind: "all" })).toEqual(["a@x.org", "b@x.org", "f@x.org"]);
  });
  it("registrants of a form, same exclusions", () => {
    expect(audienceIds(env, { kind: "form", form: "register-2026" })).toEqual(["a@x.org"]);
    expect(audienceIds(env, { kind: "form", form: "register-2025" })).toEqual(["b@x.org"]);
  });
  it("a tag matches whole tags, case-insensitively, tolerant of spaces", () => {
    expect(audienceIds(env, { kind: "tag", tag: "cohere-2024" })).toEqual(["b@x.org"]);
    expect(audienceIds(env, { kind: "tag", tag: "VOLUNTEER" })).toEqual(["b@x.org", "f@x.org"]);
  });
  it("refuses malformed audiences and the undeliverable tag itself", () => {
    expect(parseAudience({ kind: "form", form: "x'; DROP TABLE people;--" })).toBeNull();
    expect(parseAudience({ kind: "tag", tag: "a,b" })).toBeNull();
    expect(parseAudience({ kind: "tag", tag: "undeliverable" })).toBeNull();
    expect(parseAudience({ kind: "nope" })).toBeNull();
    expect(parseAudience("not json")).toBeNull();
  });
  it("the count endpoint agrees", async () => {
    const r = await call(env, "POST", "/api/admin/newsletters/count", { audience: { kind: "all" } });
    expect(r.body.count).toBe(3);
  });
});

// ------------------------------------------------------------- segments

describe("segment audiences", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
    person(env, "old@x.org", { forms: ["register-2025"], name: "Old Timer" });
    person(env, "both@x.org", { forms: ["register-2025", "register-2026"] });
    person(env, "new@x.org", { forms: ["register-2026"], tags: "Volunteer" });
    person(env, "vol@x.org", { tags: "volunteer, host" });
    person(env, "bounced@x.org", { forms: ["register-2025"], tags: "undeliverable" });
    person(env, "gone@x.org", { forms: ["register-2025"], subscribed: 0 });
    person(env, "plain@x.org");
  });
  const seg = (include: unknown[], exclude: unknown[] = []) => ({ kind: "segment", include, exclude });

  it("came before, not registered for 2026", () => {
    expect(audienceIds(env, seg([{ form: "register-2025" }], [{ form: "register-2026" }]))).toEqual(["old@x.org"]);
  });
  it("include is any-of", () => {
    expect(audienceIds(env, seg([{ form: "register-2026" }, { tag: "host" }]))).toEqual(["both@x.org", "new@x.org", "vol@x.org"]);
  });
  it("exclude is none-of, tags and forms mixed", () => {
    expect(audienceIds(env, seg([{ form: "register-2026" }, { tag: "host" }], [{ tag: "VOLUNTEER" }]))).toEqual(["both@x.org"]);
  });
  it("empty include means everyone subscribed and deliverable", () => {
    expect(audienceIds(env, seg([]))).toEqual(["both@x.org", "new@x.org", "old@x.org", "plain@x.org", "vol@x.org"]);
    expect(audienceIds(env, seg([], [{ form: "register-2026" }]))).toEqual(["old@x.org", "plain@x.org", "vol@x.org"]);
  });
  it("undeliverable and unsubscribed are never included", () => {
    const all = audienceIds(env, seg([{ form: "register-2025" }]));
    expect(all).not.toContain("bounced@x.org");
    expect(all).not.toContain("gone@x.org");
  });
  it("numbers parameters from `first` and never inlines values", () => {
    const where = audienceWhere(parseAudience(seg([{ form: "register-2025" }, { tag: "a b" }], [{ form: "register-2026" }]))!, 3);
    expect(where.params).toEqual(["register-2025", "a b", "register-2026"]);
    expect(where.sql).toContain("?3");
    expect(where.sql).toContain("?5");
    expect(where.sql).not.toContain("register-2025");
  });
  it("is safe against injection in tags and forms", () => {
    expect(parseAudience(seg([{ form: "x'; DROP TABLE people;--" }]))).toBeNull();
    const evil = parseAudience(seg([{ tag: "x') OR 1=1 --" }]))!;
    expect(audienceIds(env, evil)).toEqual([]);
    expect(env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM people").all()[0].n).toBe(7);
  });
  it("rejects malformed segments", () => {
    expect(parseAudience(seg([{ tag: "undeliverable" }]))).toBeNull();
    expect(parseAudience(seg([{ tag: "a,b" }]))).toBeNull();
    expect(parseAudience(seg([{ form: "f", tag: "t" }]))).toBeNull();
    expect(parseAudience(seg([{}]))).toBeNull();
    expect(parseAudience({ kind: "segment", include: "x", exclude: [] })).toBeNull();
    expect(parseAudience(seg(Array.from({ length: 21 }, (_, i) => ({ tag: `t${i}` }))))).toBeNull();
  });
  it("missing include/exclude default to empty; duplicates collapse", () => {
    expect(parseAudience({ kind: "segment" })).toEqual({ kind: "segment", include: [], exclude: [] });
    expect(parseAudience(seg([{ tag: "Host" }, { tag: "host" }]))).toEqual(seg([{ tag: "host" }]));
  });
  it("old stored audiences still parse and select the same people", () => {
    expect(parseAudience('{"kind":"all"}')).toEqual({ kind: "all" });
    expect(parseAudience('{"kind":"form","form":"register-2026"}')).toEqual({ kind: "form", form: "register-2026" });
    expect(audienceIds(env, '{"kind":"tag","tag":"host"}')).toEqual(["vol@x.org"]);
  });
  it("the count endpoint counts segments", async () => {
    const r = await call(env, "POST", "/api/admin/newsletters/count", {
      audience: seg([{ form: "register-2025" }], [{ form: "register-2026" }]),
    });
    expect(r.body.count).toBe(1);
  });
  it("a draft stores a segment and a cron send snapshots it", async () => {
    const r = await call(env, "POST", "/api/admin/newsletters", {
      subject: "Register", text: "Hi", audience: seg([{ form: "register-2025" }], [{ form: "register-2026" }]),
    });
    expect(r.body.newsletter.audience.kind).toBe("segment");
  });
});

describe("recipient preview + csv", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
    for (let i = 0; i < 25; i++) person(env, `user${String(i).padStart(2, "0")}@example.org`, { name: i === 0 ? 'Ann, "A"' : `User ${i}` });
    person(env, "off@example.org", { subscribed: 0 });
  });
  it("masks addresses", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });
  it("lists the first 20 with the full count, masked", async () => {
    const r = await call(env, "POST", "/api/admin/newsletters/recipients", { audience: { kind: "all" } });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(25);
    expect(r.body.recipients).toHaveLength(20);
    expect(r.body.recipients[0]).toEqual({ name: 'Ann, "A"', email: "u***@example.org" });
    expect(JSON.stringify(r.body)).not.toContain("user00@");
  });
  it("400s on a bad audience", async () => {
    expect((await call(env, "POST", "/api/admin/newsletters/recipients", { audience: { kind: "x" } })).status).toBe(400);
  });
  it("csv carries every recipient with full email, escaped, as an attachment", async () => {
    const audience = encodeURIComponent(JSON.stringify({ kind: "all" }));
    const r = req("GET", `/api/admin/newsletters/recipients.csv?audience=${audience}`);
    const res = await handleNewsletterAdmin(r, env, new URL(r.url), ADMIN, { now: () => T0 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toBe("name,email");
    expect(lines).toHaveLength(26);
    expect(lines[1]).toBe('"Ann, ""A""",user00@example.org');
    expect(lines.join("\n")).not.toContain("off@example.org");
  });
  it("csv neutralizes spreadsheet formulas", async () => {
    person(env, "f@example.org", { name: "=HYPERLINK(1)" });
    const audience = encodeURIComponent(JSON.stringify({ kind: "all" }));
    const r = req("GET", `/api/admin/newsletters/recipients.csv?audience=${audience}`);
    const res = await handleNewsletterAdmin(r, env, new URL(r.url), ADMIN, { now: () => T0 });
    expect(await res.text()).toContain("'=HYPERLINK(1)");
  });
});

describe("bulk tags", () => {
  let env: Env;
  let a: string, b: string, c: string;
  beforeEach(() => {
    env = makeEnv();
    a = person(env, "a@x.org", { tags: "Volunteer" });
    b = person(env, "b@x.org", { tags: null });
    c = person(env, "c@x.org", { tags: "host,undeliverable" });
  });
  const tagsOf = (id: string) => env.cohere.raw.prepare("SELECT tags FROM people WHERE id = ?").all(id)[0].tags;

  it("adds normalized tags via mergeTags, keeping existing spelling", async () => {
    const r = await bulkTags(env, { ids: [a, b], add: ["Volunteer", "Came Before!"] });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(2);
    expect(tagsOf(a)).toBe("Volunteer,came-before");
    expect(tagsOf(b)).toBe("volunteer,came-before");
  });
  it("removes tags, leaving null when empty", async () => {
    await bulkTags(env, { ids: [a, c], remove: ["VOLUNTEER", "host"] });
    expect(tagsOf(a)).toBeNull();
    expect(tagsOf(c)).toBe("undeliverable");
  });
  it("will not remove undeliverable", async () => {
    const r = await bulkTags(env, { ids: [c], remove: ["undeliverable"] });
    expect(r.status).toBe(400);
    expect(tagsOf(c)).toBe("host,undeliverable");
  });
  it("validates input", async () => {
    expect((await bulkTags(env, { ids: [], add: ["x"] })).status).toBe(400);
    expect((await bulkTags(env, { ids: [a] })).status).toBe(400);
    expect((await bulkTags(env, { ids: [a], add: ["!!!"] })).status).toBe(400);
    expect((await bulkTags(env, { ids: "nope", add: ["x"] })).status).toBe(400);
    expect((await bulkTags(env, { ids: Array.from({ length: 501 }, (_, i) => `i${i}`), add: ["x"] })).status).toBe(400);
  });
  it("ignores unknown ids", async () => {
    const r = await bulkTags(env, { ids: [a, "ghost"], add: ["x"] });
    expect(r.body.updated).toBe(1);
  });
  it("the tag then works as a segment", async () => {
    await bulkTags(env, { ids: [a, b], add: ["came-before"] });
    expect(audienceIds(env, { kind: "segment", include: [{ tag: "came-before" }], exclude: [{ tag: "volunteer" }] })).toEqual(["b@x.org"]);
  });
});

async function bulkTags(env: Env, body: unknown) {
  const res = await bulkTagsHandler(env, body);
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ------------------------------------------------------------- rendering

describe("rendering", () => {
  it("escapes organizer HTML and only emits safe links and https images", () => {
    const html = renderNewsletterBody(
      [
        "Hello <script>alert(1)</script> **bold** and *it*",
        "## Heading <b>",
        "- one\n- [two](https://cohereboulder.org/a?b=1&c=2)",
        "[bad](javascript:alert(1)) and [ok](mailto:x@y.org)",
        "![photo](https://example.org/p.jpg)",
        '![x](http://insecure.org/p.jpg" onerror="alert(1))',
      ].join("\n\n"),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toMatch(/<h2[^>]*>Heading &lt;b&gt;<\/h2>/);
    expect(html).toContain('<li><a href="https://cohereboulder.org/a?b=1&amp;c=2"');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="mailto:x@y.org"');
    expect(html).toContain('<img src="https://example.org/p.jpg" alt="photo"');
    expect(html).not.toContain("onerror=\"");
  });

  it("renders --- as a rule and [[label]](url) as a button, safely", () => {
    const html = renderNewsletterBody("Before\n\n---\n\n[[Register now]](https://cohereboulder.org/register?a=1&b=2)\n\n[[Bad]](javascript:alert(1))\n\n[[<b>x</b>]](https://x.org)");
    expect(html).toContain("<hr");
    expect(html).toMatch(/<a href="https:\/\/cohereboulder.org\/register\?a=1&amp;b=2"[^>]*>Register now<\/a>/);
    expect(html).toContain("background:#36558F");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
  it("--- inside a paragraph stays text; lists and headings unchanged", () => {
    expect(renderNewsletterBody("a\n---\nb")).not.toContain("<hr");
    expect(renderNewsletterBody("- a\n- b")).toContain("<ul");
  });
  it("POST /preview renders unsaved text with the server renderer", async () => {
    const env = makeEnv();
    const r = await call(env, "POST", "/api/admin/newsletters/preview", { subject: "Hi", text: "**x**\n\n---" });
    expect(r.status).toBe(200);
    expect(r.body.html).toContain("<strong>x</strong>");
    expect(r.body.html).toContain("<hr");
    expect(r.body.html).toContain("/unsubscribe?token=preview");
  });

  it("log lines never carry an address", () => {
    expect(redactEmails('resend 422: "Ana@Example.org" is invalid')).toBe('resend 422: "<email>" is invalid');
  });

  it("each message carries the person's unsubscribe link and one-click headers", () => {
    const msg = newsletterMessage({ subject: "Hi <you>", html: "<p>x</p>", text: "x" }, `${BASE}/unsubscribe?token=abc`);
    expect(msg.html).toContain(`href="${BASE}/unsubscribe?token=abc"`);
    expect(msg.html).toContain("Hi &lt;you&gt;");
    expect(msg.text).toContain(`Unsubscribe: ${BASE}/unsubscribe?token=abc`);
    expect(msg.headers).toEqual({
      "List-Unsubscribe": `<${BASE}/unsubscribe?token=abc>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

// ----------------------------------------------------------- safeguards

describe("draft → test → confirm → scheduled", () => {
  let env: Env;
  let mail: ReturnType<typeof makeSender>;
  beforeEach(() => {
    env = makeEnv();
    mail = makeSender();
    admin(env, ADMIN.email);
    admin(env, OTHER.email);
    person(env, "a@x.org");
    person(env, "b@x.org");
    person(env, "c@x.org", { tags: "undeliverable" });
  });

  async function draft() {
    const r = await call(env, "POST", "/api/admin/newsletters", { subject: "October", text: "Hello all", audience: { kind: "all" } });
    expect(r.status).toBe(200);
    return r.body.newsletter.id as string;
  }

  it("send is locked until a test of this exact version; an edit re-locks it", async () => {
    const id = await draft();
    let r = await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: 2 }, ADMIN, { send: mail.send });
    expect(r.status).toBe(409);
    expect(r.body.locked).toBe(true);

    r = await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: mail.send });
    expect(r.status).toBe(200);
    expect(r.body.newsletter.send_unlocked).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(ADMIN.email);
    expect(mail.sent[0].message.subject).toBe("[TEST] October");
    const row = env.cohere.raw.prepare(`SELECT test_sent_hash, test_sent_to FROM newsletters`).all()[0];
    expect(row.test_sent_hash).toBe(await contentHash("October", "Hello all"));
    expect(row.test_sent_to).toBe(ADMIN.email);

    r = await call(env, "PUT", `/api/admin/newsletters/${id}`, { subject: "October", text: "Hello all!" });
    expect(r.body.newsletter.send_unlocked).toBe(false);
    expect(r.body.newsletter.tested).toBe(false);
    r = await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: 2 }, ADMIN, { send: mail.send });
    expect(r.status).toBe(409);

    // Editing back to the tested text unlocks again: the lock is the content.
    r = await call(env, "PUT", `/api/admin/newsletters/${id}`, { subject: "October", text: "Hello all" });
    expect(r.body.newsletter.send_unlocked).toBe(true);
  });

  it("another admin's test doesn't unlock it for you", async () => {
    const id = await draft();
    await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: mail.send });
    const r = await call(env, "GET", `/api/admin/newsletters/${id}`, undefined, OTHER);
    expect(r.body.newsletter.send_unlocked).toBe(false);
    expect(r.body.newsletter.lock_reason).toContain(ADMIN.email);
  });

  it("a failed test send leaves it locked", async () => {
    const id = await draft();
    const failing = vi.fn(async () => {
      throw new ResendError("resend 500", 500);
    });
    const r = await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: failing });
    expect(r.status).toBe(502);
    expect((await call(env, "GET", `/api/admin/newsletters/${id}`)).body.newsletter.send_unlocked).toBe(false);
  });

  it("the typed number must equal the live count; then it schedules and tells every admin", async () => {
    const id = await draft();
    await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: mail.send });
    let r = await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: 3 }, ADMIN, { send: mail.send });
    expect(r.status).toBe(400);
    expect(r.body.count).toBe(2);
    r = await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: "abc" }, ADMIN, { send: mail.send });
    expect(r.status).toBe(400);

    r = await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: "2" }, ADMIN, { send: mail.send });
    expect(r.status).toBe(200);
    expect(r.body.newsletter.status).toBe("scheduled");
    expect(r.body.newsletter.scheduled_for).toBe(new Date(T0.getTime() + HOLD_MINUTES * 60_000).toISOString());
    expect(r.body.newsletter.confirmed_by).toBe(ADMIN.email);
    expect(r.body.newsletter.recipient_count_confirmed).toBe(2);
    expect(r.body.newsletter).not.toHaveProperty("cancel_token");
    expect(r.body.notified).toBe(2);
    const notices = mail.sent.slice(1);
    expect(notices.map((m) => m.to).sort()).toEqual([ADMIN.email, OTHER.email]);
    const link = notices[0].message.text.match(/\/newsletter\/cancel\?token=([a-f0-9]{64})/);
    expect(link).toBeTruthy();
    // Stored hashed, never raw.
    const stored = env.cohere.raw.prepare(`SELECT cancel_token FROM newsletters`).all()[0].cancel_token;
    expect(stored).toBe(await sha256Hex(link![1]));
    expect(stored).not.toBe(link![1]);

    r = await call(env, "PUT", `/api/admin/newsletters/${id}`, { subject: "x", text: "y" });
    expect(r.status).toBe(409);
  });

  it("the emailed cancel link: GET is harmless, POST cancels, works once", async () => {
    const id = await draft();
    await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: mail.send });
    await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: 2 }, ADMIN, { send: mail.send });
    const token = mail.sent[1].message.text.match(/token=([a-f0-9]{64})/)![1];
    const url = new URL(`${BASE}/newsletter/cancel?token=${token}`);

    let res = await handleNewsletterCancelLink(new Request(url, { method: "GET" }), env, url);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("<script");
    expect(env.cohere.raw.prepare(`SELECT status FROM newsletters`).all()[0].status).toBe("scheduled");

    res = await handleNewsletterCancelLink(new Request(url, { method: "POST" }), env, url);
    expect(res.status).toBe(200);
    const row = env.cohere.raw.prepare(`SELECT status, cancelled_by FROM newsletters`).all()[0];
    expect(row).toEqual({ status: "cancelled", cancelled_by: "email-link" });

    res = await handleNewsletterCancelLink(new Request(url, { method: "POST" }), env, url);
    expect(res.status).toBe(404);
    const bogus = new URL(`${BASE}/newsletter/cancel?token=${"0".repeat(64)}`);
    expect((await handleNewsletterCancelLink(new Request(bogus), env, bogus)).status).toBe(404);

    // Cron after cancel sends nothing.
    const after = await runNewsletterCron(env, new Date(T0.getTime() + 20 * 60_000), { send: mail.send, sleep: async () => {} });
    expect(after.sent).toBe(0);

    // Reopen → a draft that needs a fresh test.
    const reopened = await call(env, "POST", `/api/admin/newsletters/${id}/reopen`);
    expect(reopened.body.newsletter.status).toBe("draft");
    expect(reopened.body.newsletter.send_unlocked).toBe(false);
  });

  it("an admin can cancel from the tab", async () => {
    const id = await draft();
    await call(env, "POST", `/api/admin/newsletters/${id}/test`, {}, ADMIN, { send: mail.send });
    await call(env, "POST", `/api/admin/newsletters/${id}/send`, { confirm_count: 2 }, ADMIN, { send: mail.send });
    const r = await call(env, "POST", `/api/admin/newsletters/${id}/cancel`, {}, OTHER);
    expect(r.body.newsletter.status).toBe("cancelled");
    expect(r.body.newsletter.cancelled_by).toBe(OTHER.email);
    expect((await call(env, "POST", `/api/admin/newsletters/${id}/cancel`, {}, OTHER)).status).toBe(409);
  });
});

// ----------------------------------------------------------------- cron

describe("runNewsletterCron", () => {
  let env: Env;
  let mail: ReturnType<typeof makeSender>;
  const sleep = async () => {};

  function scheduled(id: string, count: number, at = T0, audience: unknown = { kind: "all" }) {
    env.cohere.raw
      .prepare(
        `INSERT INTO newsletters (id, subject, html, text, audience, status, created_by, scheduled_for,
           recipient_count_confirmed, confirmed_by, created_at, updated_at)
         VALUES (?, 'Subj', '<p>Body</p>', 'Body', ?, 'scheduled', 'ana@cohere.test', ?, ?, 'ana@cohere.test', 'x', 'x')`,
      )
      .run(id, JSON.stringify(audience), at.toISOString(), count);
  }
  function sends(id: string) {
    return env.cohere.raw.prepare(`SELECT person_id, status, resend_id, attempts FROM newsletter_sends WHERE newsletter_id = ? ORDER BY person_id`).all(id);
  }

  beforeEach(() => {
    env = makeEnv();
    mail = makeSender();
    for (let i = 0; i < 5; i++) person(env, `r${i}@x.org`);
    person(env, "gone@x.org", { subscribed: 0 });
    person(env, "bounce@x.org", { tags: "undeliverable" });
  });

  it("waits for the hold, then sends each recipient exactly once with idempotency keys", async () => {
    scheduled("nl1", 5, T0);
    let r = await runNewsletterCron(env, new Date(T0.getTime() - 60_000), { send: mail.send, sleep });
    expect(r.started).toBe(0);
    expect(mail.sent).toHaveLength(0);

    r = await runNewsletterCron(env, T0, { send: mail.send, sleep, limit: 3 });
    expect(r).toMatchObject({ started: 1, sent: 3, completed: 0 });
    r = await runNewsletterCron(env, T0, { send: mail.send, sleep, limit: 3 });
    expect(r).toMatchObject({ sent: 2, completed: 1 });
    r = await runNewsletterCron(env, T0, { send: mail.send, sleep });
    expect(r.sent).toBe(0);

    expect(mail.sent).toHaveLength(5);
    expect(new Set(mail.sent.map((m) => m.to)).size).toBe(5);
    expect(mail.sent.map((m) => m.to)).not.toContain("gone@x.org");
    expect(mail.sent.map((m) => m.to)).not.toContain("bounce@x.org");
    for (const m of mail.sent) {
      expect(m.idempotencyKey).toMatch(/^newsletter:nl1:p\d+$/);
      expect(m.message.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(m.message.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/cohereboulder\.org\/unsubscribe\?token=tok-p\d+>$/);
    }
    expect(sends("nl1").every((s: Record<string, unknown>) => s.status === "sent" && String(s.resend_id).startsWith("re_"))).toBe(true);
    const nl = env.cohere.raw.prepare(`SELECT status, sent_at FROM newsletters`).all()[0];
    expect(nl.status).toBe("sent");
    expect(nl.sent_at).toBe(T0.toISOString());
  });

  it("the (newsletter, person) unique row is the double-send guard", async () => {
    scheduled("nl1", 5);
    await runNewsletterCron(env, T0, { send: mail.send, sleep });
    // Force it back to sending as a buggy/duplicate run might; nobody is re-sent.
    env.cohere.raw.prepare(`UPDATE newsletters SET status = 'scheduled'`).run();
    const r = await runNewsletterCron(env, T0, { send: mail.send, sleep });
    expect(r.sent).toBe(0);
    expect(mail.sent).toHaveLength(5);
    expect(() =>
      env.cohere.raw
        .prepare(`INSERT INTO newsletter_sends (newsletter_id, person_id, email, created_at, updated_at) VALUES ('nl1', ?, 'x', 'x', 'x')`)
        .run(String(sends("nl1")[0].person_id)),
    ).toThrow(/UNIQUE/);
  });

  it("a crash mid-send resumes without resending what went out", async () => {
    scheduled("nl1", 5);
    let calls = 0;
    const crashing = vi.fn(async (e: unknown, m: ResendSend) => {
      if (++calls === 3) throw new Error("worker killed");
      return mail.send(e, m);
    });
    // Simulate an orphaned claim: a row left 'sending' by a dead invocation.
    await runNewsletterCron(env, T0, { send: crashing, sleep });
    env.cohere.raw.prepare(`UPDATE newsletter_sends SET status = 'sending', updated_at = ? WHERE status = 'queued'`).run(T0.toISOString());
    // Not stale yet: left alone.
    let r = await runNewsletterCron(env, new Date(T0.getTime() + 60_000), { send: mail.send, sleep });
    expect(r.sent).toBe(0);
    // Stale: requeued and sent once.
    r = await runNewsletterCron(env, new Date(T0.getTime() + 11 * 60_000), { send: mail.send, sleep });
    expect(r.sent).toBe(1);
    expect(r.completed).toBe(1);
    expect(mail.sent).toHaveLength(5);
    expect(new Set(mail.sent.map((m) => m.to)).size).toBe(5);
  });

  it("someone who unsubscribes during sending is skipped", async () => {
    scheduled("nl1", 5);
    await runNewsletterCron(env, T0, { send: mail.send, sleep, limit: 2 });
    env.cohere.raw.prepare(`UPDATE people SET subscribed = 0 WHERE email = 'r4@x.org'`).run();
    const r = await runNewsletterCron(env, T0, { send: mail.send, sleep });
    expect(r.skipped).toBe(1);
    expect(mail.sent.map((m) => m.to)).not.toContain("r4@x.org");
  });

  it("a permanent failure is logged; a transient one is retried", async () => {
    scheduled("nl1", 5);
    const flaky = vi.fn(async (e: unknown, m: ResendSend) => {
      if (m.to === "r0@x.org") throw new ResendError("resend 422: invalid", 422);
      if (m.to === "r1@x.org" && flaky.mock.calls.filter((c) => (c[1] as ResendSend).to === "r1@x.org").length === 1) {
        throw new ResendError("resend 500", 500);
      }
      return mail.send(e, m);
    });
    let r = await runNewsletterCron(env, T0, { send: flaky, sleep });
    expect(r).toMatchObject({ failed: 1, retried: 1, sent: 3, completed: 0 });
    r = await runNewsletterCron(env, T0, { send: flaky, sleep });
    expect(r).toMatchObject({ sent: 1, completed: 1 });
    const failed = sends("nl1").filter((s: Record<string, unknown>) => s.status === "failed");
    expect(failed).toHaveLength(1);
  });

  it("aborts if the audience grew well past the confirmed number during the hold", async () => {
    scheduled("nl1", 1);
    for (let i = 0; i < 20; i++) person(env, `late${i}@x.org`);
    const r = await runNewsletterCron(env, T0, { send: mail.send, sleep });
    expect(r.aborted).toBe(1);
    expect(mail.sent).toHaveLength(0);
    expect(env.cohere.raw.prepare(`SELECT status, cancelled_by FROM newsletters`).all()[0].status).toBe("cancelled");
  });

  it("cancelling mid-send stops the rest and keeps the sent log", async () => {
    scheduled("nl1", 5);
    await runNewsletterCron(env, T0, { send: mail.send, sleep, limit: 2 });
    expect(await cancelNewsletter(env, "nl1", "ana@cohere.test", T0)).toBe(true);
    await runNewsletterCron(env, T0, { send: mail.send, sleep });
    expect(mail.sent).toHaveLength(2);
    expect(sends("nl1").map((s: Record<string, unknown>) => s.status)).toEqual(["sent", "sent"]);
  });
});

// --------------------------------------------------------- Beehiiv import

const HEADER =
  "subscriber_id,api_subscription_id,email,tags,status,created_at,updated_at,unsubscribed_at,stripe_customer_id,referred_by,campaign,channel,acquisition_source,referring_url,acquisition_term,acquisition_content,device_type,total_revenue_cents,referral_count,total_sent,total_delivered,total_unique_opened,total_clicked,total_unique_clicked,open_rate,click_rate,last_opened_at,last_clicked_at,Free Tier,Name";
function bRow(email: string, status: string, tags = "", unsub = "", name = "") {
  const cells = Array(30).fill("");
  cells[0] = "sub_1";
  cells[2] = email;
  cells[3] = tags;
  cells[4] = status;
  cells[7] = unsub;
  cells[29] = name;
  return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

describe("Beehiiv import", () => {
  it("parses quoted CSV with embedded commas, quotes and newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nthere"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"\nthere'],
    ]);
  });

  it("reads Beehiiv rows: tags, status, unsubscribed_at, Name, invalid and duplicate rows", () => {
    const csv = [
      HEADER,
      bRow("New@X.org", "active", '["cohere-2024", "Volunteers"]', "", "New Person"),
      bRow("gone@x.org", "inactive", "", "2026-03-01"),
      bRow("not-an-email", "active"),
      bRow("new@x.org", "active", "extra"),
    ].join("\n");
    const r = readBeehiivCsv(csv);
    if (typeof r === "string") throw new Error(r);
    expect(r).toMatchObject({ rows: 4, invalid: 1, duplicates: 1 });
    expect(r.records[0]).toEqual({
      email: "new@x.org",
      name: "New Person",
      tags: ["beehiiv", "cohere-2024", "volunteers", "extra"],
      unsubscribed: false,
      active: true,
    });
    expect(r.records[1]).toMatchObject({ email: "gone@x.org", unsubscribed: true, active: false });
    expect(readBeehiivCsv("foo,bar\n1,2")).toMatch(/no email column/);
  });

  it("merge rules: unsubscribe wins both ways, tags merge, names fill blanks only", () => {
    const existing = new Map([
      ["site-unsub@x.org", { id: "1", name: null, tags: null, subscribed: 0 }],
      ["both@x.org", { id: "2", name: "Kept Name", tags: "volunteer", subscribed: 1 }],
      ["bh-unsub@x.org", { id: "3", name: null, tags: null, subscribed: 1 }],
      ["done@x.org", { id: "4", name: "D", tags: "beehiiv", subscribed: 1 }],
    ]);
    const plan = planImport(
      [
        { email: "site-unsub@x.org", name: "S", tags: ["beehiiv"], unsubscribed: false, active: true },
        { email: "both@x.org", name: "Other", tags: ["beehiiv", "cohere-2024"], unsubscribed: false, active: true },
        { email: "bh-unsub@x.org", name: null, tags: ["beehiiv"], unsubscribed: true, active: false },
        { email: "done@x.org", name: null, tags: ["beehiiv"], unsubscribed: false, active: true },
        { email: "fresh@x.org", name: "F", tags: ["beehiiv"], unsubscribed: false, active: true },
        { email: "fresh-unsub@x.org", name: null, tags: ["beehiiv"], unsubscribed: true, active: false },
      ],
      existing,
    );
    expect(plan.counts).toEqual({ new: 2, new_unsubscribed: 1, existing: 4, existing_changed: 3, would_unsubscribe: 1, unchanged: 1 });
    const by = Object.fromEntries(plan.actions.map((a) => [a.email, a]));
    expect(by["site-unsub@x.org"].subscribed).toBe(0); // never flipped back
    expect(by["both@x.org"]).toMatchObject({ name: "Kept Name", tags: "volunteer,beehiiv,cohere-2024", subscribed: 1 });
    expect(by["bh-unsub@x.org"].subscribed).toBe(0);
    expect(by["fresh@x.org"]).toMatchObject({ kind: "insert", subscribed: 1, tags: "beehiiv" });
    expect(by["fresh-unsub@x.org"]).toMatchObject({ kind: "insert", subscribed: 0 });
    expect(by["done@x.org"]).toBeUndefined();
  });

  it("mergeTags keeps existing spelling and dedupes case-insensitively", () => {
    expect(mergeTags("Volunteer, cohere-2024", ["volunteer", "beehiiv"])).toBe("Volunteer,cohere-2024,beehiiv");
  });

  it("dry run writes nothing; apply writes; re-import is a no-op", async () => {
    const env = makeEnv();
    person(env, "site-unsub@x.org", { subscribed: 0 });
    person(env, "reg@x.org", { name: "Reg", tags: "volunteer" });
    const csv = [
      HEADER,
      bRow("site-unsub@x.org", "active"),
      bRow("REG@x.org", "active", "cohere-2024", "", "Someone Else"),
      bRow("new@x.org", "active", "", "", "Nu"),
      bRow("new-unsub@x.org", "inactive", "", "2026-01-01"),
      bRow("bad", "active"),
    ].join("\n");

    let r = await call(env, "POST", "/api/admin/import/beehiiv", { csv });
    // site-unsub@ gains the beehiiv tag (but stays unsubscribed), so 4 changes.
    expect(r.body).toMatchObject({ dry_run: true, pending: 4 });
    expect(r.body.counts).toMatchObject({ rows: 5, skipped_invalid: 1, new: 2, existing: 2, would_unsubscribe: 0 });
    expect(env.cohere.raw.prepare(`SELECT COUNT(*) AS n FROM people`).all()[0].n).toBe(2);

    r = await call(env, "POST", "/api/admin/import/beehiiv", { csv, apply: true });
    expect(r.body).toMatchObject({ dry_run: false, applied: 4, pending: 0 });
    const rows = Object.fromEntries(
      env.cohere.raw.prepare(`SELECT email, name, tags, subscribed, source, unsubscribe_token FROM people`).all().map((p: Record<string, unknown>) => [p.email, p]),
    );
    expect(rows["site-unsub@x.org"]).toMatchObject({ subscribed: 0, tags: "beehiiv" });
    expect(rows["reg@x.org"]).toMatchObject({ name: "Reg", tags: "volunteer,beehiiv,cohere-2024", subscribed: 1 });
    expect(rows["new@x.org"]).toMatchObject({ name: "Nu", source: "beehiiv", tags: "beehiiv", subscribed: 1 });
    expect(rows["new-unsub@x.org"]).toMatchObject({ subscribed: 0, source: "beehiiv" });
    expect(String(rows["new@x.org"].unsubscribe_token)).toMatch(/^[0-9a-f-]{36}$/);

    r = await call(env, "POST", "/api/admin/import/beehiiv", { csv });
    expect(r.body.pending).toBe(0);
    expect(r.body.counts).toMatchObject({ new: 0, existing: 4, unchanged: 4 });
  });
});
