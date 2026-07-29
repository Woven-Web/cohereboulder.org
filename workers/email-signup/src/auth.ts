// Admin sign-in: magic link + one-time code, no passwords.
//
// Only addresses in the `admins` table can sign in. A request mints one login
// challenge good for both a clickable link and a typed 6-digit code; whichever
// arrives first creates a session. Tokens are stored hashed, so a leak of the
// KV store doesn't hand anyone a session.

import { EmailMessage } from "cloudflare:email";

export interface AuthEnv {
  COHERE_AUTH: KVNamespace;
  cohere: D1Database;
  RESEND_API_KEY?: string;
  SEND_EMAIL?: { send(message: EmailMessage): Promise<void> };
  ADMIN_KEY?: string;
  MAIL_FROM?: string;
  PUBLIC_BASE_URL?: string;
}

const LOGIN_TTL_SECONDS = 10 * 60; // challenge validity
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_SECONDS = 15 * 60;
const SESSION_COOKIE = "cohere_session";

export interface Session {
  email: string;
  name: string | null;
  createdAt: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Six digits, uniformly distributed (rejection sampling avoids modulo bias). */
function randomCode(): string {
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= 4294000000);
  return String(value % 1000000).padStart(6, "0");
}

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export async function isAllowedAdmin(env: AuthEnv, email: string): Promise<{ email: string; name: string | null } | null> {
  const row = await env.cohere
    .prepare(`SELECT email, name FROM admins WHERE email = ?1`)
    .bind(email)
    .first<{ email: string; name: string | null }>();
  return row ?? null;
}

/** Simple fixed-window limiter, keyed by whatever the caller considers a subject. */
async function rateLimited(env: AuthEnv, subject: string): Promise<boolean> {
  const key = `rate:${await sha256(subject)}`;
  const current = Number((await env.COHERE_AUTH.get(key)) ?? "0");
  if (current >= MAX_REQUESTS_PER_WINDOW) return true;
  await env.COHERE_AUTH.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS });
  return false;
}

// ------------------------------------------------------------------ email

