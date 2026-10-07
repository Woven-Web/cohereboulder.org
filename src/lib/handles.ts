/** Domains managed by COhere's account host; add future hosted domains here. */
export const HOSTED_HANDLE_SUFFIXES = [".scenius.social"] as const;

/** Presentation only: keep the original handle for identity and API requests.
 * Preserve an optional leading @ for both hosted and external accounts.
 */
export function displayHandle(handle?: string | null): string {
  if (!handle) return "";
  const prefix = handle.startsWith("@") ? "@" : "";
  const address = prefix ? handle.slice(1) : handle;
  if (HOSTED_HANDLE_SUFFIXES.some(suffix => address.toLowerCase().endsWith(suffix))) {
    return prefix + address.split(".")[0];
  }
  return handle;
}
