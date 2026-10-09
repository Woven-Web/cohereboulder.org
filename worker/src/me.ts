// GET /api/me — what the site header needs to know about the visitor: are they
// signed in to regenOS, and do they get the "Organizer" link. It reuses the
// admin gate (and its 60-second cache), so the answer can never disagree with
// whether /admin would open. Anything uncertain reads as signed out.

import { canManageAccess, resolveAdminAccess, type AdminGateEnv } from "./admin-gate";

export async function handleMe(env: AdminGateEnv, request: Request): Promise<Response> {
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "GET") return reply({ error: "MethodNotAllowed" }, 405);

  const access = await resolveAdminAccess(env, request);
  if (access.state === "organizer") {
    const { session } = access;
    return reply({ signedIn: true, handle: session.handle ?? null, organizer: true, steward: canManageAccess(session) });
  }
  if (access.state === "notOrganizer") return reply({ signedIn: true, handle: access.handle, organizer: false, steward: false });
  return reply({ signedIn: false, handle: null, organizer: false, steward: false });
}
