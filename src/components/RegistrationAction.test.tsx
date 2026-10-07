import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ registered: null as boolean | null }));
vi.mock("@/hooks/useRegenos", () => ({ useMyRegistration: () => ({ data: state }), useSiteConfig: () => ({ data: { regenosLoginEnabled: true } }), useRegenosSession: () => ({ data: { did: "did:plc:me" } }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ tr: (key: string) => key }) }));
import { RegistrationAction } from "./RegistrationAction";
it.each([true, false, null])("renders registration state %s", registered => {
  state.registered = registered;
  const html = renderToStaticMarkup(<MemoryRouter><RegistrationAction className="button-style" /></MemoryRouter>);
  if (registered !== null) expect(html).toContain('class="button-style"');
  else expect(html).toContain("text-muted-foreground");
  expect(html.includes('href="/register"')).toBe(registered !== true);
  expect(html).toContain(registered ? "app.registered" : registered === false ? "app.registerGathering" : "nav.register");
});
