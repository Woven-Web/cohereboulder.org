// Newsletter images: an organizer uploads a photo in /admin's Newsletter
// composer, and the body gets a `![alt](<base>/media/newsletter/<name>)` line
// that the renderer (newsletter.ts) turns into an <img>. The image is served
// publicly from this origin, because email clients fetch it with no session.
//
//   POST /api/admin/newsletters/images?alt=…   raw image body   (admin gate, in index.ts)
//   GET  /media/newsletter/<id>-<w>x<h>.<ext>                   (public, immutable)
//
// Storage follows the harvest photo pattern (D1, base64 text, no R2), split
// into chunks: D1 caps a row at 2 MB and a 3 MB image is 4 MB of base64.
// The browser shrinks the image to ≤ 1200 px wide and re-encodes it (which
// also drops EXIF, including GPS); the server re-checks everything anyway:
// type by magic bytes, size, and the pixel width read from the file header.
//
// The width and height are in the file name so the renderer, which is pure,
// can write a width attribute without a database read. The name must match
// the stored row exactly or the route answers 404.

export interface NewsletterImagesEnv {
  cohere: D1Database;
  PUBLIC_BASE_URL?: string;
}

export const NEWSLETTER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const NEWSLETTER_IMAGE_MAX_WIDTH = 1200;
export const NEWSLETTER_IMAGE_MAX_HEIGHT = 6000;
export const NEWSLETTER_IMAGE_ALT_MAX = 300;
/** base64 characters per D1 row: well under D1's 2 MB row limit, and about the size harvest photos already store. */
const CHUNK_CHARS = 500_000;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
const EXT: Record<ImageMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, ImageMime> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const TYPES = new Set<string>(Object.keys(EXT));

export const MEDIA_PREFIX = "/media/newsletter/";
/** <32 hex id>-<width>x<height>.<ext> */
export const IMAGE_NAME_RE = /^([0-9a-f]{32})-([1-9][0-9]{0,4})x([1-9][0-9]{0,4})\.(jpg|png|webp)$/;

export function imageName(id: string, width: number, height: number, mime: ImageMime): string {
  return `${id}-${width}x${height}.${EXT[mime]}`;
}

export interface OwnImage {
  /** Absolute URL on `base`. */
  url: string;
  width: number;
  height: number;
}

/**
 * An image reference from a newsletter body → our own image, or null. Accepts
 * the path alone or the path on exactly `base`; anything else (another host,
 * a query string, a different shape) is not ours and must not become an <img>.
 */
export function ownImage(src: string, base: string): OwnImage | null {
  const root = base.replace(/\/$/, "");
  let path: string;
  if (src.startsWith(MEDIA_PREFIX)) path = src;
  else if (src.startsWith(root + MEDIA_PREFIX)) path = src.slice(root.length);
  else return null;
  const name = path.slice(MEDIA_PREFIX.length);
  const match = IMAGE_NAME_RE.exec(name);
  if (!match) return null;
  return { url: `${root}${MEDIA_PREFIX}${name}`, width: Number(match[2]), height: Number(match[3]) };
}

