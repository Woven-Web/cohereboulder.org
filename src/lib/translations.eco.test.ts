import { afterEach, describe, expect, it, vi } from "vitest";
import { getTranslation, translations } from "./translations";
import { ecoCopy } from "./translations.eco";

const base = (path: string) => path.split(".").reduce<any>((o, k) => o?.[k], translations); // eslint-disable-line @typescript-eslint/no-explicit-any
const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("the ecology copy pass", () => {
  it("overrides only strings that exist, and keeps their {placeholders}", () => {
    for (const [path, [en, es]] of Object.entries(ecoCopy)) {
      const orig = base(path);
      expect(orig, path).toBeTruthy();
      // A short version may drop a {slot}; it may not invent one.
      for (const slot of slots(en)) expect(slots(orig.en), `${path} en ${slot}`).toContain(slot);
      for (const slot of slots(es)) expect(slots(orig.es), `${path} es ${slot}`).toContain(slot);
      expect(en === "", `${path}: cut in both languages or neither`).toBe(es === "");
    }
  });

  it("is only a word or two: no override runs past 12 words", () => {
    for (const [path, [en]] of Object.entries(ecoCopy)) expect(en.split(/\s+/).length, path).toBeLessThanOrEqual(12);
  });

  describe("lookup", () => {
    const at = (search: string) => vi.stubGlobal("window", { location: { search }, sessionStorage: { getItem: () => null } });
    afterEach(() => vi.unstubAllGlobals());
    it("changes nothing for classic or almanac", () => {
      expect(getTranslation("almanac.sourceNote", "en")).toBe(base("almanac.sourceNote").en);
      at("?look=almanac");
      expect(getTranslation("almanac.sourceNote", "en")).toBe(base("almanac.sourceNote").en);
    });
    it("serves the override under ?look=ecology, empty strings included", () => {
      at("?look=ecology");
      expect(getTranslation("almanac.sourceNote", "en")).toBe("Boulder time.");
      expect(getTranslation("almanac.sourceNote", "es")).toBe("Hora de Boulder.");
      expect(getTranslation("members.board.emptyBody", "en")).toBe("");
    });
  });
});
