import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchForm, submitForm, type FormField, type FormDefinition } from "@/lib/api";

// The questions live in the database, not in this file. An organizer can
// reword a label or add a question from the admin portal and it appears here
// on the next page load — see workers/email-signup/README.md.

/** Fields that map onto columns of `people` rather than into the answers blob. */
const PERSON_FIELDS: Record<string, "name" | "email" | "phone" | "orgs"> = {
  full_name: "name",
  email: "email",
  phone: "phone",
  orgs: "orgs",
};

type Value = string | boolean | string[];

interface DynamicFormProps {
  slug: string;
  /** Shown above the questions once the definition loads. */
  intro?: React.ReactNode;
  successTitle?: string;
  successMessage?: string;
}

export const DynamicForm = ({ slug, intro, successTitle, successMessage }: DynamicFormProps) => {
  const { language } = useLanguage();
  const spanish = language === "es";

  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Value>>({});
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchForm(slug)
      .then((data: FormDefinition) => {
        if (cancelled) return;
        setDefinition(data);
        const initial: Record<string, Value> = {};
        for (const field of data.fields) {
          if (field.type === "checkbox") initial[field.key] = field.default ?? false;
          else if (field.type === "checkboxes") initial[field.key] = [];
          else initial[field.key] = "";
        }
        setValues(initial);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            spanish
              ? "No pudimos cargar el formulario. Por favor recarga la página."
              : "We couldn't load the form. Please reload the page.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, spanish]);

  const labelFor = (field: FormField) => (spanish && field.label_es ? field.label_es : field.label);
  const helpFor = (field: FormField) => (spanish && field.help_es ? field.help_es : field.help);
  const optionsFor = (field: FormField) =>
    (spanish && field.options_es ? field.options_es : field.options) ?? [];
  /** Answers are stored in English so exports stay consistent across languages. */
  const canonicalOption = (field: FormField, option: string) => {
    const localized = optionsFor(field);
    const index = localized.indexOf(option);
    return index >= 0 && field.options ? field.options[index] : option;
  };

  const setValue = (key: string, value: Value) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!definition || status === "submitting") return;
    setStatus("submitting");
    setSubmitError(null);

    const person: Record<string, string> = {};
    const answers: Record<string, unknown> = {};
    let subscribed: boolean | undefined;

    for (const field of definition.fields) {
      const value = values[field.key];
      if (field.key === "subscribed" && typeof value === "boolean") {
        subscribed = value;
        continue;
      }
      const personKey = PERSON_FIELDS[field.key];
      if (personKey) {
        person[personKey] = String(value ?? "");
        continue;
      }
      if (Array.isArray(value)) answers[field.key] = value.map((v) => canonicalOption(field, v));
      else if (typeof value === "string" && field.options) answers[field.key] = canonicalOption(field, value);
      else answers[field.key] = value;
    }

    try {
      await submitForm(slug, { ...person, email: person.email, website, answers, subscribed });
      setStatus("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus("error");
      setSubmitError(
        spanish
          ? "No pudimos enviar tu registro. Inténtalo de nuevo en un momento."
          : "We couldn't submit your registration. Please try again in a moment.",
      );
    }
  };

  if (loadError) {
    return <p className="text-center text-destructive py-12">{loadError}</p>;
  }

  if (!definition) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (status === "success") {
    return (
      <Card className="max-w-2xl mx-auto shadow-warm">
        <CardContent className="pt-10 pb-10 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-nature-green" />
          <h2 className="text-2xl font-bold">
            {successTitle ?? (spanish ? "¡Estás dentro!" : "You're in!")}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {successMessage ??
              (spanish
                ? "Gracias por registrarte. Te escribiremos a medida que COhere tome forma."
                : "Thanks for registering. We'll be in touch as COhere takes shape.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!definition.active) {
    return (
      <p className="text-center text-muted-foreground py-12">
        {spanish ? "Este formulario está cerrado por ahora." : "This form is closed for now."}
      </p>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto shadow-warm">
      <CardHeader>
        <CardTitle>{definition.title}</CardTitle>
        {intro}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-7">
          {definition.fields.map((field) => {
            const id = `field-${field.key}`;
            const help = helpFor(field);
            const value = values[field.key];

            if (field.type === "checkbox") {
              return (
                <div key={field.key} className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => setValue(field.key, checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor={id} className="font-medium leading-snug">
                      {labelFor(field)}
                    </Label>
                    {help && <p className="text-sm text-muted-foreground">{help}</p>}
                  </div>
                </div>
              );
            }

            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={id} className="leading-snug">
                  {labelFor(field)}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {help && <p className="text-sm text-muted-foreground">{help}</p>}

                {field.type === "textarea" && (
                  <Textarea
                    id={id}
                    rows={3}
                    required={field.required}
                    value={String(value ?? "")}
                    onChange={(e) => setValue(field.key, e.target.value)}
                  />
                )}

                {(field.type === "text" || field.type === "email" || field.type === "tel") && (
                  <Input
                    id={id}
                    type={field.type}
                    required={field.required}
                    value={String(value ?? "")}
                    onChange={(e) => setValue(field.key, e.target.value)}
                  />
                )}

                {field.type === "radio" && (
                  <RadioGroup
                    value={String(value ?? "")}
                    onValueChange={(next) => setValue(field.key, next)}
                    className="flex flex-wrap gap-x-6 gap-y-2 pt-1"
                  >
                    {optionsFor(field).map((option) => (
                      <div key={option} className="flex items-center gap-2">
                        <RadioGroupItem value={option} id={`${id}-${option}`} />
                        <Label htmlFor={`${id}-${option}`} className="font-normal">
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {field.type === "checkboxes" && (
                  <div className="space-y-2 pt-1">
                    {optionsFor(field).map((option) => {
                      const selected = Array.isArray(value) ? value : [];
                      return (
                        <div key={option} className="flex items-start gap-3">
                          <Checkbox
                            id={`${id}-${option}`}
                            checked={selected.includes(option)}
                            onCheckedChange={(checked) =>
                              setValue(
                                field.key,
                                checked === true
                                  ? [...selected, option]
                                  : selected.filter((v) => v !== option),
                              )
                            }
                          />
                          <Label htmlFor={`${id}-${option}`} className="font-normal leading-snug">
                            {option}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Honeypot — hidden from people, catnip for bots. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button type="submit" size="lg" variant="community" disabled={status === "submitting"}>
            {status === "submitting"
              ? spanish
                ? "Enviando…"
                : "Submitting…"
              : spanish
                ? "Enviar Registro"
                : "Submit Registration"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
