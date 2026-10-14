import { describe, expect, it } from "vitest";
import { shouldOffer, type OfferContext } from "./installOffer";

const base: OfferContext = { installed: false, dismissed: false, offered: false, hasSomethingToOffer: true };

describe("shouldOffer", () => {
  it("offers once on its own", () => {
    expect(shouldOffer("didit", base)).toBe(true);
    expect(shouldOffer("reminders", base)).toBe(true);
    expect(shouldOffer("didit", { ...base, offered: true })).toBe(false);
  });
  it("never offers after Not now, but the More entry still works", () => {
    expect(shouldOffer("didit", { ...base, dismissed: true })).toBe(false);
    expect(shouldOffer("reminders", { ...base, dismissed: true })).toBe(false);
    expect(shouldOffer("manual", { ...base, dismissed: true, offered: true })).toBe(true);
  });
  it("never volunteers an install to an installed app, but a manual ask still shows the reminders", () => {
    expect(shouldOffer("didit", { ...base, installed: true })).toBe(false);
    expect(shouldOffer("reminders", { ...base, installed: true })).toBe(false);
    expect(shouldOffer("manual", { ...base, installed: true })).toBe(true);
  });
  it("offers nothing when there is nothing to offer", () => {
    expect(shouldOffer("didit", { ...base, hasSomethingToOffer: false })).toBe(false);
    expect(shouldOffer("manual", { ...base, hasSomethingToOffer: false })).toBe(false);
  });
});
