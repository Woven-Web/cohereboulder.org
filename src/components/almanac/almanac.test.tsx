import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { HexTrail } from "./HexTrail";
import { SeatBadge } from "./SeatBadge";
import { YourNextStrip } from "./YourNextStrip";
import { Ridgeline } from "./Folio";
import { seatOf } from "./seat";
import { fill } from "./format";
import { AddressBlock } from "./AddressBlock";

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter><LanguageProvider>{node}</LanguageProvider></MemoryRouter>);

describe("HexTrail", () => {
  it("fit is a nav of links, each named with its day, state and your events", () => {
    const html = wrap(<HexTrail variant="fit" today="2026-10-17" done={["2026-10-15"]} counts={{ "2026-10-17": 2 }} />);
    expect(html).toContain("<nav");
    expect(html).toContain('aria-label="Festival days, Oct 15 to 25"');
    expect(html.match(/<a /g)).toHaveLength(11);
    expect(html).toContain('aria-label="Thursday Oct 15, practice done"');
    expect(html).toContain('aria-label="Saturday Oct 17, today, 2 of your events"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('href="/calendar?day=2026-10-17"');
  });
  it("pick is a horizontal listbox with one selected option and one tab stop", () => {
    const html = wrap(<HexTrail variant="pick" today="2026-10-17" selected="2026-10-18" counts={{ "2026-10-18": 1 }} />);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html.match(/role="option"/g)).toHaveLength(11);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Sunday Oct 18, 1 of your events"');
  });
  it("fills placeholders", () => {
    expect(fill("{n} de tus eventos", { n: 2 })).toBe("2 de tus eventos");
  });
});

describe("seat badges", () => {
  it("maps list entries to Going / Requested / Waitlisted", () => {
    const event = { did: "d", rkey: "r", name: "n", imageUrl: null, startsAt: null, endsAt: null, description: null, status: null, mode: null, location: null };
    expect(seatOf({ event, source: "email" })).toBe("going");
    expect(seatOf({ event, source: "regenos", seat: "confirmed" })).toBe("going");
    expect(seatOf({ event, source: "regenos", seat: "requested" })).toBe("requested");
    expect(seatOf({ event, source: "regenos", seat: "waitlisted" })).toBe("waitlisted");
    expect(wrap(<SeatBadge seat="waitlisted" />)).toContain('data-state="waitlisted">Waitlisted');
  });
});

describe("Your next", () => {
  const event = { did: "did:plc:x", rkey: "a", name: "Song Circle", imageUrl: null, startsAt: "2026-10-18T18:00:00Z", endsAt: null, description: null, status: null, mode: null, location: { name: "The Hub" } };
  it("lists events with their seat and a link to the details", () => {
    const html = wrap(<YourNextStrip items={[{ event, seat: "going" }]} total={3} today="2026-10-17" />);
    expect(html).toContain('data-testid="your-next"');
    expect(html).toContain("Song Circle");
    expect(html).toContain('href="/events/did%3Aplc%3Ax/a"');
    expect(html).toContain("All 3 of your events");
  });
  it("is a quiet hint, not an empty box, with no events", () => {
    const html = wrap(<YourNextStrip items={[]} total={0} today="2026-10-17" />);
    expect(html).not.toContain('data-testid="your-next"');
    expect(html).toContain("Nothing yet");
  });
});

describe("Ridgeline", () => {
  it("is named for screen readers and places the sun inside the frame", () => {
    const html = wrap(<Ridgeline minutes={9 * 60 + 40} rise={431} set={1092} wide={false} label="A ridgeline" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="A ridgeline"');
    const cx = Number(html.match(/<circle cx="(\d+)"/)?.[1]);
    expect(cx).toBeGreaterThan(30);
    expect(cx).toBeLessThan(400);
  });
});

describe("AddressBlock", () => {
  const location = { name: "The Hub", street: "1520 Pearl St", locality: "Boulder", region: "CO", postalCode: "80302" };
  it("gives screen readers the full address once, with the decorative split hidden", () => {
    const html = wrap(<AddressBlock location={location as never} />);
    // What a screen reader would read: drop aria-hidden subtrees (flat divs here), then the tags.
    const visible = html.replace(/<div[^>]*aria-hidden="true"[^>]*>.*?<\/div>/g, "").replace(/<[^>]+>/g, " ");
    expect(html).toContain('class="sr-only"');
    expect(html).toMatch(/sr-only[^>]*>[^<]*1520 Pearl St/);
    // Outside the hidden split, the number appears exactly once (in the sr-only line).
    expect((visible.match(/1520/g) ?? []).length).toBe(1);
  });
});

describe("ecology look", () => {
  const at = (url: string, node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><LanguageProvider>{node}</LanguageProvider></MemoryRouter>);
  it("draws the landscape above both trails only under ?look=ecology, and keeps the trail's links", () => {
    for (const variant of ["fit", "pick"] as const) {
      const eco = at("/today?look=ecology", <HexTrail variant={variant} today="2026-10-17" />);
      expect(eco).toContain("eco-ridges");
      expect(eco).toContain('aria-hidden="true"');
      expect(at("/today?look=almanac", <HexTrail variant={variant} today="2026-10-17" />)).not.toContain("eco-ridges");
      expect(wrap(<HexTrail variant={variant} today="2026-10-17" />)).not.toContain("eco-ridges");
    }
    expect(at("/today?look=ecology", <HexTrail variant="fit" today="2026-10-17" />).match(/<a /g)).toHaveLength(11);
  });
});
