import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { NOTIFY_SETTINGS_KEY, syncDevice } from "@/lib/notify";
import { useReminders } from "@/lib/reminders";
import { useCompanionToday } from "@/lib/useCompanionToday";

/** What the last report said, so a screen change doesn't repeat it but a real change (signing in, turning push on) does. */
let lastReported = "";

/**
 * Keep the Worker's picture of this phone true: on every app open, when the
 * app comes back to the foreground (at most every ten minutes), and straight
 * away when notifications are switched on or the person signs in.
 */
export function useDeviceSync() {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const { subscribed } = useReminders();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isFetched } = useRegenosSession(laneOn);
  const { data: today } = useCompanionToday();
  const did = laneOn ? session?.did ?? null : null;
  // Wait until we know who this is, so the first report already carries it.
  const ready = Boolean(config) && (!laneOn || isFetched) && Boolean(today);
  const pushKey = today?.pushKey ?? null;

  useEffect(() => {
    if (!ready) return;
    const key = `${did}|${subscribed}|${language}`;
    const changed = key !== lastReported;
    lastReported = key;
    void syncDevice({ signedIn: Boolean(did), language, pushKey, force: changed }).then(() => queryClient.invalidateQueries({ queryKey: NOTIFY_SETTINGS_KEY }));
  }, [ready, did, subscribed, pushKey, language, queryClient]);

  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncDevice({ signedIn: Boolean(did), language, pushKey });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, did, language, pushKey]);
}
