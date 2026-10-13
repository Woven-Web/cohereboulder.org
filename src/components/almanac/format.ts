import { useEffect, useState } from "react";
import { FESTIVAL_DATES, dayNumber } from "@/lib/festival";
import { currentDenverDate } from "@/lib/companion";

/** True from Oct 15 through Oct 25, Boulder time. */
export const duringGathering = (date = currentDenverDate()) => {
  const n = dayNumber(date);
  return n >= 1 && n <= 11;
};

/** The festival's days in two weeks (Oct 15 to 21, then 22 to 25). */
export const weekOf = (day: string): string[] => (FESTIVAL_DATES.indexOf(day) < 7 ? FESTIVAL_DATES.slice(0, 7) : FESTIVAL_DATES.slice(7));

/** Fill `{name}` placeholders in a translated string. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** A live media-query match, for layouts CSS alone cannot choose (the week view). */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setOn(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return on;
}

/** True at the Daylight/tablet width where the app goes two-column (matches the CSS 768px query). */
export function useWide(): boolean {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}
