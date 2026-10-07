import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ registered: null as boolean | null }));
vi.mock("@/hooks/useRegenos", () => ({
  useMyRegistration: () => ({ data: state }),
  useSiteConfig: () => ({ data: { regenosLoginEnabled: true } }),
  useRegenosSession: () => ({ data: { did: "did:plc:fixture" } }),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", tr: (key: string) => key }) }));
vi.mock("@/components/Navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
import About from "./About";
import CoCreate from "./CoCreate";
it.each([true, false, null])("About and Co-create reflect registration state %s", registered => {
  state.registered = registered;
  for (const Page of [About, CoCreate]) {
    const html = renderToStaticMarkup(<MemoryRouter><Page /></MemoryRouter>);
    expect(html.includes('href="/register"')).toBe(registered !== true);
    if (registered) expect(html).toContain('role="status"');
  }
});
