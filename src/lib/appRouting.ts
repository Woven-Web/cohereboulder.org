export function safeReturnPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || Array.from(path).some((char) => char === "\\" || char.charCodeAt(0) <= 32)) return null;
  const base = "https://cohere.invalid";
  const url = new URL(path, base);
  if (url.origin !== base || ["/", "/login"].includes(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}
export function signInDestination(path: string | null, registered = false): string {
  const safe = safeReturnPath(path);
  return registered && safe?.split(/[?#]/)[0] === "/register" ? "/events" : safe ?? "/events";
}
export function activeAppTab(path: string): "today" | "events" | "board" | null {
  return ["/today", "/quests", "/more"].includes(path) ? "today" : path === "/board" ? "board" : path === "/events" || path.startsWith("/events/") || path === "/calendar" ? "events" : null;
}

// The /login wizard navigates only after completing the handle step.
export function shouldRedirectToApp(signedIn: boolean, pathname: string, search = ""): boolean {
  return signedIn && pathname === "/" && new URLSearchParams(search).get("signedIn") === "1";
}
