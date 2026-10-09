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
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.match(/<h3\b/g) ?? []).toHaveLength(0);
    expect(html).toContain("First paragraph.");
  });

  it("renders the form h2 before field h3s", () => {
    Object.assign(state.definition!.fields[0], { intro_heading: "First section" });
    state.definition!.fields.push({ key: "second", type: "text", label: "Second answer", intro_heading: "Second section" });
    const html = render();
    expect(html.match(/<h[23]\b[^>]*>[^<]*<\/h[23]>/g)).toEqual([
      '<h2 class="text-2xl font-semibold leading-none tracking-tight">Test form</h2>',
      '<h3 class="text-xl font-semibold text-foreground leading-tight">First section</h3>',
      '<h3 class="text-xl font-semibold text-foreground leading-tight">Second section</h3>',
    ]);
  });

  it("renders a checkbox heading then intro paragraphs then its label", () => {
    Object.assign(state.definition!.fields[0], { type: "checkbox", intro_heading: "Donation (optional)" });
    const html = render();
    expect(html).toMatch(/<h3[^>]*>Donation \(optional\)<\/h3>/);
    expect(html).toMatch(/<p[^>]*>First paragraph\.<\/p>/);
    expect(html).toMatch(/<p[^>]*>Second paragraph\.<\/p>/);
    expect(html).toMatch(/<label[^>]*for="field-donation"[^>]*>Amount<\/label>/);
    expect(html.indexOf("Donation (optional)")).toBeLessThan(html.indexOf("First paragraph."));
    expect(html.indexOf("First paragraph.")).toBeLessThan(html.indexOf("Second paragraph."));
    expect(html.indexOf("Second paragraph.")).toBeLessThan(html.indexOf("<label"));
  });

  it.each(["en", "es"])("escapes markup-like heading text in %s", (language) => {
    state.language = language;
    Object.assign(state.definition!.fields[0], {
      intro_heading: '<em data-injected="heading">Donation & support</em>',
      intro_heading_es: '<em data-injected="heading">Donación & apoyo</em>',
    });
    const html = render();
    const text = language === "es" ? "Donación &amp; apoyo" : "Donation &amp; support";
    expect(html).toContain(`&lt;em data-injected=&quot;heading&quot;&gt;${text}&lt;/em&gt;</h3>`);
    expect(html).not.toMatch(/<em\b/);
  });
});
