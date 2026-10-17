import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));
const { session } = vi.hoisted(() => {
  const session = vi.fn();
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
  return { session };
});
vi.mock("./auth", async (original) => ({ ...(await original<typeof import("./auth")>()), currentSession: session }));

import worker from "./index";
import { newsletterMessage, renderNewsletterBody, newsletterPlainText } from "./newsletter";
import { checkImage, cleanAlt, ownImage, sniffImage, NEWSLETTER_IMAGE_MAX_BYTES } from "./newsletter-images";
import { testD1, testKV } from "./test-d1";

const BASE = "https://cohereboulder.org";
const SCENE = "did:plc:scene";

// ---------------------------------------------------------------- fixtures
// Header-only images: enough for the server, which reads the header and never decodes pixels.

function be32(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function png(width: number, height: number, padTo = 0) {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...[..."IHDR"].map((c) => c.charCodeAt(0)), ...be32(width), ...be32(height), 8, 2, 0, 0, 0, 0, 0, 0, 0];
  const out = new Uint8Array(Math.max(head.length, padTo));
  out.set(head);
  return out;
}
function jpeg(width: number, height: number) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 JFIF
    0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, // APP1 (Exif) — skipped over
    0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, // DQT
    0xff, 0xc2, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, // SOF2
    0xff, 0xd9,
  ]);
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
function webp(kind: "VP8 " | "VP8L" | "VP8X", width: number, height: number) {
  const b = new Uint8Array(40);
  b.set(ascii("RIFF"), 0);
  b.set(ascii("WEBP"), 8);
  b.set(ascii(kind), 12);
  if (kind === "VP8 ") {
    b.set([0x9d, 0x01, 0x2a], 23);
    b.set([width & 255, width >> 8, height & 255, height >> 8], 26);
  } else if (kind === "VP8L") {
    b[20] = 0x2f;
    const bits = (width - 1) | ((height - 1) << 14);
    b.set([bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255], 21);
  } else {
    const w = width - 1, h = height - 1;
    b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  }
  return b;
}

// ---------------------------------------------------------------- harness

let env: Parameters<typeof worker.fetch>[1] & { cohere: ReturnType<typeof testD1> };
beforeEach(() => {
  session.mockReset();
  session.mockResolvedValue({ email: "eileen@cohere.test", name: "Eileen", createdAt: "2026-01-01T00:00:00Z" });
  env = {
    cohere: testD1(["../schema.sql"]),
    COHERE_AUTH: testKV(),
    ADMIN_EMAIL_LOGIN: "true",
    PUBLIC_BASE_URL: BASE,
  } as unknown as typeof env;
});

function upload(body: BodyInit | null, type = "image/png", alt: string | null = "A circle by the creek", headers: Record<string, string> = {}) {
  const q = alt === null ? "" : `?alt=${encodeURIComponent(alt)}`;
  return worker.fetch(
    new Request(`${BASE}/api/admin/newsletters/images${q}`, {
      method: "POST",
      body,
      headers: { "Content-Type": type, Origin: BASE, ...headers },
    }),
    env,
  );
}
const get = (path: string, method = "GET") => worker.fetch(new Request(`${BASE}${path}`, { method }), env);
const rows = () => env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM newsletter_images").all()[0].n as number;

// ---------------------------------------------------------------- upload

