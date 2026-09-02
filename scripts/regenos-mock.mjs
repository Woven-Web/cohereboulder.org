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
// It ALSO stands in for the admin lane the site drives server-side with its
// own agent token (worker/src/regenos-service.ts):
//   * createEvent / updateEvent / deleteEvent / getSceneMembers /
//     setMembership / revokeMembership / proposeInvite accept EITHER a browser
//     session cookie (the on-site host flow) or `Authorization: Bearer
//     mock-token`. Any other bearer is refused the way production refuses an
//     out-of-scope one: `NotAuthorized … (scope check)`. That is the tripwire
//     for a Worker that ships with the wrong secret.
//   * getEventAttendance answers ANONYMOUSLY, because production refuses that
//     method to the agent token — a Worker that "helpfully" sends the bearer
//     on a read would still pass here, so the reads are checked too: any
//     bearer on getEvents / getEventAttendance is a hard 403.
//   * proposeInvite answers with a raw invite token, so an end-to-end test can
//     prove the Worker never passes it back to the browser.
//
// Fixed tokens: /login?token=tok-good (new user), verifyEmail?token=tok-return,
// and `mock-token` as the site's service credential.

import http from "node:http";

const PORT = Number(process.env.PORT ?? 9944);
const SCENE_DID = "did:plc:mockscene";
const USER_DID = "did:plc:mockuser";
const USER_HANDLE = "tester.mock.test";
const SESSION_COOKIE = "__Host-rs_session";
const PENDING_COOKIE = "__Host-rs_pending";

const COOKIE_ATTRS = "Path=/; Secure; HttpOnly; SameSite=Lax";

/** The one bearer this mock honours — stand-in for REGENOS_SERVICE_TOKEN. */
const SERVICE_TOKEN = "mock-token";
const SERVICE_DID = "did:plc:mockservice";

/** The seeded roster: the site's own identity, its minter, and one builder. */
const members = new Map([
  [SERVICE_DID, { did: SERVICE_DID, handle: "cohere-site.scenius.social", kind: "person", name: null, role: "steward" }],
  ["did:plc:mockji", { did: "did:plc:mockji", handle: "claudeji.scenius.social", kind: "person", name: null, role: "steward" }],
  ["did:plc:mockbuilder", { did: "did:plc:mockbuilder", handle: "rosa.mock.test", kind: "person", name: "Rosa Mock", role: "builder" }],
]);

/** Seeded RSVPs, keyed by rkey. Counts plus CONFIRMED guests, as production. */
const attendance = new Map();
function seedAttendance(rkey) {
  attendance.set(rkey, {
    confirmed: 2,
    waitlisted: 0,
    requested: 1,
    maxAttendees: null,
    attendance: "open",
    guests: [
      { did: "did:plc:mockguest1", handle: "ana.mock.test" },
      { did: "did:plc:mockguest2", handle: null },
    ],
  });
}

