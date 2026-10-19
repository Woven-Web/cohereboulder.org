import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ registered: null as boolean | null }));
const auth = vi.hoisted(() => ({ hold: false, loading: false }));
vi.mock("@/hooks/useRegenos", () => ({
  useMyRegistration: () => ({ data: auth.loading ? undefined : state, isLoading: auth.loading }),
  useAuthState: () => ({ session: { did: "did:plc:me" }, hold: auth.hold }),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ tr: (key: string) => key }) }));
import { RegistrationAction } from "./RegistrationAction";
const render = () => renderToStaticMarkup(<MemoryRouter><RegistrationAction className="button-style" /></MemoryRouter>);
it.each([true, false, null])("renders registration state %s", registered => {
  state.registered = registered;
  auth.hold = false; auth.loading = false;
  const html = render();
  if (registered === false) expect(html).toContain('class="button-style"');
  else if (registered) {
    expect(html).toContain('role="status"');
    expect(html).toContain("border-0");
    expect(html).toContain("lucide-check");
    expect(html).not.toContain("tabindex");
  }
  else expect(html).toContain("text-muted-foreground");
  expect(html.includes('href="/register"')).toBe(registered !== true);
  expect(html).toContain(registered ? "app.registered" : registered === false ? "app.registerGathering" : "nav.register");
});
it.each([["the member's registration is still being read", { hold: false, loading: true }], ["who this is is not known yet, on a device signed in last time", { hold: true, loading: false }]])(
  "keeps its place, hidden and not a link, while %s", (_why, s) => {
    Object.assign(auth, s);
    const html = render();
    expect(html).toContain('data-testid="registration-pending"');
    expect(html).toContain("visibility:hidden");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="button-style"');
    expect(html).not.toContain("href=");
  });
