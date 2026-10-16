import { describe, expect, it } from "vitest";
import {
  STALE_DAYS, afterHeartbeat, alsoEmail, effectiveChannels, withAlsoEmail, afterSend, boulderTime, decide, effectiveChannel, emptyPrefs, eveningRef, eventEndMs, harvestDue, isLive, isOn,
  logTag, morningRef, personKey, pushStatus, reviveDevice, signLink, softFailure, verifyLink, type DeviceRow, type Prefs, type Reach,
} from "./notify-core";

const NOW = Date.parse("2026-10-17T14:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const device = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  device_id: "d1", person_key: "did:plc:me", installed: 1, permission: "granted", state: "live", fail_count: 0,
  last_seen_at: iso(NOW - 3600_000), last_sent_at: null, last_success_at: null, last_failure_at: null, last_shown_at: null, soft_failed_for: null, ...over,
});
const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...emptyPrefs(), email: "me@example.org", email_verified_at: "2026-10-01T00:00:00Z", ...over });
const reach = (over: Partial<Reach> = {}): Reach => ({ livePush: true, hasApp: true, email: "me@example.org", registered: false, ...over });

describe("person keys", () => {
  it("is the account when there is one, else the lower-cased verified address", () => {
    expect(personKey({ did: "did:plc:me", email: "A@B.org" })).toBe("did:plc:me");
    expect(personKey({ email: " Sam@Example.ORG " })).toBe("mailto:sam@example.org");
    expect(personKey({})).toBeNull();
  });
  it("logs a short hash, never the address", async () => {
    const tag = await logTag("mailto:sam@example.org");
    expect(tag).toMatch(/^[0-9a-f]{10}$/);
    expect(tag).not.toContain("sam");
  });
});

describe("is a note on?", () => {
  it("defaults all three on for people with the app installed", () => {
    for (const type of ["morning", "harvest", "evening"] as const) expect(isOn(type, prefs(), reach())).toBe(true);
  });
  it("email-only: the morning note is opt-in; harvest and 8 PM need the one-tap ask", () => {
    const only = reach({ hasApp: false, livePush: false });
    expect(isOn("morning", prefs(), only)).toBe(false);
    expect(isOn("harvest", prefs(), only)).toBe(false);
    expect(isOn("evening", prefs(), only)).toBe(false);
    const asked = prefs({ email_optin_at: "2026-10-12T00:00:00Z" });
    expect(isOn("morning", asked, only)).toBe(false);
    expect(isOn("harvest", asked, only)).toBe(true);
    expect(isOn("evening", asked, only)).toBe(true);
    expect(isOn("morning", prefs({ morning_on: 1 }), only)).toBe(true);
  });
  it("an explicit choice beats every default", () => {
    expect(isOn("morning", prefs({ morning_on: 0 }), reach())).toBe(false);
    expect(isOn("harvest", prefs({ harvest_on: 1 }), reach({ hasApp: false, livePush: false }))).toBe(true);
  });
});

describe("which channel", () => {
  it("push when the app is live, by default", () => {
    expect(decide("morning", prefs(), reach())).toEqual({ action: "push", fellBack: false });
  });
  it("email when there is no app at all, and that is not a 'fallback'", () => {
    expect(decide("morning", prefs({ morning_on: 1 }), reach({ hasApp: false, livePush: false }))).toEqual({ action: "email", fellBack: false });
  });
  it("push chosen but not live: email instead, marked as a fallback for someone who has the app", () => {
    expect(decide("morning", prefs(), reach({ livePush: false }))).toEqual({ action: "email", fellBack: true });
    expect(decide("harvest", prefs({ harvest_channel: "push" }), reach({ livePush: false }))).toEqual({ action: "email", fellBack: true });
  });
  it("email chosen stays email whatever the app is doing", () => {
    expect(decide("evening", prefs({ evening_channel: "email" }), reach())).toEqual({ action: "email", fellBack: false });
  });
  it("skips, and says why, when nothing can reach the person", () => {
    expect(decide("morning", prefs(), reach({ livePush: false, email: null }))).toEqual({ action: "skip", reason: "unreachable" });
    expect(decide("morning", prefs({ morning_channel: "email" }), reach({ email: null }))).toEqual({ action: "skip", reason: "unreachable" });
  });
  it("skips a note that is off, however reachable they are", () => {
    expect(decide("morning", prefs({ morning_on: 0 }), reach())).toEqual({ action: "skip", reason: "off" });
  });
  it("never changes the stored choice; only the effective channel moves", () => {
    const p = prefs({ morning_channel: "push" });
    expect(effectiveChannel("morning", p, reach({ livePush: false }))).toBe("email");
    expect(p.morning_channel).toBe("push");
    expect(effectiveChannel("morning", p, reach())).toBe("push");
  });
});

