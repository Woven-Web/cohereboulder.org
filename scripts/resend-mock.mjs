// A stand-in for Resend's POST /emails, so the newsletter lane can be tested
// end to end without sending a single real email.
//
//   PORT=9960 node scripts/resend-mock.mjs
//   npx wrangler dev --var RESEND_API_BASE:http://127.0.0.1:9960 --var RESEND_API_KEY:mock-key
//
// It mirrors the parts of Resend's contract the Worker depends on:
//   * Authorization: Bearer <key> is required (401 otherwise; the key must be
//     `mock-key`, so a misconfigured Worker fails loudly);
//   * Idempotency-Key: a repeated key answers the original id and is NOT
//     delivered twice — the same guarantee Resend gives for 24 hours;
//   * `from`, `to` (array), `subject`, and `html` or `text` are required (422).
//
// Inspection (test-only, not part of Resend's API):
//   GET  /_messages   → { messages: [...], requests: n }  delivered messages,
//                       plus the count of POSTs including idempotent repeats
//   POST /_reset      → forget everything

import http from "node:http";

const port = Number(process.env.PORT ?? 9960);
let messages = [];
let requests = 0;
const byKey = new Map();

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/_messages") return send(res, 200, { messages, requests });
    if (req.method === "POST" && req.url === "/_reset") {
      messages = [];
      requests = 0;
      byKey.clear();
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/emails") {
      requests += 1;
      if (req.headers.authorization !== "Bearer mock-key") {
        return send(res, 401, { statusCode: 401, name: "missing_api_key", message: "Missing API key" });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 422, { statusCode: 422, name: "validation_error", message: "invalid JSON" });
      }
      if (!body.from || !Array.isArray(body.to) || !body.to.length || !body.subject || !(body.html || body.text)) {
        return send(res, 422, { statusCode: 422, name: "validation_error", message: "missing field" });
      }
      const key = req.headers["idempotency-key"];
      if (key && byKey.has(key)) return send(res, 200, { id: byKey.get(key) });
      const id = `mock_${messages.length + 1}`;
      if (key) byKey.set(key, id);
      messages.push({ id, idempotencyKey: key ?? null, ...body });
      return send(res, 200, { id });
    }
    send(res, 404, { error: "not found" });
  });
});

server.listen(port, "127.0.0.1", () => console.log(`resend mock on :${port}`));
