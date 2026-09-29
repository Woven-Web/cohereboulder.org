-- Email RSVPs ("RSVP · remind me") for people without a COhere/regenOS
-- account. One row per (event, email). Signed-in visitors RSVP on regenOS
-- itself (through the /xrpc proxy) and never land here.
--
-- Not the mailing list: nothing here touches `people`. Rows are deleted by the
-- daily cron 30 days after the event starts (worker/src/rsvps.ts), and the
-- attendee can remove their own row at any time with the cancel link in every
-- email (/rsvp/cancel?token=…).

CREATE TABLE IF NOT EXISTS event_rsvps (
  id               TEXT PRIMARY KEY,
  event_did        TEXT NOT NULL,
  event_rkey       TEXT NOT NULL,
  event_name       TEXT NOT NULL,   -- snapshot at RSVP time; refreshed by the cron
  event_starts_at  TEXT NOT NULL,   -- RFC3339 UTC (toISOString), so it sorts as text
  event_where      TEXT,            -- venue line snapshot
  email            TEXT NOT NULL,   -- lowercased
  name             TEXT,
  language         TEXT NOT NULL DEFAULT 'en',  -- en | es, for the emails
  cancel_token     TEXT NOT NULL UNIQUE,
  reminder_sent_at TEXT,            -- set when the day-before reminder is claimed/sent
  created_at       TEXT NOT NULL,
  UNIQUE (event_did, event_rkey, email)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_starts ON event_rsvps(event_starts_at);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_did, event_rkey);
