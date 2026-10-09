-- COhere member database (Cloudflare D1)
--
-- Deliberately generic: `people` holds identity and contact details that persist
-- across years, `forms` holds the questions as DATA (so a form can change without
-- a deploy), and `submissions` stores each person's answers as a JSON blob keyed
-- to a form. Adding a question in 2026 means editing a row in `forms`, not a
-- migration.

CREATE TABLE IF NOT EXISTS people (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  phone             TEXT,
  orgs              TEXT,
  subscribed        INTEGER NOT NULL DEFAULT 1,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  source            TEXT,
  tags              TEXT,
  internal_notes    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_email      ON people(email);
CREATE INDEX IF NOT EXISTS idx_people_created_at ON people(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_subscribed ON people(subscribed);

CREATE TABLE IF NOT EXISTS forms (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  event       TEXT,
  fields      TEXT NOT NULL,            -- JSON array of field definitions
  active      INTEGER NOT NULL DEFAULT 1,
  -- Optional confirmation email sent on submission; copy lives here so it can
  -- be edited from the admin portal without a deploy.
  confirm_subject TEXT,
  confirm_body    TEXT,
  -- Optional post-submit "thank you" screen as JSON: { title, title_es, body,
  -- body_es, link, link_label, link_label_es }. Same idea as the confirmation
  -- email — copy lives with the questions, editable without a deploy.
  -- (Added 2026-08-30; on an existing database run:
  --   ALTER TABLE forms ADD COLUMN completion TEXT;)
  completion      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  form_slug   TEXT NOT NULL,
  event       TEXT,
  data        TEXT NOT NULL,            -- JSON object of answers
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(person_id, form_slug)
);

CREATE INDEX IF NOT EXISTS idx_submissions_person ON submissions(person_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form   ON submissions(form_slug);
CREATE INDEX IF NOT EXISTS idx_submissions_event  ON submissions(event);

-- Who may sign in to the admin portal. Deliberately separate from `people`:
-- being in the community list and being able to read it are different things.
CREATE TABLE IF NOT EXISTS admins (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  added_by    TEXT,
  created_at  TEXT NOT NULL
);

-- Accountless event proposals (worker/migrations/0003_event_proposals.sql).
-- Anyone can submit one from /propose; an organizer approves or rejects it
-- from /admin's Proposals tab. Approval publishes to regenOS the same way
-- the Events tab does — nothing here touches the calendar until then.
CREATE TABLE IF NOT EXISTS event_proposals (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  starts_at      TEXT NOT NULL,   -- RFC3339 UTC
  ends_at        TEXT,
  mode           TEXT NOT NULL DEFAULT 'inperson',
  place_name     TEXT,
  street         TEXT,
  locality       TEXT,
  region         TEXT,
  postal_code    TEXT,
  proposer_name  TEXT,
  proposer_email TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | published | rejected
  published_did  TEXT,
  published_rkey TEXT,            -- set on approval
  reviewed_by    TEXT,
  review_note    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_proposals_status ON event_proposals(status, created_at DESC);

-- Email RSVPs ("RSVP · remind me"), worker/migrations/0004_event_rsvps.sql.
-- Not the mailing list; rows are deleted 30 days after the event starts.
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

-- Newsletters (worker/migrations/0005_newsletters.sql, worker/src/newsletter.ts).
CREATE TABLE IF NOT EXISTS newsletters (
  id                       TEXT PRIMARY KEY,
  subject                  TEXT NOT NULL,
  html                     TEXT NOT NULL,   -- body rendered from `text`, escaped (renderNewsletterBody)
  text                     TEXT NOT NULL,   -- the organizer's source: paragraphs + light markdown
  audience                 TEXT NOT NULL,   -- JSON: {"kind":"all"} | {"kind":"form","form":…} | {"kind":"tag","tag":…}
  status                   TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent | cancelled
  created_by               TEXT NOT NULL,   -- admin email
  test_sent_hash           TEXT,            -- sha256(subject, text) of the version last test-sent
  test_sent_to             TEXT,
  test_sent_at             TEXT,
  scheduled_for            TEXT,            -- confirm time + 15 min (RFC3339 UTC)
  cancel_token             TEXT UNIQUE,     -- emailed to every admin; no sign-in needed
  recipient_count_confirmed INTEGER,        -- the number the organizer typed
  confirmed_by             TEXT,            -- who pressed send
  confirmed_at             TEXT,
  cancelled_by             TEXT,            -- admin email, or 'email-link'
  cancelled_at             TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  sent_at                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status, scheduled_for);

-- One row per (newsletter, person): the double-send guard. Rows are queued
-- when the send is confirmed, claimed by the cron (status 'sending'), then
-- marked sent / failed / skipped (unsubscribed or undeliverable by send time).
CREATE TABLE IF NOT EXISTS newsletter_sends (
  newsletter_id TEXT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  person_id     TEXT NOT NULL,
  email         TEXT NOT NULL,
  resend_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | sending | sent | failed | skipped
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- 0007_resend_webhooks.sql: after 'sent', Resend's webhook moves status to
  -- delivered / bounced (permanent only) / complained and records the latest event.
  last_event    TEXT,
  last_event_at TEXT,
  UNIQUE (newsletter_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_status ON newsletter_sends(newsletter_id, status);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_resend_id ON newsletter_sends(resend_id);

-- Resend webhook replay guard (worker/migrations/0007_resend_webhooks.sql,
-- worker/src/resend-webhook.ts). One row per svix-id; no email addresses.
CREATE TABLE IF NOT EXISTS resend_webhook_events (
  svix_id      TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  email_id     TEXT,
  bounce_type  TEXT,
  person_id    TEXT,
  effect       TEXT,
  received_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_received ON resend_webhook_events(received_at);

-- Door check-in, worker/migrations/0006_event_checkins.sql. Who actually
-- arrived; never the mailing list. Rows are deleted 30 days after the event.
CREATE TABLE IF NOT EXISTS event_checkins (
  id               TEXT PRIMARY KEY,
  event_did        TEXT NOT NULL,
  event_rkey       TEXT NOT NULL,
  event_name       TEXT NOT NULL,
  event_starts_at  TEXT NOT NULL,
  email            TEXT,
  guest_did        TEXT,
  name             TEXT,
  source           TEXT NOT NULL CHECK (source IN ('rsvp_email', 'rsvp_regenos', 'registrant', 'walkin')),
  person_id        TEXT,
  checked_in_by    TEXT NOT NULL,
  checked_in_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_email
  ON event_checkins(event_did, event_rkey, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_guest
  ON event_checkins(event_did, event_rkey, guest_did) WHERE guest_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_checkins_event ON event_checkins(event_did, event_rkey);
CREATE INDEX IF NOT EXISTS idx_event_checkins_starts ON event_checkins(event_starts_at);

-- Registration funnel counts, worker/migrations/0009_form_funnel.sql. Counters
-- only — no visitor, IP, user agent or answer is ever stored here.
CREATE TABLE IF NOT EXISTS form_funnel (
  form_slug TEXT NOT NULL,
  day       TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  event     TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form_slug, day, event)
);
