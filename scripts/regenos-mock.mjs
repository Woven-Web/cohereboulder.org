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
// Organizer-gate personas (worker/src/admin-gate.ts) — set the
// `__Host-rs_session` cookie to one of these values:
//   sess-steward  sam.mock.test   steward  (no contact email on file)
//   sess-builder  rosa.mock.test  builder  (verified contact email rosa@cohere.test)
//   sess-member   mel.mock.test   member
//   sess-outsider otto.mock.test  signed in, not on the roster at all
//   sess-expired  getSession answers {} (a lapsed session)
//   sess-registrant reg.mock.test  signed in, verified email reg@cohere.test, NOT on
//                 the roster (registration editing + AUTO_MEMBER_ON_SIGNIN)
// MOCK_SETMEMBERSHIP_ADDS=1 lets setMembership add someone not yet on the roster
// (unset, it answers 404 as before — whether production adds is unverified).
// Peepholes (not AppView methods): /__setRole?did=…&role=… changes a roster
// role (role=none removes it), /__expire?token=…&on=1|0 expires or restores a
// session, and /__sawCookies lists every Cookie header the mock was sent.
//
// Fixed tokens: /login?token=tok-good (new user), verifyEmail?token=tok-return,
// and `mock-token` as the site's service credential.

import { readFileSync } from "node:fs";
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
const PEER_DID = "did:plc:mockpeer";
const PEER_HANDLE = "pia.mock.test";
const OUTSIDER_DID = "did:plc:mockoutsider";
const OUTSIDER_HANDLE = "ollie.mock.test";
const STEWARD_DID = "did:plc:mockji";
const members = new Map([
  [SERVICE_DID, { did: SERVICE_DID, handle: "cohere-site.scenius.social", kind: "person", name: null, role: "steward" }],
  ["did:plc:mockji", { did: "did:plc:mockji", handle: "claudeji.scenius.social", kind: "person", name: null, role: "steward" }],
  ["did:plc:mockbuilder", { did: "did:plc:mockbuilder", handle: "rosa.mock.test", kind: "person", name: "Rosa Mock", role: "builder" }],
  [USER_DID, { did: USER_DID, handle: USER_HANDLE, kind: "person", name: null, role: "builder" }],
  [PEER_DID, { did: PEER_DID, handle: PEER_HANDLE, kind: "person", name: "Pia Mock", role: "member" }],
  ["did:plc:mocksteward", { did: "did:plc:mocksteward", handle: "sam.mock.test", kind: "person", name: "Sam Mock", role: "steward" }],
  ["did:plc:mockmember", { did: "did:plc:mockmember", handle: "mel.mock.test", kind: "person", name: "Mel Mock", role: "member" }],
]);

/** Session cookie value → who it is. Anything else is the default mock user. */
const PERSONAS = {
  "sess-steward": { did: "did:plc:mocksteward", handle: "sam.mock.test" },
  "sess-builder": { did: "did:plc:mockbuilder", handle: "rosa.mock.test", email: "rosa@cohere.test" },
  "sess-member": { did: "did:plc:mockmember", handle: "mel.mock.test" },
  "sess-outsider": { did: "did:plc:mockoutsider", handle: "otto.mock.test" },
  "sess-registrant": { did: "did:plc:mockregistrant", handle: "reg.mock.test", email: "reg@cohere.test" },
};
const expiredSessions = new Set(["sess-expired"]);
const sawCookies = [];

function sessionToken(req) {
  const m = /(?:^|;\s*)__Host-rs_session=([^;]*)/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}

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

/**
 * Who a `__Host-rs_session` cookie names. Any value is the default mock user
 * (sess-1, mock-member, ...); these name the other people the members-area
 * lanes need: a fellow member, a steward-authored session, and a signed-in
 * person who is NOT on the collective's roster.
 */
const SESSION_PEOPLE = {
  "mock-peer": { did: PEER_DID, handle: PEER_HANDLE },
  "mock-steward": { did: STEWARD_DID, handle: "claudeji.scenius.social" },
  "mock-outsider": { did: OUTSIDER_DID, handle: OUTSIDER_HANDLE },
  // Rosa: on the roster, and with only a PUBLIC profile (the publicFallback case).
  "mock-builder": { did: "did:plc:mockbuilder", handle: "rosa.mock.test" },
};
function sessionPerson(req) {
  const value = sessionToken(req);
  if (value === null || expiredSessions.has(value)) return null;
  return PERSONAS[value] ?? SESSION_PEOPLE[value] ?? { did: USER_DID, handle: USER_HANDLE };
}

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

