import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { getTranslation } from "@/lib/translations";

type Language = "en" | "es";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** For this view only, and only if the visitor never chose: e.g. the language an emailed link was written in. */
  suggestLanguage: (lang: Language) => void;
  t: (en: string, es: string) => string;
  tr: (path: string) => string; // New method for centralized translations
}

const LANGUAGE_KEY = "cohere-language";
function storedChoice(): Language | null {
  try { const v = localStorage.getItem(LANGUAGE_KEY); return v === "es" || v === "en" ? v : null; } catch { return null; }
}
function remember(lang: Language) {
  try { localStorage.setItem(LANGUAGE_KEY, lang); } catch { /* storage blocked: the choice lasts this visit */ }
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // A choice the visitor makes is kept on this device, so a reload or a new tab doesn't drop back to English.
  const [language, setCurrent] = useState<Language>(() => storedChoice() ?? "en");
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const setLanguage = useCallback((lang: Language) => { remember(lang); setCurrent(lang); }, []);
  const toggleLanguage = () => setLanguage(language === "en" ? "es" : "en");
  const suggestLanguage = useCallback((lang: Language) => { if (!storedChoice()) setCurrent(lang); }, []);

  const t = (en: string, es: string) => {
    return language === "en" ? en : es;
  };

  // New method that uses centralized translations
  const tr = (path: string) => {
    return getTranslation(path, language);
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, toggleLanguage, suggestLanguage, t, tr }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
