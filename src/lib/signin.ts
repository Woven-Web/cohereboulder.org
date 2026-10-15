// Open the navigation's sign-in dialog (src/components/AccountControl.tsx)
// from anywhere on the page — e.g. the RSVP panel's "or sign in" link.

export const OPEN_SIGNIN_EVENT = "cohere:open-signin";

/** What the dialog starts with: an email to fill in, and where to land after. */
export interface SignInPrefill {
  email?: string;
  returnTo?: string;
}

export function openSignInDialog() {
  openSignInWith({});
}

/** The same dialog, with the email already filled in (e.g. just registered with it). */
export function openSignInWith({ email, returnTo }: SignInPrefill) {
  const path = returnTo ?? window.location.pathname + window.location.search + window.location.hash;
  localStorage.setItem("cohere:returnTo", path);
  window.dispatchEvent(new CustomEvent<SignInPrefill>(OPEN_SIGNIN_EVENT, { detail: { email, returnTo: path } }));
}
