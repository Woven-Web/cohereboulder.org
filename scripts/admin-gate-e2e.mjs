// End-to-end proof that the admin portal opens for regenOS scene builders and
// above — and for nobody else — against the mock AppView
// (scripts/regenos-mock.mjs). Never touches scenius.social.
//
// Covers: steward / builder / member / outsider / signed-out / expired
// sessions; Access being steward-only; the 60-second role cache lapsing (a
// revoked role and an ended session both stop working); a lone `cohere_session`
// granting nothing while ADMIN_EMAIL_LOGIN is off; the retired email-code
// routes answering 404; `cohere_session` never reaching regenOS; and the real
// browser round trip /admin → /login → sign in → back on /admin.
//
// Usage (scripts/ci-e2e.sh lane 7 runs exactly this):
//   PORT=9947 node scripts/regenos-mock.mjs          # start it FRESH
//   npx wrangler dev --port 8797 \
//     --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9947 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
//     --var REGENOS_SERVICE_TOKEN:mock-token
//   node scripts/admin-gate-e2e.mjs http://127.0.0.1:8797 http://127.0.0.1:9947 \
//     <legacy-session-token> [http://127.0.0.1:8798]
//
// <legacy-session-token> is a seeded `cohere_session` (see admin-events-e2e.mjs's
// header) — it must be REFUSED. The optional last URL is a second Worker with
// `--var ADMIN_EMAIL_LOGIN:true`, proving the rollback path still works.
// The cache-lapse step waits ~65 seconds on purpose.

import { chromium } from "playwright";

const [target, mockUrl, legacyToken, rollbackUrl] = process.argv.slice(2);
if (!target || !mockUrl || !legacyToken) {
  console.error("usage: node scripts/admin-gate-e2e.mjs <worker-url> <mock-url> <legacy-session-token> [rollback-worker-url]");
  process.exit(2);
}

const failures = [];
let step = "";
const ok = (message) => console.log(`ok    ${message}`);
function expect(condition, message) {
  if (condition) ok(message);
  else {
    failures.push(`${step}: ${message}`);
    console.error(`FAIL  ${step}: ${message}`);
  }
}

const rs = (token) => `__Host-rs_session=${token}`;
const get = (base, path, cookie, init = {}) =>
  fetch(new URL(path, base), { redirect: "manual", ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } });
const post = (base, path, cookie, body, headers = { Origin: new URL(base).origin }) =>
  get(base, path, cookie, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });

