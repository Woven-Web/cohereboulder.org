// Open the navigation's sign-in dialog (src/components/AccountControl.tsx)
// from anywhere on the page — e.g. the RSVP panel's "or sign in" link.

export const OPEN_SIGNIN_EVENT = "cohere:open-signin";

export function openSignInDialog() {
  const path = window.location.pathname + window.location.search;
  if (path.startsWith("/events/")) localStorage.setItem("cohere:returnTo", path);
  window.dispatchEvent(new Event(OPEN_SIGNIN_EVENT));
}
