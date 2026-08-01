// The site's only backend is the COhere Worker (workers/email-signup).
//
// Once the site is served by that same Worker, VITE_SIGNUP_URL can be dropped
// and these become same-origin relative paths.

const RAW_BASE = import.meta.env.VITE_SIGNUP_URL || "https://cohere-signup.unforced.workers.dev/";

/** No trailing slash, so path joining stays predictable. */
export const API_BASE = RAW_BASE.replace(/\/$/, "");

export interface FormField {
  key: string;
  label: string;
  label_es?: string;
  help?: string;
  help_es?: string;
  type: "text" | "email" | "tel" | "textarea" | "radio" | "checkbox" | "checkboxes";
  options?: string[];
  options_es?: string[];
  required?: boolean;
  default?: boolean;
}

export interface FormDefinition {
  slug: string;
  title: string;
  event: string | null;
  fields: FormField[];
  active: boolean;
}

export interface SubmitPayload {
  email: string;
  name?: string;
  phone?: string;
  orgs?: string;
  /** Hidden honeypot; bots fill it, people never see it. */
  website?: string;
  subscribed?: boolean;
  answers?: Record<string, unknown>;
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}) as { error?: string });
  return body.error || `request failed (${response.status})`;
}

/** Fetch a form's questions, which live in the database rather than in code. */
export async function fetchForm(slug: string): Promise<FormDefinition> {
  const response = await fetch(`${API_BASE}/api/form/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function submitForm(slug: string, payload: SubmitPayload): Promise<void> {
  const response = await fetch(`${API_BASE}/api/submit/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
}

/** The lightweight "stay in the loop" capture — email only. */
export async function subscribeEmail(input: {
  email: string;
  name?: string;
  source?: string;
  language?: string;
  website?: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
}
