import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getTranslation } from "@/lib/translations";

type Language = "en" | "es";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (en: string, es: string) => string;
  tr: (path: string) => string; // New method for centralized translations
}

const LANGUAGE_KEY = "cohere-language";
function storedLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === "es" ? "es" : "en"; } catch { return "en"; }
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // The choice is kept on this device, so a reload, a new tab or a link from an email doesn't drop back to English.
  const [language, setLanguage] = useState<Language>(storedLanguage);
  useEffect(() => {
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* storage blocked: the choice lasts this visit */ }
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "es" : "en"));
  };

  const t = (en: string, es: string) => {
    return language === "en" ? en : es;
  };

  // New method that uses centralized translations
  const tr = (path: string) => {
    return getTranslation(path, language);
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, toggleLanguage, t, tr }}
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
