import type { FormDefinition } from "./api";
import { translations } from "./translations";

/** The stored fields JSON is an array; heading translations live by slug here. */
export function formTitle(form: Pick<FormDefinition, "slug" | "title">, language: "en" | "es"): string {
  if (language === "es" && Object.prototype.hasOwnProperty.call(translations.formTitles, form.slug)) {
    return translations.formTitles[form.slug as keyof typeof translations.formTitles].es || form.title;
  }
  return form.title;
}