try {
  step = "signed out";
  {
    const page = await get(target, "/admin");
    expect(page.status === 302, "GET /admin with no session redirects");
    expect(page.headers.get("location") === "/login?returnTo=%2Fadmin", "…to /login with a return to /admin");
    expect((await get(target, "/api/admin/people")).status === 401, "the admin API answers 401");
  }

  step = "steward";
  {
    const c = rs("sess-steward");
    const page = await get(target, "/admin", c);
    expect(page.status === 200 && (await page.text()).includes('content="regenos"'), "steward opens the portal (regenOS mode)");
    expect((await get(target, "/api/admin/people", c)).status === 200, "steward reads people");
    expect((await get(target, "/api/admin/access", c)).status === 200, "steward reads Access");
    const me = await (await get(target, "/api/auth/me", c)).json();
    expect(me.handle === "sam.mock.test" && me.role === "steward" && me.canManageAccess === true, "me reports the steward");
    expect(me.email === "@sam.mock.test" && me.hasMailbox === false, "no contact email → identity is @handle, no mailbox");

    // Newsletter test send without a mailbox must ask for an address.
    const draft = await (await post(target, "/api/admin/newsletters", c, { subject: "Gate", text: "Hello", audience: { kind: "all" } })).json();
    const id = draft.newsletter?.id;
    expect(Boolean(id), "steward can draft a newsletter");
    const noTo = await post(target, `/api/admin/newsletters/${id}/test`, c, {});
    expect(noTo.status === 400 && /address/i.test((await noTo.json()).error), "test send with no mailbox asks for an address");
    const stranger = await post(target, `/api/admin/newsletters/${id}/test`, c, { to: "stranger@elsewhere.test" });
    expect(stranger.status === 400, "…and refuses one that isn't an organizer notification address");
  }

  step = "cross-site writes";
  {
    const c = rs("sess-steward");
    const foreign = await post(target, "/api/admin/access/role", c, { did: "did:plc:mockmember", role: "builder" }, { Origin: "https://evil.example" });
    expect(foreign.status === 403, "a foreign Origin is refused on an admin write");
    const bare = await post(target, "/api/admin/access/role", c, { did: "did:plc:mockmember", role: "builder" }, {});
    expect(bare.status === 403, "a write with no Origin is refused");
    const logout = await post(target, "/api/auth/logout", c, {}, { Origin: "https://evil.example" });
    expect(logout.status === 403, "a foreign Origin cannot log the organizer out");
    expect((await get(target, "/api/admin/people", c, { headers: { Origin: "https://evil.example" } })).status === 200, "reads are not affected");
  }

  step = "builder";
  {
    const c = rs("sess-builder");
    expect((await get(target, "/admin", c)).status === 200, "builder opens the portal");
    expect((await get(target, "/api/admin/people", c)).status === 200, "builder reads people");
    expect((await get(target, "/api/admin/events", c)).status === 200, "builder reads events");
    expect((await get(target, "/api/admin/access", c)).status === 403, "builder is refused Access");
    expect((await post(target, "/api/admin/access/role", c, { did: "did:plc:mockmember", role: "builder" })).status === 403, "builder cannot change a role");
    expect((await post(target, "/api/admin/access/invite", c, { email: "x@example.test" })).status === 403, "builder cannot invite");
    expect((await post(target, "/api/admin/admins", c, { email: "x@example.test" })).status === 403, "builder cannot edit the notification list");
    const me = await (await get(target, "/api/auth/me", c)).json();
    expect(me.canManageAccess === false && me.email === "rosa@cohere.test" && me.hasMailbox === true, "me reports a builder with a verified mailbox");
  }

  step = "member and outsider";
  for (const [token, label] of [["sess-member", "member"], ["sess-outsider", "signed-in non-member"]]) {
    const c = rs(token);
    const page = await get(target, "/admin", c);
    const html = await page.text();
    expect(page.status === 403, `${label}: /admin is refused`);
    expect(
      /You're signed in as @\w+\.mock\.test, but you're not an organizer of COhere's scene\. Ask a steward to give you the builder role\./.test(html.replaceAll("&#39;", "'")),
      `${label}: the page says who they are and what to ask for`,
    );
    expect(!html.includes("people"), `${label}: no portal markup in the refusal`);
    expect((await get(target, "/api/admin/people", c)).status === 403, `${label}: API refused`);
    expect((await get(target, "/api/admin/access", c)).status === 403, `${label}: Access refused`);
  }

  step = "expired regenOS session";
  {
    const c = rs("sess-expired");
    expect((await get(target, "/admin", c)).status === 302, "an expired session is treated as signed out (redirect)");
    expect((await get(target, "/api/admin/people", c)).status === 401, "…and the API answers 401");
  }

  step = "cohere_session alone";
  {
    const c = `cohere_session=${legacyToken}`;
    expect((await get(target, "/api/admin/people", c)).status === 401, "a seeded cohere_session no longer opens the API");
    expect((await get(target, "/api/auth/me", c)).status === 401, "…or /api/auth/me");
    expect((await get(target, "/admin", c)).status === 302, "…or /admin");
    const request = await post(target, "/api/auth/request", null, { email: "ci-e2e@cohere.test" });
    expect(request.status === 404, "POST /api/auth/request is retired (no email sent)");
    expect((await post(target, "/api/auth/verify", null, { email: "ci-e2e@cohere.test", code: "123456" })).status === 404, "POST /api/auth/verify is retired");
    expect((await get(target, "/api/auth/callback?token=x")).status === 404, "GET /api/auth/callback is retired");
  }

  step = "cookie isolation";
  {
    await get(target, "/api/admin/people", `cohere_session=${legacyToken}; ${rs("sess-steward")}; theme=dark`);
    const { cookies } = await (await fetch(new URL("/__sawCookies", mockUrl))).json();
    expect(cookies.length > 0, "regenOS saw the visitor's session cookie");
    expect(cookies.every((line) => line.split(";").every((p) => p.trim().startsWith("__Host-rs_"))), "regenOS only ever saw __Host-rs_ cookies");
    expect(!cookies.some((line) => line.includes("cohere_session") || line.includes(legacyToken)), "cohere_session never reached regenOS");
  }

  if (rollbackUrl) {
    step = "rollback (ADMIN_EMAIL_LOGIN=true)";
    expect((await get(rollbackUrl, "/api/admin/people", `cohere_session=${legacyToken}`)).status === 200, "the old email session still works behind the flag");
    expect((await get(rollbackUrl, "/api/admin/people", rs("sess-builder"))).status === 200, "…and regenOS organizers still work beside it");
    const both = `${rs("sess-member")}; cohere_session=${legacyToken}`;
    expect((await get(rollbackUrl, "/api/admin/people", both)).status === 200, "a regenOS member who also holds the old session is let in (rollback)");
    expect((await get(rollbackUrl, "/admin", both)).status === 200, "…and /admin opens for them");
    expect((await get(target, "/api/admin/people", both)).status === 403, "…but not once the flag is off");
  }

  step = "real browser round trip";
  {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(new URL("/admin", target).href, { waitUntil: "networkidle" });
      expect(new URL(page.url()).pathname === "/login" && page.url().includes("returnTo=%2Fadmin"), "signed-out /admin lands on /login with the return");
      await page.locator("#regenos-email").fill("returning@example.test");
      await page.getByRole("button", { name: "Email me a link" }).click();
      await page.getByText("returning@example.test").waitFor();
      // The emailed link, for a returning user: verifyEmail answers 302 / with the session.
      await page.goto(new URL("/xrpc/social.scenius.verifyEmail?token=tok-return", target).href);
      await page.waitForURL((u) => u.pathname === "/admin", { timeout: 15000 });
      await page.locator("#app:not(.hidden)").waitFor({ timeout: 15000 });
      const who = await page.locator("#whoami").textContent();
      expect(/@tester\.mock\.test \(builder\)/.test(who ?? ""), `back on the portal, signed in (${who})`);
      expect(await page.locator('[data-tab="access"]').isHidden(), "a builder doesn't see the Access tab");
      expect(await page.locator("#login").isHidden(), "no email-code form is shown");
    } finally {
      await browser.close();
    }
  }

  step = "role and session cache lapse";
  {
    const builder = rs("sess-builder");
    const steward = rs("sess-steward");
    expect((await get(target, "/api/admin/people", builder)).status === 200, "builder is in before the revoke");
    await fetch(new URL("/__setRole?did=did:plc:mockbuilder&role=member", mockUrl));
    await fetch(new URL("/__expire?token=sess-steward", mockUrl));
    expect((await get(target, "/api/admin/people", builder)).status === 200, "a revoked role is still honoured inside the 60s cache");
    expect((await get(target, "/api/admin/people", steward)).status === 200, "…as is an ended session");
    console.log("      waiting 65s for the cache to lapse…");
    await new Promise((resolve) => setTimeout(resolve, 65_000));
    expect((await get(target, "/api/admin/people", builder)).status === 403, "after the TTL the revoked builder is refused");
    expect((await get(target, "/api/admin/people", steward)).status === 401, "after the TTL the ended session is refused");
  }

  step = "roster (for the rollout report)";
  {
    const roster = await (await fetch(new URL("/xrpc/social.scenius.getSceneMembers?scene=did:plc:mockscene", mockUrl), { headers: { Authorization: "Bearer mock-token" } })).json();
    console.log("      mock roster:", roster.members.map((m) => `${m.handle}=${m.role}`).join(", "));
  }
} catch (error) {
  failures.push(`${step}: ${error instanceof Error ? error.stack : error}`);
  console.error(error);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nadmin-gate e2e passed");
