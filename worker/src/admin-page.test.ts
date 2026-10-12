import { describe, expect, it } from "vitest";
import { ADMIN_PAGE } from "./admin-page";

describe("admin page", () => {
  it("ships inline scripts that parse (template-literal escaping is easy to get wrong)", () => {
    const scripts = [...ADMIN_PAGE.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
  });
  it("has the Board tab wired to its section and loader", () => {
    expect(ADMIN_PAGE).toContain('data-tab="board"');
    expect(ADMIN_PAGE).toContain('id="tab-board"');
    expect(ADMIN_PAGE).toContain('if (name === "board") loadBoard();');
    expect(ADMIN_PAGE).toContain("/api/admin/board/settings");
  });
});
