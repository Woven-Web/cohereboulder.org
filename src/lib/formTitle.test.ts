import { describe, expect, it } from "vitest";
import { formTitle } from "./formTitle";

describe("form heading language", () => {
  it("uses the Spanish translation for a known slug", () => {
    expect(formTitle({ slug: "register-2026", title: "Stored English title" }, "es"))
      .toBe("Regístrate para COhere Boulder 2026");
  });

  it.each(["signup-2026", "unknown", "toString"])("falls back to the stored title without a translation (%s)", (slug) => {
    expect(formTitle({ slug, title: "Stored English title" }, "es")).toBe("Stored English title");
  });

  it("keeps the stored English title even when a translation exists", () => {
    expect(formTitle({ slug: "register-2026", title: "Custom English title" }, "en"))
      .toBe("Custom English title");
  });
});
