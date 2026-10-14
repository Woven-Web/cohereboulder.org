// When to offer "Add to home screen & get reminders". Offered at most once on
// its own (after the first "I did it", or when someone first asks for a
// reminder), never when the app is already installed, and never again after
// "Not now". The More page keeps a quiet entry that always works.
import { useSyncExternalStore } from "react";
import { localGet, localSet } from "@/lib/companion";

export const INSTALL_DISMISSED_KEY = "cohere-install-dismissed";
export const INSTALL_OFFERED_KEY = "cohere-install-offered";

export type OfferReason = "didit" | "reminders" | "manual";

export interface OfferContext {
  installed: boolean;
  dismissed: boolean;
  offered: boolean;
  /** Something real to offer: a native install prompt, the iOS guide, or reminders not yet on. */
  hasSomethingToOffer: boolean;
}

/** Pure decision, so it can be tested without a browser. */
export function shouldOffer(reason: OfferReason, ctx: OfferContext): boolean {
  if (!ctx.hasSomethingToOffer) return false;
  // Asked for by the person (More, Remind me): always shown, even if installed
  // (then it is just the reminders) or after "Not now".
  if (reason === "manual") return true;
  return !ctx.installed && !ctx.dismissed && !ctx.offered;
}

interface SheetState { open: boolean; reason: OfferReason }
let sheet: SheetState = { open: false, reason: "manual" };
const listeners = new Set<() => void>();
const publish = (next: SheetState) => {
  sheet = next;
  for (const listener of listeners) listener();
};
export const getSheetState = () => sheet;
const subscribeSheet = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useInstallSheet = () => useSyncExternalStore(subscribeSheet, getSheetState, getSheetState);

export const wasDismissed = () => localGet(INSTALL_DISMISSED_KEY) === "true";
export const wasOffered = () => localGet(INSTALL_OFFERED_KEY) === "true";
export const rememberDismissed = () => { localSet(INSTALL_DISMISSED_KEY, "true"); localSet(INSTALL_OFFERED_KEY, "true"); };

/** Open the sheet if the rules allow it; returns whether it opened. */
export function offerInstall(reason: OfferReason, ctx: Omit<OfferContext, "dismissed" | "offered">): boolean {
  const full: OfferContext = { ...ctx, dismissed: wasDismissed(), offered: wasOffered() };
  if (!shouldOffer(reason, full)) return false;
  if (reason !== "manual") localSet(INSTALL_OFFERED_KEY, "true");
  publish({ open: true, reason });
  return true;
}

export const closeInstallSheet = () => publish({ ...sheet, open: false });