describe("device health", () => {
  it("counts as live only when installed, granted, recent and state live", () => {
    expect(isLive(device(), NOW)).toBe(true);
    expect(isLive(device({ installed: 0 }), NOW)).toBe(false);
    expect(isLive(device({ permission: "denied" }), NOW)).toBe(false);
    expect(isLive(device({ state: "suspect" }), NOW)).toBe(false);
    expect(isLive(device({ last_seen_at: iso(NOW - (STALE_DAYS + 1) * 86_400_000) }), NOW)).toBe(false);
    // an accepted push also counts as a sign of life
    expect(isLive(device({ last_seen_at: iso(NOW - (STALE_DAYS + 1) * 86_400_000), last_success_at: iso(NOW - 3600_000) }), NOW)).toBe(true);
  });
  it("404 and 410 expire it at once", () => {
    for (const status of [404, 410]) expect(afterSend(device(), { status }, iso(NOW)).state).toBe("expired");
  });
  it("a 201 resets the count and records the success", () => {
    const next = afterSend(device({ fail_count: 2, state: "suspect" }), { status: 201 }, iso(NOW));
    expect(next).toMatchObject({ state: "live", fail_count: 0, last_success_at: iso(NOW) });
  });
  it("three failures in a row make it suspect; the first two do not", () => {
    let d = device();
    d = afterSend(d, { status: 500 }, iso(NOW));
    d = afterSend(d, { status: 0 }, iso(NOW + 1000));
    expect(d.state).toBe("live");
    d = afterSend(d, { status: 503 }, iso(NOW + 2000));
    expect(d).toMatchObject({ state: "suspect", fail_count: 3 });
  });
  it("two failures across two days make it suspect", () => {
    let d = afterSend(device(), { status: 500 }, iso(NOW));
    expect(d.state).toBe("live");
    d = afterSend(d, { status: 500 }, iso(NOW + 86_400_000));
    expect(d.state).toBe("suspect");
  });
  it("a heartbeat records the install and permission", () => {
    const d = afterHeartbeat(device({ installed: 0 }), { installed: true, permission: "granted", subscribed: true }, iso(NOW));
    expect(d).toMatchObject({ installed: 1, last_seen_at: iso(NOW) });
  });
  it("no subscription, or a denied permission, expires it", () => {
    expect(afterHeartbeat(device(), { installed: true, permission: "granted", subscribed: false }, iso(NOW)).state).toBe("expired");
    expect(afterHeartbeat(device(), { installed: true, permission: "denied", subscribed: true }, iso(NOW)).state).toBe("expired");
  });
  it("a heartbeat revives a device that went quiet, but not one suspect for failed sends, nor an expired one", () => {
    const hb = { installed: true, permission: "granted", subscribed: true };
    expect(afterHeartbeat(device({ state: "suspect", fail_count: 0 }), hb, iso(NOW)).state).toBe("live");
    expect(afterHeartbeat(device({ state: "suspect", fail_count: 3 }), hb, iso(NOW)).state).toBe("suspect");
    expect(afterHeartbeat(device({ state: "expired" }), hb, iso(NOW)).state).toBe("expired");
  });
  it("'turn push back on' (a landed test push) or a new subscription revives it", () => {
    expect(reviveDevice(device({ state: "expired", fail_count: 4 }), iso(NOW))).toMatchObject({ state: "live", fail_count: 0 });
  });
  it("a push never reported shown, a day on, is one soft failure, counted once", () => {
    const sent = iso(NOW - 25 * 3600_000);
    const d = device({ last_sent_at: sent, last_success_at: sent });
    const soft = softFailure(d, NOW)!;
    expect(soft.fail_count).toBe(1);
    expect(soft.soft_failed_for).toBe(sent);
    expect(softFailure(soft, NOW)).toBeNull();
  });
  it("no soft failure when the phone reported showing it, or when it is too soon to tell", () => {
    const sent = iso(NOW - 25 * 3600_000);
    expect(softFailure(device({ last_sent_at: sent, last_shown_at: iso(NOW - 24 * 3600_000) }), NOW)).toBeNull();
    expect(softFailure(device({ last_sent_at: iso(NOW - 3600_000) }), NOW)).toBeNull();
  });
  it("summarises a person's phones for settings", () => {
    expect(pushStatus([], NOW)).toBe("none");
    expect(pushStatus([device()], NOW)).toBe("live");
    expect(pushStatus([device({ installed: 0 })], NOW)).toBe("not-installed");
    expect(pushStatus([device({ state: "suspect" })], NOW)).toBe("suspect");
    expect(pushStatus([device({ state: "expired" })], NOW)).toBe("expired");
    expect(pushStatus([device({ state: "expired" }), device({ device_id: "d2" })], NOW)).toBe("live");
  });
});

