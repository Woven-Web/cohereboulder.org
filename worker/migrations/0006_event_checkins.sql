-- Door check-in (worker/src/checkins.ts, /admin/checkin). One row per person
-- who actually arrived at an event, written by an organizer at the door.
--
-- Numbered 0006 because the unmerged newsletter PR already claims
-- 0005_newsletters.sql; the two are independent and wrangler applies any
-- unapplied file regardless of the order they land in.
--
-- Not the mailing list: a check-in never touches `people` unless a walk-in
-- explicitly ticks "add me to the COhere email list" (and even then an
-- existing unsubscribe is respected). Rows are deleted by the daily cron 30
-- days after the event starts, same as event_rsvps.

CREATE TABLE IF NOT EXISTS event_checkins (
  id               TEXT PRIMARY KEY,   -- minted by the phone, so a retried tap is idempotent
  event_did        TEXT NOT NULL,
  event_rkey       TEXT NOT NULL,
  event_name       TEXT NOT NULL,      -- snapshot at check-in time
  event_starts_at  TEXT NOT NULL,      -- RFC3339 UTC; retention runs off this
  email            TEXT,               -- lowercased; NULL for regenOS guests and walk-ins who decline
  guest_did        TEXT,               -- regenOS confirmed guest (no email upstream)
  name             TEXT,
  source           TEXT NOT NULL CHECK (source IN ('rsvp_email', 'rsvp_regenos', 'registrant', 'walkin')),
  person_id        TEXT,               -- people.id when the email matches someone we know
  checked_in_by    TEXT NOT NULL,      -- the organizer's sign-in email
  checked_in_at    TEXT NOT NULL
);

-- One check-in per address (and per regenOS guest) per event. Partial, so any
-- number of email-less walk-ins can arrive.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_email
  ON event_checkins(event_did, event_rkey, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_guest
  ON event_checkins(event_did, event_rkey, guest_did) WHERE guest_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_checkins_event ON event_checkins(event_did, event_rkey);
CREATE INDEX IF NOT EXISTS idx_event_checkins_starts ON event_checkins(event_starts_at);