describe("upload", () => {
  it("refuses a signed-out visitor and writes nothing", async () => {
    session.mockResolvedValue(null);
    expect((await upload(png(800, 600))).status).toBe(401);
    expect(rows()).toBe(0);
  });

  it("refuses a regenOS member below builder", async () => {
    env = { ...env, ADMIN_EMAIL_LOGIN: "false", REGENOS_BASE_URL: "https://regenos.test", REGENOS_COLLECTIVE_DID: SCENE, REGENOS_SERVICE_TOKEN: "svc" } as typeof env;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const u = String(input);
      if (u.includes("getSession")) return Response.json({ did: "did:plc:m", handle: "m.test", kind: "user" });
      if (u.includes("getSceneMembers")) return Response.json({ members: [{ did: "did:plc:m", handle: "m.test", role: "member" }] });
      return Response.json({}, { status: 404 });
    }));
    const res = await upload(png(800, 600), "image/png", "x", { Cookie: "__Host-rs_session=abc" });
    expect(res.status).toBe(403);
    expect(rows()).toBe(0);
    vi.unstubAllGlobals();
    vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
  });

  it("refuses a cross-site upload before auth", async () => {
    const res = await upload(png(800, 600), "image/png", "x", { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(rows()).toBe(0);
  });

  it.each(["image/svg+xml", "text/html", "application/octet-stream", "image/gif"])("rejects %s", async (type) => {
    const res = await upload(png(800, 600), type);
    expect(res.status).toBe(415);
    expect(rows()).toBe(0);
  });

  it("rejects bodies over 3 MB, including a dishonest Content-Length", async () => {
    expect((await upload(png(800, 600, NEWSLETTER_IMAGE_MAX_BYTES + 1))).status).toBe(413);
    expect((await upload(png(800, 600), "image/png", "x", { "Content-Length": String(NEWSLETTER_IMAGE_MAX_BYTES + 1) })).status).toBe(413);
    expect(rows()).toBe(0);
  });

  it("rejects bad magic bytes and a type that doesn't match the contents", async () => {
    const garbage = await upload(new TextEncoder().encode("<svg onload=alert(1)></svg>"), "image/png");
    expect(garbage.status).toBe(400);
    expect((await garbage.json()).error).toMatch(/isn't a JPEG, PNG or WebP/);
    const mismatch = await upload(jpeg(800, 600), "image/png");
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toMatch(/don't match/);
    expect((await upload(new Uint8Array(0))).status).toBe(400);
    expect(rows()).toBe(0);
  });

  it("rejects an image wider than 1200 px; 1200 is fine", async () => {
    const wide = await upload(png(1201, 600));
    expect(wide.status).toBe(400);
    expect((await wide.json()).error).toMatch(/1200 pixels wide \(this one is 1201\)/);
    expect((await upload(jpeg(4000, 3000), "image/jpeg")).status).toBe(400);
    expect((await upload(webp("VP8X", 2400, 1600), "image/webp")).status).toBe(400);
    expect((await upload(png(1200, 800))).status).toBe(200);
    expect(rows()).toBe(1);
  });

  it("requires alt text and keeps it to one bracket-free line", async () => {
    expect((await upload(png(800, 600), "image/png", null)).status).toBe(400);
    expect((await upload(png(800, 600), "image/png", "   ")).status).toBe(400);
    const res = await upload(png(800, 600), "image/png", "Two [friends]\n](javascript:x)");
    const d = await res.json();
    expect(d.alt).toBe("Two friends (javascript:x)"); // brackets and newline gone, so it can't close the ![…]
    expect(d.alt).not.toMatch(/[[\]\n]/);
    expect(d.markdown).toBe(`![${d.alt}](${d.url})`);
  });

  it("stores, then serves it publicly at a stable URL on PUBLIC_BASE_URL", async () => {
    const img = jpeg(1000, 750);
    const res = await upload(img, "image/jpeg", "Neighbours planting willows");
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.url).toMatch(/^https:\/\/cohereboulder\.org\/media\/newsletter\/[0-9a-f]{32}-1000x750\.jpg$/);
    expect(d).toMatchObject({ width: 1000, height: 750, mime: "image/jpeg", alt: "Neighbours planting willows" });
    const row = env.cohere.raw.prepare("SELECT created_by, bytes FROM newsletter_images").all()[0];
    expect(row).toEqual({ created_by: "eileen@cohere.test", bytes: img.length });

    const path = new URL(d.url).pathname;
    session.mockResolvedValue(null); // public: no session needed
    const served = await get(path);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/jpeg");
    expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(img);
    const head = await get(path, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe(String(img.length));

    // Any other name for it is a 404, not the SPA.
    for (const other of [path.replace("1000x750", "1000x751"), path.replace(".jpg", ".png"), path.replace(/[0-9a-f]{32}/, "0".repeat(32)), `${path}.html`, "/media/newsletter/%2e%2e%2fadmin", "/media/newsletter/x.jpg"]) {
      expect((await get(other)).status).toBe(404);
    }
  });

  it("splits a large image across rows and joins it back byte for byte", async () => {
    const big = png(1200, 900, 2_500_000);
    for (let i = 40; i < big.length; i++) big[i] = (i * 31) & 255;
    const d = await (await upload(big)).json();
    const chunks = env.cohere.raw.prepare("SELECT COUNT(*) AS n FROM newsletter_image_chunks WHERE image_id = ?").all(d.id)[0].n as number;
    expect(chunks).toBeGreaterThan(1);
    const served = await get(new URL(d.url).pathname);
    expect(Buffer.compare(Buffer.from(await served.arrayBuffer()), Buffer.from(big))).toBe(0);
  });

  it("GET on the upload route is not allowed", async () => {
    const res = await worker.fetch(new Request(`${BASE}/api/admin/newsletters/images`), env);
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------- sniffing

describe("sniffImage / checkImage", () => {
  it("reads width and height from JPEG, PNG and all three WebP headers", () => {
    expect(sniffImage(jpeg(640, 480))).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
    expect(sniffImage(png(1200, 1))).toEqual({ mime: "image/png", width: 1200, height: 1 });
    expect(sniffImage(webp("VP8 ", 300, 200))).toEqual({ mime: "image/webp", width: 300, height: 200 });
    expect(sniffImage(webp("VP8L", 1200, 900))).toEqual({ mime: "image/webp", width: 1200, height: 900 });
    expect(sniffImage(webp("VP8X", 1100, 4000))).toEqual({ mime: "image/webp", width: 1100, height: 4000 });
  });
  it("refuses truncated or foreign files", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(sniffImage(jpeg(10, 10).slice(0, 30))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a........................"))).toBeNull();
    expect(sniffImage(png(10, 10).slice(0, 20))).toBeNull();
  });
  it("checks size, type and height too", () => {
    expect(checkImage(png(10, 0), "image/png")).toMatchObject({ ok: false, status: 400 });
    expect(checkImage(png(1000, 6001), "image/png")).toMatchObject({ ok: false, status: 400 });
    expect(checkImage(png(1000, 800), "image/png; charset=binary")).toMatchObject({ ok: true });
    expect(checkImage(png(1000, 800), "toString")).toMatchObject({ ok: false, status: 415 });
  });
  it("cleanAlt trims and caps", () => {
    expect(cleanAlt("  a\tb  ")).toBe("a b");
    expect(cleanAlt("x".repeat(400))).toHaveLength(300);
  });
});

// ---------------------------------------------------------------- rendering

const OWN = `${BASE}/media/newsletter/${"a".repeat(32)}-1000x750.jpg`;
const SMALL = `/media/newsletter/${"b".repeat(32)}-300x200.png`;

describe("rendering our images", () => {
  it("emits <img> with an absolute URL, a width attribute and escaped alt for our own images only", () => {
    const html = renderNewsletterBody(
      [
        `![Willows <b>"planted"</b> & watered](${OWN})`,
        `![Logo](${SMALL})`,
        "![pixel](https://tracker.example/p.gif)",
        `![pixel](http://cohereboulder.org/media/newsletter/${"a".repeat(32)}-1000x750.jpg)`,
        `![wrong host](https://cohereboulder.org.evil.example/media/newsletter/${"a".repeat(32)}-1000x750.jpg)`,
        `![query](${OWN}?x=1)`,
        `![shape](${BASE}/media/newsletter/../../admin)`,
        `![attr](${OWN}" onerror="alert(1))`,
      ].join("\n\n"),
      BASE,
    );
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toContain(`src="${OWN}"`);
    expect(imgs[0]).toContain('width="472"'); // capped to the mail column
    expect(imgs[0]).toContain('alt="Willows &lt;b&gt;&quot;planted&quot;&lt;/b&gt; &amp; watered"');
    expect(imgs[0]).toContain("max-width:472px;height:auto");
    expect(imgs[1]).toContain(`src="${BASE}${SMALL}"`); // a relative path is made absolute
    expect(imgs[1]).toContain('width="300"');
    expect(html).not.toContain("tracker.example/p.gif\"");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("![pixel](https://tracker.example/p.gif)"); // left as visible text
  });

  it("uses the configured base, not the one in the text", () => {
    const staging = "https://cohere-signup-staging.unforced.workers.dev";
    expect(ownImage(OWN, staging)).toBeNull();
    expect(ownImage(SMALL, staging)?.url).toBe(`${staging}${SMALL}`);
    expect(renderNewsletterBody(`![x](${OWN})`, staging)).not.toContain("<img");
  });

  it("the plain-text part names the image and gives its URL", () => {
    const text = `Hello\n\n![Willows by the creek](${OWN})\n\n![t](https://tracker.example/p.gif)`;
    expect(newsletterPlainText(text, BASE)).toBe(`Hello\n\n[Image: Willows by the creek] ${OWN}\n\n![t](https://tracker.example/p.gif)`);
    const msg = newsletterMessage({ subject: "S", html: renderNewsletterBody(text, BASE), text }, `${BASE}/unsubscribe?token=t`, false, BASE);
    expect(msg.text).toContain(`[Image: Willows by the creek] ${OWN}`);
    expect(msg.html).toContain(`<img src="${OWN}"`);
  });

  it("the preview endpoint renders an inserted image", async () => {
    const res = await worker.fetch(
      new Request(`${BASE}/api/admin/newsletters/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: BASE },
        body: JSON.stringify({ subject: "Hi", text: `Before\n\n![Willows](${SMALL})` }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.html).toContain(`<img src="${BASE}${SMALL}" width="300" alt="Willows"`);
    expect(d.text).toContain(`[Image: Willows] ${BASE}${SMALL}`);
  });
});
