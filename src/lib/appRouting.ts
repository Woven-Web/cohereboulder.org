export function safeReturnPath(path: string | null): string | null {
  return path && path.startsWith("/") && !path.startsWith("//") && !["/", "/login"].includes(path.split("?")[0]) ? path : null;
}
export function signInDestination(path: string | null): string {
  return safeReturnPath(path) ?? "/events";
}
export function activeAppTab(path: string): "events" | "board" | null {
  return path === "/board" ? "board" : path === "/events" || path.startsWith("/events/") || path === "/calendar" ? "events" : null;
}

export function shouldRedirectToApp(signedIn: boolean, previousSignedIn: boolean | undefined, pathname: string): boolean {
  return signedIn && (pathname === "/" || pathname === "/login" || (previousSignedIn === false && !pathname.startsWith("/events/")));
}