describe("timing, in Boulder time", () => {
  const fest = { start: "2026-10-15", end: "2026-10-25" };

  it("reads the Boulder date and minute", () => {
    expect(boulderTime(new Date("2026-10-15T12:00:00Z"))).toEqual({ date: "2026-10-15", minutes: 360 });
    expect(boulderTime(new Date("2026-10-15T05:59:00Z"))).toEqual({ date: "2026-10-14", minutes: 23 * 60 + 59 });
  });
  it("the morning note is 6 AM and may be an hour late, never early", () => {
    expect(morningRef(new Date("2026-10-15T11:59:00Z"), fest)).toBeNull();
    expect(morningRef(new Date("2026-10-15T12:00:00Z"), fest)).toBe("2026-10-15");
    expect(morningRef(new Date("2026-10-15T12:59:00Z"), fest)).toBe("2026-10-15");
    expect(morningRef(new Date("2026-10-15T13:00:00Z"), fest)).toBeNull();
  });
  it("the morning note stays inside the gathering's dates", () => {
    expect(morningRef(new Date("2026-10-14T12:00:00Z"), fest)).toBeNull();
    expect(morningRef(new Date("2026-10-25T12:00:00Z"), fest)).toBe("2026-10-25");
    expect(morningRef(new Date("2026-10-26T12:00:00Z"), fest)).toBeNull();
  });
  it("the 8 PM note starts the night before opening and skips the last night", () => {
    expect(eveningRef(new Date("2026-10-15T01:59:00Z"), fest)).toBeNull(); // 7:59 PM on the 14th
    expect(eveningRef(new Date("2026-10-15T02:00:00Z"), fest)).toBe("2026-10-14");
    expect(eveningRef(new Date("2026-10-15T02:59:00Z"), fest)).toBe("2026-10-14");
    expect(eveningRef(new Date("2026-10-15T03:00:00Z"), fest)).toBeNull();
    expect(eveningRef(new Date("2026-10-24T02:00:00Z"), fest)).toBe("2026-10-23");
    expect(eveningRef(new Date("2026-10-26T02:00:00Z"), fest)).toBeNull(); // the night after the 25th
    expect(eveningRef(new Date("2026-10-26T01:00:00Z"), fest)).toBeNull(); // 7 PM on the 25th
    expect(eveningRef(new Date("2026-10-25T20:00:00Z"), { start: "2026-10-15", end: "2026-10-25" })).toBeNull();
    expect(eveningRef(new Date("2026-10-25T02:00:00Z"), fest)).toBe("2026-10-24");
  });

  describe("across daylight saving", () => {
    const wide = { start: "2026-01-01", end: "2026-12-31" };
    /** How many minutes of a UTC range each Boulder date's note is due. */
    const minutesDue = (from: string, to: string, fn: typeof morningRef) => {
      const counts = new Map<string, number>();
      for (let t = Date.parse(from); t < Date.parse(to); t += 60_000) {
        const ref = fn(new Date(t), wide);
        if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
      }
      return counts;
    };
    it("the morning note is due exactly once on the spring-forward day (23 hours long)", () => {
      const counts = minutesDue("2026-03-07T00:00:00Z", "2026-03-10T00:00:00Z", morningRef);
      expect([...counts]).toEqual([["2026-03-07", 60], ["2026-03-08", 60], ["2026-03-09", 60]]);
      // 6 AM MST on the 7th is 13:00Z; 6 AM MDT on the 8th is 12:00Z
      expect(morningRef(new Date("2026-03-07T13:00:00Z"), wide)).toBe("2026-03-07");
      expect(morningRef(new Date("2026-03-08T12:00:00Z"), wide)).toBe("2026-03-08");
      expect(morningRef(new Date("2026-03-08T11:00:00Z"), wide)).toBeNull();
    });
    it("the morning note is due exactly once on the fall-back day (25 hours long)", () => {
      const counts = minutesDue("2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z", morningRef);
      expect([...counts]).toEqual([["2026-10-31", 60], ["2026-11-01", 60], ["2026-11-02", 60]]);
      expect(morningRef(new Date("2026-11-01T12:00:00Z"), wide)).toBeNull(); // 5 AM MST
      expect(morningRef(new Date("2026-11-01T13:00:00Z"), wide)).toBe("2026-11-01");
    });
    it("the 8 PM note is due exactly once either side of both changes", () => {
      for (const [from, to] of [["2026-03-07T12:00:00Z", "2026-03-10T12:00:00Z"], ["2026-10-31T12:00:00Z", "2026-11-03T12:00:00Z"]]) {
        const counts = minutesDue(from, to, eveningRef);
        for (const n of counts.values()) expect(n).toBe(60);
        expect(counts.size).toBe(3);
      }
      expect(eveningRef(new Date("2026-11-02T03:00:00Z"), wide)).toBe("2026-11-01"); // 8 PM MST
      expect(eveningRef(new Date("2026-11-02T02:00:00Z"), wide)).toBeNull(); // 7 PM MST
      expect(eveningRef(new Date("2026-03-09T02:00:00Z"), wide)).toBe("2026-03-08"); // 8 PM MDT
    });
  });

  describe("harvest", () => {
    const event = { startsAt: "2026-10-16T16:00:00Z", endsAt: "2026-10-16T17:15:00Z", status: "scheduled" };
    it("goes out an hour after the event ends, not before", () => {
      expect(harvestDue(event, new Date("2026-10-16T18:14:00Z"))).toBe(false);
      expect(harvestDue(event, new Date("2026-10-16T18:15:00Z"))).toBe(true);
      expect(harvestDue(event, new Date("2026-10-16T20:00:00Z"))).toBe(true);
    });
    it("may be late by a few hours (a missed tick) but not by a day", () => {
      expect(harvestDue(event, new Date("2026-10-17T00:14:00Z"))).toBe(true);
      expect(harvestDue(event, new Date("2026-10-17T00:15:00Z"))).toBe(false);
    });
    it("uses an hour after the start when there is no end, and never invites to a cancelled event", () => {
      expect(eventEndMs({ startsAt: "2026-10-16T16:00:00Z", endsAt: null })).toBe(Date.parse("2026-10-16T17:00:00Z"));
      expect(eventEndMs({ startsAt: null, endsAt: null })).toBeNaN();
      expect(harvestDue({ ...event, status: "cancelled" }, new Date("2026-10-16T19:00:00Z"))).toBe(false);
      expect(harvestDue({ startsAt: null, endsAt: null }, new Date("2026-10-16T19:00:00Z"))).toBe(false);
    });
    it("is the same elapsed time across a clock change (it is an instant, not a wall time)", () => {
      const late = { startsAt: "2026-11-01T07:00:00Z", endsAt: "2026-11-01T08:30:00Z" }; // across the 2 AM fall-back
      expect(harvestDue(late, new Date("2026-11-01T09:29:00Z"))).toBe(false);
      expect(harvestDue(late, new Date("2026-11-01T09:30:00Z"))).toBe(true);
    });
  });
});