/**
 * The signed-in mock user's own RSVPs, keyed by rkey → seat state. Read back
 * as getEventAttendance.mySeat (auth-only upstream: anonymous ⇒ null).
 */
const mySeats = new Map(); // `${did}|${rkey}` → seat state, one entry per signed-in person
const seatKey = (req, rkey) => `${sessionPerson(req)?.did ?? ""}|${rkey}`;
/** Confirmed guests: the seeded ones plus every signed-in person holding a confirmed seat. */
function guestsFor(rkey, seeded) {
  const out = [...seeded];
  for (const [key, state] of mySeats) {
    const [did, seatRkey] = key.split("|");
    if (seatRkey === rkey && state === "confirmed") out.push({ did, handle: [...members.values()].find((m) => m.did === did)?.handle ?? null });
  }
  return out;
}


// ------------------------------------------------------- members area (circle)
// regenOS main #167: member-owned circle posts. Mirrors the contract the Worker
// relies on — every method needs a session; reads answer a non-member an EMPTY
// page (never an error); lists run in ascending record-URI order with an
// exclusive cursor; unknown record fields are refused; a delete only ever
// touches the caller's own post.
const POST_COLLECTION = "coop.lexicon.post";
const POST_FIELDS = new Set(["text", "facets", "title", "subject", "reply", "tags", "langs", "createdAt"]);
const circlePosts = new Map();
let tidCounter = 0;
function nextTid() {
  tidCounter += 1;
  return `3m${String(tidCounter).padStart(8, "0")}`;
}
function seedPost(author, text, extra = {}, minutesAgo = 0) {
  const rkey = nextTid();
  const uri = `at://${author}/${POST_COLLECTION}/${rkey}`;
  circlePosts.set(uri, {
    uri, cid: `bafy${rkey}`, author, spaceUri: `at://${author}/coop.lexicon.space.circle/${SCENE_DID}`,
    record: { text, createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), ...extra },
  });
  return uri;
}
function seedCircle() {
  const ride = seedPost(PEER_DID, "Two seats open from Longmont to Saturday's work day. Leaving 8:15, back by dark.", { title: "Seats to Saturday", tags: ["rideshare"], langs: ["en"] }, 60 * 26);
  seedPost(USER_DID, "Count me in for one of them!", { reply: { root: { uri: ride, cid: `bafy${ride.split("/").pop()}` }, parent: { uri: ride, cid: `bafy${ride.split("/").pop()}` } }, langs: ["en"] }, 60 * 25);
  seedPost(PEER_DID, "Spare squash, a lot of it. Come get some.", { tags: ["offers", "harvest"], langs: ["en"] }, 60 * 5);
  seedPost("did:plc:mockbuilder", "Gracias a todas las personas que cocinaron el domingo.", { tags: ["gratitude"], langs: ["es"] }, 60 * 2);
}
seedCircle();

// Profiles. A contextual (COhere) profile replaces the whole record; a member
// with none shows their PUBLIC `self` profile as `publicFallback`. The mock's
// default user starts with neither, so the editor's empty state is reachable.
const PROFILE_FIELDS = new Set(["displayName", "bio", "avatar", "links", "createdAt"]);
const circleProfiles = new Map();
const publicProfiles = new Map([
  ["did:plc:mockbuilder", { displayName: "Rosa Mock", bio: "Seed saver and fiddler. Find me at the Thursday market.", createdAt: "2026-09-01T00:00:00.000Z" }],
]);
function seedProfiles() {
  circleProfiles.set(PEER_DID, {
    uri: `at://${PEER_DID}/coop.lexicon.profile/${SCENE_DID}`, cid: "bafyprofilepeer", author: PEER_DID,
    spaceUri: `at://${PEER_DID}/coop.lexicon.space.circle/${SCENE_DID}`, profileSource: "contextual",
    record: { displayName: "Pia Mock", bio: "I keep bees near Lyons and grow too much squash.", links: ["https://example.org/pia"], createdAt: "2026-09-02T00:00:00.000Z" },
  });
}
seedProfiles();

