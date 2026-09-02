// A tiny stand-in for the regenOS AppView, for exercising the sign-in and
// event-hosting lane WITHOUT touching scenius.social — beginSignup against
// prod would email a real inbox and mint real state.
//
// Point the Worker at it and flip the flag:
//   node scripts/regenos-mock.mjs &                       # listens on :9944
//   npx wrangler dev --port 8787 \
//     --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//
// It mimics the AppView's real contracts (onboarding.rs / event.rs / auth_routes.rs):
//   * `__Host-` cookies with Secure + Path=/ + HttpOnly — the browser will
//     only store them if the proxy relays Set-Cookie verbatim, which is the
//     point of the whole exercise.
//   * createCustodialAccount answers with TWO Set-Cookie headers (session +
//     pending-clear), so a proxy that coalesces them fails visibly.
//   * verifyEmail (the returning-user link) answers `302 Location: /` WITH
//     the session cookie — the 3xx-passthrough proof.
//   * getSession echoes the Origin / Sec-Fetch-Site / Cookie it received back
//     as x-mock-saw-* response headers, so a curl through the proxy can prove
//     the browser's own headers survive the hop — and that the caller's own
//     `cohere_session` does NOT. It also answers with a hostile
//     `Set-Cookie: cohere_session=…`, which the proxy must drop.
//
// Fixed tokens: /login?token=tok-good (new user), verifyEmail?token=tok-return.

import http from "node:http";

const PORT = Number(process.env.PORT ?? 9944);
const SCENE_DID = "did:plc:mockscene";
const USER_DID = "did:plc:mockuser";
const USER_HANDLE = "tester.mock.test";
const SESSION_COOKIE = "__Host-rs_session";
const PENDING_COOKIE = "__Host-rs_pending";

const COOKIE_ATTRS = "Path=/; Secure; HttpOnly; SameSite=Lax";

/** The mock calendar: starts with one scene-authored future event. */
const events = new Map();
function seedEvent() {
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  events.set("ev-seed1", {
    uri: `at://${SCENE_DID}/community.lexicon.calendar.event/ev-seed1`,
    value: {
      name: "Seed Gathering",
      description: "The event that was already on the calendar.",
      createdAt: new Date().toISOString(),
      startsAt,
      mode: "community.lexicon.calendar.event#inperson",
      locations: [
        {
          $type: "community.lexicon.location.address",
          name: "Mock Hall",
          street: "100 Mock St",
          locality: "Boulder",
          region: "CO",
          postalCode: "80302",
          country: "US",
        },
      ],
    },
  });
}
seedEvent();

function hasCookie(req, name) {
  return (req.headers.cookie ?? "").split(";").some((p) => p.trim().startsWith(`${name}=`));
}

