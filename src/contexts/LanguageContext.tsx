import React, { createContext, useContext, useState, ReactNode } from "react";
import { getTranslation } from "@/lib/translations";

type Language = "en" | "es";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (en: string, es: string) => string;
  tr: (path: string) => string; // New method for centralized translations
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [language, setLanguage] = useState<Language>("en");

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
