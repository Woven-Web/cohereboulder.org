// What crawlers and link-preview bots see. The SPA renders client-side, so a
// shared link to /events/:did/:rkey would otherwise preview as the homepage:
// Slack, iMessage, Facebook and friends never run the JS. The Worker already
// fronts every route, so it rewrites the <head> of the served index.html:
//
//   - a single event page gets its own title / description / og / twitter
//     tags, built from the same anonymous regenOS read /api/events/:did/:rkey
//     uses (events.ts `handleEventDetail`);
//   - every known page gets a canonical + og:url pointing at ITSELF, rather
//     than all of them claiming to duplicate the homepage;
//   - unknown paths (the SPA's 404) drop the canonical entirely.
//
// Everything here is best-effort. Any failure — regenOS slow or down, a bad
// path, a private event — serves the unmodified defaults. It must never make
// the page slower than a short timeout or turn a 200 into an error.
//
// Also here: /sitemap.xml, and long-term caching for Vite's hashed /assets/*.

import { handleEventDetail, handleEventsList, type EventsEnv } from "./events";

/** Where canonical URLs point, whichever hostname served the request. */
export const DEFAULT_ORIGIN = "https://cohereboulder.org";
const SITE_NAME = "COhere Boulder";
const EVENT_TZ = "America/Denver";
/** A page view must not wait on regenOS for longer than this. */
const META_TIMEOUT_MS = 2_500;
const META_CACHE_SECONDS = 300;
const DESCRIPTION_MAX = 240;

/** Public pages that exist and should be indexed / carry a self canonical. */
export const KNOWN_ROUTES = [
  "/",
  "/about",
  "/co-create",
  "/calendar",
  "/propose",
  "/register",
  "/telegram",
  "/archive",
  "/archive/2024",
  "/join-2025",
  "/invitation-2025",
  "/presskit",
] as const;

/** Listed in /sitemap.xml, before the per-event URLs. */
export const SITEMAP_ROUTES = ["/", "/calendar", "/propose", "/about", "/register", "/co-create"] as const;

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL, or null to drop the canonical/og:url tags. */
  canonical: string | null;
  /** og:type — "website" by default. */
  type?: string;
}

/** The subset of the detail payload the meta builder reads. */
export interface MetaEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt?: string | null;
  description: string | null;
  status?: string | null;
  location: { name?: string; street?: string; locality?: string } | null;
}

export function originFor(publicBaseUrl: string | undefined): string {
  const raw = publicBaseUrl?.trim().replace(/\/+$/, "");
  return raw || DEFAULT_ORIGIN;
}

