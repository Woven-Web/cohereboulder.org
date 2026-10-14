import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 768px)";

/** True on the Daylight layout (the Almanac's 768px breakpoint). */
export function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => { const q = window.matchMedia(WIDE); q.addEventListener("change", notify); return () => q.removeEventListener("change", notify); },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