// ------------------------------------------------------------ validation

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** The type by magic bytes and the pixel size from the header, or null if it isn't a JPEG/PNG/WebP we can read. */
export function sniffImage(b: Uint8Array): ImageInfo | null {
  // PNG: signature, then IHDR must be the first chunk.
  if (b.length >= 24 && u32be(b, 0) === 0x89504e47 && u32be(b, 4) === 0x0d0a1a0a) {
    if (ascii(b, 12, 4) !== "IHDR") return null;
    return { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  // JPEG: SOI, then walk the marker segments to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; } // fill byte
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan data before any frame
      const length = u16be(b, i + 2);
      if (length < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        if (i + 9 > b.length) return null;
        return { mime: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
      }
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF container, then a VP8 / VP8L / VP8X first chunk.
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return { mime: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      if (b[20] !== 0x2f) return null;
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return { mime: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    }
    return null;
  }
  return null;
}

export type ImageCheck = { ok: true; info: ImageInfo } | { ok: false; status: number; error: string };

/** Every server-side rule an upload must pass. `declared` is the request's Content-Type. */
export function checkImage(bytes: Uint8Array, declared: string): ImageCheck {
  const type = declared.split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) return { ok: false, status: 415, error: "Use a JPEG, PNG or WebP image." };
  if (bytes.length === 0) return { ok: false, status: 400, error: "Choose an image to upload." };
  if (bytes.length > NEWSLETTER_IMAGE_MAX_BYTES) return { ok: false, status: 413, error: "Images must be at most 3 MB." };
  const info = sniffImage(bytes);
  if (!info) return { ok: false, status: 400, error: "That file isn't a JPEG, PNG or WebP image we can read." };
  if (info.mime !== type) return { ok: false, status: 400, error: "The file's contents don't match its type." };
  if (!info.width || !info.height) return { ok: false, status: 400, error: "That image has no size." };
  if (info.width > NEWSLETTER_IMAGE_MAX_WIDTH) {
    return { ok: false, status: 400, error: `Images must be at most ${NEWSLETTER_IMAGE_MAX_WIDTH} pixels wide (this one is ${info.width}).` };
  }
  if (info.height > NEWSLETTER_IMAGE_MAX_HEIGHT) {
    return { ok: false, status: 400, error: `Images must be at most ${NEWSLETTER_IMAGE_MAX_HEIGHT} pixels tall.` };
  }
  return { ok: true, info };
}

/** Alt text as it can sit inside `![…]`: one line, no brackets, trimmed, capped. */
export function cleanAlt(raw: string | null): string {
  return (raw ?? "")
    .replace(/[[\]\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, NEWSLETTER_IMAGE_ALT_MAX)
    .trim();
}

// ---------------------------------------------------------------- base64

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- routes

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Read at most `max` bytes; null if the body is longer (Content-Length may be absent or wrong). */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("Content-Length")) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** POST /api/admin/newsletters/images?alt=… — the caller has already passed the admin gate. */
export async function handleNewsletterImageUpload(
  request: Request,
  env: NewsletterImagesEnv,
  url: URL,
  createdBy: string,
  now: Date = new Date(),
): Promise<Response> {
  const alt = cleanAlt(url.searchParams.get("alt"));
  if (!alt) return json({ error: "Describe the image first (alt text) — it's what people hear or see when images are off." }, 400);
  const declared = request.headers.get("Content-Type") ?? "";
  if (!TYPES.has(declared.split(";")[0].trim().toLowerCase())) {
    return json({ error: "Use a JPEG, PNG or WebP image." }, 415);
  }
  const bytes = await readCapped(request, NEWSLETTER_IMAGE_MAX_BYTES);
  if (!bytes) return json({ error: "Images must be at most 3 MB." }, 413);
  const check = checkImage(bytes, declared);
  if (!check.ok) return json({ error: check.error }, check.status);
  const { mime, width, height } = check.info;

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const id = [...idBytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  const data = toBase64(bytes);
  const statements = [
    env.cohere
      .prepare(
        `INSERT INTO newsletter_images (id, mime, width, height, bytes, alt, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(id, mime, width, height, bytes.length, alt, createdBy, now.toISOString()),
  ];
  for (let seq = 0, at = 0; at < data.length; seq++, at += CHUNK_CHARS) {
    statements.push(
      env.cohere
        .prepare("INSERT INTO newsletter_image_chunks (image_id, seq, data) VALUES (?1, ?2, ?3)")
        .bind(id, seq, data.slice(at, at + CHUNK_CHARS)),
    );
  }
  await env.cohere.batch(statements);

  const base = (env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
  const src = `${base}${MEDIA_PREFIX}${imageName(id, width, height, mime)}`;
  return json({ id, url: src, width, height, mime, alt, markdown: `![${alt}](${src})` }, 200);
}

const NOT_FOUND = () =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });

/** GET|HEAD /media/newsletter/<name> — public: email clients fetch it with no session. */
export async function handleNewsletterImage(request: Request, env: NewsletterImagesEnv, name: string): Promise<Response> {
  const match = IMAGE_NAME_RE.exec(name);
  if (!match) return NOT_FOUND();
  const [, id, w, h, ext] = match;
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const keyUrl = new URL(request.url);
  keyUrl.search = "";
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
  }
  const row = await env.cohere
    .prepare("SELECT mime, width, height FROM newsletter_images WHERE id = ?1")
    .bind(id)
    .first<{ mime: string; width: number; height: number }>();
  if (!row || MIME_BY_EXT[ext] !== row.mime || String(row.width) !== w || String(row.height) !== h) return NOT_FOUND();
  const { results } = await env.cohere
    .prepare("SELECT data FROM newsletter_image_chunks WHERE image_id = ?1 ORDER BY seq")
    .bind(id)
    .all<{ data: string }>();
  if (!results.length) return NOT_FOUND();
  const bytes = fromBase64(results.map((r) => r.data).join(""));
  const headers = {
    "Content-Type": row.mime,
    "Content-Length": String(bytes.length),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  const response = new Response(bytes, { status: 200, headers });
  if (cache) await cache.put(cacheKey, response.clone());
  return request.method === "HEAD" ? new Response(null, { status: 200, headers }) : response;
}
