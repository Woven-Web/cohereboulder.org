import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Registration from "./Registration";

const config = vi.hoisted(() => ({ regenosLoginEnabled: false }));
vi.mock("@/hooks/useRegenos", () => ({ useSiteConfig: () => ({ data: config }), useMyRegistration: () => ({ data: undefined }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ tr: (key: string) => key, language: "en" }) }));
vi.mock("@/components/Navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/DynamicForm", () => ({ DynamicForm: () => null }));

describe("registration sign-in affordance", () => {
  it.each([false, true])("honors regenosLoginEnabled=%s", (enabled) => {
    config.regenosLoginEnabled = enabled;
    const html = renderToStaticMarkup(<Registration />);
    expect(html.includes("app.alreadyJoined")).toBe(enabled);
    expect(html.includes("nav.signIn")).toBe(enabled);
  });
});
