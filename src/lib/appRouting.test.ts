import { describe, expect, it } from "vitest";
import { activeAppTab, isWorkerPage, signInDestination, shouldRedirectToApp } from "./appRouting";
describe("app routing", () => {
  it("keeps normal signed-in home visits on home", () => {
    expect(shouldRedirectToApp(true, "/")).toBe(false);
    expect(shouldRedirectToApp(true, "/register")).toBe(false);
    expect(shouldRedirectToApp(true, "/login")).toBe(false);
    expect(shouldRedirectToApp(false, "/")).toBe(false);
    expect(shouldRedirectToApp(true, "/home")).toBe(false);
    expect(shouldRedirectToApp(true, "/events/a/b")).toBe(false);
  });
  it.each(["/register", "/join/abc", "/board"])("keeps sign-in on %s", (path) => {
    expect(shouldRedirectToApp(true, path)).toBe(false);
    expect(signInDestination(path)).toBe(path);
  });
  it("redirects home sessions but leaves the handle wizard in control", () => {
    expect(shouldRedirectToApp(true, "/")).toBe(false);
    expect(shouldRedirectToApp(true, "/login")).toBe(false);
    expect(signInDestination("/join/abc?from=invite#details")).toBe("/join/abc?from=invite#details");
    expect(signInDestination(null)).toBe("/events");
  });
  it.each(["///", "//evil.test", "/\\evil.test", "/\n/evil.test", "/login#handle", "/events/../login", "https://evil.test"])("rejects unsafe or login return path %s", (path) => {
    expect(signInDestination(path)).toBe("/events");
  });
  it("returns completed login handle steps to the saved path or events", () => {
    expect(signInDestination("/board")).toBe("/board");
    expect(signInDestination(null)).toBe("/events");
  });
  it("defaults sign-ins and home landings to events", () => { expect(signInDestination(null)).toBe("/events"); expect(signInDestination("/")).toBe("/events"); });
  it("preserves explicit internal return paths and rejects external redirects", () => { expect(signInDestination("/events/did:plc:a/event?x=1")).toBe("/events/did:plc:a/event?x=1"); expect(signInDestination("//evil.test")).toBe("/events"); expect(signInDestination("https://evil.test")).toBe("/events"); });
  it("marks event details and the board under their tabs", () => { expect(activeAppTab("/events/a/b")).toBe("events"); expect(activeAppTab("/board")).toBe("board"); expect(activeAppTab("/about")).toBeNull(); });
  it("keeps the members area (threads, People, profiles) under the Board tab", () => {
    for (const path of ["/board/did%3Aplc%3Aa/3k", "/people", "/people/did%3Aplc%3Aa", "/profile"]) expect(activeAppTab(path)).toBe("board");
    expect(activeAppTab("/boardwalk")).toBeNull();
  });
  it("keeps Today lit for its quests, and More has its own tab", () => { for (const path of ["/today", "/quests"]) expect(activeAppTab(path)).toBe("today"); expect(activeAppTab("/more")).toBe("more"); });
});

it("redirects only an explicit sign-in landing", () => {
  expect(shouldRedirectToApp(true, "/", "?signedIn=1")).toBe(true);
  expect(signInDestination("/register", true)).toBe("/events");
  expect(signInDestination("/register", false)).toBe("/register");
  expect(signInDestination("/register?edit=1", true)).toBe("/register?edit=1");
});

describe("the admin portal is a Worker page, not an SPA route", () => {
  it("is returned to after sign-in", () => {
    expect(signInDestination("/admin")).toBe("/admin");
    expect(signInDestination("/admin/checkin")).toBe("/admin/checkin");
  });
  it.each(["/admin", "/admin/", "/admin/checkin", "/admin?x=1"])("%s needs a real page load", (path) => expect(isWorkerPage(path)).toBe(true));
  it.each(["/events", "/administrators", "/adminx", "/register"])("%s stays in the SPA", (path) => expect(isWorkerPage(path)).toBe(false));
});