describe("signed links", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("round-trips, and the unsubscribe link never expires", async () => {
    const token = await signLink("secret", { p: "mailto:sam@example.org", k: "unsub", t: "morning" }, now);
    expect(await verifyLink("secret", token, now)).toEqual({ p: "mailto:sam@example.org", k: "unsub", t: "morning" });
    expect(await verifyLink("secret", token, new Date("2030-01-01T00:00:00Z"))).not.toBeNull();
  });
  it("the settings link lasts 30 days", async () => {
    const token = await signLink("secret", { p: "did:plc:me", k: "settings" }, now);
    expect(await verifyLink("secret", token, new Date(now.getTime() + 29 * 86_400_000))).not.toBeNull();
    expect(await verifyLink("secret", token, new Date(now.getTime() + 31 * 86_400_000))).toBeNull();
  });
  it("the address-verification link lasts a day", async () => {
    const token = await signLink("secret", { p: "did:plc:me", k: "verify", e: "me@example.org" }, now);
    expect(await verifyLink("secret", token, new Date(now.getTime() + 23 * 3600_000))).toMatchObject({ e: "me@example.org" });
    expect(await verifyLink("secret", token, new Date(now.getTime() + 25 * 3600_000))).toBeNull();
  });
  it("refuses a link signed with another secret, an edited payload, a truncated token and junk", async () => {
    const token = await signLink("secret", { p: "did:plc:me", k: "unsub", t: "all" }, now);
    expect(await verifyLink("other", token, now)).toBeNull();
    const [head, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ p: "did:plc:victim", k: "unsub", t: "all" })).replace(/=+$/, "");
    expect(await verifyLink("secret", `${forged}.${sig}`, now)).toBeNull();
    expect(await verifyLink("secret", head, now)).toBeNull();
    expect(await verifyLink("secret", `${head}.${sig}.x`, now)).toBeNull();
    expect(await verifyLink("secret", "not a token", now)).toBeNull();
    expect(await verifyLink("secret", "", now)).toBeNull();
  });
  it("a settings link cannot be turned into a forever link by dropping its expiry", async () => {
    const strip = btoa(JSON.stringify({ p: "did:plc:me", k: "settings" })).replace(/=+$/, "");
    const real = await signLink("secret", { p: "did:plc:me", k: "unsub" }, now);
    expect(await verifyLink("secret", `${strip}.${real.split(".")[1]}`, now)).toBeNull();
  });
});

