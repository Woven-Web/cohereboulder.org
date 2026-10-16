import { describe, expect, it } from "vitest";
import { signedInInstallEligible, shouldOffer, type OfferContext } from "./installOffer";

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

const signedIn = { pathname: "/", signedIn: true, phone: true, installPath: true };
describe("signed-in install invitation", () => {
  it("shares the once, dismissed, installed and capability rules", () => {
    expect(shouldOffer("signedin", base)).toBe(true);
    for (const change of [{ offered: true }, { dismissed: true }, { installed: true }, { hasSomethingToOffer: false }]) {
      expect(shouldOffer("signedin", { ...base, ...change })).toBe(false);
    }
  });
  it("requires a signed-in phone with an install path", () => {
    expect(signedInInstallEligible(signedIn)).toBe(true);
    for (const change of [{ signedIn: false }, { phone: false }, { installPath: false }]) {
      expect(signedInInstallEligible({ ...signedIn, ...change })).toBe(false);
    }
  });
  it("allows app reading screens, never authentication or editing routes", () => {
    for (const pathname of ["/", "/home", "/today", "/calendar", "/events", "/events/did/key", "/board", "/board/did/key", "/people", "/people/did", "/more"]) {
      expect(signedInInstallEligible({ ...signedIn, pathname })).toBe(true);
    }
    for (const pathname of ["/register", "/login", "/admin", "/admin/events", "/profile", "/propose", "/join/token", "/more/notifications"]) {
      expect(signedInInstallEligible({ ...signedIn, pathname })).toBe(false);
    }
  });
});
