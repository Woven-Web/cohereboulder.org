import { useSyncExternalStore } from "react";
import { getInstallState, subscribeInstall } from "@/lib/install";
import { installPlatform } from "@/lib/companion";
import { offerInstall, type OfferReason } from "@/lib/installOffer";
import { reminderSupport, useReminders } from "@/lib/reminders";
import { useCompanionToday } from "@/lib/useCompanionToday";

export const isIosDevice = (installed: boolean, hasPrompt: boolean) =>
  installPlatform(navigator.userAgent, installed, hasPrompt) === "ios" ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 && !installed);

/** What can be offered on this device right now, and a function to offer it. */
export function useInstallOffer() {
  const { prompt, installed } = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  const { data } = useCompanionToday();
  const reminders = useReminders();
  const ios = isIosDevice(installed, !!prompt);
  const canRemind = reminderSupport(data?.pushKey) && !ios && !reminders.subscribed && reminders.permission !== "denied";
  const hasSomethingToOffer = (!installed && (ios || !!prompt)) || canRemind;
  return {
    ios, installed, prompt, canRemind, hasSomethingToOffer,
    offer: (reason: OfferReason) => offerInstall(reason, { installed, hasSomethingToOffer }),
  };
}
