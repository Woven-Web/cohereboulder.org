import { fetchMe, fetchMyRegistration } from "@/lib/api";
// React-query hooks for the regenOS account lane. Both are read-only polls;
// every mutation lives with the component that makes it.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRegenosSession, fetchSiteConfig } from "@/lib/regenos";

export const SITE_CONFIG_QUERY_KEY = ["site-config"] as const;
export const REGENOS_SESSION_QUERY_KEY = ["regenos-session"] as const;

/**
 * What /api/config says about this deployment. While it's loading (or if it
 * fails) the answer reads as "lane off", so the calendar renders exactly its
 * pre-phase-2 self — the safe direction.
 */
export function useSiteConfig() {
  return useQuery({
    queryKey: SITE_CONFIG_QUERY_KEY,
    queryFn: fetchSiteConfig,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Who this browser is on regenOS. Enabled ONLY when the lane is on — with the
 * flag off the /xrpc proxy 404s and there is nothing to ask. Refetches on
 * window focus (react-query's default), which is what picks the session up
 * after the person clicks the emailed link in another tab.
 */
export function useRegenosSession(enabled: boolean) {
  return useQuery({
    queryKey: REGENOS_SESSION_QUERY_KEY,
    queryFn: fetchSessionAndRemember,
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** Set while this device's last answer was "signed in", so the next load can hold the masthead instead of flashing "Join COhere". */
export const SIGNED_IN_HINT_KEY = "cohere.signedIn";

export function readSignedInHint(): boolean {
  try { return window.localStorage.getItem(SIGNED_IN_HINT_KEY) === "1"; } catch { return false; }
}

export function writeSignedInHint(on: boolean) {
  try {
    if (on) window.localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    else window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch { /* private mode: every load starts as signed out */ }
}

export async function fetchSessionAndRemember() {
  try {
    const session = await fetchRegenosSession();
    writeSignedInHint(Boolean(session.did));
    return session;
  } catch (err) {
    // An unreadable session renders as signed out, so the next load should start that way too.
    writeSignedInHint(false);
    throw err;
  }
}

/** The longest a placeholder waits for the answer before showing the signed-out state anyway. */
export const AUTH_HOLD_MAX_MS = 3000;

/**
 * Who this is, and whether we know yet. `pending` until /api/config and (lane on) the
 * session have answered; a failed read counts as answered, signed out. `hold` is true
 * while pending on a device that was signed in last time: show a neutral placeholder
 * rather than the signed-out state. A device with no such memory gets the signed-out
 * state at once, so a first-time visitor never waits for the Register button.
 * Neither lasts past AUTH_HOLD_MAX_MS: a stalled regenOS must not hide the controls.
 * `settled` is "answered, or waited long enough".
 */
export function useAuthState() {
  const { data: config, isPending: configPending } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isLoading: sessionLoading } = useRegenosSession(laneOn);
  const pending = configPending || (laneOn && sessionLoading);
  const signedIn = Boolean(session?.did);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setWaited(true), AUTH_HOLD_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return {
    config, laneOn, configPending: configPending && !waited, session, signedIn, pending,
    hold: pending && !waited && readSignedInHint(),
    settled: !pending || waited,
  };
}

/** For after sign-in/sign-out/wizard completion: re-ask who we are. */
export function useInvalidateRegenosSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: REGENOS_SESSION_QUERY_KEY });
}

export function useMyRegistration() {
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  return useQuery({ queryKey: ["my-registration", session?.did], queryFn: fetchMyRegistration, enabled: Boolean(session?.did), staleTime: 0, retry: 1 });
}

/** Whether the signed-in visitor is an organizer (gets the header's Organizer link). */
export function useMe() {
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  return useQuery({ queryKey: ["me", session?.did], queryFn: fetchMe, enabled: Boolean(session?.did), staleTime: 60 * 1000, retry: 1 });
}
