import { describe, expect, it, vi } from "vitest";
import {
  MY_EVENTS_CAP,
  SEAT_LOOKUP_CONCURRENCY,
  SEAT_LOOKUP_LIMIT,
  addStored,
  lookupSeats,
  mapLimit,
  mergeMyEvents,
  nextEvent,
  normalize,
  parseSeatCache,
  parseStored,
  removeStored,
  seatLookupCandidates,
  type StoredEvent,
} from "./myEvents";
import type { CommunityEvent } from "./events";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const hours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

function ev(rkey: string, startH: number | null, extra: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    did: "did:plc:scene", rkey, name: rkey, imageUrl: null, description: null, status: null, mode: null, location: null,
    startsAt: startH === null ? null : hours(startH),
    endsAt: startH === null ? null : hours(startH + 2),
    ...extra,
  };
}
const stored = (rkey: string, source: "email" | "regenos", atH = 0, seat?: StoredEvent["seat"]): StoredEvent => ({
  did: "did:plc:scene", rkey, source, at: hours(atH), ...(seat ? { seat } : {}),
});
const k = (rkey: string) => `did:plc:scene/${rkey}`;
const raw = (items: unknown) => JSON.stringify({ v: 1, items });

describe("storage", () => {
  it("parses defensively", () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("not json")).toEqual([]);
    expect(parseStored(JSON.stringify({ v: 2, items: [stored("a", "email")] }))).toEqual([]);
    expect(parseStored(JSON.stringify([stored("a", "email")]))).toEqual([]);
    const out = parseStored(raw([stored("a", "email"), null, 7, { did: "x" }, { did: "d", rkey: "r", source: "carrier-pigeon", at: "" }, { did: "d", rkey: "r2", source: "email", at: "garbage" }]));
    expect(out.map((e) => e.rkey).sort()).toEqual(["a", "r2"]);
  });

  it("drops a bogus seat and keeps seats only on regenos entries", () => {
    const out = parseStored(raw([{ ...stored("a", "regenos"), seat: "bogus" }, { ...stored("b", "email"), seat: "confirmed" }, stored("c", "regenos", 0, "waitlisted")]));
    expect(out.find((e) => e.rkey === "a")?.seat).toBeUndefined();
    expect(out.find((e) => e.rkey === "b")?.seat).toBeUndefined();
    expect(out.find((e) => e.rkey === "c")?.seat).toBe("waitlisted");
  });

  it("dedupes by event, keeping the most recent record", () => {
    const out = addStored([stored("a", "email", -5)], stored("a", "regenos", 1, "confirmed"));
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("regenos");
    // an older duplicate does not displace a newer one
    expect(normalize([stored("a", "regenos", 2, "confirmed"), stored("a", "email", 1)])[0].source).toBe("regenos");
  });

  it("caps the list, dropping the oldest", () => {
    const many = Array.from({ length: MY_EVENTS_CAP + 30 }, (_, i) => stored(`e${i}`, "email", i));
    const out = normalize(many);
    expect(out).toHaveLength(MY_EVENTS_CAP);
    expect(out[0].rkey).toBe(`e${MY_EVENTS_CAP + 29}`);
    expect(out.some((e) => e.rkey === "e0")).toBe(false);
    expect(parseStored(raw(many))).toHaveLength(MY_EVENTS_CAP);
  });

  it("removes one event only", () => {
    const out = removeStored([stored("a", "email"), stored("b", "email")], { did: "did:plc:scene", rkey: "a" });
    expect(out.map((e) => e.rkey)).toEqual(["b"]);
  });
});

