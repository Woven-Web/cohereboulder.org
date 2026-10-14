-- Notifications (morning note, harvest invite, 8 PM "ready for tomorrow") and
-- Harvest. ADD-ONLY: new tables and indexes, nothing existing is altered.
-- Needs Aaron's yes before it is applied to production.
--
-- Notification state is keyed by a person_key: the regenOS DID when the person
-- has an account, else 'mailto:<verified email>'. Push subscriptions themselves
-- stay in companion_subscriptions (0010); notify_devices adds who a device
-- belongs to and how healthy it is.

-- One row per person: which notes are on, by which channel, and where to email.
-- *_on NULL means "the default" (decided at send time: on for people with the
-- app installed, off for the morning note and RSVP-gated for the other two
-- when email-only). *_channel NULL means "auto" (push if live, else email).
CREATE TABLE IF NOT EXISTS notify_prefs (
  person_key        TEXT PRIMARY KEY,
  did               TEXT,
  morning_on        INTEGER CHECK (morning_on IN (0, 1)),
  harvest_on        INTEGER CHECK (harvest_on IN (0, 1)),
  evening_on        INTEGER CHECK (evening_on IN (0, 1)),
  morning_channel   TEXT CHECK (morning_channel IN ('push', 'email')),
  harvest_channel   TEXT CHECK (harvest_channel IN ('push', 'email')),
  evening_channel   TEXT CHECK (evening_channel IN ('push', 'email')),
  email             TEXT,
  email_verified_at TEXT,
  email_optin_at    TEXT,               -- the one-tap ask in the RSVP confirmation (harvest + 8 PM emails)
  locale            TEXT NOT NULL DEFAULT 'en',
  fallback_noted_at TEXT,               -- the "push stopped working" line was shown/sent; cleared when push is live again
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notify_prefs_email ON notify_prefs(email);

-- Health of each push subscription, by the companion's device id.
-- state: live | suspect | expired. A push service 404/410 expires at once.
CREATE TABLE IF NOT EXISTS notify_devices (
  device_id       TEXT PRIMARY KEY,
  person_key      TEXT,                 -- NULL = an anonymous install (morning note only)
  installed       INTEGER NOT NULL DEFAULT 0,   -- display-mode standalone, as the page reports it
  permission      TEXT NOT NULL DEFAULT 'default',
  state           TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'suspect', 'expired')),
  fail_count      INTEGER NOT NULL DEFAULT 0,
  last_seen_at    TEXT,                 -- heartbeat
  last_sent_at    TEXT,
  last_success_at TEXT,                 -- the push service accepted a send
  last_failure_at TEXT,
  last_shown_at   TEXT,                 -- the service worker's "shown" ping
  soft_failed_for TEXT,                 -- the last_sent_at already counted as unshown
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notify_devices_person ON notify_devices(person_key);

-- Dedupe and audit: one row per person, per note type, per day or event.
-- A fallback therefore never produces both a push and an email.
CREATE TABLE IF NOT EXISTS notify_ledger (
  type       TEXT NOT NULL CHECK (type IN ('morning', 'harvest', 'evening')),
  ref        TEXT NOT NULL,             -- the Boulder date, or '<event did>/<rkey>' for harvest
  person_key TEXT NOT NULL,
  channel    TEXT,                      -- push | email, once decided
  fell_back  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'skipped', 'failed')),
  reason     TEXT,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (type, ref, person_key)
);

-- A send in progress or finished, so idle minute ticks cost one indexed read.
CREATE TABLE IF NOT EXISTS notify_runs (
  type         TEXT NOT NULL,
  ref          TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (type, ref)
);

-- Harvests: a member's few words (and optionally one photo) about an event.
-- Kept in D1 rather than as regenOS circle posts: see REPORT-notify.md.
CREATE TABLE IF NOT EXISTS harvests (
  id            TEXT PRIMARY KEY,
  event_did     TEXT NOT NULL,
  event_rkey    TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  event_ends_at TEXT,
  author_did    TEXT NOT NULL,
  body          TEXT NOT NULL,
  prompt        TEXT NOT NULL DEFAULT 'event' CHECK (prompt IN ('event', 'inquiry')),
  lang          TEXT NOT NULL DEFAULT 'en',
  has_photo     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  edited_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_harvests_event_author ON harvests(event_did, event_rkey, author_did);
CREATE INDEX IF NOT EXISTS idx_harvests_author ON harvests(author_did, created_at);

-- The photo, a re-encoded JPEG as base64 text (no R2 binding needed).
CREATE TABLE IF NOT EXISTS harvest_photos (
  harvest_id TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL
);
