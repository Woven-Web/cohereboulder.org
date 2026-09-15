import { describe, expect, it } from "vitest";
import { buildEventIcs } from "./ics";
import type { CommunityEvent } from "./events";

type IcsEvent = Pick<CommunityEvent, "did" | "rkey" | "name" | "startsAt" | "endsAt" | "description" | "location">;

const baseEvent: IcsEvent = {
  did: "did:plc:mockscene",
  rkey: "ev-test1",
  name: "Ecology Walk",
  startsAt: "2026-10-16T18:00:00.000Z",
  endsAt: "2026-10-16T20:00:00.000Z",
  description: "A slow walk along the creek, then tea.",
  location: {
    name: "Chautauqua Ranger Cottage",
    street: "900 Baseline Rd",
    locality: "Boulder",
  },
};

const SITE_URL = "https://cohereboulder.org/events/did:plc:mockscene/ev-test1";

/** Split on the RFC 5545 CRLF the builder emits, dropping the trailing blank. */
function icsLines(ics: string): string[] {
  return ics.split("\r\n").filter((_, i, arr) => i < arr.length - 1 || arr[i] !== "");
}

describe("buildEventIcs — envelope and required fields", () => {
  it("returns a VCALENDAR/VEVENT envelope with the expected fixed fields", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL);
    expect(ics).not.toBeNull();
    const lines = icsLines(ics as string);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//COhere Boulder//Community Calendar//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines[lines.length - 2]).toBe("END:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("uses CRLF line endings throughout and ends with a trailing CRLF", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    expect(ics.includes("\n") && !ics.includes("\r\n")).toBe(false);
    // Every "\n" in the file must be preceded by "\r".
    expect(ics.match(/(?<!\r)\n/)).toBeNull();
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("builds a UID from rkey and did, scoped to the site's domain", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    expect(ics).toContain(`UID:${baseEvent.rkey}.${baseEvent.did}@cohereboulder.org`);
  });

  it("includes the site URL as URL:", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    expect(ics).toContain(`URL:${SITE_URL}`);
  });

  it("omits DESCRIPTION and LOCATION when absent, without leaving blank lines", () => {
    const ics = buildEventIcs({ ...baseEvent, description: null, location: null }, SITE_URL) as string;
    const lines = icsLines(ics);
    expect(lines.some((l) => l.startsWith("DESCRIPTION"))).toBe(false);
    expect(lines.some((l) => l.startsWith("LOCATION"))).toBe(false);
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });
});

describe("buildEventIcs — datetime handling", () => {
  it("renders DTSTART/DTEND as UTC YYYYMMDDTHHmmssZ", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    expect(ics).toContain("DTSTART:20261016T180000Z");
    expect(ics).toContain("DTEND:20261016T200000Z");
  });

  it("falls back to a one-hour duration when there is no end time", () => {
    const ics = buildEventIcs({ ...baseEvent, endsAt: null }, SITE_URL) as string;
    expect(ics).toContain("DTSTART:20261016T180000Z");
    expect(ics).toContain("DTEND:20261016T190000Z");
  });

  it("falls back to a one-hour duration when the end time doesn't parse", () => {
    const ics = buildEventIcs({ ...baseEvent, endsAt: "not-a-date" }, SITE_URL) as string;
    expect(ics).toContain("DTEND:20261016T190000Z");
  });

  it("returns null when there is no start time", () => {
    expect(buildEventIcs({ ...baseEvent, startsAt: null }, SITE_URL)).toBeNull();
  });

  it("returns null when the start time doesn't parse", () => {
    expect(buildEventIcs({ ...baseEvent, startsAt: "not-a-date" }, SITE_URL)).toBeNull();
  });

  it("stamps DTSTAMP as a well-formed UTC instant", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
});

describe("buildEventIcs — RFC 5545 §3.3.11 escaping", () => {
  it("escapes backslash, semicolon, comma, and newlines in SUMMARY", () => {
    const ics = buildEventIcs(
      { ...baseEvent, name: 'Walk; Talk, and "Tea" \\ Trivia\nSession two' },
      SITE_URL,
    ) as string;
    expect(ics).toContain('SUMMARY:Walk\\; Talk\\, and "Tea" \\\\ Trivia\\nSession two');
  });

  it("escapes the same characters in DESCRIPTION", () => {
    const ics = buildEventIcs(
      { ...baseEvent, description: "Bring snacks; drinks, and a blanket.\r\nRain cancels." },
      SITE_URL,
    ) as string;
    expect(ics).toContain("DESCRIPTION:Bring snacks\\; drinks\\, and a blanket.\\nRain cancels.");
  });

  it("escapes characters that appear in the assembled LOCATION line", () => {
    const ics = buildEventIcs(
      { ...baseEvent, location: { name: "Hall A; B", street: "1, Main St" } },
      SITE_URL,
    ) as string;
    // locationLine joins name/street/locality with " · " — the escape runs on
    // the assembled line, so the embedded ";" and "," still get escaped, but
    // the separator itself (not one of the four escaped characters) is not.
    expect(ics).toContain("LOCATION:Hall A\\; B · 1\\, Main St");
  });
});

describe("buildEventIcs — RFC 5545 §3.1 line folding", () => {
  it("does not fold a line at or under 75 octets", () => {
    const ics = buildEventIcs(baseEvent, SITE_URL) as string;
    const lines = icsLines(ics);
    const summaryLine = lines.find((l) => l.startsWith("SUMMARY:")) as string;
    expect(summaryLine.length).toBeLessThanOrEqual(75);
    // Not folded: the line after it is a real property, not a continuation.
    const idx = lines.indexOf(summaryLine);
    expect(lines[idx + 1].startsWith(" ")).toBe(false);
  });

  it("folds a line over 75 octets, continuation lines starting with a single space", () => {
    const longDescription = "This is a very long description that goes on and on ".repeat(4).trim();
    const ics = buildEventIcs({ ...baseEvent, description: longDescription }, SITE_URL) as string;
    // Folding happens before the CRLF split, so recover the raw physical
    // line (CRLF + one space is a continuation, not a new property).
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${longDescription}`);

    // And the actual bytes sent DID get split into <=75-char chunks with a
    // leading space on every continuation.
    const rawLines = ics.split("\r\n");
    const descStart = rawLines.findIndex((l) => l.startsWith("DESCRIPTION:"));
    expect(descStart).toBeGreaterThanOrEqual(0);
    expect(rawLines[descStart].length).toBeLessThanOrEqual(75);
    expect(rawLines[descStart + 1].startsWith(" ")).toBe(true);
  });

  it("reassembling every folded line loses no content", () => {
    const longName = "A".repeat(200);
    const ics = buildEventIcs({ ...baseEvent, name: longName }, SITE_URL) as string;
    const unfolded = (ics as string).replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${longName}`);
  });
});
