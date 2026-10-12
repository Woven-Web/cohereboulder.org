// The Worker's short-lived copy of one event's confirmed guests, used for
// members' profile RSVP lists (rsvp-visibility.ts). A regenOS RSVP made through
// our /xrpc proxy drops the entry, so a member's own profile never lags their
// own click; an RSVP made elsewhere shows up within the TTL.

export const ATTENDANCE_TTL_SECONDS = 60;

export const attendanceCache = (caches as unknown as { default: Cache }).default;

export function attendanceKey(eventDid: string, eventRkey: string): Request {
  return new Request(`https://cohere.invalid/attendance/${encodeURIComponent(eventDid)}/${encodeURIComponent(eventRkey)}`);
}