// MOCK_RICH_SEED=1 — a fuller roster for visual QA (never set by the e2e lanes).
if (process.env.MOCK_RICH_SEED === "1") {
  const people = [
    ["did:plc:mockmara", "mara.mock.test", "Mara Okonkwo", "Mycologist and tea person. Ask me about the oyster logs behind the library.", "https://example.org/mara"],
    ["did:plc:mockteo", "teo.mock.test", "Teo Ramírez", "Carpenter, cook, and keeper of the long table. Happy to lend tools and hands.", null],
    ["did:plc:mocklin", "lin.mock.test", "Lin Aoki", "I run a small seed library out of a bicycle trailer.", "https://example.org/lin"],
    ["did:plc:mockdev", "dev.mock.test", "Devika Rao", "Sound healer and watershed volunteer. Boulder Creek mornings.", null],
    ["did:plc:mockwren", "wren.mock.test", "Wren Calloway", "New to the Front Range, here to listen and carry chairs.", null],
  ];
  for (const [did, handle, name, bio, link] of people) {
    members.set(did, { did, handle, kind: "person", name, role: "member" });
    circleProfiles.set(did, {
      uri: `at://${did}/coop.lexicon.profile/${SCENE_DID}`, cid: `bafyprofile${handle}`, author: did,
      spaceUri: `at://${did}/coop.lexicon.space.circle/${SCENE_DID}`, profileSource: "contextual",
      record: { displayName: name, bio, ...(link ? { links: [link] } : {}), createdAt: "2026-09-03T00:00:00.000Z" },
    });
  }
  const soon = (days, name, description, place) => {
    const startsAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const rkey = `ev-rich${days}`;
    events.set(rkey, {
      uri: `at://${SCENE_DID}/community.lexicon.calendar.event/${rkey}`,
      value: { name, description, createdAt: new Date().toISOString(), startsAt, mode: "community.lexicon.calendar.event#inperson",
        locations: [{ $type: "community.lexicon.location.address", name: place, locality: "Boulder", region: "CO", country: "US" }] },
    });
    seedAttendance(rkey);
    return rkey;
  };
  const eTable = soon(3, "Long Table Supper", "A shared meal under the cottonwoods. Bring a dish and a chair.", "Eben G. Fine Park");
  const eCreek = soon(9, "Creek Walk and Listening Circle", "A slow walk along Boulder Creek, ending in a circle.", "Boulder Creek Path");
  for (const did of ["did:plc:mockmara", "did:plc:mockteo", "did:plc:mocklin", "did:plc:mockdev", PEER_DID]) {
    mySeats.set(`${did}|ev-seed1`, "confirmed");
    mySeats.set(`${did}|${eTable}`, "confirmed");
  }
  mySeats.set(`did:plc:mockmara|${eCreek}`, "confirmed");
  seedPost("did:plc:mockmara", "Anyone have a spare 10x10 canopy for the Saturday tea table? I can trade you a jar of reishi honey.", { title: "Canopy wanted", tags: ["requests"], langs: ["en"] }, 60 * 9);
  seedPost("did:plc:mockteo", "Long table build day is Thursday at 3. Bring a drill if you have one, and gloves.", { title: "Long table build day", tags: ["offers", "building"], langs: ["en"] }, 60 * 14);
  seedPost("did:plc:mocklin", "Seeds for the autumn swap are sorted into envelopes. Kale, calendula, three kinds of beans. Come early; the beans go fast.", { tags: ["harvest"], langs: ["en"] }, 60 * 3);
  seedPost(STEWARD_DID, "Welcome, everyone. Be kind, stay curious, and tell us if a post doesn't feel right. Use Report on any post.", { title: "Welcome to the Board", tags: ["welcome"], langs: ["en"] }, 60 * 40);
}

