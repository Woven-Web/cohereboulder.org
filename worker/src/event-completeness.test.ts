import { describe, expect, it } from "vitest";
import { isPlaceholder, missingDetails } from "./event-completeness";

const complete = {
  mode: "inperson",
  description: "Bring water.",
  location: { name: "The Riverside", street: "1724 Broadway St", locality: "Boulder" },
};

describe("isPlaceholder", () => {
  it("treats blank and TBD-style values as missing", () => {
    for (const v of [undefined, null, "", "  ", "TBD", "tbd", " TBD ", "TBA", "T.B.D.", "To be determined", "To be announced", "Por anunciar", "Por determinar"]) {
      expect(isPlaceholder(v), String(v)).toBe(true);
    }
  });

  it("keeps real values, including ones that merely contain the letters", () => {
    for (const v of ["The Riverside", "TBD Brewing Co", "Eben G Fine Park"]) {
      expect(isPlaceholder(v), v).toBe(false);
    }
  });
});

describe("missingDetails", () => {
  it("is empty for a complete in-person event", () => {
    expect(missingDetails(complete)).toEqual([]);
  });

  it("flags a TBD venue as venue (not also street)", () => {
    expect(
      missingDetails({ ...complete, location: { name: "TBD", locality: "Boulder" } }),
    ).toEqual(["venue"]);
  });

  it("flags a missing location entirely as venue", () => {
    expect(missingDetails({ ...complete, location: null })).toEqual(["venue"]);
  });

  it("flags a named venue without a street as street", () => {
    expect(
      missingDetails({ ...complete, location: { name: "Eben G Fine Park", locality: "Boulder" } }),
    ).toEqual(["street"]);
  });

  it("flags an empty or whitespace description", () => {
    expect(missingDetails({ ...complete, description: null })).toEqual(["description"]);
    expect(missingDetails({ ...complete, description: "   " })).toEqual(["description"]);
  });

  it("orders multiple gaps venue, street, description", () => {
    expect(missingDetails({ mode: null, description: "", location: { name: "Tbd" } })).toEqual([
      "venue",
      "description",
    ]);
    expect(missingDetails({ mode: "inperson", description: null, location: { name: "Library" } })).toEqual([
      "street",
      "description",
    ]);
  });

  it("does not ask a virtual event for a venue or street", () => {
    expect(missingDetails({ mode: "virtual", description: "Zoom link sent on RSVP.", location: null })).toEqual([]);
    expect(missingDetails({ mode: "virtual", description: null, location: null })).toEqual(["description"]);
  });

  it("still asks a hybrid event for its venue", () => {
    expect(missingDetails({ mode: "hybrid", description: "x", location: null })).toEqual(["venue"]);
  });
});
