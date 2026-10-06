// Photos belong to this site, not regenOS. SIGNUPS keeps them separate from sessions.
import { purgeEventsCache } from "./regenos-service";

interface ImageMetadata { contentType: string; updated: string }
export interface EventImagesEnv { SIGNUPS?: KVNamespace; REGENOS_COLLECTIVE_DID?: string }
const PREFIX = "event-image:";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const keyFor = (did: string, rkey: string) => `${PREFIX}${encodeURIComponent(did)}|${encodeURIComponent(rkey)}`;
export function imageUrl(did: string, rkey: string, version?: string): string | null {
  return version ? `/api/event-image/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}?v=${encodeURIComponent(version)}` : null;
}

// list returns metadata with the keys: no binary reads and no shared mutable index.
export async function imageVersions(env: EventImagesEnv): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  if (!env.SIGNUPS) return versions;
  let cursor: string | undefined;
  do {
    const page = await env.SIGNUPS.list<ImageMetadata>({ prefix: PREFIX, cursor });
    for (const key of page.keys) {
      if (key.metadata && TYPES.has(key.metadata.contentType)) versions.set(key.name, key.metadata.updated);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return versions;
}
export function eventImageUrl(versions: Map<string, string>, did: string, rkey: string): string | null {
  return imageUrl(did, rkey, versions.get(keyFor(did, rkey)));
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Called only after the portal's session gate. */
export async function handleAdminEventImage(request: Request, env: EventImagesEnv, did: string, rkey: string): Promise<Response> {
  if (!env.SIGNUPS || !env.REGENOS_COLLECTIVE_DID) return json({ error: "Event photos aren't configured." }, 503);
  if (did !== env.REGENOS_COLLECTIVE_DID.trim()) return json({ error: "only COhere's own events can be edited here" }, 400);
  if (!rkey || rkey.includes("/") || rkey.includes("|")) return json({ error: "Invalid event key." }, 400);
  const key = keyFor(did, rkey);
  let url: string | null = null;
  if (request.method === "DELETE") {
    await env.SIGNUPS.delete(key);
  } else {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!TYPES.has(contentType)) return json({ error: "Use a JPEG, PNG, or WebP image." }, 400);
    if (Number(request.headers.get("Content-Length")) > MAX_BYTES) return json({ error: "Event photos must be at most 2 MB." }, 413);
    // Bound memory even when Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Choose an image to upload." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return json({ error: "Event photos must be at most 2 MB." }, 413); }
      chunks.push(value);
    }
    if (!size) return json({ error: "Choose an image to upload." }, 400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const updated = `${Date.now()}-${crypto.randomUUID()}`;
    await env.SIGNUPS.put(key, bytes.buffer, { metadata: { contentType, updated } });
    url = imageUrl(did, rkey, updated);
  }
  await purgeEventsCache(new URL(request.url));
  return json({ ok: true, imageUrl: url });
}

export async function handleEventImage(request: Request, env: EventImagesEnv, did: string, rkey: string): Promise<Response> {
  const stored = await env.SIGNUPS?.getWithMetadata<ImageMetadata>(keyFor(did, rkey), "arrayBuffer");
  if (!stored?.value || !stored.metadata || !TYPES.has(stored.metadata.contentType)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const etag = `"${stored.metadata.updated}"`;
  const headers = { "Content-Type": stored.metadata.contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300", ETag: etag };
  return request.headers.get("If-None-Match") === etag
    ? new Response(null, { status: 304, headers }) : new Response(stored.value, { headers });
}
