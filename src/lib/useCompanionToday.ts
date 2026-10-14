import { useQuery } from "@tanstack/react-query";
import { companionRequest, type CompanionToday } from "@/lib/api";

/** Today's practice, question, quests and the push key. One cache entry shared by every screen. */
export function useCompanionToday() {
  return useQuery({ queryKey: ["companion"], queryFn: () => companionRequest<CompanionToday>("today"), retry: 1 });
}