describe("merge", () => {
  const events = [ev("late", 48), ev("soon", 5), ev("past", -30), ev("mid", 24)];

  it("combines email and regenos sources, sorted by start", () => {
    const items = mergeMyEvents({
      events,
      stored: [stored("late", "email"), stored("past", "email")],
      seats: { [k("mid")]: "confirmed" },
      signedIn: true,
    });
    expect(items.map((i) => i.event.rkey)).toEqual(["past", "mid", "late"]);
    expect(items.find((i) => i.event.rkey === "mid")).toMatchObject({ source: "regenos", seat: "confirmed" });
  });

  it("a regenos seat wins over an email RSVP to the same event", () => {
    const items = mergeMyEvents({ events, stored: [stored("mid", "email")], seats: { [k("mid")]: "requested" }, signedIn: true });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "regenos", seat: "requested" });
  });

  it("ignores regenos data when signed out, but keeps email RSVPs", () => {
    const items = mergeMyEvents({ events, stored: [stored("soon", "email"), stored("mid", "regenos", 0, "confirmed")], seats: { [k("late")]: "confirmed" }, signedIn: false });
    expect(items.map((i) => i.event.rkey)).toEqual(["soon"]);
  });

  it("a fresh not-going lookup hides a stale local regenos record; unknown keeps it", () => {
    const local = [stored("mid", "regenos", 0, "confirmed"), stored("soon", "regenos", 0, "waitlisted")];
    const items = mergeMyEvents({ events, stored: local, seats: { [k("mid")]: null }, signedIn: true });
    expect(items.map((i) => i.event.rkey)).toEqual(["soon"]);
    expect(items[0].seat).toBe("waitlisted");
  });

  it("skips stored events that are not in the event list", () => {
    expect(mergeMyEvents({ events, stored: [stored("gone", "email")], seats: {}, signedIn: false })).toEqual([]);
  });

  it("next skips past and cancelled events and counts one still under way", () => {
    const list = [ev("past", -30), ev("cancelled", 2, { status: "cancelled" }), ev("running", -1), ev("later", 30)];
    const items = mergeMyEvents({ events: list, stored: list.map((e) => stored(e.rkey, "email")), seats: {}, signedIn: false });
    expect(nextEvent(items, NOW)?.rkey).toBe("running");
    expect(nextEvent(items.filter((i) => i.event.rkey === "past"), NOW)).toBeNull();
    expect(nextEvent([], NOW)).toBeNull();
  });
});

describe("seat lookups", () => {
  it("picks at most N upcoming, uncancelled events, soonest first", () => {
    const list = [ev("past", -30), ev("c", 3, { status: "cancelled" }), ev("undated", null), ...Array.from({ length: 50 }, (_, i) => ev(`e${i}`, 50 - i))];
    const picked = seatLookupCandidates(list, NOW);
    expect(picked).toHaveLength(SEAT_LOOKUP_LIMIT);
    expect(picked[0].rkey).toBe("e49");
    expect(picked.some((e) => ["past", "c", "undated"].includes(e.rkey))).toBe(false);
  });

  it("mapLimit never runs more than the limit at once and keeps order", async () => {
    let inFlight = 0, peak = 0;
    const out = await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
  });

  it("lookupSeats bounds concurrency (mock fetch), maps seats, and survives failures", async () => {
    let inFlight = 0, peak = 0;
    const fetchSeat = vi.fn(async (_did: string, rkey: string) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      if (rkey === "e3") throw new Error("boom");
      return { seat: rkey === "e1" ? "confirmed" : rkey === "e2" ? "declined" : null };
    });
    const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, i + 1));
    const seats = await lookupSeats(events, fetchSeat);
    expect(fetchSeat).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(SEAT_LOOKUP_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    expect(seats["did:plc:scene/e1"]).toBe("confirmed");
    expect(seats["did:plc:scene/e2"]).toBeNull();
    expect("did:plc:scene/e3" in seats).toBe(false);
  });
});

describe("parseSeatCache (last visit's seats, for a still first paint)", () => {
  const raw = (v: unknown) => JSON.stringify(v);
  it("gives back this account's seats, with anything but an active seat read as not going", () => {
    expect(parseSeatCache(raw({ did: "did:plc:me", seats: { "a/1": "confirmed", "a/2": null, "a/3": "declined", "a/4": "waitlisted" } }), "did:plc:me"))
      .toEqual({ "a/1": "confirmed", "a/2": null, "a/3": null, "a/4": "waitlisted" });
  });
  it("gives nothing for another account, or for anything malformed", () => {
    expect(parseSeatCache(raw({ did: "did:plc:other", seats: { "a/1": "confirmed" } }), "did:plc:me")).toBeUndefined();
    for (const bad of [null, "", "{", raw(null), raw([]), raw({ did: "did:plc:me" }), raw({ did: "did:plc:me", seats: ["a/1"] }), raw({ did: "did:plc:me", seats: "x" })]) {
      expect(parseSeatCache(bad, "did:plc:me")).toBeUndefined();
    }
  });
});
