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
  /** Optional section heading above the intro (or label when there is no intro). */
  intro_heading?: string;
  intro_heading_es?: string;
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

/**
 * How a submit landed. `alreadyRegistered`: the email already had a
 * registration and nothing was stored (sign in to change it). `updated`: a
 * signed-in person's own registration was edited.
 */
export interface SubmitOutcome {
  alreadyRegistered: boolean;
  updated: boolean;
}

export async function submitForm(slug: string, payload: SubmitPayload): Promise<SubmitOutcome> {
  const response = await fetch(`${API_BASE}/api/submit/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json().catch(() => ({}))) as { alreadyRegistered?: unknown; updated?: unknown };
  return { alreadyRegistered: body.alreadyRegistered === true, updated: body.updated === true };
}

const funnelSent = new Set<string>();

/**
 * Counts-only funnel beacon (worker/src/funnel.ts): `view`, `reached:<key>`,
 * `submit_attempt`. Sends an event name and nothing else — no answers, no
 * identifier, no credentials — and at most once per event per page load.
 * Fire-and-forget: a failed beacon must never touch the form.
 */
export function sendFunnelEvent(slug: string, event: string): void {
  const id = `${slug}:${event}`;
  if (funnelSent.has(id)) return;
  funnelSent.add(id);
  const url = `${API_BASE}/api/funnel/${encodeURIComponent(slug)}`;
  // Plain fetch, not sendBeacon: a beacon always carries credentials, and the
  // admin session cookie is Path=/, so a signed-in organizer would send it here.
  try {
    void fetch(url, {
      method: "POST",
      body: JSON.stringify({ event }),
      headers: { "Content-Type": "text/plain" },
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).catch(() => {});
  } catch {
    // Measurement is best-effort.
  }
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

/**
 * "RSVP · remind me" without an account: stored by the Worker
 * (worker/src/rsvps.ts), confirmed by email, reminded the morning before.
 * `already` is true when this address had already RSVP'd — nothing is re-sent.
 */
export interface EmailRsvpPayload {
  did: string;
  rkey: string;
  email: string;
  name?: string;
  language?: "en" | "es";
  /** Hidden honeypot; bots fill it, people never see it. */
  website?: string;
}

export async function createEmailRsvp(payload: EmailRsvpPayload): Promise<{ already: boolean }> {
  const response = await fetch(`${API_BASE}/api/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json().catch(() => ({}))) as { already?: boolean };
  return { already: body.already === true };
}

export interface CompanionDaily {date:string;title:string;body:string;title_es?:string;body_es?:string;question?:string;question_es?:string;}
export interface CompanionQuest {id:string;title:string;description:string;title_es?:string;description_es?:string;start_date:string;end_date:string;}
export interface CompanionToday {date:string;daily:CompanionDaily|null;quests:CompanionQuest[];pushKey:string|null;start:string;end:string;}
export async function companionRequest<T = {ok:boolean}>(path:string,body?:unknown,method=body?'POST':'GET'):Promise<T>{
 const response=await fetch(`${API_BASE}/api/companion/${path}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
 if(!response.ok)throw new Error(String(response.status));return response.json();
}
export async function companionEvents():Promise<import('./events').CommunityEvent[]>{
 const response=await fetch(`${API_BASE}/api/events`);if(!response.ok)throw new Error('events unavailable');
 const data=await response.json() as {events?:import('./events').CommunityEvent[]};return data.events??[];
}

export async function fetchMyRegistration(): Promise<{ registered: boolean | null }> {
  const response = await fetch(`${API_BASE}/api/me/registration`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Registration status unavailable");
  return response.json();
}

/** A signed-in person's own registration, to edit. `email` is the verified one from their account. */
export interface SavedRegistration {
  registered: boolean | null;
  email?: string;
  name?: string | null;
  phone?: string | null;
  orgs?: string | null;
  subscribed?: boolean | null;
  answers?: Record<string, unknown>;
}

export async function fetchMyRegistrationDetail(): Promise<SavedRegistration> {
  const response = await fetch(`${API_BASE}/api/me/registration?detail=1`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    // Read the refusal anyway: an unread body leaves the request open.
    await response.text().catch(() => "");
    throw new Error("Registration unavailable");
  }
  return response.json();
}

// ---------------------------------------------------- members: RSVP visibility
// Who sees a member's RSVPs on their profile (worker/src/rsvp-visibility.ts).
// The Worker takes the owner from the regenOS session cookie; nothing here
// names a person except the profile being looked at.

export type RsvpVisibilityMode = "members" | "nobody";

export interface RsvpVisibility {
  mode: RsvpVisibilityMode;
  hiddenEvents: string[];
}

export interface ProfileRsvp {
  uri: string;
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
}

async function memberJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", cache: "no-store", ...init });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json() as Promise<T>;
}

export const fetchRsvpVisibility = () => memberJson<RsvpVisibility>("/api/me/rsvp-visibility");

export const fetchMyProfileRsvps = () =>
  memberJson<{ visibility: RsvpVisibility; rsvps: (ProfileRsvp & { hidden: boolean })[] }>("/api/me/rsvps");

/** What members see on this person's profile (their setting already applied). */
export const fetchMemberRsvps = (did: string) =>
  memberJson<{ rsvps: ProfileRsvp[] }>(`/api/members/${encodeURIComponent(did)}/rsvps`);

function putVisibility(body: { mode: RsvpVisibilityMode } | { event: string; hidden: boolean }) {
  return memberJson<RsvpVisibility>("/api/me/rsvp-visibility", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export const setRsvpVisibilityMode = (mode: RsvpVisibilityMode) => putVisibility({ mode });
export const setEventHidden = (event: string, hidden: boolean) => putVisibility({ event, hidden });

// ------------------------------------------------ members: profile extras
// "Bringing / Offering / Curious about" (worker/src/profile-extras.ts).
export type ExtraKey = "bringing" | "offering" | "curious";
export type ProfileExtras = Record<ExtraKey, string>;

export const fetchMyProfileExtras = () => memberJson<ProfileExtras>("/api/me/profile-extras");
export const fetchMemberProfileExtras = () => memberJson<{ extras: Record<string, ProfileExtras> }>("/api/members/profile-extras");
export const putMyProfileExtras = (extras: ProfileExtras) =>
  memberJson<ProfileExtras>("/api/me/profile-extras", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(extras),
  });

export interface MeStatus {
  signedIn: boolean;
  handle: string | null;
  /** Builder or higher in the COhere scene: the portal at /admin opens for them. */
  organizer: boolean;
  steward: boolean;
}

export async function fetchMe(): Promise<MeStatus> {
  const response = await fetch(`${API_BASE}/api/me`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Account status unavailable");
  return response.json();
}