// MOCK_NOTIFY=1 — what the notifications/harvest lane needs (never set by the older lanes):
//  * two events that just ended (90 minutes ago, and yesterday) the default user and Pia both
//    RSVP'd to, so the harvest composer, the Today card and the invitation have something to be about;
//  * Pia has a verified contact email (getMyContactPref); the default user has none.
const CONTACT_EMAILS = new Map();
if (process.env.MOCK_NOTIFY === "1") {
  const ended = (rkey, name, hoursAgo, lengthH, place, description) => {
    const endsAt = new Date(Date.now() - hoursAgo * 3600_000);
    events.set(rkey, {
      uri: `at://${SCENE_DID}/community.lexicon.calendar.event/${rkey}`,
      value: { name, description, createdAt: new Date(endsAt.getTime() - 7 * 86_400_000).toISOString(),
        startsAt: new Date(endsAt.getTime() - lengthH * 3600_000).toISOString(), endsAt: endsAt.toISOString(),
        mode: "community.lexicon.calendar.event#inperson",
        locations: [{ $type: "community.lexicon.location.address", name: place, locality: "Boulder", region: "CO", country: "US" }] },
    });
    seedAttendance(rkey);
    mySeats.set(`${USER_DID}|${rkey}`, "confirmed");
    mySeats.set(`${PEER_DID}|${rkey}`, "confirmed");
  };
  ended("ev-ended1", "Honoring Water | with Angelique", 1.5, 1.25, "Boulder Creek Path", "A slow walk to our local waters.");
  ended("ev-ended2", "Soup Night at the Barn", 20, 2, "The Old Barn", "Bring a bowl.");
  CONTACT_EMAILS.set(PEER_DID, "pia@example.test");
  // A builder who registered for 2026 (the e2e inserts the registration): the email-by-default screens.
  CONTACT_EMAILS.set("did:plc:mockbuilder", "bea@example.test");
}

// MOCK_GUIDE=1 — the screenshots for the "how to use the app" guide (scripts/guide-capture.sh; never
// set by a test lane). Neutral names instead of "Mock", and, from MOCK_GUIDE_EVENTS (a JSON file of
// /api/events rows), the public calendar in place of the made-up events. Pia, the member the guide
// signs in as, holds seats on GUIDE_SEATS; the other members get sessions `guide-<first name>`.
if (process.env.MOCK_GUIDE === "1") {
  const RENAME = { "Pia Mock": "Pia Hansen", "Rosa Mock": "Rosa Delgado", "Sam Mock": "Sam Whitaker", "Mel Mock": "Mel Ortiz" };
  const handle = (h) => (h && h.endsWith(".mock.test") ? h.replace(/\.mock\.test$/, ".example.org") : h);
  members.get(STEWARD_DID).name = "Jo Bennett";
  members.get(STEWARD_DID).handle = "jo.example.org";
  for (const m of members.values()) { m.handle = handle(m.handle); if (RENAME[m.name]) m.name = RENAME[m.name]; }
  for (const p of [...Object.values(PERSONAS), ...Object.values(SESSION_PEOPLE)]) p.handle = handle(p.handle);
  SESSION_PEOPLE["mock-steward"].handle = "jo.example.org";
  for (const p of [...circleProfiles.values()].map((r) => r.record).concat([...publicProfiles.values()])) {
    if (RENAME[p.displayName]) p.displayName = RENAME[p.displayName];
  }
  for (const m of members.values()) {
    const first = m.name?.split(" ")[0]?.toLowerCase();
    if (first) SESSION_PEOPLE[`guide-${first}`] = { did: m.did, handle: m.handle };
  }
  CONTACT_EMAILS.set(PEER_DID, "pia@example.org");
  CONTACT_EMAILS.set("did:plc:mockbuilder", "rosa@example.org");
  for (const [rkey, seats] of attendance) seats.guests = (seats.guests ?? []).map((g) => ({ ...g, handle: handle(g.handle) }));
  if (process.env.MOCK_GUIDE_EVENTS) {
    const rows = JSON.parse(readFileSync(process.env.MOCK_GUIDE_EVENTS, "utf8"));
    events.clear();
    for (const key of [...mySeats.keys()]) mySeats.delete(key);
    const crowd = ["did:plc:mockmara", "did:plc:mockteo", "did:plc:mocklin", "did:plc:mockdev", "did:plc:mockwren", "did:plc:mockbuilder"];
    rows.forEach((e, i) => {
      const l = e.location ?? {};
      events.set(e.rkey, {
        uri: `at://${SCENE_DID}/community.lexicon.calendar.event/${e.rkey}`,
        value: { name: e.name, description: e.description ?? undefined, createdAt: "2026-10-01T00:00:00.000Z", startsAt: e.startsAt, endsAt: e.endsAt ?? undefined,
          mode: "community.lexicon.calendar.event#inperson",
          locations: l.name || l.street ? [{ $type: "community.lexicon.location.address", name: l.name, street: l.street, locality: l.locality, region: l.region, postalCode: l.postalCode, country: "US" }] : [] },
      });
      attendance.set(e.rkey, { confirmed: 0, waitlisted: 0, requested: 0, maxAttendees: null, attendance: "open", guests: [] });
      // A few people going to everything, so the cards and rosters look lived in.
      for (const did of crowd.slice(0, 1 + (i % crowd.length))) mySeats.set(`${did}|${e.rkey}`, "confirmed");
    });
    for (const rkey of (process.env.GUIDE_SEATS ?? "").split(",").filter(Boolean)) mySeats.set(`${PEER_DID}|${rkey}`, "confirmed");
    for (const [key] of mySeats) attendance.get(key.split("|")[1]).confirmed += 1;
  }
}

