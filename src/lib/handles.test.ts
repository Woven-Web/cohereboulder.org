import { describe, expect, it } from "vitest";
import { displayHandle } from "./handles";

describe("displayHandle", () => {
  it.each([
    ["aaron.scenius.social", "aaron"],
    ["Aaron.SCENIUS.SOCIAL", "Aaron"],
    ["aaron.extra.scenius.social", "aaron"],
    ["@aaron.scenius.social", "@aaron"],
    ["alice.bsky.social", "alice.bsky.social"],
    ["@alice.com", "@alice.com"],
    ["alice.com", "alice.com"],
    ["alice.scenius.social.evil.com", "alice.scenius.social.evil.com"],
    ["scenius.social", "scenius.social"],
    ["", ""], [undefined, ""], [null, ""],
  ])("formats %s as %s", (handle, expected) => {
    expect(displayHandle(handle)).toBe(expected);
  });
});
