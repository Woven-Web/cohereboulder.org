// The site's only backend is the COhere Worker (worker/src).

// Same origin by default: the Worker serves this site and the API together.
// Set VITE_SIGNUP_URL to point a locally-served site at a deployed Worker.
const RAW_BASE = import.meta.env.VITE_SIGNUP_URL ?? "";

/** No trailing slash, so path joining stays predictable. */
export const API_BASE = RAW_BASE.replace(/\/$/, "");

export interface FormField {
  key: string;
  label: string;
  label_es?: string;
  /** Framing copy shown above the label. Blank lines separate paragraphs. */
  intro?: string;
  intro_es?: string;
  help?: string;
  help_es?: string;
  type: "text" | "email" | "tel" | "textarea" | "radio" | "checkbox" | "checkboxes";
  options?: string[];
  options_es?: string[];
  /** Radio only: append an "Other" choice that opens a free-text write-in. */
  allow_other?: boolean;
  required?: boolean;
  default?: boolean;
}

/** Post-submit "thank you" screen; like the questions, it lives in the database. */
export interface FormCompletion {
  title?: string;
  title_es?: string;
  /** Blank lines separate paragraphs; URLs render as links. */
  body?: string;
  body_es?: string;
  /** Rendered as a prominent button under the body. */
  link?: string;
  link_label?: string;
  link_label_es?: string;
}

export interface FormDefinition {
  slug: string;
  title: string;
  event: string | null;
  fields: FormField[];
  active: boolean;
  completion?: FormCompletion | null;
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

/**
 * Propose an event for the community calendar — no regenOS account, no admin
 * session. It lands as a pending row an organizer approves from /admin's
 * Proposals tab; this call never publishes anything itself. Field names line
 * up with the Worker's shared event validator (worker/src/regenos-service.ts
 * readEventValues) on purpose.
 */
export interface ProposeEventPayload {
  name: string;
  description?: string;
  /** ISO 8601 (send `new Date(v).toISOString()` from a datetime-local input). */
  startsAt: string;
  endsAt?: string;
  mode?: "inperson" | "virtual" | "hybrid";
  placeName?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  proposerName?: string;
  proposerEmail?: string;
  /** Hidden honeypot; bots fill it, people never see it. */
  website?: string;
}

export async function proposeEvent(payload: ProposeEventPayload): Promise<void> {
  const response = await fetch(`${API_BASE}/api/events/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
}
