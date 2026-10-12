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
import { PEOPLE_QUERY_KEY, fetchDirectory, type DirectoryEntry } from "@/lib/people";

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

  // The directory is only asked for once the gate says "member"; regenOS
  // would answer anyone else with an empty page anyway.
  const directory = useQuery({
    queryKey: [...PEOPLE_QUERY_KEY, collective],
    queryFn: () => fetchDirectory(collective as string),
    enabled: status === "member",
    staleTime: 60_000,
  });
  const entryOf = (target: string): DirectoryEntry | undefined => directory.data?.find((e) => e.author === target);

  /** The best name we have for a DID: their profile's name, then the roster's, then handle, then a short DID. */
  const nameOf = (target: string): string => {
    const member = roster.data?.members.find((m) => m.did === target);
    return entryOf(target)?.record.displayName?.trim() || member?.name || member?.handle || shortDid(target);
  };

  return { status, did, collective, roster: roster.data, directory, entryOf, nameOf, retry: () => roster.refetch() };
}
