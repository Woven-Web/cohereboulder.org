-- Event reminders: a fourth note, about an hour before an event you RSVP'd to starts.
-- ADD-ONLY: two nullable columns and one new table; nothing existing is altered or rewritten.
-- Needs Aaron's yes before it is applied to production (the deploy workflow applies it on push to main).
--
-- reminder_on / reminder_channel work like the other notes' columns: NULL = the default
-- (on by push for people with the app, off for everyone else).
ALTER TABLE notify_prefs ADD COLUMN reminder_on INTEGER CHECK (reminder_on IN (0, 1));
ALTER TABLE notify_prefs ADD COLUMN reminder_channel TEXT CHECK (reminder_channel IN ('push', 'email'));

-- The reminders' dedupe ledger: one row per person per event. Its own table because
-- notify_ledger.type carries a CHECK that only allows the first three notes, and SQLite can
-- only widen that by rebuilding the table, which is not add-only. Same columns, same rules.
CREATE TABLE IF NOT EXISTS notify_reminder_ledger (
  type       TEXT NOT NULL CHECK (type = 'reminder'),
  ref        TEXT NOT NULL,             -- '<event did>/<rkey>'
  person_key TEXT NOT NULL,
  channel    TEXT,
  fell_back  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'skipped', 'failed')),
  reason     TEXT,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (type, ref, person_key)
);
