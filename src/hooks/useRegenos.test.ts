import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answer = vi.hoisted(() => ({ next: null as null | { did: string | null; handle: string | null } | Error }));
vi.mock("@/lib/regenos", () => ({
  fetchSiteConfig: vi.fn(),
  fetchRegenosSession: vi.fn(async () => { if (answer.next instanceof Error) throw answer.next; return answer.next; }),
}));
import { fetchSessionAndRemember, readSignedInHint, SIGNED_IN_HINT_KEY } from "./useRegenos";

// The device remembers whether its last session answer was "signed in", so the next load can
// hold the masthead for a member instead of flashing the signed-out state.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the signed-in hint", () => {
  it("is set when the session names someone", async () => {
    answer.next = { did: "did:plc:me", handle: "me.test" };
    await expect(fetchSessionAndRemember()).resolves.toEqual({ did: "did:plc:me", handle: "me.test" });
    expect(store.get(SIGNED_IN_HINT_KEY)).toBe("1");
    expect(readSignedInHint()).toBe(true);
  });
  it("is cleared when the session is empty (signed out)", async () => {
    store.set(SIGNED_IN_HINT_KEY, "1");
    answer.next = { did: null, handle: null };
    await fetchSessionAndRemember();
    expect(store.has(SIGNED_IN_HINT_KEY)).toBe(false);
    expect(readSignedInHint()).toBe(false);
  });
  it("is cleared when the session can't be read, since the page then shows the signed-out state", async () => {
    store.set(SIGNED_IN_HINT_KEY, "1");
    answer.next = new Error("down");
    await expect(fetchSessionAndRemember()).rejects.toThrow("down");
    expect(store.has(SIGNED_IN_HINT_KEY)).toBe(false);
  });
  it("reads as not signed in where storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); } } });
    expect(readSignedInHint()).toBe(false);
  });
});
