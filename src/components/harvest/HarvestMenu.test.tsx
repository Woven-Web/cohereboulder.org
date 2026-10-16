import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { translations } from "@/lib/translations";
import { HarvestMenu } from "./HarvestMenu";

const html = renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <LanguageProvider><HarvestMenu harvestId="h1" onEdit={() => {}} onDeleted={() => {}} /></LanguageProvider>
  </QueryClientProvider>,
);

describe("the harvest ⋯ menu", () => {
  it("is one labelled button that starts closed", () => {
    expect(html).toContain('aria-label="Harvest options"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
  it("puts no Delete in the page until the menu is open, and no confirm button until Delete is chosen", () => {
    expect(html).not.toContain('data-testid="harvest-menu-delete"');
    expect(html).not.toContain('data-testid="harvest-delete-yes"');
  });
  it("asks \"Delete this harvest?\" with Delete and Cancel, in both languages", () => {
    const harvest = translations.notify.harvest;
    expect(harvest.deleteTitle).toEqual({ en: "Delete this harvest?", es: "¿Eliminar esta cosecha?" });
    expect(harvest.deleteYes.en).toBe("Delete");
    expect(harvest.deleteKeep).toEqual({ en: "Cancel", es: "Cancelar" });
  });
});
