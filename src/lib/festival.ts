// The ten days (eleven calendar dates) of COhere Boulder 2026, and the small
// pieces of date arithmetic the Today and Calendar screens share. Dates are
// "YYYY-MM-DD" calendar days in America/Denver; nothing here depends on the
// device's own time zone.
import { localGet, localSet } from "@/lib/companion";

export const FESTIVAL_DATES: string[] = Array.from({ length: 11 }, (_, i) => `2026-10-${15 + i}`);
export const FESTIVAL_FIRST = FESTIVAL_DATES[0];
export const FESTIVAL_LAST = FESTIVAL_DATES[FESTIVAL_DATES.length - 1];

export type Lang = "en" | "es";

const DAY_MS = 86_400_000;
const noonUtc = (date: string) => new Date(`${date}T12:00:00Z`);

export const isFestivalDate = (date: string) => date >= FESTIVAL_FIRST && date <= FESTIVAL_LAST;

/** 1…11 inside the festival, 0 before it, 12 after it. */
export function dayNumber(date: string): number {
  const n = Math.round((noonUtc(date).getTime() - noonUtc(FESTIVAL_FIRST).getTime()) / DAY_MS) + 1;
  return n < 1 ? 0 : n > 11 ? 12 : n;
}

/** Whole days from `from` until the first festival day (0 on or after it). */
export function daysUntilStart(from: string): number {
  return Math.max(0, Math.round((noonUtc(FESTIVAL_FIRST).getTime() - noonUtc(from).getTime()) / DAY_MS));
}

const WEEKDAYS: Record<Lang, { short: string[]; long: string[]; two: string[] }> = {
  en: {
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    two: ["su", "mo", "tu", "we", "th", "fr", "sa"],
  },
  es: {
    short: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
    long: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    two: ["do", "lu", "ma", "mi", "ju", "vi", "sá"],
  },
};
const MONTHS: Record<Lang, { short: string[]; long: string[] }> = {
  en: {
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  es: {
    short: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    long: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  },
};

/** "Sat Oct 17" / "sáb 17 oct"; long: "Saturday, October 17" / "sábado 17 de octubre". */
export function formatDay(date: string, lang: Lang, long = false): string {
  const d = noonUtc(date);
  const w = WEEKDAYS[lang][long ? "long" : "short"][d.getUTCDay()];
  const m = MONTHS[lang][long ? "long" : "short"][d.getUTCMonth()];
  const n = d.getUTCDate();
  return lang === "es" ? `${w} ${n} ${long ? "de " : ""}${m}` : `${w}${long ? "," : ""} ${m} ${n}`;
}

/** Two-letter weekday under a hex ("sa"). */
export const weekdayTwo = (date: string, lang: Lang) => WEEKDAYS[lang].two[noonUtc(date).getUTCDay()];

/** Minutes since midnight in Denver for an instant. */
export function denverMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** "9:40 AM" / "9:40 a. m." from minutes since midnight. */
export function formatMinutes(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, "0");
  const suffix = lang === "es" ? (h < 12 ? "a. m." : "p. m.") : h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${mm} ${suffix}`;
}

/**
 * Sunrise and sunset in Boulder, minutes since local midnight. Linear between
 * Oct 15 (7:11 / 18:12) and Oct 25 (7:22 / 17:59), which is within a couple of
 * minutes of the almanac and is only used to place the sun on the ridgeline.
 */
export function sunTimes(date: string): { rise: number; set: number } {
  const t = Math.min(10, Math.max(0, Math.round((noonUtc(date).getTime() - noonUtc(FESTIVAL_FIRST).getTime()) / DAY_MS))) / 10;
  return { rise: Math.round(7 * 60 + 11 + t * 11), set: Math.round(18 * 60 + 12 - t * 13) };
}

// ---------------------------------------------------------------- practice done

/** Days whose practice was marked "I did it" on this device. Never leaves it. */
export const PRACTICE_DONE_KEY = "cohere-practice-done";
export const PRACTICE_DONE_EVENT = "cohere-practice-done";

export function parseDone(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && isFestivalDate(v)))].sort();
  } catch {
    return [];
  }
}

export const practiceDoneDays = () => parseDone(localGet(PRACTICE_DONE_KEY));

export function markPracticeDone(date: string): string[] {
  const next = parseDone(JSON.stringify([...practiceDoneDays(), date]));
  localSet(PRACTICE_DONE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(PRACTICE_DONE_EVENT));
  return next;
}

export type TrailState = "done" | "today" | "past" | "future";

/** done beats everything; otherwise today / earlier / later than `today`. */
export function trailState(date: string, today: string, done: string[]): TrailState {
  if (done.includes(date)) return "done";
  return date === today ? "today" : date < today ? "past" : "future";
}

// ---------------------------------------------------------------- sample day

/** Day 1, shown before the gathering starts and labelled "Sample" on screen. */
export const SAMPLE_DAY_ONE = {
  en: {
    title: "Welcome. Start by arriving.",
    body: "Tonight the gathering opens. Before you go, step outside for five minutes and stand somewhere you can feel the air change as the day cools. Notice which way the wind is coming from and what the light is doing on the hills. You are already part of the place you are about to celebrate.",
    question: "What are you bringing with you into these ten days?",
  },
  es: {
    title: "Bienvenida. Empieza por llegar.",
    body: "Esta noche se abre el encuentro. Antes de salir, sal cinco minutos y párate en un lugar donde sientas cómo cambia el aire al enfriarse el día. Fíjate de dónde viene el viento y qué hace la luz sobre las colinas. Ya eres parte del lugar que vas a celebrar.",
    question: "¿Qué traes contigo a estos diez días?",
  },
} as const;

/** Screen-reader day name: "Saturday Oct 17" / "sábado 17 oct". */
export function formatDayA11y(date: string, lang: Lang): string {
  const d = noonUtc(date);
  const w = WEEKDAYS[lang].long[d.getUTCDay()];
  const m = MONTHS[lang].short[d.getUTCMonth()];
  const n = d.getUTCDate();
  return lang === "es" ? `${w} ${n} ${m}` : `${w} ${m} ${n}`;
}
