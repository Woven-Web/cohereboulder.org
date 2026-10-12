// Who may be in the members area, from this browser's point of view.
//
// regenOS enforces the real rule (non-members get EMPTY pages, so an empty
// page cannot tell "nobody has posted" from "you aren't a member"). The gate is
// therefore decided here from the public roster, and the pages only ask for
// content once it says "member".

import { useQuery } from "@tanstack/react-query";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { fetchSceneRoster } from "@/lib/regenos";
import { shortDid } from "@/lib/board";

export type CircleStatus = "loading" | "off" | "signed-out" | "not-member" | "member" | "error";

export const SCENE_ROSTER_QUERY_KEY = ["scene-roster"] as const;

export function useCircleAccess() {
  const { data: config, isLoading: configLoading } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const collective = config?.collectiveDid ?? null;
  const { data: session, isLoading: sessionLoading } = useRegenosSession(laneOn);
  const did = session?.did ?? null;
  const roster = useQuery({
    queryKey: [...SCENE_ROSTER_QUERY_KEY, collective],
    queryFn: () => fetchSceneRoster(collective as string),
    enabled: laneOn && Boolean(did) && Boolean(collective),
    staleTime: 60_000,
    retry: 1,
  });

  let status: CircleStatus;
  if (configLoading) status = "loading";
  else if (!laneOn || !collective) status = "off";
  else if (sessionLoading) status = "loading";
  else if (!did) status = "signed-out";
  else if (roster.isLoading) status = "loading";
  else if (roster.isError || !roster.data) status = "error";
  else status = roster.data.members.some((m) => m.did === did) ? "member" : "not-member";

  /** The best name we have for a DID: roster name, then handle, then a short DID. */
  const nameOf = (target: string): string => {
    const member = roster.data?.members.find((m) => m.did === target);
    return member?.name || member?.handle || shortDid(target);
  };

  return { status, did, collective, roster: roster.data, nameOf, retry: () => roster.refetch() };
}
