// CSRF guard for cookie-authenticated writes that do NOT sit behind the admin
// session's SameSite=Lax cookie (worker/src/auth.ts): the members area rides
// regenOS's `__Host-rs_session`, whose SameSite we don't control, so the Worker
// refuses cross-site writes itself.
//
//   * Sec-Fetch-Site: cross-site            → 403
//   * an Origin that isn't this Worker's    → 403
//   * a body that isn't application/json    → 415 (a cross-site <form> can only
//     send urlencoded / multipart / text/plain without a CORS preflight)
//
// A request carrying neither header (curl, server-side callers) passes: those
// are not browsers, and a browser always sends at least one of them on a write.

function reply(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** A Response refusing the request, or null if it may proceed. */
export function refuseCrossSiteWrite(request: Request, { json = true }: { json?: boolean } = {}): Response | null {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return reply("cross-site request refused", 403);
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== new URL(request.url).origin) return reply("cross-origin request refused", 403);
  if (json && !(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply("expected application/json", 415);
  }
  return null;
}
