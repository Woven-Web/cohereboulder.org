import { handleXrpcProxy, readVerifiedSessionEmail, type RegenosAuthEnv } from "./regenos-auth";

export async function handleMyRegistration(request: Request, env: RegenosAuthEnv & { cohere: D1Database }): Promise<Response> {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "GET") return json({ error: "MethodNotAllowed" }, 405);
  const url = new URL("/xrpc/social.scenius.getSession", request.url);
  const response = await handleXrpcProxy(new Request(url, { headers: request.headers }), env, url);
  if (!response.ok) return json({ error: "SessionUnavailable" }, response.status);
  const session = await response.json() as { did?: string };
  if (!session.did) return json({ error: "Unauthorized" }, 401);
  let email: string | null;
  try { email = await readVerifiedSessionEmail(request, env); }
  catch { return json({ error: "RegistrationUnavailable" }, 502); }
  if (!email) return json({ registered: null });
  const row = await env.cohere.prepare(`SELECT 1 FROM submissions s JOIN people p ON p.id = s.person_id WHERE p.email = ?1 AND s.form_slug = 'register-2026' LIMIT 1`).bind(email).first();
  return json({ registered: Boolean(row) });
}