/** The SPA's own URL shape for an event page (src/lib/events.ts `eventPath`). */
export function eventPath(did: string, rkey: string): string {
  return `/events/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** `/events/:did/:rkey` → parts, or null for any other path (or bad encoding). */
export function parseEventPath(path: string): { did: string; rkey: string } | null {
  const m = /^\/events\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (!m) return null;
  try {
    const did = decodeURIComponent(m[1]);
    const rkey = decodeURIComponent(m[2]);
    return did.startsWith("did:") && rkey ? { did, rkey } : null;
  } catch {
    return null;
  }
}

/** Drop a trailing slash (except on "/") so /calendar and /calendar/ agree. */
function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/** Canonical for a known static route, or null for anything else. */
export function canonicalFor(path: string, origin: string): string | null {
  const p = normalizePath(path);
  return (KNOWN_ROUTES as readonly string[]).includes(p) ? `${origin}${p === "/" ? "/" : p}` : null;
}

/** "Thu, Oct 16, 2026, 6:00 PM MDT", in the festival's own timezone. */
export function formatEventWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return null;
  }
}

/** Collapse whitespace and cut at a word boundary with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

function isTbd(value: string | undefined): boolean {
  return !value || !value.trim() || value.trim().toLowerCase() === "tbd";
}

function whereLine(location: MetaEvent["location"]): string | null {
  if (!location) return null;
  const parts = [location.name, location.street, location.locality].filter(
    (p): p is string => typeof p === "string" && !isTbd(p),
  );
  return parts.length ? parts.join(", ") : null;
}

/** Title/description/canonical for one event page. Plain text — escaping happens at write time. */
export function eventMeta(event: MetaEvent, origin: string): PageMeta {
  const cancelled = event.status === "cancelled";
  const when = formatEventWhen(event.startsAt);
  const where = whereLine(event.location);
  const lead = [when, where].filter(Boolean).join(" · ");
  const body = event.description ? clip(event.description, DESCRIPTION_MAX) : null;
  const fallback = "Part of COhere Boulder 2026 — We Are Our Ecology, October 15–25, 2026 in Boulder, Colorado.";
  const description = clip(
    [cancelled ? "Cancelled." : null, lead ? `${lead}.` : null, body ?? fallback].filter(Boolean).join(" "),
    DESCRIPTION_MAX + 80,
  );
  return {
    title: `${cancelled ? "Cancelled: " : ""}${event.name} · ${SITE_NAME} 2026`,
    description,
    canonical: `${origin}${eventPath(event.did, event.rkey)}`,
    type: "article",
  };
}

/** HTML-escape for text we inject as raw HTML (see `applyMeta`). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----------------------------------------------------------- HTMLRewriter

// workers-types aren't wired into this repo's typecheck; describe the bits used.
interface RewriterElement {
  getAttribute(name: string): string | null;
  setInnerContent(content: string, options?: { html?: boolean }): RewriterElement;
  replace(content: string, options?: { html?: boolean }): RewriterElement;
  remove(): RewriterElement;
}
interface Rewriter {
  on(selector: string, handlers: { element(el: RewriterElement): void }): Rewriter;
  transform(response: Response): Response;
}
declare const HTMLRewriter: { new (): Rewriter };

const META_NAME_ATTRS: Record<string, "title" | "description"> = {
  description: "description",
  "twitter:title": "title",
  "twitter:description": "description",
};
const META_PROPERTY_ATTRS: Record<string, "title" | "description"> = {
  "og:title": "title",
  "og:description": "description",
};

/**
 * Rewrite the served index.html's head for this page. Existing tags are
 * replaced wholesale (index.html declares them all); og:url and canonical are
 * set, or removed when `meta.canonical` is null.
 *
 * Every tag is rebuilt as a string with each value HTML-escaped here, so the
 * output never depends on how the runtime escapes `setAttribute` values.
 * `partial` touches only canonical/og:url and leaves the default copy alone.
 */
export function applyMeta(response: Response, meta: PageMeta, partial: boolean): Response {
  const canonical = meta.canonical ? escapeHtml(meta.canonical) : null;
  let rewriter = new HTMLRewriter()
    .on('link[rel="canonical"]', {
      element(el) {
        if (canonical) el.replace(`<link rel="canonical" href="${canonical}" />`, { html: true });
        else el.remove();
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        if (canonical) el.replace(`<meta property="og:url" content="${canonical}" />`, { html: true });
        else el.remove();
      },
    });
  if (!partial) {
    const value = (key: "title" | "description") => escapeHtml(stripControls(meta[key]));
    rewriter = rewriter
      .on("title", {
        element(el) {
          el.setInnerContent(value("title"), { html: true });
        },
      })
      .on("meta[name]", {
        element(el) {
          const name = el.getAttribute("name") ?? "";
          const key = META_NAME_ATTRS[name];
          if (key) el.replace(`<meta name="${escapeHtml(name)}" content="${value(key)}" />`, { html: true });
        },
      })
      .on("meta[property]", {
        element(el) {
          const prop = el.getAttribute("property") ?? "";
          const key = META_PROPERTY_ATTRS[prop];
          if (key) el.replace(`<meta property="${escapeHtml(prop)}" content="${value(key)}" />`, { html: true });
          if (prop === "og:type" && meta.type) {
            el.replace(`<meta property="og:type" content="${escapeHtml(meta.type)}" />`, { html: true });
          }
        },
      });
  }
  return rewriter.transform(response);
}

/** Control characters have no business in a head tag. */
function stripControls(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ");
}

// -------------------------------------------------------------- event lookup

/** The Cache API's default namespace; workers-types aren't wired in this repo. */
function edgeCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** One event via the same anonymous read /api/events/:did/:rkey uses, or null. */
async function lookupEvent(env: EventsEnv, did: string, rkey: string): Promise<MetaEvent | null> {
  const res = await handleEventDetail(env, did, rkey, {});
  if (!res.ok) return null;
  const data = (await res.json()) as { event?: MetaEvent };
  return data.event?.name ? data.event : null;
}

/** The meta for an event page, edge-cached briefly; null means "use defaults". */
async function eventPageMeta(
  request: Request,
  env: EventsEnv,
  origin: string,
  did: string,
  rkey: string,
): Promise<PageMeta | null> {
  const cache = edgeCache();
  const cacheKey = new Request(new URL(`/__meta${eventPath(did, rkey)}`, request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return (await hit.json()) as PageMeta;
  }
  const event = await withTimeout(lookupEvent(env, did, rkey), META_TIMEOUT_MS);
  if (!event) return null;
  const meta = eventMeta(event, origin);
  if (cache) {
    await cache
      .put(
        cacheKey,
        new Response(JSON.stringify(meta), {
          headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${META_CACHE_SECONDS}` },
        }),
      )
      .catch(() => undefined);
  }
  return meta;
}

