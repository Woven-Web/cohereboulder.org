import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormDefinition } from "@/lib/api";

const state = vi.hoisted(() => ({
  language: "en",
  stateCalls: 0,
  definition: null as FormDefinition | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
// Supply the loaded definition during server rendering, where effects do not run.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => react.useState(state.stateCalls++ === 0 ? state.definition : initial) };
});
import { DynamicForm } from "./DynamicForm";

beforeEach(() => {
  state.language = "en";
  state.definition = {
    slug: "test", title: "Test form", event: null, active: true,
    fields: [{ key: "donation", type: "text", label: "Amount", intro: "First paragraph.\n\nSecond paragraph." }],
  };
});

const render = () => {
  state.stateCalls = 0;
  return renderToStaticMarkup(<DynamicForm slug="test" />);
};

describe("field intro heading", () => {
  it.each(["en", "es"])("renders the %s heading before intro paragraphs", (language) => {
    state.language = language;
    Object.assign(state.definition!.fields[0], { intro_heading: "Donation (optional)", intro_heading_es: "Donación (opcional)" });
    const html = render();
    const heading = language === "es" ? "Donación (opcional)" : "Donation (optional)";
    expect(html).toMatch(new RegExp(`<h3[^>]*>${heading.replace(/[()]/g, "\\$&")}</h3>`));
    expect(html.indexOf(heading)).toBeLessThan(html.indexOf("First paragraph."));
  });

  it.each(["text", "checkbox"] as const)("renders a heading without intro above a %s label, with English fallback", (type) => {
    state.language = "es";
    Object.assign(state.definition!.fields[0], { type, intro: undefined, intro_heading: "Donation (optional)" });
    const html = render();
    expect(html).toMatch(/<h3[^>]*>Donation \(optional\)<\/h3>/);
    expect(html.indexOf("Donation (optional)")).toBeLessThan(html.indexOf("Amount"));
  });

  it("omits the field heading when unset", () => {
    const html = render();
    expect(html.match(/<h3/g)).toHaveLength(1); // Only the card title.
    expect(html).toContain("First paragraph.");
  });
});
