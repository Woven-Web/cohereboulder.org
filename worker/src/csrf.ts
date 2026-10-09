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
