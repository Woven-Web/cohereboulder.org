// Open the navigation's sign-in dialog (src/components/AccountControl.tsx)
// from anywhere on the page — e.g. the RSVP panel's "or sign in" link.

export const OPEN_SIGNIN_EVENT = "cohere:open-signin";

export function openSignInDialog() {
  window.dispatchEvent(new Event(OPEN_SIGNIN_EVENT));
}