function loginEmail(code: string, link: string): { subject: string; html: string; text: string } {
  const subject = `Your COhere sign-in code: ${code}`;
  const text = [
    "Sign in to the COhere member portal.",
    "",
    `Your one-time code is ${code}`,
    "",
    "Or open this link:",
    link,
    "",
    "The code and link both expire in 10 minutes. If you didn't ask to sign in, you can ignore this.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f4f1;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;color:#1c2723">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#16776f;margin:0 0 8px">COhere Boulder</p>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 20px">Sign in to the member portal</h1>
    <p style="margin:0 0 12px;color:#4a5854">Enter this one-time code:</p>
    <p style="font-family:ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:.18em;margin:0 0 24px">${code}</p>
    <p style="margin:0 0 24px">
      <a href="${link}" style="display:inline-block;background:#16776f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px">Or sign in with one click</a>
    </p>
    <p style="font-size:13px;color:#78847f;margin:0">
      The code and link both expire in 10 minutes. If you didn't ask to sign in, you can ignore this email.
    </p>
  </div>
</body></html>`;
  return { subject, html, text };
}

/** Split "Name <addr@host>" into its parts; a bare address works too. */
function parseFrom(value: string): { name: string; address: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1], address: match[2] } : { name: "", address: value.trim() };
}

/** RFC 2047 encoded-word, so non-ASCII survives a Subject header. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function buildMime(
  from: { name: string; address: string },
  to: string,
  message: { subject: string; html: string; text: string },
): string {
  const boundary = `b${crypto.randomUUID().replace(/-/g, "")}`;
  const domain = from.address.split("@")[1] ?? "cohereboulder.org";
  const fromHeader = from.name ? `${encodeHeader(from.name)} <${from.address}>` : from.address;

  return [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    message.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    message.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/**
 * Two possible transports, Cloudflare first.
 *
 * Cloudflare's send_email binding delivers only to addresses verified as
 * Email Routing destinations on the account — which covers the organizers who
 * sign in here, but can never reach the wider member list. Resend stays as a
 * fallback for that day.
 */
async function sendMail(
  env: AuthEnv,
  to: string,
  message: { subject: string; html: string; text: string },
): Promise<void> {
  const from = parseFrom(env.MAIL_FROM || "COhere Boulder <cohere@wovenweb.org>");

  if (env.SEND_EMAIL) {
    await env.SEND_EMAIL.send(new EmailMessage(from.address, to, buildMime(from, to, message)));
    return;
  }

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`resend failed: ${response.status} ${await response.text()}`);
    }
    return;
  }

  throw new Error("no email transport configured");
}

// ----------------------------------------------------------------- flows

export async function requestLogin(
  env: AuthEnv,
  rawEmail: unknown,
  clientIp: string,
  baseUrl: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, error: "invalid email" };
  }
  if (await rateLimited(env, `ip:${clientIp}`)) {
    return { ok: false, status: 429, error: "too many attempts, try again shortly" };
  }

  const admin = await isAllowedAdmin(env, email);
  // Always report success: whether an address is an admin isn't public information.
  if (!admin) return { ok: true };

  if (await rateLimited(env, `email:${email}`)) {
    return { ok: false, status: 429, error: "too many attempts, try again shortly" };
  }

  const token = randomToken();
  const code = randomCode();
  const challenge = JSON.stringify({ email, code, attempts: 0 });

  await env.COHERE_AUTH.put(`login:${await sha256(token)}`, challenge, { expirationTtl: LOGIN_TTL_SECONDS });
  await env.COHERE_AUTH.put(`code:${email}`, JSON.stringify({ code, attempts: 0 }), {
    expirationTtl: LOGIN_TTL_SECONDS,
  });

  const link = `${baseUrl}/api/auth/callback?token=${token}`;
  await sendMail(env, email, loginEmail(code, link));
  return { ok: true };
}

async function createSession(env: AuthEnv, email: string, name: string | null): Promise<string> {
  const token = randomToken();
  const session: Session = { email, name, createdAt: new Date().toISOString() };
  await env.COHERE_AUTH.put(`session:${await sha256(token)}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Consume a magic-link token. Single use. */
export async function consumeLinkToken(env: AuthEnv, token: string): Promise<string | null> {
  if (!token) return null;
  const key = `login:${await sha256(token)}`;
  const stored = await env.COHERE_AUTH.get(key);
  if (!stored) return null;
  await env.COHERE_AUTH.delete(key);

  const { email } = JSON.parse(stored) as { email: string };
  const admin = await isAllowedAdmin(env, email);
  if (!admin) return null;
  return createSession(env, admin.email, admin.name);
}

/** Verify a typed code. Three wrong guesses burn the challenge. */
export async function verifyCode(
  env: AuthEnv,
  rawEmail: unknown,
  rawCode: unknown,
): Promise<{ ok: true; token: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) {
    return { ok: false, status: 400, error: "invalid code" };
  }

  const key = `code:${email}`;
  const stored = await env.COHERE_AUTH.get(key);
  if (!stored) {
    return { ok: false, status: 400, error: "that code has expired — request a new one" };
  }

  const challenge = JSON.parse(stored) as { code: string; attempts: number };
  if (challenge.code !== code) {
    const attempts = challenge.attempts + 1;
    if (attempts >= 3) {
      await env.COHERE_AUTH.delete(key);
      return { ok: false, status: 400, error: "too many wrong codes — request a new one" };
    }
    await env.COHERE_AUTH.put(key, JSON.stringify({ ...challenge, attempts }), {
      expirationTtl: LOGIN_TTL_SECONDS,
    });
    return { ok: false, status: 400, error: "that code doesn't match" };
  }

  await env.COHERE_AUTH.delete(key);
  const admin = await isAllowedAdmin(env, email);
  if (!admin) return { ok: false, status: 403, error: "not an admin address" };

  return { ok: true, token: await createSession(env, admin.email, admin.name) };
}

export function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

export async function currentSession(env: AuthEnv, request: Request): Promise<Session | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const stored = await env.COHERE_AUTH.get(`session:${await sha256(token)}`);
  if (!stored) return null;
  const session = JSON.parse(stored) as Session;
  // Revoking an admin should end their session, not just block new ones.
  if (!(await isAllowedAdmin(env, session.email))) return null;
  return session;
}

export async function endSession(env: AuthEnv, request: Request): Promise<void> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.COHERE_AUTH.delete(`session:${await sha256(token)}`);
}
