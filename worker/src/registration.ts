import { reconcileMembership } from "./membership";
import type { RegenosServiceEnv } from "./regenos-service";
import { handleXrpcProxy, type RegenosAuthEnv } from "./regenos-auth";

export async function handleMyRegistration(request: Request, env: RegenosAuthEnv & RegenosServiceEnv & { cohere: D1Database }): Promise<Response> {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "GET") return json({ error: "MethodNotAllowed" }, 405);
  const url = new URL("/xrpc/social.scenius.getSession", request.url);
  const response = await handleXrpcProxy(new Request(url, { headers: request.headers }), env, url);
  if (!response.ok) return json({ error: "SessionUnavailable" }, response.status);
  const session = await response.json() as { did?: string };
  if (!session.did) return json({ error: "Unauthorized" }, 401);
  try { return json(await reconcileMembership(request, env, session.did)); }
  catch { return json({ error: "RegistrationUnavailable" }, 502); }
}
