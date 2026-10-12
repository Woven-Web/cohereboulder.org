import { describe, expect, it } from "vitest";
import { cleanLinks, entryName, fold, graphemes, linkLabel, matchesSearch, safeLink, type DirectoryEntry } from "./people";

const entry = (record: DirectoryEntry["record"]): DirectoryEntry => ({ uri: "u", cid: "c", author: "did:plc:a", record, profileSource: "contextual" });

describe("directory search", () => {
  it("is accent- and case-insensitive over name and bio", () => {
    const e = entry({ displayName: "José Álvarez", bio: "I keep bees near Lyons" });
    expect(matchesSearch(e, "José Álvarez", "jose")).toBe(true);
    expect(matchesSearch(e, "José Álvarez", "ALVAREZ")).toBe(true);
    expect(matchesSearch(e, "José Álvarez", "bees")).toBe(true);
    expect(matchesSearch(e, "José Álvarez", "goats")).toBe(false);
    expect(matchesSearch(e, "José Álvarez", "   ")).toBe(true);
    expect(fold("Ñandú")).toBe("nandu");
  });
  it("falls back to the roster name when the profile has none", () => {
    expect(entryName(entry({}), "pia.mock.test")).toBe("pia.mock.test");
    expect(entryName(entry({ displayName: " Pia " }), "x")).toBe("Pia");
  });
});

describe("profile links", () => {
  it.each([
    ["https://example.org/a", "https://example.org/a"],
    ["mailto:pia@example.org", "mailto:pia@example.org"],
    ["javascript:alert(1)", null],
    ["data:text/html,<script>", null],
    ["not a url", null],
  ])("safeLink(%s)", (input, expected) => expect(safeLink(input)).toBe(expected));
  it("cleans editor input: adds https, drops unsafe, de-duplicates, caps", () => {
    const { links, rejected } = cleanLinks(["example.org", "https://example.org/", "javascript:alert(1)", "  ", "ftp://x.test"]);
    expect(links).toEqual(["https://example.org/"]);
    expect(rejected).toEqual(["javascript:alert(1)", "ftp://x.test"]);
    expect(cleanLinks(Array.from({ length: 14 }, (_, i) => `https://e${i}.test`)).links).toHaveLength(10);
  });
  it("labels links by host", () => {
    expect(linkLabel("https://www.example.org/")).toBe("example.org");
    expect(linkLabel("https://example.org/farm")).toBe("example.org/farm");
    expect(linkLabel("mailto:pia@example.org")).toBe("pia@example.org");
  });
});

describe("graphemes", () => {
  it("counts what a person sees as one character", () => {
    expect(graphemes("café")).toBe(4);
    expect(graphemes("👩‍🌾")).toBe(1);
  });
});