function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/** Production's exact refusal for an out-of-scope method on a valid token. */
const SCOPE_ERROR = {
  error: "NotAuthorized",
  message: "this token is not authorized for this method (scope check)",
};

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
  const wasAt = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  events.set("ev-seed0", {
    uri: `at://${SCENE_DID}/community.lexicon.calendar.event/ev-seed0`,
    value: {
      name: "Last Month's Potluck",
      description: "Already happened — the admin list keeps it, /api/events drops it.",
      createdAt: wasAt,
      startsAt: wasAt,
      endsAt: new Date(Date.now() - 21 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
      mode: "community.lexicon.calendar.event#inperson",
      locations: [
        {
          $type: "community.lexicon.location.address",
          name: "The Old Barn",
          locality: "Boulder",
          region: "CO",
          country: "US",
        },
      ],
    },
  });
  seedAttendance("ev-seed1");
  seedAttendance("ev-seed0");
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

/** Methods the SERVICE TOKEN is refused on upstream — reads must stay anonymous. */
const ANON_ONLY = new Set([
  "social.scenius.getEvents",
  "social.scenius.getEvent",
  "social.scenius.getEventAttendance",
]);

/** What the last proposeInvite carried, for the e2e script to inspect. */
let lastInvite = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const nsid = url.pathname.replace(/^\/xrpc\//, "");
  const signedIn = hasCookie(req, SESSION_COOKIE);
  const pending = hasCookie(req, PENDING_COOKIE);
  const token = bearer(req);
  // A bearer that isn't the service token is refused exactly the way
  // production refuses one that lacks the scope.
  if (token !== null && token !== SERVICE_TOKEN) {
    return json(res, 403, SCOPE_ERROR);
  }
  // ...and these two REFUSE the service token even when it is valid, which is
  // how production behaves. The Worker must read them anonymously.
  if (token === SERVICE_TOKEN && ANON_ONLY.has(nsid)) {
    return json(res, 403, SCOPE_ERROR);
  }
  const asService = token === SERVICE_TOKEN;
  console.log(`${req.method} ${url.pathname}${url.search} signedIn=${signedIn} pending=${pending}`);

  switch (nsid) {
    case "social.scenius.getEvents": {
      const rows = [...events.values()].map((e) => ({ ...e, hostName: "COhere Boulder" }));
      return json(res, 200, { scene: SCENE_DID, events: rows });
    }

    case "social.scenius.getEventAttendance": {
      const rkey = url.searchParams.get("eventRkey") ?? "";
      const seats = attendance.get(rkey);
      if (!seats) return json(res, 404, { error: "NotFound", message: "no such event" });
      return json(res, 200, seats);
    }

    case "social.scenius.getSceneMembers": {
      // Anonymous callers get the roster without the viewer flag; a bearer
      // call also learns whether the caller is a steward.
      return json(res, 200, {
        members: [...members.values()],
        steward: asService,
      });
    }

    case "social.scenius.setMembership": {
      if (!asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      const existing = members.get(input.member);
      if (!existing) {
        return json(res, 404, { error: "NotFound", message: "that person is not a member" });
      }
      members.set(input.member, { ...existing, role: input.role });
      return json(res, 200, { ok: true, role: input.role });
    }

    case "social.scenius.revokeMembership": {
      if (!asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (!members.has(input.member)) {
        return json(res, 404, { error: "NotFound", message: "that person is not a member" });
      }
      members.delete(input.member);
      return json(res, 200, { ok: true });
    }

    case "social.scenius.proposeInvite": {
      if (!asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (!String(input.inviteeEmail ?? "").includes("@")) {
        return json(res, 400, { error: "InvalidRequest", message: "an invite needs an email address" });
      }
      lastInvite = { email: input.inviteeEmail, confersRole: input.confersRole, origin: input.origin };
      // The raw redemption token, exactly as production answers. The Worker
      // must swallow it — scripts/admin-events-e2e.mjs asserts it never
      // reaches the browser.
      return json(res, 200, {
        status: "sent",
        placeholderId: "x",
        token: "mock-invite-token",
      });
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
      if (!signedIn && !asService) {
        return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      }
      const input = await readBody(req);
      if (String(input.name ?? "").includes("forbidden")) {
        return json(res, 403, { error: "Forbidden", message: "only a Builder of the collective may edit an event" });
      }
      events.set(input.rkey, recordFromInput(input.rkey, input));
      // The seat config lives in a sibling record; getEvents never carries it,
      // so the site can only read it back through getEventAttendance.
      const seats = attendance.get(input.rkey) ?? {
        confirmed: 0, waitlisted: 0, requested: 0, guests: [],
      };
      attendance.set(input.rkey, {
        ...seats,
        maxAttendees: input.maxAttendees ?? null,
        attendance: input.attendance ?? seats.attendance ?? "open",
      });
      return json(res, 200, {
        eventUri: `at://${input.authority ?? USER_DID}/community.lexicon.calendar.event/${input.rkey}`,
        eventCid: "bafymock",
        audience: "public",
        visibility: "public",
      });
    }

    case "social.scenius.deleteEvent": {
      if (!signedIn && !asService) {
        return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      }
      const input = await readBody(req);
      events.delete(input.rkey);
      attendance.delete(input.rkey);
      return json(res, 200, { deleted: true });
    }

    // A peephole for the e2e script: what the last proposeInvite actually
    // carried upstream. Not an AppView method — deliberately outside /xrpc.
    case "/__lastInvite": {
      return json(res, 200, lastInvite ?? {});
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