describe("registered for 2026, no settings", () => {
  const reg = reach({ hasApp: false, livePush: false, registered: true });
  it("the 8 PM note is on by email, the morning note and the harvest invitation are off", () => {
    expect(decide("evening", prefs(), reg)).toEqual({ action: "email", fellBack: false });
    expect(decide("morning", prefs(), reg)).toEqual({ action: "skip", reason: "off" });
    expect(decide("harvest", prefs(), reg)).toEqual({ action: "skip", reason: "off" });
  });
  it("explicit settings win: off stays off, and they can turn the morning note on", () => {
    expect(decide("evening", prefs({ evening_on: 0 }), reg)).toEqual({ action: "skip", reason: "off" });
    expect(decide("morning", prefs({ morning_on: 1 }), reg)).toEqual({ action: "email", fellBack: false });
  });
  it("with the app, nothing changes: all three, by push", () => {
    for (const type of ["morning", "harvest", "evening"] as const) expect(decide(type, prefs(), reach({ registered: true }))).toEqual({ action: "push", fellBack: false });
  });
  it("someone not registered and without the app still gets nothing by default", () => {
    expect(decide("evening", prefs(), reach({ hasApp: false, livePush: false, registered: false }))).toEqual({ action: "skip", reason: "off" });
  });
});

describe("phone and email both", () => {
  const both = prefs({ evening_on: 1, evening_channel: "push", also_email: "evening" });
  it("goes to the phone and the email when the phone is live", () => {
    expect(decide("evening", both, reach())).toEqual({ action: "both" });
    expect(effectiveChannels("evening", both, reach())).toEqual({ phone: true, email: true });
  });
  it("is just the email when the phone is not live, and says the phone fell back", () => {
    expect(decide("evening", both, reach({ livePush: false }))).toEqual({ action: "email", fellBack: true });
  });
  it("only the notes named in also_email go twice", () => {
    expect(decide("morning", prefs({ morning_channel: "push" }), reach())).toEqual({ action: "push", fellBack: false });
    expect(alsoEmail(both, "evening")).toBe(true);
    expect(alsoEmail(both, "morning")).toBe(false);
    expect(withAlsoEmail(both, "morning", true)).toBe("morning,evening");
    expect(withAlsoEmail(both, "evening", false)).toBeNull();
  });
  it("the toggles read: off is neither, email only is email", () => {
    expect(effectiveChannels("evening", prefs({ evening_on: 0 }), reach())).toEqual({ phone: false, email: false });
    expect(effectiveChannels("evening", prefs({ evening_channel: "email" }), reach())).toEqual({ phone: false, email: true });
  });
});
