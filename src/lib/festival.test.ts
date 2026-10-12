import { describe, expect, it } from "vitest";
import { dayNumber, daysUntilStart, denverMinutes, formatDay, formatMinutes, parseDone, sunTimes, trailState, FESTIVAL_DATES } from "./festival";

describe("festival dates", () => {
  it("numbers the eleven days and brackets them", () => {
    expect(FESTIVAL_DATES).toHaveLength(11);
    expect([dayNumber("2026-10-14"), dayNumber("2026-10-15"), dayNumber("2026-10-17"), dayNumber("2026-10-25"), dayNumber("2026-10-26")]).toEqual([0, 1, 3, 11, 12]);
  });
  it("counts days until the start", () => {
    expect(daysUntilStart("2026-10-11")).toBe(4);
    expect(daysUntilStart("2026-10-15")).toBe(0);
    expect(daysUntilStart("2026-10-20")).toBe(0);
  });
  it("formats in both languages without the device time zone", () => {
    expect(formatDay("2026-10-17", "en")).toBe("Sat Oct 17");
    expect(formatDay("2026-10-17", "en", true)).toBe("Saturday, October 17");
    expect(formatDay("2026-10-17", "es")).toBe("sáb 17 oct");
    expect(formatDay("2026-10-17", "es", true)).toBe("sábado 17 de octubre");
    expect(formatMinutes(9 * 60 + 40, "en")).toBe("9:40 AM");
    expect(formatMinutes(0, "en")).toBe("12:00 AM");
    expect(formatMinutes(15 * 60, "es")).toBe("3:00 p. m.");
  });
  it("reads Denver minutes", () => {
    expect(denverMinutes(new Date("2026-10-17T15:40:00Z"))).toBe(9 * 60 + 40);
  });
  it("keeps sunrise before sunset all festival long", () => {
    for (const d of FESTIVAL_DATES) { const s = sunTimes(d); expect(s.rise).toBeLessThan(s.set); }
  });
});

describe("practice done", () => {
  it("parses defensively and keeps only festival days, sorted and unique", () => {
    expect(parseDone(null)).toEqual([]);
    expect(parseDone("nope")).toEqual([]);
    expect(parseDone('{"a":1}')).toEqual([]);
    expect(parseDone('["2026-10-17","2026-10-16","2026-10-17","2020-01-01",5]')).toEqual(["2026-10-16", "2026-10-17"]);
  });
  it("gives each day one trail state", () => {
    const done = ["2026-10-16"];
    expect(trailState("2026-10-16", "2026-10-17", done)).toBe("done");
    expect(trailState("2026-10-15", "2026-10-17", done)).toBe("past");
    expect(trailState("2026-10-17", "2026-10-17", done)).toBe("today");
    expect(trailState("2026-10-17", "2026-10-17", ["2026-10-17"])).toBe("done");
    expect(trailState("2026-10-18", "2026-10-17", done)).toBe("future");
  });
});