function circleSubject(req, res, url) {
  const person = sessionPerson(req);
  if (!person) {
    json(res, 401, { error: "AuthRequired", message: "sign in first" });
    return null;
  }
  if (req.method === "GET" && url.searchParams.get("collective") !== SCENE_DID) {
    json(res, 400, { error: "InvalidRequest", message: "collective is not a known circle" });
    return null;
  }
  return person;
}

function pageOf(records, url) {
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
  const sorted = records.sort((a, b) => (a.uri < b.uri ? -1 : 1)).filter((r) => !cursor || r.uri > cursor);
  const slice = sorted.slice(0, limit);
  return { records: slice, ...(sorted.length > limit ? { cursor: slice[slice.length - 1].uri } : {}) };
}

/** What `person` may read: their own posts, plus those of current members — and only if they are a member. */
function readableCirclePosts(person) {
  if (!members.has(person.did)) return [];
  return [...circlePosts.values()].filter((p) => p.author === person.did || members.has(p.author));
}

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
  if (req.headers.cookie) sawCookies.push(req.headers.cookie);
  console.log(`${req.method} ${url.pathname}${url.search} signedIn=${signedIn} pending=${pending}`);

  switch (nsid) {
    case "social.scenius.getEvents": {
      const rows = [...events.values()].map((e) => ({ ...e, hostName: "COhere Boulder" }));
      return json(res, 200, { scene: SCENE_DID, events: rows });
    }

    // Anonymous single-event read, as the public detail page and the Worker's
    // per-event link previews (worker/src/seo.ts) use it.
    case "social.scenius.getEvent": {
      const m = /\/community\.lexicon\.calendar\.event\/(.+)$/.exec(url.searchParams.get("uri") ?? "");
      const row = m ? events.get(m[1]) : undefined;
      if (!row) return json(res, 404, { error: "NotFound", message: "no such event" });
      return json(res, 200, { ...row, visibility: "public", hostName: "COhere Boulder" });
    }

    case "social.scenius.getEventAttendance": {
      const rkey = url.searchParams.get("eventRkey") ?? "";
      const seats = attendance.get(rkey);
      if (!seats) return json(res, 404, { error: "NotFound", message: "no such event" });
      return json(res, 200, { ...seats, guests: guestsFor(rkey, seats.guests ?? []), mySeat: signedIn ? (mySeats.get(seatKey(req, rkey)) ?? null) : null });
    }

    case "social.scenius.getSceneMembers": {
      // Anonymous callers get the roster without the viewer flag; a bearer
      // call also learns whether the caller is a steward.
      const viewerMembers = req.headers.cookie?.includes(`${SESSION_COOKIE}=mock-member`)
        ? [...members.values()].map((m) => m.did === USER_DID ? { ...m, role: "member" } : m)
        : [...members.values()];
      // MOCK_ROSTER_PAGE_SIZE=n pages the roster n at a time with an opaque
      // `cursor`, as a real AppView might; unset, one page holds everyone.
      const pageSize = Number(process.env.MOCK_ROSTER_PAGE_SIZE) || 0;
      if (pageSize > 0) {
        const start = Number(url.searchParams.get("cursor") ?? 0) || 0;
        const slice = viewerMembers.slice(start, start + pageSize);
        const next = start + pageSize < viewerMembers.length ? String(start + pageSize) : undefined;
        return json(res, 200, { members: slice, steward: asService, ...(next ? { cursor: next } : {}) });
      }
      return json(res, 200, {
        members: viewerMembers,
        steward: asService,
      });
    }

    case "social.scenius.setMembership": {
      if (!asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      const existing = members.get(input.member);
      if (!existing && process.env.MOCK_SETMEMBERSHIP_ADDS === "1" && typeof input.member === "string") {
        const known = Object.values(PERSONAS).find((p) => p.did === input.member);
        members.set(input.member, { did: input.member, handle: known?.handle ?? null, kind: "person", name: null, role: input.role });
        return json(res, 200, { ok: true, role: input.role });
      }
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

    case "social.scenius.listCirclePosts": {
      const person = circleSubject(req, res, url);
      if (!person) return;
      const tag = url.searchParams.get("tag");
      const subject = url.searchParams.get("subject");
      const root = url.searchParams.get("root");
      const matching = readableCirclePosts(person).filter(
        (p) =>
          (!tag || (p.record.tags ?? []).includes(tag)) &&
          (!subject || p.record.subject?.uri === subject) &&
          (!root || p.record.reply?.root?.uri === root),
      );
      return json(res, 200, pageOf(matching, url));
    }

    case "social.scenius.getCircleThread": {
      const person = circleSubject(req, res, url);
      if (!person) return;
      const root = url.searchParams.get("root");
      const readable = readableCirclePosts(person);
      if (!readable.some((p) => p.uri === root && !p.record.reply)) {
        return json(res, 404, { error: "NotFound", message: "no readable root post in that collective" });
      }
      return json(res, 200, pageOf(readable.filter((p) => p.uri === root || p.record.reply?.root?.uri === root), url));
    }

    case "social.scenius.createCirclePost": {
      const person = sessionPerson(req);
      if (!person || asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (input.collective !== SCENE_DID) return json(res, 400, { error: "InvalidRequest", message: "collective is not a known circle" });
      const post = input.post;
      if (!post || typeof post !== "object") return json(res, 400, { error: "InvalidRequest", message: "post is required" });
      const unknown = Object.keys(post).find((k) => !POST_FIELDS.has(k));
      if (unknown) return json(res, 400, { error: "InvalidRequest", message: `unknown field ${unknown}` });
      if (typeof post.text !== "string" || !post.text.trim()) return json(res, 400, { error: "InvalidRequest", message: "text must not be empty" });
      if (Array.from(post.text).length > 20000) return json(res, 400, { error: "InvalidRequest", message: "text is too long" });
      if (post.reply && !circlePosts.has(post.reply.root?.uri) ) {
        return json(res, 400, { error: "InvalidRequest", message: "reply root must be a readable post in this collective" });
      }
      if (post.reply && circlePosts.get(post.reply.root.uri).record.reply) {
        return json(res, 400, { error: "InvalidRequest", message: "root must really be a root" });
      }
      const rkey = nextTid();
      const uri = `at://${person.did}/${POST_COLLECTION}/${rkey}`;
      circlePosts.set(uri, {
        uri, cid: `bafy${rkey}`, author: person.did, spaceUri: `at://${person.did}/coop.lexicon.space.circle/${SCENE_DID}`,
        record: { ...post, createdAt: post.createdAt ?? new Date().toISOString() },
      });
      return json(res, 200, { uri, cid: `bafy${rkey}` });
    }

    case "social.scenius.deleteCirclePost": {
      const person = sessionPerson(req);
      if (!person || asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (input.collective !== SCENE_DID) return json(res, 400, { error: "InvalidRequest", message: "collective is not a known circle" });
      const uri = `at://${person.did}/${POST_COLLECTION}/${input.rkey}`;
      return json(res, 200, { deleted: circlePosts.delete(uri) });
    }

    case "social.scenius.listCircleProfiles": {
      const person = circleSubject(req, res, url);
      if (!person) return;
      if (!members.has(person.did)) return json(res, 200, { records: [] });
      const rows = [];
      for (const did of members.keys()) {
        const own = circleProfiles.get(did);
        if (own) rows.push(own);
        else if (publicProfiles.has(did)) {
          rows.push({
            uri: `at://${did}/coop.lexicon.profile/self`, cid: `bafypublic${did.slice(-6)}`, author: did,
            record: publicProfiles.get(did), profileSource: "publicFallback",
          });
        }
      }
      return json(res, 200, pageOf(rows, url));
    }

    case "social.scenius.putCircleProfile": {
      const person = sessionPerson(req);
      if (!person || asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (input.collective !== SCENE_DID) return json(res, 400, { error: "InvalidRequest", message: "collective is not a known circle" });
      const profile = input.profile;
      if (!profile || typeof profile !== "object") return json(res, 400, { error: "InvalidRequest", message: "profile is required" });
      const unknown = Object.keys(profile).find((k) => !PROFILE_FIELDS.has(k));
      if (unknown) return json(res, 400, { error: "InvalidRequest", message: `unknown field ${unknown}` });
      if (profile.displayName && Array.from(profile.displayName).length > 64) return json(res, 400, { error: "InvalidRequest", message: "displayName too long" });
      if (profile.bio && Array.from(profile.bio).length > 256) return json(res, 400, { error: "InvalidRequest", message: "bio too long" });
      if (profile.links && profile.links.length > 10) return json(res, 400, { error: "InvalidRequest", message: "too many links" });
      const uri = `at://${person.did}/coop.lexicon.profile/${SCENE_DID}`;
      circleProfiles.set(person.did, {
        uri, cid: `bafyprofile${person.did.slice(-6)}${Date.now().toString(36)}`, author: person.did,
        spaceUri: `at://${person.did}/coop.lexicon.space.circle/${SCENE_DID}`, profileSource: "contextual",
        record: { ...profile, createdAt: profile.createdAt ?? new Date().toISOString() },
      });
      return json(res, 200, { uri, cid: circleProfiles.get(person.did).cid });
    }

    case "social.scenius.deleteCircleProfile": {
      const person = sessionPerson(req);
      if (!person || asService) return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      const input = await readBody(req);
      if (input.collective !== SCENE_DID) return json(res, 400, { error: "InvalidRequest", message: "collective is not a known circle" });
      return json(res, 200, { deleted: circleProfiles.delete(person.did) });
    }

    case "social.scenius.getMyContactPref": {
      const who = sessionPerson(req);
      const email = who?.email ?? CONTACT_EMAILS.get(who?.did);
      return json(res, who ? 200 : 401, { channels: email ? [{ kind: "email", address: email, verified: true }] : [] });
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
      const who = sessionPerson(req);
      if (who) return json(res, 200, { did: who.did, handle: who.handle, kind: "user" }, headers);
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

    // A visitor's own RSVP (event.rs `rsvp`): user-only, never the service
    // token. going → confirmed on an open event, requested on approval-only;
    // notgoing withdraws. Mirrors production's seat derivation, not its cap.
    case "social.scenius.rsvp": {
      if (!signedIn || asService) return json(res, 401, { error: "AuthRequired", message: "sign in to RSVP" });
      const input = await readBody(req);
      const seats = attendance.get(input.eventRkey);
      if (!seats) return json(res, 404, { error: "NotFound", message: "no such event" });
      if (!["going", "notgoing", "interested"].includes(input.intent)) {
        return json(res, 400, { error: "InvalidRequest", message: "unknown intent" });
      }
      const before = mySeats.get(seatKey(req, input.eventRkey)) ?? null;
      let state = "none";
      if (input.intent === "going") state = seats.attendance === "approval" ? "requested" : "confirmed";
      if (before === "confirmed") seats.confirmed -= 1;
      if (before === "requested") seats.requested -= 1;
      if (state === "confirmed") seats.confirmed += 1;
      if (state === "requested") seats.requested += 1;
      if (state === "none") mySeats.delete(seatKey(req, input.eventRkey));
      else mySeats.set(seatKey(req, input.eventRkey), state);
      return json(res, 200, { state, decidedBy: "self" });
    }

    case "social.scenius.createEvent":
    case "social.scenius.updateEvent": {
      if (!signedIn && !asService) {
        return json(res, 401, { error: "AuthRequired", message: "sign in first" });
      }
      const input = await readBody(req);
      // Mirrors the AppView's require_owner_or_builder: a plain member may
      // not write under the collective.
      if (!asService && req.headers.cookie?.includes(`${SESSION_COOKIE}=mock-member`) && input.authority === SCENE_DID) {
        return json(res, 403, { error: "Forbidden", message: "only a Builder of the collective may create an event" });
      }
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
    case "/__setRole": {
      const did = url.searchParams.get("did") ?? "";
      const role = url.searchParams.get("role") ?? "";
      const existing = members.get(did);
      if (!existing) return json(res, 404, { error: "NotFound" });
      if (role === "none") members.delete(did);
      else members.set(did, { ...existing, role });
      return json(res, 200, { ok: true });
    }

    case "/__expire": {
      const token = url.searchParams.get("token") ?? "";
      if (url.searchParams.get("on") === "0") expiredSessions.delete(token);
      else expiredSessions.add(token);
      return json(res, 200, { ok: true });
    }

    case "/__sawCookies": {
      return json(res, 200, { cookies: sawCookies });
    }

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
