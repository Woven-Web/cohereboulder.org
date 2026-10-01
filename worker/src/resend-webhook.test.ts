import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// newsletter.ts → auth.ts imports the Workers-only email module.
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));

import { countAudience, handleNewsletterAdmin, runNewsletterCron, sendViaResend } from "./newsletter";
import {
  applyResendEvent,
  handleResendWebhook,
  isHardBounce,
  purgeWebhookEvents,
  verifySvixSignature,
  webhookKeyBytes,
  TIMESTAMP_TOLERANCE_SECONDS,
} from "./resend-webhook";
import { testD1, testKV } from "./test-d1";

// Throwaway test key, not a real secret: base64 of 24 fixed bytes.
const KEY_B64 = Buffer.from("cohere-test-webhook-key!").toString("base64");
const SECRET = `whsec_${KEY_B64}`;
const OTHER_SECRET = `whsec_${Buffer.from("some-other-webhook-key!!").toString("base64")}`;
const NOW = new Date("2026-10-01T16:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

function sign(secret: string, id: string, ts: number | string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

function makeEnv(secret: string | null = SECRET) {
  return {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    RESEND_WEBHOOK_SECRET: secret ?? undefined,
  } as unknown as { cohere: ReturnType<typeof testD1>; RESEND_WEBHOOK_SECRET?: string } & Parameters<typeof handleResendWebhook>[1];
}
type Env = ReturnType<typeof makeEnv>;

let seq = 0;
function person(env: Env, email: string, extra: { tags?: string | null; notes?: string | null; subscribed?: number } = {}) {
  const id = `p${++seq}`;
  env.cohere.raw
    .prepare(
      `INSERT INTO people (id, email, subscribed, unsubscribe_token, source, tags, internal_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'test', ?, ?, 'x', 'x')`,
    )
    .run(id, email, extra.subscribed ?? 1, `tok-${id}`, extra.tags ?? null, extra.notes ?? null);
  return id;
}

function newsletterWithSend(env: Env, personId: string, email: string, resendId: string, status = "sent") {
  const nl = `nl${++seq}`;
  env.cohere.raw
    .prepare(
      `INSERT INTO newsletters (id, subject, html, text, audience, status, created_by, created_at, updated_at)
       VALUES (?, 'Hello', '<p>x</p>', 'x', '{"kind":"all"}', 'sent', 'a@cohere.test', 'x', 'x')`,
    )
    .run(nl);
  env.cohere.raw
    .prepare(
      `INSERT INTO newsletter_sends (newsletter_id, person_id, email, resend_id, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'x', 'x')`,
    )
    .run(nl, personId, email, resendId, status);
  return nl;
}

function row<T = Record<string, unknown>>(env: Env, sql: string, ...params: unknown[]): T {
  return env.cohere.raw.prepare(sql).all(...params)[0] as T;
}

function event(type: string, data: Record<string, unknown>) {
  return { type, created_at: "2026-10-01T15:59:00.000Z", data: { subject: "October update", ...data } };
}

function webhookRequest(body: string, opts: { id?: string; ts?: number | string; signature?: string; secret?: string } = {}) {
  const id = opts.id ?? `msg_${++seq}`;
  const ts = opts.ts ?? NOW_S;
  const signature = opts.signature ?? `v1,${sign(opts.secret ?? SECRET, id, ts, body)}`;
  return new Request("https://cohereboulder.org/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(ts), "svix-signature": signature },
    body,
  });
}

const audienceSize = (env: Env) => countAudience(env as unknown as Parameters<typeof countAudience>[0], { kind: "all" });
const call = (env: Env, request: Request) => handleResendWebhook(request, env, { now: () => NOW });

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- verify

describe("verifySvixSignature", () => {
  const key = webhookKeyBytes(SECRET)!;
  const body = new TextEncoder().encode('{"type":"email.delivered"}');
  const good = sign(SECRET, "msg_1", NOW_S, '{"type":"email.delivered"}');
  const hdr = (signature: string, ts: number | string = NOW_S, id = "msg_1") => ({ id, timestamp: String(ts), signature });

  it("accepts a correct v1 signature", async () => {
    expect(await verifySvixSignature(key, hdr(`v1,${good}`), body, NOW_S)).toEqual({ ok: true });
  });

  it("matches the worked example in Svix's manual-verification docs", async () => {
    // https://docs.svix.com/receiving/verifying-payloads/how-manual uses this secret;
    // the expected value is computed independently with node:crypto.
    const svixSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const payload = '{"test": 2432232314}';
    const sig = sign(svixSecret, "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, payload);
    const result = await verifySvixSignature(
      webhookKeyBytes(svixSecret)!,
      { id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", signature: `v1,${sig}` },
      new TextEncoder().encode(payload),
      1614265330,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a signature made with another secret", async () => {
    const bad = sign(OTHER_SECRET, "msg_1", NOW_S, '{"type":"email.delivered"}');
    expect(await verifySvixSignature(key, hdr(`v1,${bad}`), body, NOW_S)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a tampered body and a swapped svix-id", async () => {
    const tampered = new TextEncoder().encode('{"type":"email.complained"}');
    expect((await verifySvixSignature(key, hdr(`v1,${good}`), tampered, NOW_S)).ok).toBe(false);
    expect((await verifySvixSignature(key, hdr(`v1,${good}`, NOW_S, "msg_2"), body, NOW_S)).ok).toBe(false);
  });

  it("rejects stale and future timestamps beyond five minutes, accepts just inside", async () => {
    const at = (ts: number) => verifySvixSignature(key, hdr(`v1,${sign(SECRET, "msg_1", ts, '{"type":"email.delivered"}')}`, ts), body, NOW_S);
    expect(await at(NOW_S - TIMESTAMP_TOLERANCE_SECONDS - 1)).toEqual({ ok: false, reason: "stale timestamp" });
    expect(await at(NOW_S + TIMESTAMP_TOLERANCE_SECONDS + 1)).toEqual({ ok: false, reason: "stale timestamp" });
    expect(await at(NOW_S - TIMESTAMP_TOLERANCE_SECONDS + 5)).toEqual({ ok: true });
  });

  it("accepts when any one of several space-separated signatures matches", async () => {
    const other = sign(OTHER_SECRET, "msg_1", NOW_S, '{"type":"email.delivered"}');
    expect(await verifySvixSignature(key, hdr(`v1,${other} v1,${good}`), body, NOW_S)).toEqual({ ok: true });
    expect(await verifySvixSignature(key, hdr(`v2,${good} v1,${other}`), body, NOW_S)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects missing headers, malformed timestamps and garbage entries", async () => {
    expect((await verifySvixSignature(key, { id: null, timestamp: String(NOW_S), signature: `v1,${good}` }, body, NOW_S)).ok).toBe(false);
    expect((await verifySvixSignature(key, hdr(`v1,${good}`, "soon"), body, NOW_S)).ok).toBe(false);
    expect((await verifySvixSignature(key, hdr("v1,!!!not-base64 v1 ,"), body, NOW_S)).ok).toBe(false);
  });

  it("parses whsec_ secrets and refuses malformed ones", () => {
    expect(webhookKeyBytes(SECRET)?.length).toBe(24);
    expect(webhookKeyBytes("whsec_***")).toBeNull();
    expect(webhookKeyBytes("whsec_c2hvcnQ=")).toBeNull();
  });
});

// ----------------------------------------------------------------- route

describe("POST /api/webhooks/resend", () => {
  it("answers 503 while RESEND_WEBHOOK_SECRET is unset", async () => {
    const env = makeEnv(null);
    const res = await call(env, webhookRequest('{"type":"email.delivered","data":{}}'));
    expect(res.status).toBe(503);
  });

  it("answers 401 for a bad signature and writes nothing", async () => {
    const env = makeEnv();
    const id = person(env, "x@example.org");
    const body = JSON.stringify(event("email.complained", { email_id: "re_1", to: ["x@example.org"] }));
    const res = await call(env, webhookRequest(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(401);
    expect(row(env, `SELECT subscribed FROM people WHERE id = ?`, id)).toEqual({ subscribed: 1 });
    expect(row(env, `SELECT COUNT(*) AS n FROM resend_webhook_events`)).toEqual({ n: 0 });
  });

  it("answers 401 for a replayed-later (stale) delivery", async () => {
    const env = makeEnv();
    const body = JSON.stringify(event("email.delivered", { email_id: "re_1", to: ["x@example.org"] }));
    const res = await call(env, webhookRequest(body, { ts: NOW_S - 3600 }));
    expect(res.status).toBe(401);
  });

  it("refuses GET", async () => {
    const res = await call(makeEnv(), new Request("https://cohereboulder.org/api/webhooks/resend"));
    expect(res.status).toBe(405);
  });

  it("hard bounce: tags undeliverable, notes it, marks the send bounced, drops them from audiences", async () => {
    const env = makeEnv();
    const id = person(env, "gone@example.org", { tags: "beehiiv,volunteer", notes: "Met at the 2025 opening." });
    const nl = newsletterWithSend(env, id, "gone@example.org", "re_hard");
    expect(await audienceSize(env)).toBe(1);
    const body = JSON.stringify(
      event("email.bounced", {
        email_id: "re_hard",
        to: ["gone@example.org"],
        bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 <gone@example.org>: mailbox unavailable" },
      }),
    );
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(env, webhookRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, effect: "tagged-undeliverable" });
    const p = row<{ tags: string; internal_notes: string; subscribed: number }>(env, `SELECT tags, internal_notes, subscribed FROM people WHERE id = ?`, id);
    expect(p.tags).toBe("beehiiv,volunteer,undeliverable");
    expect(p.subscribed).toBe(1);
    expect(p.internal_notes.split("\n")[0]).toBe("Met at the 2025 opening.");
    expect(p.internal_notes.split("\n")[1]).toBe(
      "2026-10-01: Resend hard bounce, tagged undeliverable (Permanent/General) on “October update” — 550 5.1.1 <<email>>: mailbox unavailable",
    );
    expect(row(env, `SELECT status, last_event FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({ status: "bounced", last_event: "bounced:Permanent" });
    expect(await audienceSize(env)).toBe(0);
    // Never an address in the logs.
    expect(JSON.stringify(log.mock.calls)).not.toContain("@");
  });

  it("transient and undetermined bounces only record; no tag, no note", async () => {
    const env = makeEnv();
    const id = person(env, "full@example.org", { tags: "beehiiv" });
    const nl = newsletterWithSend(env, id, "full@example.org", "re_soft");
    for (const type of ["Transient", "Undetermined"]) {
      const body = JSON.stringify(event("email.bounced", { email_id: "re_soft", to: ["full@example.org"], bounce: { type, subType: "MailboxFull" } }));
      vi.spyOn(console, "info").mockImplementation(() => {});
      const res = await call(env, webhookRequest(body));
      expect(await res.json()).toEqual({ ok: true, effect: "soft-bounce-recorded" });
    }
    expect(row(env, `SELECT tags, internal_notes FROM people WHERE id = ?`, id)).toEqual({ tags: "beehiiv", internal_notes: null });
    expect(row(env, `SELECT status, last_event FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({
      status: "sent",
      last_event: "bounced:Undetermined",
    });
    expect(await audienceSize(env)).toBe(1);
  });

  it("complaint: unsubscribes, notes it, marks the send complained", async () => {
    const env = makeEnv();
    const id = person(env, "spam@example.org");
    const nl = newsletterWithSend(env, id, "spam@example.org", "re_spam", "delivered");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(env, webhookRequest(JSON.stringify(event("email.complained", { email_id: "re_spam", to: ["spam@example.org"] }))));
    expect(await res.json()).toEqual({ ok: true, effect: "unsubscribed" });
    const p = row<{ subscribed: number; internal_notes: string; tags: string | null }>(env, `SELECT subscribed, internal_notes, tags FROM people WHERE id = ?`, id);
    expect(p.subscribed).toBe(0);
    expect(p.tags).toBeNull();
    expect(p.internal_notes).toBe("2026-10-01: marked a newsletter as spam (Resend complaint), unsubscribed on “October update”");
    expect(row(env, `SELECT status FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({ status: "complained" });
  });

  it("delivered: marks the send delivered; a late delivered never overrides a bounce", async () => {
    const env = makeEnv();
    const a = person(env, "a@example.org");
    const b = person(env, "b@example.org");
    const nlA = newsletterWithSend(env, a, "a@example.org", "re_a");
    const nlB = newsletterWithSend(env, b, "b@example.org", "re_b", "bounced");
    await call(env, webhookRequest(JSON.stringify(event("email.delivered", { email_id: "re_a", to: ["a@example.org"] }))));
    await call(env, webhookRequest(JSON.stringify(event("email.delivered", { email_id: "re_b", to: ["b@example.org"] }))));
    expect(row(env, `SELECT status, last_event FROM newsletter_sends WHERE newsletter_id = ?`, nlA)).toEqual({ status: "delivered", last_event: "delivered" });
    expect(row(env, `SELECT status FROM newsletter_sends WHERE newsletter_id = ?`, nlB)).toEqual({ status: "bounced" });
  });

  it("delivery_delayed only records the event", async () => {
    const env = makeEnv();
    const a = person(env, "slow@example.org");
    const nl = newsletterWithSend(env, a, "slow@example.org", "re_slow");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(env, webhookRequest(JSON.stringify(event("email.delivery_delayed", { email_id: "re_slow", to: ["slow@example.org"] }))));
    expect(await res.json()).toEqual({ ok: true, effect: "delay-recorded" });
    expect(row(env, `SELECT status, last_event FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({ status: "sent", last_event: "delivery_delayed" });
  });

  it("is idempotent: the same svix-id twice applies once", async () => {
    const env = makeEnv();
    const id = person(env, "twice@example.org", { tags: "beehiiv" });
    newsletterWithSend(env, id, "twice@example.org", "re_twice");
    const body = JSON.stringify(event("email.bounced", { email_id: "re_twice", to: ["twice@example.org"], bounce: { type: "Permanent" } }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const first = await call(env, webhookRequest(body, { id: "msg_replay" }));
    const second = await call(env, webhookRequest(body, { id: "msg_replay" }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    const p = row<{ tags: string; internal_notes: string }>(env, `SELECT tags, internal_notes FROM people WHERE id = ?`, id);
    expect(p.tags).toBe("beehiiv,undeliverable");
    expect(p.internal_notes.split("\n")).toHaveLength(1);
    expect(row(env, `SELECT COUNT(*) AS n FROM resend_webhook_events`)).toEqual({ n: 1 });
  });

  it("concurrent replays commit exactly one note/effect", async () => {
    const env = makeEnv();
    const id = person(env, "race@example.org");
    newsletterWithSend(env, id, "race@example.org", "re_race");
    const body = JSON.stringify(event("email.complained", { email_id: "re_race", to: ["race@example.org"] }));
    const responses = await Promise.all(Array.from({ length: 5 }, () => call(env, webhookRequest(body, { id: "msg_concurrent" }))));
    const data = await Promise.all(responses.map((r) => r.json()));
    expect(data.filter((d) => d.duplicate)).toHaveLength(4);
    expect(row<{ internal_notes: string }>(env, `SELECT internal_notes FROM people WHERE id = ?`, id).internal_notes.split("\n")).toHaveLength(1);
  });

  it.each(["email.delivered", "email.bounced", "email.complained"])("reconciles %s before the send response attaches resend_id", async (type) => {
    const env = makeEnv();
    const id = person(env, "early@example.org");
    const nl = newsletterWithSend(env, id, "early@example.org", "", "queued");
    env.cohere.raw.prepare(`UPDATE newsletters SET status = 'sending' WHERE id = ?`).run(nl);
    const send = async () => {
      const response = await call(env, webhookRequest(JSON.stringify(event(type, {
        email_id: "re_early", to: ["early@example.org"], bounce: { type: "Permanent" },
      }))));
      expect(response.status).toBe(200);
      return { id: "re_early" };
    };
    await runNewsletterCron(env as unknown as Parameters<typeof runNewsletterCron>[0], NOW, { send, sleep: async () => {} });
    expect(row(env, `SELECT status FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({ status: type.slice(6) });
    // Sent total still counts delivery terminal states; deletion stays blocked.
    env.cohere.raw.prepare(`UPDATE newsletters SET status = 'cancelled' WHERE id = ?`).run(nl);
    const request = new Request(`https://cohereboulder.org/api/admin/newsletters/${nl}`, { method: "DELETE" });
    const response = await handleNewsletterAdmin(request, env as unknown as Parameters<typeof handleNewsletterAdmin>[1], new URL(request.url), {
      email: "a@cohere.test", name: "A", createdAt: "x",
    });
    expect(response.status).toBe(409);
  });

  it.each(["email.delivered", "email.bounced", "email.complained"])("preserves %s when Resend accepts but the HTTP acknowledgment is lost", async (type) => {
    const env = makeEnv();
    const id = person(env, "lost-ack@example.org");
    const nl = newsletterWithSend(env, id, "lost-ack@example.org", "", "queued");
    env.cohere.raw.prepare(`UPDATE newsletter_sends SET resend_id = NULL WHERE newsletter_id = ?`).run(nl);
    env.cohere.raw.prepare(`UPDATE newsletters SET status = 'sending' WHERE id = ?`).run(nl);
    const send = vi.fn(async () => {
      const res = await call(env, webhookRequest(JSON.stringify(event(type, {
        email_id: "re_lost", to: ["lost-ack@example.org"], bounce: { type: "Permanent" },
        tags: { newsletter_id: nl, person_id: id },
      }))));
      expect(res.status).toBe(200);
      throw new Error("provider accepted, response lost");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cronEnv = env as unknown as Parameters<typeof runNewsletterCron>[0];
    await runNewsletterCron(cronEnv, NOW, { send, sleep: async () => {} });
    await runNewsletterCron(cronEnv, new Date(NOW.getTime() + 60000), { send, sleep: async () => {} });
    expect(send).toHaveBeenCalledTimes(1);
    expect(row(env, `SELECT status, resend_id, last_event FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({
      status: type.slice(6), resend_id: "re_lost", last_event: type === "email.bounced" ? "bounced:Permanent" : type.slice(6),
    });
  });

  it("sends correlation tags to the mock fetch only, without making real calls", async () => {
    const env = { RESEND_API_KEY: "mock-key", RESEND_API_BASE: "http://127.0.0.1:9960" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"re_tagged"}'));
    await sendViaResend(env as unknown as Parameters<typeof sendViaResend>[0], {
      to: "x@example.org", message: { subject: "x", text: "x", html: "x", headers: {} },
      tags: { newsletter_id: "nl_123", person_id: "p_456" }, idempotencyKey: "newsletter:nl_123:p_456",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:9960/emails");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tags).toEqual([{ name: "newsletter_id", value: "nl_123" }, { name: "person_id", value: "p_456" }]);
  });

  it("a second hard bounce under a new svix-id doesn't duplicate the tag", async () => {
    const env = makeEnv();
    const id = person(env, "again@example.org", { tags: "Undeliverable" });
    vi.spyOn(console, "info").mockImplementation(() => {});
    await call(env, webhookRequest(JSON.stringify(event("email.bounced", { email_id: "re_x", to: ["again@example.org"], bounce: { type: "Permanent" } }))));
    expect(row(env, `SELECT tags FROM people WHERE id = ?`, id)).toEqual({ tags: "Undeliverable" });
  });

  it("falls back to data.to when there is no send row (test sends, admin notices)", async () => {
    const env = makeEnv();
    const id = person(env, "admin@example.org");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await call(
      env,
      webhookRequest(JSON.stringify(event("email.bounced", { email_id: "re_none", to: ["Admin <ADMIN@example.org>"], bounce: { type: "Permanent" } }))),
    );
    expect(await res.json()).toEqual({ ok: true, effect: "tagged-undeliverable" });
    expect(row(env, `SELECT tags FROM people WHERE id = ?`, id)).toEqual({ tags: "undeliverable" });
  });

  it("an unknown recipient is acknowledged and changes nothing", async () => {
    const env = makeEnv();
    const id = person(env, "known@example.org");
    vi.spyOn(console, "info").mockImplementation(() => {});
    for (const type of ["email.bounced", "email.complained"]) {
      const res = await call(
        env,
        webhookRequest(JSON.stringify(event(type, { email_id: "re_ghost", to: ["stranger@example.org"], bounce: { type: "Permanent" } }))),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, effect: "unknown-recipient" });
    }
    expect(row(env, `SELECT tags, subscribed, internal_notes FROM people WHERE id = ?`, id)).toEqual({ tags: null, subscribed: 1, internal_notes: null });
  });

  it("ignores event types it doesn't handle, and rejects a signed non-event body", async () => {
    const env = makeEnv();
    const ok = await call(env, webhookRequest(JSON.stringify(event("email.opened", { email_id: "re_1" }))));
    expect(await ok.json()).toEqual({ ok: true, effect: "ignored" });
    const bad = await call(env, webhookRequest("[1,2,3]"));
    expect(bad.status).toBe(400);
  });

  it("rolls back the claim AND all effects on failure, so Svix retries", async () => {
    const env = makeEnv();
    const pid = person(env, "x@example.org");
    const nl = newsletterWithSend(env, pid, "x@example.org", "re_1");
    const body = JSON.stringify(event("email.complained", { email_id: "re_1", to: ["x@example.org"] }));
    // Abort after the ledger insert/send update: the whole D1 batch must roll back.
    env.cohere.raw.exec(`CREATE TRIGGER fail_webhook BEFORE UPDATE ON people
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await call(env, webhookRequest(body, { id: "msg_retry" }));
    expect(first.status).toBe(500);
    expect(JSON.stringify(err.mock.calls)).not.toContain("x@example.org");
    expect(row(env, `SELECT COUNT(*) AS n FROM resend_webhook_events`)).toEqual({ n: 0 });
    expect(row(env, `SELECT status FROM newsletter_sends WHERE newsletter_id = ?`, nl)).toEqual({ status: "sent" });
    env.cohere.raw.exec(`DROP TRIGGER fail_webhook`);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const retry = await call(env, webhookRequest(body, { id: "msg_retry" }));
    expect(await retry.json()).toEqual({ ok: true, effect: "unsubscribed" });
  });
});

describe("helpers", () => {
  it("isHardBounce is strictly Permanent", () => {
    expect(isHardBounce({ type: "email.bounced", data: { bounce: { type: "Permanent" } } })).toBe(true);
    expect(isHardBounce({ type: "email.bounced", data: { bounce: { type: "Transient" } } })).toBe(false);
    expect(isHardBounce({ type: "email.bounced", data: { bounce: { type: "Undetermined" } } })).toBe(false);
    expect(isHardBounce({ type: "email.bounced", data: {} })).toBe(false);
  });

  it("applyResendEvent with no email_id and no recipients is an unknown recipient", async () => {
    const env = makeEnv();
    expect(await applyResendEvent(env, { type: "email.bounced", data: { bounce: { type: "Permanent" } } }, NOW)).toEqual({
      effect: "unknown-recipient",
      personIds: [],
      sendRows: 0,
    });
  });

  it("purgeWebhookEvents forgets rows older than 60 days", async () => {
    const env = makeEnv();
    env.cohere.raw.prepare(`INSERT INTO resend_webhook_events (svix_id, type, received_at) VALUES ('old', 'x', '2026-07-01T00:00:00Z'), ('new', 'x', '2026-09-30T00:00:00Z')`).run();
    expect(await purgeWebhookEvents(env, NOW)).toBe(1);
    expect(row(env, `SELECT svix_id FROM resend_webhook_events`)).toEqual({ svix_id: "new" });
  });
});
