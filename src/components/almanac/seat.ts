import type { MyEventItem } from "@/lib/myEvents";

export type Seat = "going" | "requested" | "waitlisted";

/** The seat shown for a list entry: regenOS knows it; an emailed RSVP is a yes. */
export function seatOf(item: MyEventItem): Seat {
  return item.seat === "requested" || item.seat === "waitlisted" ? item.seat : "going";
}
