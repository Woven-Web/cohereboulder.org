import { describe, expect, it } from "vitest";
import { LOOKS, TRAILS, lookClass, resolveFlag } from "./look";

describe("resolveFlag", () => {
  it("defaults to classic / zigzag", () => {
    expect(resolveFlag("", null, "look", LOOKS, "classic")).toBe("classic");
    expect(resolveFlag("", null, "trail", TRAILS, "zigzag")).toBe("zigzag");
  });
  it("the query wins over what was stored", () => {
    expect(resolveFlag("?look=almanac", "classic", "look", LOOKS, "classic")).toBe("almanac");
    expect(resolveFlag("?look=classic", "almanac", "look", LOOKS, "classic")).toBe("classic");
  });
  it("knows the ecology look and keeps it for the session", () => {
    expect(resolveFlag("?look=ecology", null, "look", LOOKS, "classic")).toBe("ecology");
    expect(resolveFlag("", "ecology", "look", LOOKS, "classic")).toBe("ecology");
    expect(lookClass("ecology")).toBe(" eco");
    expect(lookClass("almanac")).toBe("");
  });
  it("a stored choice persists when the query is gone", () => {
    expect(resolveFlag("", "row", "trail", TRAILS, "zigzag")).toBe("row");
  });
  it("ignores values it does not know", () => {
    expect(resolveFlag("?look=neon", "almanac", "look", LOOKS, "classic")).toBe("almanac");
    expect(resolveFlag("?trail=x", "nope", "trail", TRAILS, "zigzag")).toBe("zigzag");
  });
});
