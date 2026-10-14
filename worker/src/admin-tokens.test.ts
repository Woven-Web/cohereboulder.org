import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTokenCss } from "../../scripts/sync-admin-tokens.mjs";
import { BRAND_TOKEN_CSS } from "./brand-tokens.generated";
import { ADMIN_PAGE } from "./admin-page";

describe("admin portal shares the site's design tokens", () => {
  it("the generated token block matches src/index.css exactly (run scripts/sync-admin-tokens.mjs)", () => {
    expect(BRAND_TOKEN_CSS).toBe(extractTokenCss(readFileSync("src/index.css", "utf8")));
    expect(BRAND_TOKEN_CSS).toContain("--brand-deep:  219 45% 39%;");
  });

  it("the page inlines that block and styles itself from it, with no hard-coded hex", () => {
    expect(ADMIN_PAGE).toContain(BRAND_TOKEN_CSS);
    const css = /<style>([\s\S]*?)<\/style>/.exec(ADMIN_PAGE)?.[1] ?? "";
    expect(css.replace(BRAND_TOKEN_CSS, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("carries the site header: logo, links back to the site, handle, sign out", () => {
    expect(ADMIN_PAGE).toContain('src="/COHERE-Logo-Branding-2.webp"');
    for (const href of ['href="/"', 'href="/calendar"', 'href="/co-create"', 'href="/archive"']) expect(ADMIN_PAGE).toContain(href);
    for (const id of ['id="whoami"', 'id="signout"']) expect(ADMIN_PAGE).toContain(id);
  });
});
