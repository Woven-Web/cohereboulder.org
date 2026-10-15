import { describe, expect, it } from "vitest";
import type { FormField } from "./api";
import { OTHER, valuesFromSaved } from "./registrationPrefill";

const fields: FormField[] = [
  { key: "full_name", type: "text", label: "Name" },
  { key: "email", type: "email", label: "Email" },
  { key: "phone", type: "tel", label: "Phone" },
  { key: "volunteer", type: "radio", label: "Volunteer?", options: ["Yes", "No"], options_es: ["Sí", "No"] },
  { key: "heard", type: "radio", label: "Heard", options: ["Friend"], allow_other: true },
  { key: "days", type: "checkboxes", label: "Days", options: ["Thu", "Fri"], options_es: ["jue", "vie"] },
  { key: "photo_ok", type: "checkbox", label: "Photos OK" },
  { key: "subscribed", type: "checkbox", label: "Email me" },
  { key: "notes", type: "textarea", label: "Notes" },
];

const saved = {
  registered: true, email: "ana@test.com", name: "Ana", phone: null, orgs: null, subscribed: false,
  answers: { volunteer: "Yes", heard: "Other: the radio", days: ["Fri", "Sat?"], photo_ok: true, notes: "hi" },
};

describe("valuesFromSaved", () => {
  it("puts English answers back into the form, in English", () => {
    const { values, otherTexts } = valuesFromSaved(fields, saved, false);
    expect(values).toEqual({
      full_name: "Ana", email: "ana@test.com", volunteer: "Yes", heard: OTHER, days: ["Fri", "Sat?"], photo_ok: true, subscribed: false, notes: "hi",
    });
    expect(otherTexts).toEqual({ heard: "the radio" });
  });

  it("shows the Spanish option labels in Spanish, keeping unknown values", () => {
    const { values } = valuesFromSaved(fields, saved, true);
    expect(values.volunteer).toBe("Sí");
    expect(values.days).toEqual(["vie", "Sat?"]);
  });

  it("leaves unanswered fields alone", () => {
    const { values } = valuesFromSaved(fields, { registered: false, email: "n@test.com", answers: {} }, false);
    expect(values).toEqual({ email: "n@test.com" });
  });
});
