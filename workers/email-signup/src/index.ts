// Email capture for cohereboulder.org "stay in the loop" signups.
// POST /        { email, name?, source?, website? (honeypot) } -> { ok: true }
// GET  /list    Authorization: Bearer <ADMIN_KEY>              -> { count, signups }

interface Env {
  SIGNUPS: KVNamespace;
  ADMIN_KEY?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://cohereboulder.org",
  "https://www.cohereboulder.org",
  "http://localhost:8080",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":
      origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://cohereboulder.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin"));
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && url.pathname === "/list") {
      const auth = request.headers.get("Authorization");
      if (!env.ADMIN_KEY || auth !== `Bearer ${env.ADMIN_KEY}`) {
        return json({ error: "unauthorized" }, 401, cors);
      }
      const signups: unknown[] = [];
      let cursor: string | undefined;
      do {
        const page = await env.SIGNUPS.list({ prefix: "email:", cursor });
        for (const key of page.keys) {
          const value = await env.SIGNUPS.get(key.name, "json");
          if (value) signups.push(value);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ count: signups.length, signups }, 200, cors);
    }

    if (request.method === "POST" && url.pathname === "/") {
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400, cors);
      }

      // Honeypot: bots fill the hidden "website" field; pretend success.
      if (typeof body.website === "string" && body.website.length > 0) {
        return json({ ok: true }, 200, cors);
      }

      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json({ error: "invalid email" }, 400, cors);
      }

      await env.SIGNUPS.put(
        `email:${email}`,
        JSON.stringify({
          email,
          name: typeof body.name === "string" ? body.name.slice(0, 200) : undefined,
          source: typeof body.source === "string" ? body.source.slice(0, 100) : "website",
          language: typeof body.language === "string" ? body.language.slice(0, 10) : undefined,
          signedUpAt: new Date().toISOString(),
        }),
      );
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "not found" }, 404, cors);
  },
};
