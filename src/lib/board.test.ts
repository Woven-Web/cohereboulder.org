import { describe, expect, it } from "vitest";
import { groupByDay, initials, splitFeed, tagCounts, threadReplies, type BoardPost } from "./board";

const mk = (rkey: string, createdAt: string, extra: Partial<BoardPost["record"]> = {}, author = "did:plc:a"): BoardPost => ({
  uri: `at://${author}/coop.lexicon.post/${rkey}`, cid: `cid-${rkey}`, author, record: { text: rkey, createdAt, ...extra },
});
const ref = (p: BoardPost) => ({ uri: p.uri, cid: p.cid });

describe("board shaping", () => {
  const root1 = mk("r1", "2026-10-12T15:00:00Z", { tags: ["offers", "harvest"] });
  const root2 = mk("r2", "2026-10-13T15:00:00Z", { tags: ["offers"] });
  const rep1 = mk("p1", "2026-10-12T16:00:00Z", { reply: { root: ref(root1), parent: ref(root1) } });
  const rep2 = mk("p2", "2026-10-12T17:00:00Z", { reply: { root: ref(root1), parent: ref(rep1) } });

  it("splits roots (newest first) from replies and counts replies per root", () => {
    const { roots, replyCounts } = splitFeed([root1, rep1, root2, rep2]);
    expect(roots.map((r) => r.uri)).toEqual([root2.uri, root1.uri]);
    expect(replyCounts.get(root1.uri)).toBe(2);
    expect(replyCounts.get(root2.uri)).toBeUndefined();
  });
  it("counts tags once per post", () => {
    expect(Object.fromEntries(tagCounts([root1, root2]))).toEqual({ offers: 2, harvest: 1 });
  });
  it("groups by Denver day, not UTC", () => {
    // 02:00 UTC on the 14th is still the evening of the 13th in Denver.
    const late = mk("late", "2026-10-14T02:00:00Z");
    expect(groupByDay([late, root2, root1]).map((g) => [g.day, g.posts.length])).toEqual([["2026-10-13", 2], ["2026-10-12", 1]]);
  });
  it("orders replies oldest first and resolves a non-root parent", () => {
    const out = threadReplies([root1, rep2, rep1], root1.uri);
    expect(out.map((r) => r.post.uri)).toEqual([rep1.uri, rep2.uri]);
    expect(out[0].parent).toBeNull();
    expect(out[1].parent?.uri).toBe(rep1.uri);
  });
  it("makes initials", () => {
    expect(initials("Pia Mock")).toBe("PM");
    expect(initials("pia.mock.test")).toBe("PT");
    expect(initials("@ana")).toBe("A");
    expect(initials("")).toBe("?");
  });
});
