import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SignInPrompt } from "./SignInPrompt";

const wrap = (client = new QueryClient()) => renderToStaticMarkup(<QueryClientProvider client={client}><LanguageProvider><SignInPrompt /></LanguageProvider></QueryClientProvider>);
const known = (config: unknown, session?: unknown) => {
  const client = new QueryClient();
  client.setQueryData(["site-config"], config);
  if (session !== undefined) client.setQueryData(["regenos-session"], session);
  return client;
};

describe("SignInPrompt", () => {
  it("holds its place, hidden, until it knows who this is, so the page doesn't jump when it arrives", () => {
    const html = wrap();
    expect(html).toContain("visibility:hidden");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('data-testid="signin-prompt"');
  });
  it("offers sign-in to a signed-out visitor", () => {
    const html = wrap(known({ regenosLoginEnabled: true }, null));
    expect(html).toContain('data-testid="signin-prompt"');
    expect(html).not.toContain("visibility:hidden");
  });
  it("is gone for someone signed in, and when sign-in is off", () => {
    expect(wrap(known({ regenosLoginEnabled: true }, { did: "did:plc:me" }))).toBe("");
    expect(wrap(known({ regenosLoginEnabled: false }))).toBe("");
  });
});
