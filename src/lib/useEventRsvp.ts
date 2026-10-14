// The one-click RSVP that EventCard and the Almanac EventRow share: signed in
// on regenOS it RSVPs in place, anonymous visitors go to the detail page's
// email form (#rsvp). Extracted from EventCard unchanged so the two surfaces
// cannot drift.
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { eventPath, type CommunityEvent } from "@/lib/events";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { fetchMySeat, rsvpOnRegenos } from "@/lib/regenos";
import { MY_SEATS_QUERY_KEY, recordRegenosRsvp } from "@/lib/myEvents";

export type RsvpState = "idle" | "going" | "requested" | "waitlisted" | "error";

export function useEventRsvp(event: CommunityEvent) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(laneOn);
  const signedIn = laneOn && Boolean(session?.did);
  const [rsvp, setRsvp] = useState<RsvpState>("idle");
  // Attendance refetches may change the seat during a write, never its lock.
  // The ref also blocks a second click before React has rendered pending.
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const { data: mySeat } = useQuery({
    queryKey: ["regenos-my-seat", event.did, event.rkey],
    queryFn: () => fetchMySeat(event.did, event.rkey),
    enabled: signedIn,
    staleTime: 30_000,
  });
  useEffect(() => {
    setRsvp(!signedIn ? "idle" : mySeat?.seat === "confirmed" ? "going" : mySeat?.seat === "requested" ? "requested" : mySeat?.seat === "waitlisted" ? "waitlisted" : "idle");
  }, [mySeat, signedIn]);
  const upcoming = Boolean(event.startsAt) && new Date(event.startsAt ?? 0).getTime() > Date.now();

  async function handleRsvp(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pendingRef.current) return;
    if (!signedIn) {
      navigate(`${eventPath(event)}#rsvp`);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    const key = ["regenos-my-seat", event.did, event.rkey];
    try {
      const current = await fetchMySeat(event.did, event.rkey);
      let seat = current.seat;
      if (rsvp === "going" || rsvp === "requested" || rsvp === "waitlisted") {
        seat = await rsvpOnRegenos(event.did, event.rkey, "notgoing", current.attendance);
      } else if (seat !== "confirmed" && seat !== "requested" && seat !== "waitlisted") {
        seat = await rsvpOnRegenos(event.did, event.rkey, "going", current.attendance);
      }
      recordRegenosRsvp(event, seat);
      queryClient.invalidateQueries({ queryKey: [MY_SEATS_QUERY_KEY] });
      queryClient.setQueryData(key, { seat, attendance: current.attendance });
      setRsvp(seat === "confirmed" ? "going" : seat === "requested" ? "requested" : seat === "waitlisted" ? "waitlisted" : seat === "declined" || seat === "none" ? "idle" : "error");
    } catch {
      setRsvp("error");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return { rsvp, pending, upcoming, rsvpDone: rsvp === "going" || rsvp === "requested" || rsvp === "waitlisted", handleRsvp };
}
