import { describe, expect, it } from "vitest";
import { locationLine } from "./events";

describe("locationLine", () => {
  it("joins name, street and locality", () => {
    expect(locationLine({ name: "The Riverside", street: "1724 Broadway St", locality: "Boulder" })).toBe(
      "The Riverside · 1724 Broadway St · Boulder",
    );
  });

  it("drops a TBD venue instead of printing it to attendees", () => {
    expect(locationLine({ name: "TBD", locality: "Boulder", region: "CO" })).toBe("Boulder");
    expect(locationLine({ name: "Tbd" })).toBeNull();
    expect(locationLine({ name: "To be announced", street: "TBA" })).toBeNull();
  });

  it("keeps a real name that merely contains the letters", () => {
    expect(locationLine({ name: "TBD Brewing Co", locality: "Boulder" })).toBe("TBD Brewing Co · Boulder");
  });

  it("returns null for no location", () => {
    expect(locationLine(null)).toBeNull();
  });
});
