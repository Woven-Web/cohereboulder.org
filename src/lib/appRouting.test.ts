import { describe, expect, it } from "vitest";
import { activeAppTab, signInDestination, shouldRedirectToApp } from "./appRouting";
describe("app routing", () => {
  it("redirects returning home visitors and newly signed-in sessions", () => {
    expect(shouldRedirectToApp(true, undefined, "/")).toBe(true);
    expect(shouldRedirectToApp(true, false, "/register")).toBe(true);
    expect(shouldRedirectToApp(true, undefined, "/login")).toBe(true);
    expect(shouldRedirectToApp(false, true, "/")).toBe(false);
    expect(shouldRedirectToApp(true, true, "/home")).toBe(false);
    expect(shouldRedirectToApp(true, undefined, "/events/a/b")).toBe(false);
    expect(shouldRedirectToApp(true, false, "/events/a/b")).toBe(false);
  });
  it("defaults sign-ins and home landings to events", () => { expect(signInDestination(null)).toBe("/events"); expect(signInDestination("/")).toBe("/events"); });
  it("preserves explicit internal return paths and rejects external redirects", () => { expect(signInDestination("/events/did:plc:a/event?x=1")).toBe("/events/did:plc:a/event?x=1"); expect(signInDestination("//evil.test")).toBe("/events"); expect(signInDestination("https://evil.test")).toBe("/events"); });
  it("marks event details and the board under their tabs", () => { expect(activeAppTab("/events/a/b")).toBe("events"); expect(activeAppTab("/board")).toBe("board"); expect(activeAppTab("/about")).toBeNull(); });
});
