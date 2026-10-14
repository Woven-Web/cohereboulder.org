// Cross-site request refusal for cookie-authenticated mutations.
//
// The admin session is a cookie whose attributes regenOS controls
// (`__Host-rs_session`), so this Worker does not rely on SameSite. Any
// request other than GET/HEAD must prove it came from this origin: an Origin
// header equal to the request's own, or — when a client sends none — a
// browser-set Sec-Fetch-Site of same-origin/none. Neither header present
// means we can't tell, and a mutation we can't place is refused.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSiteRefusal(request: Request, url: URL): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  const ok = origin !== null ? origin === url.origin : site === "same-origin" || site === "none";
  if (ok) return null;
  return new Response(JSON.stringify({ error: "cross-site request refused" }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// ---------------------------------------------------------------------------
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
