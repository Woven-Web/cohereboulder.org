// Registration and sign-in, woven together (T-138), in a real browser against
// wrangler dev + scripts/regenos-mock.mjs. Never scenius.social, never a real
// inbox: beginSignup goes to the mock, and the form row has no confirmation mail.
//
//   1. signed out, new email      → stored; "Create your account to RSVP" opens the
//                                   sign-in dialog with that email (beginSignup only on click)
//   2. signed out, existing email → nothing stored, D1 rows byte-for-byte unchanged,
//                                   the page offers sign-in with the email filled in
//   3. signed in (verified email) → the form loads their saved answers, email locked;
//                                   an edit saves; AUTO_MEMBER_ON_SIGNIN adds them as member
//   4. signed in, body email      → ignored; the session's email is the one written
//   5. signed out prompts         → Home "Already registered? Sign in", RSVP "Sign in to RSVP" first
//   6. saved answers fail to load → no form to submit; "Try again" loads them prefilled
//   7. a second map suggestion    → not stored, and the dialog says so instead of thanking
//
// Seeded by scripts/ci-e2e.sh before the Worker starts (ana@ and reg@ registered).
// Usage: E2E_PERSIST_DIR=<dir> node scripts/register-signin-e2e.mjs <worker-url> <mock-url>

import { checkInstallInvite } from "./install-invite-check.mjs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const [target, mock] = process.argv.slice(2);
const persist = process.env.E2E_PERSIST_DIR;
if (!target || !mock || !persist) {
  console.error("usage: E2E_PERSIST_DIR=<dir> node scripts/register-signin-e2e.mjs <worker-url> <mock-url>");
  process.exit(2);
}

let step = "start";
const ok = (m) => console.log(`  ✓ ${m}`);
function expect(cond, m) {
  if (!cond) throw new Error(m);
}

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}
const rowsFor = (email) =>
  d1(
    `SELECT p.id, p.name, p.phone, p.orgs, p.subscribed, p.updated_at AS p_updated, s.id AS s_id, s.data, s.updated_at AS s_updated
     FROM people p LEFT JOIN submissions s ON s.person_id = p.id AND s.form_slug = 'register-2026' WHERE p.email = '${email}'`,
  );

async function roleOf(did) {
  const res = await fetch(`${mock}/xrpc/social.scenius.getSceneMembers?scene=did:plc:mockscene`);
  const data = await res.json();
  return data.members.find((m) => m.did === did)?.role ?? null;
}

