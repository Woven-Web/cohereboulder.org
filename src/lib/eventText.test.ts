import { describe, expect, it } from "vitest";
import { rejoinWrappedLines } from "./eventText";

describe("rejoinWrappedLines", () => {
  it("joins a line wrapped mid-sentence", () => {
    expect(rejoinWrappedLines("a living\nspiritual presence")).toBe("a living spiritual presence");
  });
  it("keeps list lines, sentence ends and paragraph breaks", () => {
    const text = "5:30 PM Welcome\nlocal organizations\n6:00 PM Dinner\n\nOn-site childcare.\nNext line";
    expect(rejoinWrappedLines(text)).toBe("5:30 PM Welcome local organizations\n6:00 PM Dinner\n\nOn-site childcare.\nNext line");
  });
});
