import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRsvpVisibility, setEventHidden, setRsvpVisibilityMode, type RsvpVisibility, type RsvpVisibilityMode } from "@/lib/api";

export const RSVP_VISIBILITY_KEY = ["rsvp-visibility"] as const;
export const MY_PROFILE_RSVPS_KEY = ["my-profile-rsvps"] as const;
export const MEMBER_RSVPS_KEY = ["member-rsvps"] as const;

export const eventUriOf = (event: { did: string; rkey: string }) => `at://${event.did}/community.lexicon.calendar.event/${event.rkey}`;

/** The signed-in member's "who sees my RSVPs" setting, and the two ways to change it. */
export function useRsvpVisibility(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: RSVP_VISIBILITY_KEY, queryFn: fetchRsvpVisibility, enabled, staleTime: 30_000, retry: 1 });

  const settle = (next: RsvpVisibility) => {
    queryClient.setQueryData(RSVP_VISIBILITY_KEY, next);
    queryClient.invalidateQueries({ queryKey: MY_PROFILE_RSVPS_KEY });
    queryClient.invalidateQueries({ queryKey: MEMBER_RSVPS_KEY });
  };
  const setMode = useMutation({ mutationFn: (mode: RsvpVisibilityMode) => setRsvpVisibilityMode(mode), onSuccess: settle });
  const setHidden = useMutation({
    mutationFn: ({ uri, hidden }: { uri: string; hidden: boolean }) => setEventHidden(uri, hidden),
    onSuccess: settle,
  });

  return { visibility: query.data, isLoading: query.isLoading, isError: query.isError, setMode, setHidden };
}
