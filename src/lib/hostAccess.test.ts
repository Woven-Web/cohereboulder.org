import { describe, expect, it } from "vitest";
import { canHostScene } from "./hostAccess";

const did = "did:plc:viewer";

describe("host affordances", () => {
  it("does not offer scene management to an ordinary signed-in member", () => {
    expect(canHostScene(did, { members: [{ did, role: "member" }], steward: false })).toBe(false);
    expect(canHostScene(did, { members: [], steward: false })).toBe(false);
  });

  it("offers management to builders, facilitators and stewards", () => {
    for (const role of ["builder", "facilitator", "steward"]) {
      expect(canHostScene(did, { members: [{ did, role }], steward: false })).toBe(true);
    }
    expect(canHostScene(did, { members: [], steward: true })).toBe(true);
  });

  it("does not infer the viewer's role from someone else's membership", () => {
    expect(canHostScene(did, { members: [{ did: "did:plc:other", role: "steward" }], steward: false })).toBe(false);
    expect(canHostScene(null, { members: [{ did, role: "steward" }], steward: false })).toBe(false);
    expect(canHostScene(did, undefined)).toBe(false);
  });
});
