export function safeReturnPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || Array.from(path).some((char) => char === "\\" || char.charCodeAt(0) <= 32)) return null;
  const base = "https://cohere.invalid";
  const url = new URL(path, base);
  if (url.origin !== base || ["/", "/login"].includes(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}
/** Pages the Worker serves itself (the admin portal): reaching one needs a real page load, not a client-side navigate. */
export function isWorkerPage(path: string): boolean {
  return /^\/admin(?:[/?#]|$)/.test(path);
}
export function signInDestination(path: string | null, registered = false): string {
  const safe = safeReturnPath(path);
  // Registered people land on the calendar, unless they signed in to edit (/register?edit=1).
  const url = safe ? new URL(safe, "https://cohere.invalid") : null;
  return registered && url?.pathname === "/register" && !url.searchParams.has("edit") ? "/events" : safe ?? "/events";
}
export type AppTab = "today" | "events" | "board" | "more";
/** The ecology look's destinations: the same six on a phone's bottom bar and in the wide masthead. */
export type EcoTab = "home" | "today" | "events" | "board" | "people" | "me";
export function activeEcoTab(path: string): EcoTab | null {
  if (path === "/" || path === "/home") return "home";
  if (path === "/people" || path.startsWith("/people/")) return "people";
  if (path === "/more" || path.startsWith("/more/") || path === "/profile") return "me";
  const tab = activeAppTab(path);
  return tab === "board" ? "board" : tab === "today" ? "today" : tab === "events" ? "events" : null;
}
export function activeAppTab(path: string): AppTab | null {
  return ["/today", "/quests"].includes(path) ? "today" : path === "/more" || path === "/more/notifications" ? "more" : ["/board", "/people", "/profile"].some((root) => path === root || path.startsWith(`${root}/`)) ? "board" : path === "/events" || path.startsWith("/events/") || path === "/calendar" || path === "/tomorrow" ? "events" : null;
}

// The /login wizard navigates only after completing the handle step.
export function shouldRedirectToApp(signedIn: boolean, pathname: string, search = ""): boolean {
  return signedIn && pathname === "/" && new URLSearchParams(search).get("signedIn") === "1";
}
