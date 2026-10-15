// A saved registration, turned back into what DynamicForm shows: the person
// columns into their fields, and English answers into the visitor's language
// (answers are stored in English so exports stay consistent; see DynamicForm).

import type { FormField, SavedRegistration } from "./api";

export type FormValue = string | boolean | string[];

/** Sentinel for a radio's appended "Other" choice (shared with DynamicForm). */
export const OTHER = "__other__";

/** Fields that map onto columns of `people` rather than into the answers blob. */
export const PERSON_FIELDS: Record<string, "name" | "email" | "phone" | "orgs"> = {
  full_name: "name",
  email: "email",
  phone: "phone",
  orgs: "orgs",
};

/** The localized label for a stored (English) option, or the value itself if it isn't one. */
function localize(field: FormField, value: string, spanish: boolean): string {
  const index = field.options?.indexOf(value) ?? -1;
  if (index < 0) return value;
  return (spanish && field.options_es?.[index]) || value;
}

export function valuesFromSaved(
  fields: FormField[],
  saved: SavedRegistration,
  spanish: boolean,
): { values: Record<string, FormValue>; otherTexts: Record<string, string> } {
  const values: Record<string, FormValue> = {};
  const otherTexts: Record<string, string> = {};
  const answers = saved.answers ?? {};
  for (const field of fields) {
    const personKey = PERSON_FIELDS[field.key];
    if (personKey) {
      const value = saved[personKey];
      if (typeof value === "string") values[field.key] = value;
      continue;
    }
    if (field.key === "subscribed" && field.type === "checkbox") {
      if (typeof saved.subscribed === "boolean") values[field.key] = saved.subscribed;
      continue;
    }
    const answer = answers[field.key];
    if (answer === undefined || answer === null) continue;
    if (field.type === "checkbox") values[field.key] = answer === true;
    else if (field.type === "checkboxes") {
      if (Array.isArray(answer)) values[field.key] = answer.map((v) => localize(field, String(v), spanish));
    } else if (field.type === "radio" && typeof answer === "string") {
      if (field.allow_other && !field.options?.includes(answer) && /^Other(: |$)/.test(answer)) {
        values[field.key] = OTHER;
        otherTexts[field.key] = answer.replace(/^Other(: )?/, "");
      } else values[field.key] = localize(field, answer, spanish);
    } else values[field.key] = String(answer);
  }
  return { values, otherTexts };
}
