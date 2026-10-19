import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SIGNED_IN_HINT_KEY } from "@/hooks/useRegenos";
import { AlmanacMast } from "./SiteChrome";

// The masthead while the site is still asking who this is. A device whose last answer was
// "signed in" must not flash "Join COhere" / "About" / "Sign in" at a member; a device with no
// such memory gets the signed-out masthead at once, so a first-time visitor never waits.

function device(signedInLastTime: boolean) {
  const store = new Map<string, string>(signedInLastTime ? [[SIGNED_IN_HINT_KEY, "1"]] : []);
  vi.stubGlobal("window", { location: { search: "?look=ecology", hostname: "test" }, localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
}
afterEach(() => { vi.unstubAllGlobals(); });

function client({ config, session, registration }: { config?: unknown; session?: unknown; registration?: unknown } = {}) {
  const c = new QueryClient();
  if (config !== undefined) c.setQueryData(["site-config"], config);
  if (session !== undefined) c.setQueryData(["regenos-session"], session);
  if (registration !== undefined) c.setQueryData(["my-registration", (session as { did?: string } | null)?.did], registration);
  return c;
}
const mast = (c: QueryClient) => renderToStaticMarkup(
  <QueryClientProvider client={c}><MemoryRouter initialEntries={["/calendar?look=ecology"]}><LanguageProvider><AlmanacMast register /></LanguageProvider></MemoryRouter></QueryClientProvider>,
);
/** The masthead's words a person can see: drops anything inside a visibility:hidden placeholder. */
const visibleWords = (html: string) => html.replace(/<(span|button)[^>]*visibility:hidden[^>]*>.*?<\/\1>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("AlmanacMast while it is still asking who this is", () => {
  it("shows a member's device no signed-out words, only empty placeholders that keep their place", () => {
    device(true);
    const html = mast(client());
    const words = visibleWords(html);
    expect(words).not.toContain("Join COhere");
    expect(words).not.toContain("Sign in");
    expect(words).not.toContain("About");
    expect(html).toContain('data-testid="registration-pending"');
    expect(html).toContain('data-testid="account-pending"');
    expect(html.match(/aria-hidden="true"[^>]*visibility:hidden|visibility:hidden[^>]*aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it("still holds once the config is in and the session is not", () => {
    device(true);
    const words = visibleWords(mast(client({ config: { regenosLoginEnabled: true } })));
    expect(words).not.toMatch(/Join COhere|Sign in|About/);
  });
  it("holds the Register button for a known member until their registration is read", () => {
    device(true);
    const html = mast(client({ config: { regenosLoginEnabled: true }, session: { did: "did:plc:me", handle: "me.test" } }));
    expect(visibleWords(html)).not.toContain("Join COhere");
    expect(html).toContain('data-testid="registration-pending"');
    expect(html).toContain("me.test");
  });
  it("then says what is true for that member", () => {
    device(true);
    const words = visibleWords(mast(client({ config: { regenosLoginEnabled: true }, session: { did: "did:plc:me", handle: "me.test" }, registration: { registered: false } })));
    expect(words).toContain("Register for the gathering");
    expect(words).not.toMatch(/Join COhere|Sign in|About/);
  });
  it("gives a device with no memory of a sign-in the signed-out masthead at once", () => {
    device(false);
    const html = mast(client());
    expect(visibleWords(html)).toContain("Join COhere");
    expect(visibleWords(html)).toContain("About");
    // Whether sign-in is on at all is not known yet: its place is kept, empty.
    expect(html).toContain('data-testid="account-pending"');
  });
  it("shows a signed-out visitor About, Join COhere and Sign in once it knows", () => {
    device(true);
    const words = visibleWords(mast(client({ config: { regenosLoginEnabled: true }, session: { did: null, handle: null } })));
    expect(words).toContain("About");
    expect(words).toContain("Join COhere");
    expect(words).toContain("Sign in");
  });
});
