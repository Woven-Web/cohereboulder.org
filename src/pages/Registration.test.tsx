import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Registration from "./Registration";

const state = vi.hoisted(() => ({
  config: { regenosLoginEnabled: false },
  session: null as { did: string | null } | null,
  mine: undefined as unknown,
  formProps: null as Record<string, unknown> | null,
}));
vi.mock("@/hooks/useRegenos", () => ({
  useSiteConfig: () => ({ data: state.config }),
  useRegenosSession: () => ({ data: state.session, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.mine, isLoading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ tr: (key: string) => key, language: "en" }) }));
vi.mock("@/components/Navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/DynamicForm", () => ({
  DynamicForm: (props: Record<string, unknown>) => {
    state.formProps = props;
    return null;
  },
}));

const render = () => renderToStaticMarkup(<MemoryRouter><Registration /></MemoryRouter>);

beforeEach(() => {
  state.config.regenosLoginEnabled = false;
  state.session = null;
  state.mine = undefined;
  state.formProps = null;
});

describe("registration sign-in affordance", () => {
  it.each([false, true])("honors regenosLoginEnabled=%s", (enabled) => {
    state.config.regenosLoginEnabled = enabled;
    const html = render();
    expect(html.includes("app.alreadyRegistered")).toBe(enabled);
    expect(html.includes("nav.signIn")).toBe(enabled);
  });

  it("signed in and registered: no sign-in line, the form is theirs to update", () => {
    state.config.regenosLoginEnabled = true;
    state.session = { did: "did:plc:me" };
    state.mine = { registered: true, email: "me@test.com", answers: { a: "b" } };
    const html = render();
    expect(html).not.toContain("app.alreadyRegistered");
    expect(renderToStaticMarkup(<>{state.formProps?.intro}</>)).toContain("app.updateRegistration");
    expect(state.formProps?.saved).toEqual(state.mine);
    expect(state.formProps?.submitLabel).toBe("app.saveChanges");
  });

  it("signed in, not yet registered: the email is prefilled but it is a new registration", () => {
    state.config.regenosLoginEnabled = true;
    state.session = { did: "did:plc:me" };
    state.mine = { registered: false, email: "me@test.com", answers: {} };
    expect(render()).not.toContain("app.alreadyRegistered");
    expect(state.formProps?.intro).toBeUndefined();
    expect(state.formProps?.saved).toEqual(state.mine);
    expect(state.formProps?.submitLabel).toBeUndefined();
  });

  it("offers sign-in for an email that is already registered, and an account after a new one", () => {
    state.config.regenosLoginEnabled = true;
    render();
    const outcome = state.formProps!.renderOutcome as (o: unknown, email: string) => React.ReactNode;
    const extra = state.formProps!.successExtra as (email: string) => React.ReactNode;
    const wrap = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
    expect(wrap(outcome({ alreadyRegistered: true, updated: false }, "a@test.com"))).toContain("app.emailAlreadyRegistered");
    expect(outcome({ alreadyRegistered: false, updated: false }, "a@test.com")).toBeNull();
    expect(wrap(extra("a@test.com"))).toContain("app.createAccountToRsvp");
  });
});
