import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider, useLanguage } from "./LanguageContext";

function Which() {
  const { language } = useLanguage();
  return <>{language}</>;
}
const render = () => renderToStaticMarkup(<LanguageProvider><Which /></LanguageProvider>);
const storage = (value: string | null) => vi.stubGlobal("localStorage", { getItem: () => value, setItem: () => {} });

describe("LanguageProvider", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("starts in the language this device chose before, so a reload stays in Spanish", () => {
    storage("es");
    expect(render()).toBe("es");
  });
  it("starts in English with no choice on file, or no storage at all", () => {
    storage(null);
    expect(render()).toBe("en");
    vi.stubGlobal("localStorage", undefined);
    expect(render()).toBe("en");
  });
});