function isHtml(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html");
}

/**
 * Post-process whatever the assets binding served for a GET/HEAD:
 * immutable caching for hashed /assets/*, and per-page head tags for HTML.
 * Never throws; on any problem the original response goes out untouched.
 */
export async function decorateAssetResponse(
  request: Request,
  response: Response,
  env: EventsEnv & { PUBLIC_BASE_URL?: string },
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Vite fingerprints everything under /assets/, so a given URL's bytes
    // never change. Guard on type: an unknown /assets/ path gets the SPA's
    // index.html, which must NOT be pinned for a year.
    if (path.startsWith("/assets/")) {
      if (response.status !== 200 || isHtml(response)) return response;
      const out = new Response(response.body, response);
      out.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return out;
    }

    if (response.status !== 200 || !isHtml(response)) return response;
    const origin = originFor(env.PUBLIC_BASE_URL);

    const event = parseEventPath(path);
    if (event) {
      const meta = await eventPageMeta(request, env, origin, event.did, event.rkey).catch(() => null);
      if (meta) return applyMeta(response, meta, false);
      // Defaults, but still a self canonical — the page exists even if the
      // lookup was slow.
      return applyMeta(
        response,
        { title: "", description: "", canonical: `${origin}${eventPath(event.did, event.rkey)}` },
        true,
      );
    }

    return applyMeta(response, { title: "", description: "", canonical: canonicalFor(path, origin) }, true);
  } catch (err) {
    console.warn("page meta rewrite skipped:", err instanceof Error ? err.message : err);
    return response;
  }
}

// ------------------------------------------------------------------ sitemap

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSitemap(origin: string, events: { did: string; rkey: string }[]): string {
  const urls = [
    ...SITEMAP_ROUTES.map((p) => `${origin}${p}`),
    ...events.map((e) => `${origin}${eventPath(e.did, e.rkey)}`),
  ];
  const unique = [...new Set(urls)];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    unique.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>\n`).join("") +
    `</urlset>\n`
  );
}

/** GET /sitemap.xml — static pages plus every upcoming public event. Never fails. */
export async function handleSitemap(
  request: Request,
  env: EventsEnv & { PUBLIC_BASE_URL?: string },
): Promise<Response> {
  const origin = originFor(env.PUBLIC_BASE_URL);
  let events: { did: string; rkey: string }[] = [];
  try {
    const listRequest = new Request(new URL("/api/events", request.url).toString());
    const res = await withTimeout(handleEventsList(listRequest, env, {}), META_TIMEOUT_MS * 2);
    if (res?.ok) {
      const data = (await res.json()) as { events?: { did?: unknown; rkey?: unknown }[] };
      events = (data.events ?? []).filter(
        (e): e is { did: string; rkey: string } => typeof e.did === "string" && typeof e.rkey === "string",
      );
    }
  } catch {
    // Static pages alone are still a valid sitemap.
  }
  return new Response(buildSitemap(origin, events), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${events.length ? 3600 : 300}`,
    },
  });
}
