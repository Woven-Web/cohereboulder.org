// React-query hooks for the regenOS account lane. Both are read-only polls;
// every mutation lives with the component that makes it.

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
    queryFn: fetchRegenosSession,
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** For after sign-in/sign-out/wizard completion: re-ask who we are. */
export function useInvalidateRegenosSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: REGENOS_SESSION_QUERY_KEY });
}
