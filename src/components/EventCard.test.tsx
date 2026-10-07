import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { EventCard } from "./EventCard";
import { getTranslation } from "@/lib/translations";

vi.mock("@/hooks/useRegenos", () => ({
  useSiteConfig: () => ({ data: { regenosLoginEnabled: false } }),
  useRegenosSession: () => ({ data: null }),
}));

describe("event card preview", () => {
  it("collapses paragraphs into one clamped block without adding an ellipsis node", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><LanguageProvider>
          <EventCard event={{ did: "did:plc:test", rkey: "test", name: "Gathering", description: "First paragraph.\n\nSecond paragraph.\nThird paragraph.", imageUrl: null, startsAt: null, endsAt: null, status: null, mode: null, location: null }} />
        </LanguageProvider></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toMatch(/<p data-testid="card-description" class="[^"]*line-clamp-3">First paragraph\. Second paragraph\. Third paragraph\.<\/p>/);
    expect(html).not.toContain("…");
    expect(html).not.toContain("More about");
  });

  it.each([
    ["cardRsvp", "RSVP", "Confirmar"],
    ["cardGoing", "✓ Going", "✓ Vas a ir"],
    ["cardMore", "More", "Más"],
  ])("provides both languages for %s", (key, en, es) => {
    expect(getTranslation(`calendar.events.${key}`, "en")).toBe(en);
    expect(getTranslation(`calendar.events.${key}`, "es")).toBe(es);
  });
});
