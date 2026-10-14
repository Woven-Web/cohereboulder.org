import { useContext, useEffect } from "react";
import { UNSAFE_LocationContext } from "react-router-dom";

// Two comparison switches for staging (T-113). Both ride a query parameter,
// stick for the browser session, and fall back to the current design:
//   ?look=classic|almanac|ecology   the site's skin. almanac and ecology restyle the
//                           public site (Home, Register, About, Join, the hybrid pages);
//                           ecology also dresses the app screens (Today, Calendar, Board, …)
//   ?trail=zigzag|row       Today's hex trail on phones

export const LOOKS = ["classic", "almanac", "ecology"] as const;
export const TRAILS = ["zigzag", "row"] as const;
export type Look = (typeof LOOKS)[number];
export type TrailVariant = (typeof TRAILS)[number];

const LOOK_KEY = "cohere-look";
/** Staging shows the ecology look by default (Aaron, 10-14); production stays classic. ?look=classic still works. */
const DEFAULT_LOOK: Look = typeof window !== "undefined" && window.location.hostname.startsWith("cohere-signup-staging.") ? "ecology" : "classic";
const TRAIL_KEY = "cohere-trail";

/** The query value if it is one of `allowed`, else the stored value, else `fallback`. */
export function resolveFlag<T extends string>(search: string, stored: string | null, param: string, allowed: readonly T[], fallback: T): T {
  const asked = new URLSearchParams(search).get(param);
  const pick = (value: string | null) => allowed.find((option) => option === value);
  return pick(asked) ?? pick(stored) ?? fallback;
}

function read(key: string): string | null {
  try { return typeof window === "undefined" ? null : (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)); } catch { return null; }
}

function useFlag<T extends string>(key: string, param: string, allowed: readonly T[], fallback: T): T {
  // The router's location when there is one (so a link re-renders us), else the address bar.
  const search = useContext(UNSAFE_LocationContext)?.location.search ?? (typeof window === "undefined" ? "" : window.location.search);
  const value = resolveFlag(search, read(key), param, allowed, fallback);
  const asked = new URLSearchParams(search).get(param);
  useEffect(() => {
    if (asked && allowed.includes(asked as T)) {
      try { window.localStorage.setItem(key, asked); } catch { /* private mode: the query still works */ }
    }
  }, [asked, key, allowed]);
  return value;
}

export const useLook = (): Look => useFlag(LOOK_KEY, "look", LOOKS, DEFAULT_LOOK);
export const useTrailVariant = (): TrailVariant => useFlag(TRAIL_KEY, "trail", TRAILS, "zigzag");

/** The class the Almanac root carries for this look: "" for classic and almanac, "eco" for ecology. */
export const lookClass = (look: Look): string => (look === "ecology" ? " eco" : "");

/** Is the ecology look on right now? For code with no hook: the query value, else the stored one. */
export const isEcoLook = (): boolean =>
  typeof window !== "undefined" && resolveFlag(window.location.search, read(LOOK_KEY), "look", LOOKS, DEFAULT_LOOK) === "ecology";