const browser = await chromium.launch();
async function persona(cookieValue) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  if (cookieValue) {
    await context.addCookies([{ name: "__Host-rs_session", value: cookieValue, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  }
  const page = await context.newPage();
  const signups = [];
  page.on("request", (req) => {
    if (req.url().includes("/xrpc/social.scenius.beginSignup")) signups.push(req.postData());
  });
  return { context, page, signups };
}

async function openForm(page) {
  await page.goto(`${target}/register`, { waitUntil: "networkidle" });
  await page.locator("#field-full_name").waitFor({ timeout: 15_000 });
}

try {
  // ── 1. signed out, a new email ──────────────────────────────────────────────
  step = "new registration";
  {
    const { context, page, signups } = await persona(null);
    await openForm(page);
    await page.getByTestId("signin-prompt").waitFor();
    await page.locator("#field-full_name").fill("Nia New");
    await page.locator("#field-email").fill("nia@cohere.test");
    await page.getByRole("button", { name: "Submit Registration" }).click();
    const invite = page.getByTestId("register-create-account");
    await invite.waitFor({ timeout: 15_000 });
    expect((await invite.textContent())?.trim() === "Create your account to RSVP to events", "invite label");
    const [row] = rowsFor("nia@cohere.test");
    expect(row?.name === "Nia New" && row?.s_id, "new registration stored");
    expect(signups.length === 0, "beginSignup must not run before the click");
    await invite.click();
    const dialogEmail = page.getByRole("dialog").locator("#regenos-email-dialog");
    await dialogEmail.waitFor();
    expect((await dialogEmail.inputValue()) === "nia@cohere.test", "dialog email prefilled");
    expect(signups.length === 0, "opening the dialog sends nothing");
    await page.getByRole("dialog").getByRole("button", { name: "Email me a link" }).click();
    await page.getByRole("dialog").getByText("Check your email").waitFor();
    await page.waitForTimeout(500);
    expect(signups.length === 1 && JSON.parse(signups[0]).email === "nia@cohere.test", "beginSignup on the user's click, with that email");
    ok("new email: stored, invite shown, dialog prefilled, beginSignup only on click");
    await context.close();
  }

  // ── 2. signed out, an email that is already registered ──────────────────────
  step = "existing email, signed out";
  {
    const before = rowsFor("ana@cohere.test");
    expect(before.length === 1 && before[0].s_id, "seeded ana registration");
    const { context, page, signups } = await persona(null);
    await openForm(page);
    await page.locator("#field-full_name").fill("Mallory");
    await page.locator("#field-email").fill("ana@cohere.test");
    await page.locator("#field-phone").fill("999-0000");
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/submit/register-2026"));
    await page.getByRole("button", { name: "Submit Registration" }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.status() === 200, `status ${response.status()}`);
    expect(JSON.stringify(body) === JSON.stringify({ ok: true, alreadyRegistered: true }), `response leaks nothing: ${JSON.stringify(body)}`);
    const card = page.getByTestId("register-already");
    await card.getByText("This email is already registered. Sign in to change your registration.").waitFor();
    const after = rowsFor("ana@cohere.test");
    expect(JSON.stringify(after) === JSON.stringify(before), `D1 row changed: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    await card.getByRole("button", { name: "Sign in" }).click();
    const dialogEmail = page.getByRole("dialog").locator("#regenos-email-dialog");
    await dialogEmail.waitFor();
    expect((await dialogEmail.inputValue()) === "ana@cohere.test", "sign-in dialog prefilled with the email");
    expect(signups.length === 0, "no sign-in mail is started by this path");
    const returnTo = await page.evaluate(() => localStorage.getItem("cohere:returnTo"));
    expect(returnTo === "/register?edit=1", `returnTo ${returnTo}`);
    ok("existing email signed out: nothing stored, sign-in offered with the email filled in");
    await context.close();
  }

  // ── 3. signed in with a verified email: edit the saved registration ─────────
  step = "signed-in edit";
  {
    const { context, page } = await persona("sess-registrant");
    await openForm(page);
    await page.getByTestId("register-editing").getByText("Update your registration").waitFor({ timeout: 15_000 });
    expect((await page.getByTestId("signin-prompt").count()) === 0, "no sign-in prompt when signed in");
    const email = page.locator("#field-email");
    expect((await email.inputValue()) === "reg@cohere.test" && (await email.getAttribute("readonly")) !== null, "email locked to the account's");
    expect((await page.locator("#field-full_name").inputValue()) === "Reg Original", "name prefilled");
    expect((await page.locator("#field-how_did_you_hear").inputValue()) === "the radio", "answer prefilled");
    expect((await page.locator("#field-attending_invocation-Yes").getAttribute("data-state")) === "checked", "radio prefilled");
    await page.locator("#field-full_name").fill("Reg Edited");
    await page.locator("#field-how_did_you_hear").fill("a friend");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByTestId("register-updated").getByText("Your registration is updated.").waitFor({ timeout: 15_000 });
    const [row] = rowsFor("reg@cohere.test");
    const data = JSON.parse(row.data);
    expect(row.name === "Reg Edited" && data.how_did_you_hear === "a friend" && data.attending_invocation === "Yes", `edit saved: ${JSON.stringify(row)}`);
    ok("signed in: saved answers prefilled, email locked, edit saved");

    // AUTO_MEMBER_ON_SIGNIN is "true" on this lane's Worker: a registered visit adds them, once.
    let role = null;
    for (let i = 0; i < 20 && !role; i++) {
      role = await roleOf("did:plc:mockregistrant");
      if (!role) await new Promise((r) => setTimeout(r, 500));
    }
    expect(role === "member", `auto-membership: role ${role}`);
    ok("AUTO_MEMBER_ON_SIGNIN added the registered visitor as member");
    await context.close();
  }

  // ── 4. signed in, first registration; the body's email is ignored ───────────
  step = "signed-in first registration";
  {
    const { context, page } = await persona("sess-builder");
    await openForm(page);
    expect((await page.getByTestId("register-editing").count()) === 0, "not registered yet: a new registration");
    expect((await page.locator("#field-email").inputValue()) === "rosa@cohere.test", "email from the account");
    await page.locator("#field-full_name").fill("Rosa Mock");
    await page.getByRole("button", { name: "Submit Registration" }).click();
    await page.getByTestId("register-signed-in").getByText("You're signed in").waitFor({ timeout: 15_000 });
    expect(rowsFor("rosa@cohere.test")[0]?.s_id, "stored under the session email");

    const anaBefore = rowsFor("ana@cohere.test");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/submit/register-2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ana@cohere.test", name: "Hijack", answers: { how_did_you_hear: "x" } }),
      });
      return res.json();
    });
    expect(result.updated === true, `signed-in submit edits the caller's own row: ${JSON.stringify(result)}`);
    expect(JSON.stringify(rowsFor("ana@cohere.test")) === JSON.stringify(anaBefore), "the body's email was not written");
    expect(rowsFor("rosa@cohere.test")[0].name === "Hijack", "the session's email was");
    // Rosa is a builder: auto-membership must never touch her role.
    await page.goto(`${target}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    expect((await roleOf("did:plc:mockbuilder")) === "builder", "no downgrade");
    ok("signed in: email from the session, never the body; an existing builder keeps their role");
    await context.close();
  }

  // ── 5. sign-in prompts for signed-out visitors ──────────────────────────────
  step = "signed-out prompts";
  {
    const { context, page } = await persona(null);
    await page.goto(`${target}/`, { waitUntil: "networkidle" });
    await page.getByTestId("signin-prompt").getByText("Already registered?").waitFor();
    await page.getByTestId("signin-prompt").getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("dialog").locator("#regenos-email-dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.goto(`${target}/events/did:plc:mockscene/ev-seed1`, { waitUntil: "networkidle" });
    const panel = page.getByTestId("event-rsvp");
    const signIn = panel.getByTestId("rsvp-sign-in");
    await signIn.waitFor({ timeout: 15_000 });
    const buttons = await panel.getByRole("button").allTextContents();
    expect(buttons[0]?.trim() === "Sign in to RSVP" && buttons.some((b) => b.trim() === "RSVP"), `RSVP order: ${JSON.stringify(buttons)}`);
    await signIn.click();
    await page.getByRole("dialog").locator("#regenos-email-dialog").waitFor();
    ok("Home and the event RSVP offer sign-in first; the email RSVP stays");
    await context.close();
  }

  // ── 6. signed in, the saved registration fails to load, then loads ───────────
  step = "detail load failure";
  {
    const { context, page } = await persona("sess-registrant");
    let failing = true;
    await page.route(
      (url) => url.pathname === "/api/me/registration" && url.searchParams.get("detail") === "1",
      (route) => (failing ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"down"}' }) : route.continue()),
    );
    await page.goto(`${target}/register`);
    const failed = page.getByTestId("register-load-failed");
    await failed.getByText("We couldn't load your registration.").waitFor({ timeout: 20_000 });
    for (const name of ["Save changes", "Submit Registration"]) {
      expect((await page.getByRole("button", { name }).count()) === 0, `no "${name}" button while the saved answers are missing`);
    }
    expect((await page.locator("#field-full_name").count()) === 0, "no blank form");
    failing = false;
    await failed.getByRole("button", { name: "Try again" }).click();
    await page.getByTestId("register-editing").waitFor({ timeout: 15_000 });
    expect((await page.locator("#field-email").inputValue()) === "reg@cohere.test", "email prefilled after retry");
    expect((await page.locator("#field-how_did_you_hear").inputValue()) === "a friend", "saved answer prefilled after retry");
    ok("signed in: a failed load shows Try again and no form; the retry prefills");
    await context.close();
  }

  // ── 7. map suggestions: one per email, and a second one says so ─────────────
  step = "map suggestion repeat";
  {
    const { context, page } = await persona(null);
    await page.goto(`${target}/`, { waitUntil: "networkidle" });
    const suggest = async (org) => {
      await page.getByRole("button", { name: "Suggest Additions" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#organizationName").fill(org);
      await dialog.locator("#description").fill("They share seeds.");
      await dialog.locator("#contactEmail").fill("sage@cohere.test");
      const response = page.waitForResponse((r) => r.url().includes("/api/submit/map-suggestion"));
      await dialog.getByRole("button", { name: "Submit Suggestion" }).click();
      return (await response).json();
    };
    expect(JSON.stringify(await suggest("Seed Library")) === '{"ok":true}', "first suggestion stored");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(JSON.stringify(await suggest("Tool Share")) === '{"ok":true,"alreadyRegistered":true}', "second suggestion flagged");
    await page.getByTestId("suggestion-already").getByText("We already have a suggestion from this email.").waitFor();
    expect((await page.getByRole("dialog").locator("#organizationName").inputValue()) === "Tool Share", "their text stays in the dialog");
    const stored = d1(
      `SELECT s.data FROM submissions s JOIN people p ON p.id = s.person_id WHERE p.email = 'sage@cohere.test' AND s.form_slug = 'map-suggestion'`,
    );
    expect(stored.length === 1 && JSON.parse(stored[0].data).organization_name === "Seed Library", `first suggestion kept: ${JSON.stringify(stored)}`);
    ok("a second map suggestion from the same email is not stored, and the dialog says so");
    await context.close();
  }

  step = "signed-in phone install invitation";
  await checkInstallInvite(browser, target);
  ok("signed-in phone: Home invitation, dismissal persists, registration excluded");

  console.log("register-signin-e2e passed.");
} catch (error) {
  console.error(`register-signin-e2e failed at "${step}": ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