function json(res, status, data, extraHeaders = []) {
  res.writeHead(status, [["content-type", "application/json"], ...extraHeaders]);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function recordFromInput(rkey, input) {
  const anyAddress =
    input.placeName || input.street || input.locality || input.region || input.postalCode;
  return {
    uri: `at://${input.authority ?? USER_DID}/community.lexicon.calendar.event/${rkey}`,
    value: {
      name: input.name,
      description: input.description,
      createdAt: new Date().toISOString(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      mode: input.mode ? `community.lexicon.calendar.event#${input.mode}` : undefined,
      locations: anyAddress
        ? [
            {
              $type: "community.lexicon.location.address",
              name: input.placeName,
              street: input.street,
              locality: input.locality,
              region: input.region,
              postalCode: input.postalCode,
              country: input.country,
            },
          ]
        : [],
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const nsid = url.pathname.replace(/^\/xrpc\//, "");
  const signedIn = hasCookie(req, SESSION_COOKIE);
  const pending = hasCookie(req, PENDING_COOKIE);
  console.log(`${req.method} ${url.pathname}${url.search} signedIn=${signedIn} pending=${pending}`);

  switch (nsid) {
    case "social.scenius.getEvents": {
      return json(res, 200, { scene: SCENE_DID, events: [...events.values()] });
    }

    case "social.scenius.getSession": {
      const headers = [
        ["x-mock-saw-origin", req.headers.origin ?? "(none)"],
        ["x-mock-saw-sec-fetch-site", req.headers["sec-fetch-site"] ?? "(none)"],
        // The cookie tripwire, outbound: whatever the proxy chose to forward.
        // The site's own `cohere_session` (admin portal, Path=/) must NEVER
        // appear here — a real AppView would be a third party.
        ["x-mock-saw-cookie", req.headers.cookie ?? "(none)"],
        // ...and inbound: a hostile upstream trying to plant a cookie on the
        // calling origin. The proxy must drop anything that isn't `__Host-rs_`.
        ["set-cookie", `cohere_session=mock-hijack; ${COOKIE_ATTRS}`],
      ];
      if (signedIn) return json(res, 200, { did: USER_DID, handle: USER_HANDLE, kind: "user" }, headers);
      return json(res, 200, {}, headers);
    }

    case "social.scenius.beginSignup": {
      const body = await readBody(req);
      const returning = String(body.email ?? "").includes("returning");
      return json(
        res,
        200,
        { stage: "checkEmail", returningUser: returning },
        [["set-cookie", `${PENDING_COOKIE}=pend-1; ${COOKIE_ATTRS}`]],
      );
    }

    case "social.scenius.verifySignup": {
      if (!pending) return json(res, 400, { error: "InvalidRequest", message: "no pending signup in progress" });
      if (url.searchParams.get("token") !== "tok-good") {
        return json(res, 400, { error: "InvalidRequest", message: "this sign-in link is invalid or already used" });
      }
      return json(res, 200, { stage: "chooseHandle" });
    }

    case "social.scenius.setSignupProfile": {
      if (!pending) return json(res, 401, { error: "AuthRequired", message: "no pending signup in progress" });
      const body = await readBody(req);
      if (body.handle === "taken") {
        return json(res, 409, { error: "HandleTaken", message: "taken was just taken — try taken2" });
      }
      return json(res, 200, { stage: "ready", handle: `${body.handle}.mock.test` });
    }

    case "social.scenius.createCustodialAccount": {
      if (!pending) return json(res, 401, { error: "AuthRequired", message: "no pending signup in progress" });
      // TWO Set-Cookie headers on purpose — the coalescing-proxy tripwire.
      return json(res, 200, { handle: USER_HANDLE, did: USER_DID }, [
        ["set-cookie", `${SESSION_COOKIE}=sess-1; ${COOKIE_ATTRS}`],
        ["set-cookie", `${PENDING_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`],
      ]);
    }

    case "social.scenius.verifyEmail": {
      // The RETURNING user's emailed link: a top-level navigation that must
      // reach the browser as a 302 + cookie, straight through the proxy.
      if (url.searchParams.get("token") !== "tok-return") {
        return json(res, 400, { error: "InvalidRequest", message: "this sign-in link is invalid or already used" });
      }
      res.writeHead(302, [
        ["location", "/"],
        ["set-cookie", `${SESSION_COOKIE}=sess-1; ${COOKIE_ATTRS}`],
      ]);
      return res.end();
    }

    case "social.scenius.logout": {
      return json(res, 200, { ok: true }, [
        ["set-cookie", `${SESSION_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`],
      ]);
    }

    case "social.scenius.createEvent":
    case "social.scenius.updateEvent": {
      if (!signedIn) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (String(input.name ?? "").includes("forbidden")) {
        return json(res, 403, { error: "Forbidden", message: "only a Builder of the collective may edit an event" });
      }
      events.set(input.rkey, recordFromInput(input.rkey, input));
      return json(res, 200, {
        eventUri: `at://${input.authority ?? USER_DID}/community.lexicon.calendar.event/${input.rkey}`,
        eventCid: "bafymock",
        audience: "public",
        visibility: "public",
      });
    }

    case "social.scenius.deleteEvent": {
      if (!signedIn) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      events.delete(input.rkey);
      return json(res, 200, { ok: true });
    }

    default:
      return json(res, 404, { error: "NotFound" });
  }
});

// Node closes idle keep-alive sockets after 5s by default, and the Worker
// runtime pools its outbound connections — a step of the wizard that lands a
// few seconds after the previous one then races a socket the mock is closing
// and surfaces as a spurious 502. Real AppViews sit behind far longer idle
// timeouts; keep the mock from manufacturing a flake the code doesn't have.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`regenOS mock listening on http://127.0.0.1:${PORT} (scene ${SCENE_DID})`);
});
