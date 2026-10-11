import { describe, expect, it } from "vitest";
import { CHECKIN_PAGE } from "./checkin-page";

describe("check-in page sign-in link", () => {
  it("returns the volunteer to the check-in page, not the portal", () => {
    expect(CHECKIN_PAGE).toContain('<a href="/login?returnTo=%2Fadmin%2Fcheckin">Sign in</a>');
    expect(CHECKIN_PAGE).not.toContain('<a href="/admin">Sign in</a>');
  });
});
